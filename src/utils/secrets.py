"""AWS Secrets Manager utilities.

SECURITY: Secrets are cached with a TTL to balance performance and security.
Cache is automatically cleared after TTL expires.
"""

import json
import logging
import time
from typing import Any, Optional

import boto3
from botocore.exceptions import ClientError

from .config import config

logger = logging.getLogger(__name__)

_secrets_client = None

# Cache configuration
CACHE_TTL_SECONDS = 1800  # 30 minutes
_secrets_cache: dict[str, tuple[dict, float]] = {}


def _get_client():
    """Get or create Secrets Manager client."""
    global _secrets_client
    if _secrets_client is None:
        _secrets_client = boto3.client(
            "secretsmanager", region_name=config.aws_region
        )
    return _secrets_client


def get_secret(secret_arn: str) -> dict[str, Any]:
    """
    Retrieve secret from AWS Secrets Manager with TTL-based caching.

    SECURITY: Secrets are cached for 30 minutes to balance performance
    with the ability to rotate credentials.

    Args:
        secret_arn: ARN of the secret

    Returns:
        Parsed secret value as dict
    """
    global _secrets_cache
    current_time = time.time()

    # Check cache
    if secret_arn in _secrets_cache:
        cached_value, cached_time = _secrets_cache[secret_arn]
        if current_time - cached_time < CACHE_TTL_SECONDS:
            return cached_value
        else:
            # Cache expired, remove it
            del _secrets_cache[secret_arn]

    # Fetch from Secrets Manager
    try:
        client = _get_client()
        response = client.get_secret_value(SecretId=secret_arn)
        secret_string = response.get("SecretString")
        if not secret_string:
            raise ValueError(f"Secret {secret_arn} has no string value")

        parsed_secret = json.loads(secret_string)

        # Cache with timestamp
        _secrets_cache[secret_arn] = (parsed_secret, current_time)

        # Log access for audit (without secret values)
        logger.info(f"Retrieved secret: {secret_arn.split(':')[-1]}")

        return parsed_secret

    except ClientError as e:
        logger.exception(f"Failed to retrieve secret {secret_arn}")
        raise RuntimeError(f"Failed to retrieve secret: {e}")


def get_aurora_credentials() -> dict[str, str]:
    """Get Aurora database credentials."""
    if not config.aurora_secret_arn:
        raise ValueError("AURORA_SECRET_ARN not configured")
    return get_secret(config.aurora_secret_arn)


def get_openai_api_key() -> str:
    """Get OpenAI API key."""
    if not config.openai_secret_arn:
        raise ValueError("OPENAI_SECRET_ARN not configured")
    secret = get_secret(config.openai_secret_arn)
    return secret.get("api_key", "")


def get_tenant_db_credentials(secret_arn: str) -> dict[str, Any]:
    """Get tenant database credentials."""
    return get_secret(secret_arn)


def clear_cache():
    """Clear the secrets cache (useful for testing or forced refresh)."""
    global _secrets_cache
    _secrets_cache = {}
    logger.info("Secrets cache cleared")


def invalidate_secret(secret_arn: str):
    """Invalidate a specific secret from cache."""
    global _secrets_cache
    if secret_arn in _secrets_cache:
        del _secrets_cache[secret_arn]
        logger.info(f"Invalidated cached secret: {secret_arn.split(':')[-1]}")
