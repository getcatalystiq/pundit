"""Data models."""

# Models are defined as dataclasses in their respective modules
# This package serves as a namespace for type hints

from db.connections import DatabaseConfig, QueryResult

__all__ = ["DatabaseConfig", "QueryResult"]
