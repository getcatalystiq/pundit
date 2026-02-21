import { embed, embedMany, gateway } from "ai";

const MODEL = gateway.textEmbeddingModel("openai/text-embedding-3-small");

/**
 * Generate a single embedding vector (1536 dimensions).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: MODEL, value: text });
  return embedding;
}

/**
 * Generate embeddings for multiple texts in a single batch.
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const { embeddings } = await embedMany({ model: MODEL, values: texts });
  return embeddings;
}
