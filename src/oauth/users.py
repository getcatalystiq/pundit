"""User and tenant management.

SECURITY: Password requirements and email validation enforced.
"""

import logging
import re
import secrets
from typing import Any, Optional

import bcrypt

from db.aurora import get_aurora_client, param

logger = logging.getLogger(__name__)

# Email validation regex (RFC 5322 simplified)
EMAIL_REGEX = re.compile(
    r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
)

# Password requirements
MIN_PASSWORD_LENGTH = 12
PASSWORD_REQUIREMENTS = (
    f"Password must be at least {MIN_PASSWORD_LENGTH} characters and contain "
    "at least one uppercase letter, one lowercase letter, and one number."
)


def _validate_email(email: str) -> bool:
    """Validate email format."""
    if not email or len(email) > 254:
        return False
    return EMAIL_REGEX.match(email) is not None


def _validate_password(password: str) -> tuple[bool, str]:
    """
    Validate password meets security requirements.

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not password:
        return False, "Password is required"

    if len(password) < MIN_PASSWORD_LENGTH:
        return False, PASSWORD_REQUIREMENTS

    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)

    if not (has_upper and has_lower and has_digit):
        return False, PASSWORD_REQUIREMENTS

    return True, ""


def create_tenant(
    name: str,
    email: str,
    slug: Optional[str] = None,
) -> dict[str, Any]:
    """
    Create a new tenant (organization).

    Args:
        name: Organization name
        email: Admin email
        slug: URL-friendly identifier (auto-generated if not provided)

    Returns:
        Created tenant data
    """
    if not name:
        raise ValueError("name is required")

    if not email:
        raise ValueError("email is required")

    if not _validate_email(email):
        raise ValueError("Invalid email format")

    # Generate slug if not provided
    if not slug:
        # Convert name to slug: lowercase, replace spaces with hyphens
        slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
        # Add random suffix to ensure uniqueness
        slug = f"{slug}-{secrets.token_hex(4)}"

    aurora = get_aurora_client()

    # Check if slug exists
    existing = aurora.query_one(
        "SELECT id FROM tenants WHERE slug = :slug",
        [param("slug", slug)]
    )
    if existing:
        raise ValueError(f"Tenant with slug '{slug}' already exists")

    # Create tenant
    result = aurora.query_one(
        """
        INSERT INTO tenants (name, slug, email)
        VALUES (:name, :slug, :email)
        RETURNING id, name, slug, email, created_at
        """,
        [
            param("name", name),
            param("slug", slug),
            param("email", email),
        ]
    )

    logger.info(f"Created tenant: {result['id']} ({name})")
    return result


def create_user(
    tenant_id: str,
    email: str,
    password: str,
    name: Optional[str] = None,
    role: str = "member",
    scopes: Optional[list[str]] = None,
) -> dict[str, Any]:
    """
    Create a new user within a tenant.

    Args:
        tenant_id: Tenant ID
        email: User email
        password: Plain text password
        name: Display name
        role: User role (owner, admin, member)
        scopes: OAuth scopes (default: read, write)

    Returns:
        Created user data (without password hash)
    """
    if not email:
        raise ValueError("email is required")

    if not _validate_email(email):
        raise ValueError("Invalid email format")

    is_valid, error_msg = _validate_password(password)
    if not is_valid:
        raise ValueError(error_msg)

    # Hash password
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    # Default scopes
    scopes = scopes or ["read", "write"]

    aurora = get_aurora_client()

    # Check if email exists for this tenant
    existing = aurora.query_one(
        """
        SELECT id FROM users
        WHERE tenant_id = :tenant_id::uuid AND email = :email
        """,
        [
            param("tenant_id", tenant_id, "UUID"),
            param("email", email),
        ]
    )
    if existing:
        raise ValueError(f"User with email '{email}' already exists in this tenant")

    # Convert list to PostgreSQL array format
    def to_pg_array(items: list) -> str:
        escaped = [item.replace('"', '\\"') for item in items]
        return "{" + ",".join(f'"{item}"' for item in escaped) + "}"

    # Create user
    result = aurora.query_one(
        """
        INSERT INTO users (tenant_id, email, password_hash, name, role, scopes)
        VALUES (:tenant_id::uuid, :email, :password_hash, :name, :role, :scopes::text[])
        RETURNING id, tenant_id, email, name, role, scopes, created_at
        """,
        [
            param("tenant_id", tenant_id, "UUID"),
            param("email", email),
            param("password_hash", password_hash),
            param("name", name),
            param("role", role),
            param("scopes", to_pg_array(scopes)),
        ]
    )

    logger.info(f"Created user: {result['id']} ({email}) for tenant {tenant_id}")
    return result


def authenticate_user(email: str, password: str) -> Optional[dict[str, Any]]:
    """
    Authenticate a user by email and password.

    Args:
        email: User email
        password: Plain text password

    Returns:
        User data if authenticated, None otherwise
    """
    aurora = get_aurora_client()

    user = aurora.query_one(
        """
        SELECT u.id, u.tenant_id, u.email, u.password_hash, u.name,
               u.role, u.scopes, u.is_active, t.slug as tenant_slug
        FROM users u
        JOIN tenants t ON u.tenant_id = t.id
        WHERE u.email = :email
        """,
        [param("email", email)]
    )

    if not user:
        return None

    if not user.get("is_active", True):
        return None

    # Verify password
    try:
        if not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
            return None
    except Exception:
        return None

    # Update last login
    aurora.execute(
        "UPDATE users SET last_login_at = NOW() WHERE id = :id::uuid",
        [param("id", user["id"], "UUID")]
    )

    # Remove password hash from response
    del user["password_hash"]

    return user


def get_user(user_id: str) -> Optional[dict[str, Any]]:
    """
    Get user by ID.

    Args:
        user_id: User ID

    Returns:
        User data or None
    """
    aurora = get_aurora_client()

    user = aurora.query_one(
        """
        SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.scopes,
               u.is_active, u.created_at, t.slug as tenant_slug, t.name as tenant_name
        FROM users u
        JOIN tenants t ON u.tenant_id = t.id
        WHERE u.id = :id::uuid
        """,
        [param("id", user_id, "UUID")]
    )

    return user


def signup(
    tenant_name: str,
    email: str,
    password: str,
    user_name: Optional[str] = None,
) -> dict[str, Any]:
    """
    Self-service signup: create tenant and owner user.

    Args:
        tenant_name: Organization name
        email: Admin email
        password: Admin password
        user_name: Admin display name

    Returns:
        Dict with tenant and user data
    """
    # Create tenant
    tenant = create_tenant(name=tenant_name, email=email)

    # Create owner user
    user = create_user(
        tenant_id=tenant["id"],
        email=email,
        password=password,
        name=user_name,
        role="owner",
        scopes=["read", "write", "admin"],
    )

    return {
        "tenant": tenant,
        "user": user,
    }
