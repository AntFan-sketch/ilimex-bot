// src/lib/retrieval.ts

import OpenAI from "openai";
import { ChatMessage } from "@/types/chat";
import {
  getIlimexEmbeddings,
  IlimexEmbeddingRecord,
} from "../data/ilimex-knowledge";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (magA === 0 || magB === 0) return 0;

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export async function retrieveRelevantKnowledge(
  messages: ChatMessage[],
  topK = 3,
): Promise<IlimexEmbeddingRecord[]> {
  const lastUserMessage = messages
    .filter((m) => m.role === "user")
    .slice(-1)[0]?.content;

  if (!lastUserMessage) return [];

  const queryEmbedding = await client.embeddings.create({
    model: "text-embedding-3-large",
    input: lastUserMessage,
  });

  const queryVector = queryEmbedding.data[0].embedding;
  const knowledge = getIlimexEmbeddings();

  const scored = knowledge
    .map((k) => ({
      ...k,
      score: cosineSimilarity(queryVector, k.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}
