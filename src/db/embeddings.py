"""OpenAI embeddings for RAG search."""

import logging
from typing import Optional

import openai

from ..utils.secrets import get_openai_api_key

logger = logging.getLogger(__name__)

_openai_client: Optional[openai.OpenAI] = None

# OpenAI text-embedding-3-small produces 1536 dimensions
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536


def _get_client() -> openai.OpenAI:
    """Get or create OpenAI client."""
    global _openai_client

    if _openai_client is None:
        api_key = get_openai_api_key()
        _openai_client = openai.OpenAI(api_key=api_key)

    return _openai_client


def generate_embedding(text: str) -> list[float]:
    """
    Generate embedding for a single text.

    Args:
        text: Text to embed

    Returns:
        1536-dimensional embedding vector
    """
    if not text or not text.strip():
        raise ValueError("Cannot generate embedding for empty text")

    client = _get_client()

    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text.strip(),
        dimensions=EMBEDDING_DIMENSIONS,
    )

    embedding = response.data[0].embedding
    logger.debug(f"Generated embedding for text ({len(text)} chars)")

    return embedding


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Generate embeddings for multiple texts in a single API call.

    Args:
        texts: List of texts to embed

    Returns:
        List of 1536-dimensional embedding vectors
    """
    if not texts:
        return []

    # Filter empty texts and track indices
    valid_texts = []
    valid_indices = []
    for i, text in enumerate(texts):
        if text and text.strip():
            valid_texts.append(text.strip())
            valid_indices.append(i)

    if not valid_texts:
        return [[] for _ in texts]

    client = _get_client()

    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=valid_texts,
        dimensions=EMBEDDING_DIMENSIONS,
    )

    # Build result list with embeddings in correct positions
    result = [[] for _ in texts]
    for i, embedding_data in enumerate(response.data):
        original_index = valid_indices[i]
        result[original_index] = embedding_data.embedding

    logger.debug(f"Generated {len(valid_texts)} embeddings")

    return result
