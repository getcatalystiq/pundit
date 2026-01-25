"""PKCE (Proof Key for Code Exchange) utilities.

SECURITY: Only S256 method is supported. The "plain" method is explicitly
rejected as it provides no security benefit (RFC 7636 Section 7.2).
"""

import base64
import hashlib
import secrets


def generate_code_verifier(length: int = 64) -> str:
    """
    Generate a cryptographically random code verifier.

    Args:
        length: Length of verifier (43-128 chars per RFC 7636)

    Returns:
        URL-safe base64 encoded random string
    """
    # Generate random bytes and encode as URL-safe base64
    random_bytes = secrets.token_bytes(length)
    verifier = base64.urlsafe_b64encode(random_bytes).decode("utf-8").rstrip("=")
    return verifier[:128]  # Max 128 chars per spec


def generate_code_challenge(verifier: str, method: str = "S256") -> str:
    """
    Generate code challenge from verifier.

    Args:
        verifier: The code verifier
        method: Challenge method (only S256 is supported)

    Returns:
        Code challenge string

    Raises:
        ValueError: If method is not S256
    """
    # SECURITY: Only S256 is allowed. Plain method provides no security.
    if method != "S256":
        raise ValueError(
            f"Unsupported code challenge method: {method}. Only S256 is allowed."
        )

    # SHA256 hash, then base64url encode
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
    return challenge


def verify_code_challenge(
    verifier: str,
    challenge: str,
    method: str = "S256"
) -> bool:
    """
    Verify that a code verifier matches a code challenge.

    Args:
        verifier: The code verifier from token request
        challenge: The code challenge from authorization request
        method: Challenge method used (must be S256)

    Returns:
        True if verifier matches challenge
    """
    # SECURITY: Reject any method other than S256
    if method != "S256":
        return False

    expected_challenge = generate_code_challenge(verifier, method)
    return secrets.compare_digest(expected_challenge, challenge)
