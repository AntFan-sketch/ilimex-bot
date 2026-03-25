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
      score += keyword.length > 8 ? 5 : 3;
    }
  }

  const asksTrialResults =
    /\b(trial|trials|results|mortality|forster|birds saved|performance)\b/.test(q);

  const asksHowItWorks =
    /\b(work|works|technology|uv|uvc|filter|air treatment|air sanitisation|air purification)\b/.test(q);

  const asksPricing =
    /\b(price|pricing|cost|quote|quotation|roi|payback|worth|estimate)\b/.test(q);

  if (asksTrialResults && chunk.id === "forster-trial-results") {
    score += 10;
  }

  if (asksTrialResults && chunk.category === "trial") {
    score += 4;
  }

  if (asksHowItWorks && chunk.id === "technology-how-it-works") {
    score += 10;
  }

  if (asksHowItWorks && chunk.category === "technology") {
    score += 4;
  }

  if (asksPricing && chunk.id === "commercial-pricing") {
    score += 10;
  }

  if (asksPricing && chunk.id === "commercial-roi") {
    score += 7;
  }

  if (asksPricing && chunk.category === "conversion") {
    score += 3;
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