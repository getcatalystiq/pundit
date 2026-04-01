"""Pytest configuration and fixtures."""

import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture
def mock_tenant_id():
    """Mock tenant ID for testing."""
    return "test-tenant-123"


@pytest.fixture
def mock_user_id():
    """Mock user ID for testing."""
    return "test-user-456"


@pytest.fixture
def mock_database_id():
    """Mock database ID for testing."""
    return "test-db-789"


@pytest.fixture
def sample_question():
    """Sample question for SQL generation."""
    return "What are the top 10 customers by total order value?"


@pytest.fixture
def sample_sql():
    """Sample SQL query."""
    return """
    SELECT c.name, SUM(o.total) as total_spent
    FROM customers c
    JOIN orders o ON c.id = o.customer_id
    WHERE o.status != 'cancelled'
    GROUP BY c.id, c.name
    ORDER BY total_spent DESC
    LIMIT 10;
    """


@pytest.fixture
def mock_db_connection():
    """Mock database connection."""
    with patch("psycopg2.connect") as mock_connect:
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn
        yield mock_conn, mock_cursor


@pytest.fixture
def sample_rag_context():
    """Sample RAG context for testing."""
    return {
        "ddl": [
            "CREATE TABLE customers (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(100));",
            "CREATE TABLE orders (id SERIAL PRIMARY KEY, customer_id INT, total DECIMAL(10,2), status VARCHAR(50));",
        ],
        "documentation": [
            "The orders table tracks all customer purchases. Status can be: pending, shipped, delivered, cancelled.",
        ],
        "examples": [
            {
                "question": "List all customers",
                "sql": "SELECT * FROM customers ORDER BY name;",
            }
        ],
    }
