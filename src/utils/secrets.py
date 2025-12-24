"""AWS Secrets Manager utilities."""

import json
import logging
from functools import lru_cache
from typing import Any

import boto3
from botocore.exceptions import ClientError

from .config import config

logger = logging.getLogger(__name__)

_secrets_client = None


def _get_client():
    """Get or create Secrets Manager client."""
    global _secrets_client
    if _secrets_client is None:
        _secrets_client = boto3.client(
            "secretsmanager", region_name=config.aws_region
        )
    return _secrets_client


@lru_cache(maxsize=10)
def get_secret(secret_arn: str) -> dict[str, Any]:
    """
    Retrieve secret from AWS Secrets Manager.

    Args:
        secret_arn: ARN of the secret

    Returns:
        Parsed secret value as dict
    """
    try:
        client = _get_client()
        response = client.get_secret_value(SecretId=secret_arn)
        secret_string = response.get("SecretString")
        if not secret_string:
            raise ValueError(f"Secret {secret_arn} has no string value")
        return json.loads(secret_string)
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
    """Clear the secrets cache (useful for testing)."""
    get_secret.cache_clear()
