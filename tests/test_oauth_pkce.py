"""Tests for OAuth PKCE implementation."""

import pytest
import base64
import hashlib


class TestPKCE:
    """Tests for PKCE code verifier and challenge."""

    def test_code_verifier_length(self):
        """Test that code verifier meets minimum length requirements."""
        from src.oauth.pkce import generate_code_verifier
        
        verifier = generate_code_verifier()
        
        # RFC 7636 requires 43-128 characters
        assert len(verifier) >= 43
        assert len(verifier) <= 128

    def test_code_verifier_characters(self):
        """Test that code verifier uses only allowed characters."""
        from src.oauth.pkce import generate_code_verifier
        
        verifier = generate_code_verifier()
        
        # RFC 7636 allows: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
        allowed_chars = set(
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
        )
        assert all(c in allowed_chars for c in verifier)

    def test_code_challenge_s256(self):
        """Test S256 code challenge generation."""
        from src.oauth.pkce import generate_code_challenge
        
        verifier = "test_verifier_12345678901234567890123456789012345"
        challenge = generate_code_challenge(verifier, method="S256")
        
        # Manually compute expected challenge
        digest = hashlib.sha256(verifier.encode()).digest()
        expected = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
        
        assert challenge == expected

    def test_code_challenge_plain(self):
        """Test plain code challenge (verifier == challenge)."""
        from src.oauth.pkce import generate_code_challenge
        
        verifier = "test_verifier_12345678901234567890123456789012345"
        challenge = generate_code_challenge(verifier, method="plain")
        
        assert challenge == verifier

    def test_verify_code_challenge_s256(self):
        """Test S256 code challenge verification."""
        from src.oauth.pkce import generate_code_verifier, generate_code_challenge, verify_code_challenge
        
        verifier = generate_code_verifier()
        challenge = generate_code_challenge(verifier, method="S256")
        
        assert verify_code_challenge(verifier, challenge, method="S256") is True

    def test_verify_code_challenge_fails_wrong_verifier(self):
        """Test that verification fails with wrong verifier."""
        from src.oauth.pkce import generate_code_verifier, generate_code_challenge, verify_code_challenge
        
        verifier = generate_code_verifier()
        challenge = generate_code_challenge(verifier, method="S256")
        
        wrong_verifier = generate_code_verifier()  # Different verifier
        
        assert verify_code_challenge(wrong_verifier, challenge, method="S256") is False

    def test_code_verifier_uniqueness(self):
        """Test that generated code verifiers are unique."""
        from src.oauth.pkce import generate_code_verifier
        
        verifiers = [generate_code_verifier() for _ in range(100)]
        
        # All should be unique
        assert len(set(verifiers)) == 100
