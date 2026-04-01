"""Tests for the generate_sql tool."""

import pytest
from unittest.mock import patch, MagicMock

# Import will be available when tests are run with proper PYTHONPATH
# from src.tools.generate import generate_sql
# from src.tools.context import set_context, clear_context


class TestGenerateSQL:
    """Tests for SQL generation tool."""

    def test_generate_sql_requires_question(self, mock_tenant_id, mock_user_id):
        """Test that generate_sql requires a question."""
        from src.tools.generate import generate_sql
        
        result = generate_sql(
            arguments={},
            tenant_id=mock_tenant_id,
            user_id=mock_user_id,
        )
        
        assert result.get("isError") is True
        assert "question is required" in str(result.get("content", []))

    def test_generate_sql_warns_without_context(
        self, mock_tenant_id, mock_user_id, sample_question
    ):
        """Test that generate_sql warns when no RAG context is available."""
        from src.tools.generate import generate_sql
        from src.tools.context import clear_context
        
        # Clear any existing context
        clear_context()
        
        result = generate_sql(
            arguments={"question": sample_question},
            tenant_id=mock_tenant_id,
            user_id=mock_user_id,
        )
        
        # Should warn about missing context but not error
        assert result.get("isError") is not True
        content_text = str(result.get("content", []))
        assert "Warning" in content_text or "context" in content_text.lower()

    def test_generate_sql_with_context(
        self, mock_tenant_id, mock_user_id, sample_question
    ):
        """Test SQL generation with RAG context."""
        from src.tools.generate import generate_sql
        from src.tools.context import set_context, clear_context
        
        # Clear and set up context
        clear_context()
        
        # Mock RAG context object
        mock_rag = MagicMock()
        mock_rag.to_prompt_sections.return_value = "## Schema\nCREATE TABLE test..."
        set_context("rag_context", mock_rag)
        
        result = generate_sql(
            arguments={"question": sample_question},
            tenant_id=mock_tenant_id,
            user_id=mock_user_id,
        )
        
        assert result.get("isError") is not True
        content_text = str(result.get("content", []))
        assert sample_question in content_text
        assert "SQL Generation Guidelines" in content_text

    def test_generate_sql_includes_guidelines(
        self, mock_tenant_id, mock_user_id, sample_question
    ):
        """Test that SQL generation includes helpful guidelines."""
        from src.tools.generate import generate_sql
        from src.tools.context import set_context, clear_context
        
        clear_context()
        
        mock_rag = MagicMock()
        mock_rag.to_prompt_sections.return_value = "## Schema\ntest"
        set_context("rag_context", mock_rag)
        
        result = generate_sql(
            arguments={"question": sample_question},
            tenant_id=mock_tenant_id,
            user_id=mock_user_id,
        )
        
        content_text = str(result.get("content", []))
        
        # Check for key guidelines
        assert "LIMIT" in content_text
        assert "NULL" in content_text or "appropriate" in content_text
        assert "execute_sql" in content_text
