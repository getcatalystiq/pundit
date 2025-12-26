"""Dynamic Client Registration (RFC 7591)."""

import logging
import secrets
from typing import Any, Optional

import bcrypt

from db.aurora import get_aurora_client, param

logger = logging.getLogger(__name__)

# Supported grant types and response types
SUPPORTED_GRANT_TYPES = ["authorization_code", "refresh_token"]
SUPPORTED_RESPONSE_TYPES = ["code"]
SUPPORTED_TOKEN_ENDPOINT_AUTH_METHODS = ["client_secret_basic", "client_secret_post", "none"]


def register_client(
    client_name: str,
    redirect_uris: list[str],
    grant_types: Optional[list[str]] = None,
    response_types: Optional[list[str]] = None,
    token_endpoint_auth_method: str = "client_secret_basic",
    client_uri: Optional[str] = None,
    scope: Optional[str] = None,
    tenant_id: Optional[str] = None,
    client_id: Optional[str] = None,
) -> dict[str, Any]:
    """
    Register a new OAuth client (Dynamic Client Registration).

    Args:
        client_name: Human-readable client name
        redirect_uris: List of allowed redirect URIs
        grant_types: Allowed grant types (default: authorization_code, refresh_token)
        response_types: Allowed response types (default: code)
        token_endpoint_auth_method: Auth method for token endpoint
        client_uri: URL of client's homepage
        scope: Space-separated list of allowed scopes
        tenant_id: Optional tenant ID to associate client with
        client_id: Optional client ID (if not provided, one is generated)

    Returns:
        Client registration response with client_id and client_secret
    """
    # Validate inputs
    if not client_name:
        raise ValueError("client_name is required")

    if not redirect_uris:
        raise ValueError("redirect_uris is required")

    # Validate redirect URIs
    for uri in redirect_uris:
        if not uri.startswith("https://") and not uri.startswith("http://localhost"):
            # Allow http://localhost for development, require HTTPS otherwise
            if not uri.startswith("http://127.0.0.1"):
                raise ValueError(f"Invalid redirect_uri: {uri}. Must use HTTPS or localhost.")

    # Set defaults
    grant_types = grant_types or ["authorization_code", "refresh_token"]
    response_types = response_types or ["code"]
    scope = scope or "read write"

    # Validate grant types
    for gt in grant_types:
        if gt not in SUPPORTED_GRANT_TYPES:
            raise ValueError(f"Unsupported grant_type: {gt}")

    # Validate response types
    for rt in response_types:
        if rt not in SUPPORTED_RESPONSE_TYPES:
            raise ValueError(f"Unsupported response_type: {rt}")

    # Validate auth method
    if token_endpoint_auth_method not in SUPPORTED_TOKEN_ENDPOINT_AUTH_METHODS:
        raise ValueError(f"Unsupported token_endpoint_auth_method: {token_endpoint_auth_method}")

    # Use provided client_id or generate one
    if not client_id:
        client_id = f"pundit_{secrets.token_urlsafe(16)}"

    # Generate client secret for confidential clients
    client_secret = None
    client_secret_hash = None
    if token_endpoint_auth_method != "none":
        client_secret = secrets.token_urlsafe(32)
        client_secret_hash = bcrypt.hashpw(
            client_secret.encode(), bcrypt.gensalt()
        ).decode()

    # Store in database
    aurora = get_aurora_client()
    # Convert lists to PostgreSQL array format
    def to_pg_array(items: list) -> str:
        """Convert Python list to PostgreSQL array literal."""
        escaped = [item.replace('"', '\\"') for item in items]
        return "{" + ",".join(f'"{item}"' for item in escaped) + "}"

    aurora.execute(
        """
        INSERT INTO oauth_clients
            (client_id, client_secret_hash, client_name, client_uri,
             redirect_uris, grant_types, response_types,
             token_endpoint_auth_method, scope, tenant_id)
        VALUES
            (:client_id, :client_secret_hash, :client_name, :client_uri,
             :redirect_uris::text[], :grant_types::text[], :response_types::text[],
             :token_endpoint_auth_method, :scope, :tenant_id::uuid)
        """,
        [
            param("client_id", client_id),
            param("client_secret_hash", client_secret_hash),
            param("client_name", client_name),
            param("client_uri", client_uri),
            param("redirect_uris", to_pg_array(redirect_uris)),
            param("grant_types", to_pg_array(grant_types)),
            param("response_types", to_pg_array(response_types)),
            param("token_endpoint_auth_method", token_endpoint_auth_method),
            param("scope", scope),
            param("tenant_id", tenant_id, "UUID" if tenant_id else None),
        ]
    )

    logger.info(f"Registered new OAuth client: {client_id} ({client_name})")

    # Build response (RFC 7591 format)
    response = {
        "client_id": client_id,
        "client_name": client_name,
        "redirect_uris": redirect_uris,
        "grant_types": grant_types,
        "response_types": response_types,
        "token_endpoint_auth_method": token_endpoint_auth_method,
        "scope": scope,
    }

    if client_secret:
        response["client_secret"] = client_secret
        # client_secret doesn't expire in this implementation
        response["client_secret_expires_at"] = 0

    if client_uri:
        response["client_uri"] = client_uri

    return response


def get_client(client_id: str) -> Optional[dict[str, Any]]:
    """
    Get OAuth client by client_id.

    Args:
        client_id: Client ID

    Returns:
        Client data or None if not found
    """
    aurora = get_aurora_client()
    return aurora.query_one(
        """
        SELECT client_id, client_secret_hash, client_name, client_uri,
               redirect_uris, grant_types, response_types,
               token_endpoint_auth_method, scope, tenant_id, is_active
        FROM oauth_clients
        WHERE client_id = :client_id
        """,
        [param("client_id", client_id)]
    )


def verify_client_secret(client_id: str, client_secret: str) -> bool:
    """
    Verify client credentials.

    Args:
        client_id: Client ID
        client_secret: Client secret to verify

    Returns:
        True if credentials are valid
    """
    client = get_client(client_id)

    if not client:
        return False

    if not client.get("is_active", True):
        return False

    # Public clients don't have secrets
    if not client.get("client_secret_hash"):
        return False

    try:
        return bcrypt.checkpw(
            client_secret.encode(),
            client["client_secret_hash"].encode()
        )
    except Exception:
        return False


def validate_redirect_uri(client_id: str, redirect_uri: str) -> bool:
    """
    Validate that a redirect URI is registered for the client.

    Args:
        client_id: Client ID
        redirect_uri: Redirect URI to validate

    Returns:
        True if redirect URI is valid for this client
    """
    client = get_client(client_id)

    if not client:
        return False

    redirect_uris = client.get("redirect_uris", [])

    # Exact match required
    return redirect_uri in redirect_uris
