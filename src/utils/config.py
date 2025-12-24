"""Configuration management."""

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Config:
    """Application configuration from environment variables."""

    # Aurora
    aurora_secret_arn: str = field(
        default_factory=lambda: os.environ.get("AURORA_SECRET_ARN", "")
    )
    aurora_cluster_arn: str = field(
        default_factory=lambda: os.environ.get("AURORA_CLUSTER_ARN", "")
    )
    aurora_database: str = field(
        default_factory=lambda: os.environ.get("AURORA_DATABASE", "pundit")
    )

    # OpenAI
    openai_secret_arn: str = field(
        default_factory=lambda: os.environ.get("OPENAI_SECRET_ARN", "")
    )

    # OAuth (issuer derived from request context if not set)
    oauth_issuer: str = field(
        default_factory=lambda: os.environ.get("OAUTH_ISSUER", "")
    )
    jwt_secret_key: Optional[str] = field(
        default_factory=lambda: os.environ.get("JWT_SECRET_KEY")
    )
    jwt_algorithm: str = "RS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30
    authorization_code_expire_minutes: int = 10

    # AWS
    aws_region: str = field(
        default_factory=lambda: os.environ.get("AWS_REGION", "us-east-1")
    )

    # Logging
    log_level: str = field(
        default_factory=lambda: os.environ.get("LOG_LEVEL", "INFO")
    )

    # MCP
    mcp_protocol_version: str = "2025-03-26"

    @property
    def is_configured(self) -> bool:
        """Check if required configuration is present."""
        return bool(self.aurora_secret_arn and self.aurora_cluster_arn)

    def get_oauth_issuer(self, event: dict = None) -> str:
        """Get OAuth issuer URL, deriving from request context if not configured."""
        if self.oauth_issuer:
            return self.oauth_issuer
        if event and "requestContext" in event:
            domain = event["requestContext"].get("domainName", "")
            if domain:
                return f"https://{domain}"
        return ""


# Singleton instance
config = Config()
