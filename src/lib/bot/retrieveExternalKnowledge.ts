// src/lib/bot/retrieveExternalKnowledge.ts

import { EXTERNAL_KNOWLEDGE_CHUNKS, type ExternalKnowledgeChunk } from "@/lib/bot/externalKnowledge";

function normalise(text: string) {
  return text.toLowerCase();
}

function scoreChunk(query: string, chunk: ExternalKnowledgeChunk): number {
  const q = normalise(query);
  let score = 0;

  for (const keyword of chunk.keywords) {
    if (q.includes(keyword.toLowerCase())) {
      score += keyword.length > 8 ? 4 : 3;
    }
  }

  if (chunk.category === "trial" && /\b(trial|trials|results|mortality|forster|birds)\b/.test(q)) {
    score += 2;
  }

  if (chunk.category === "technology" && /\b(work|works|technology|uv|uvc|filter)\b/.test(q)) {
    score += 2;
  }

  if (chunk.category === "conversion" && /\b(price|pricing|cost|quote|roi|payback|worth)\b/.test(q)) {
    score += 2;
  }

  return score;
}

export function retrieveExternalKnowledge(userQuery: string, maxChunks = 3) {
  const scored = EXTERNAL_KNOWLEDGE_CHUNKS.map((chunk) => ({
    chunk,
    score: scoreChunk(userQuery, chunk),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, maxChunks).map((item) => item.chunk);

  if (selected.length === 0) {
    return EXTERNAL_KNOWLEDGE_CHUNKS.filter(
      (chunk) =>
        chunk.id === "positioning-core" ||
        chunk.id === "technology-how-it-works" ||
        chunk.id === "conversion-guidance"
    );
  }

  return selected;
}

export function buildRetrievedKnowledgePrompt(userQuery: string) {
  const chunks = retrieveExternalKnowledge(userQuery, 3);

  return chunks
    .map(
      (chunk) => `CHUNK: ${chunk.title}
CATEGORY: ${chunk.category}
${chunk.content}`
    )
    .join("\n\n---\n\n");
}