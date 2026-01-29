"""Tests for the context management module."""

import pytest


class TestContext:
    """Tests for context management."""

    def test_set_and_get_context(self):
        """Test setting and getting context values."""
        from src.tools.context import set_context, get_context, clear_context
        
        clear_context()
        
        set_context("test_key", "test_value")
        assert get_context("test_key") == "test_value"

    def test_get_context_returns_none_for_missing_key(self):
        """Test that get_context returns None for missing keys."""
        from src.tools.context import get_context, clear_context
        
        clear_context()
        
        assert get_context("nonexistent_key") is None

    def test_get_context_with_default(self):
        """Test get_context with default value."""
        from src.tools.context import get_context, clear_context
        
        clear_context()
        
        result = get_context("nonexistent_key", default="default_value")
        assert result == "default_value"

    def test_clear_context(self):
        """Test clearing all context."""
        from src.tools.context import set_context, get_context, clear_context
        
        set_context("key1", "value1")
        set_context("key2", "value2")
        
        clear_context()
        
        assert get_context("key1") is None
        assert get_context("key2") is None

    def test_context_overwrites_existing_key(self):
        """Test that setting a key overwrites existing value."""
        from src.tools.context import set_context, get_context, clear_context
        
        clear_context()
        
        set_context("key", "value1")
        set_context("key", "value2")
        
        assert get_context("key") == "value2"

    def test_context_handles_complex_values(self):
        """Test that context can store complex values."""
        from src.tools.context import set_context, get_context, clear_context
        
        clear_context()
        
        complex_value = {
            "list": [1, 2, 3],
            "nested": {"a": "b"},
            "tuple": (1, 2),
        }
        
        set_context("complex", complex_value)
        result = get_context("complex")
        
        assert result == complex_value
        assert result["list"] == [1, 2, 3]
        assert result["nested"]["a"] == "b"
