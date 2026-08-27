import { OpenAI } from "openai";

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  return new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 });
}

// Embed text using OpenAI
export async function embedText(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  const embedding = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return embedding.data[0].embedding;
}

// Cosine similarity
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] ** 2;
    magB += b[i] ** 2;
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
