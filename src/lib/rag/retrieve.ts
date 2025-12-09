// src/lib/rag/retrieve.ts

import { embedText } from "@/lib/rag/embed";

export interface RetrievableChunk {
  id: string;
  text: string;
  embedding: number[];
  section?: string; // Section label as a string
}

// What the route expects back: an id + score
export interface RetrievedChunkScore {
  id: string;
  score: number;
}

// -----------------------------
// Cosine similarity helper
// -----------------------------
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// -----------------------------
// Section weighting
// -----------------------------
//
// We don't strictly know the exact label union here,
// so we treat it as a string for weighting purposes.
const SECTION_WEIGHTS: Record<string, number> = {
  results: 1.3,
  conclusion: 1.3,
  discussion: 1.2,
  summary: 1.2,
  "executive-summary": 1.2,

  introduction: 1.0,
  background: 1.0,
  body: 1.0,

  methods: 0.9,
  methodology: 0.9,
  appendix: 0.8,
  references: 0.8,
  bibliography: 0.8,
};

function weightForSection(section?: string): number {
  if (!section) return 1;
  const key = section.toLowerCase();
  return SECTION_WEIGHTS[key] ?? 1;
}

// -----------------------------
// Retrieval options
// -----------------------------
export interface RetrieveOptions {
  topK?: number;
  minScore?: number; // cosine similarity threshold, usually 0–1
}

/**
 * Given a question and a list of chunks (with precomputed embeddings),
 * returns the top-K most relevant chunk IDs with scores.
 *
 * - Uses cosine similarity between the question embedding and each chunk.
 * - Applies simple section-based weighting.
 * - Filters out low-score chunks via a minScore threshold.
 */
export async function retrieveRelevantChunks(
  question: string,
  chunks: RetrievableChunk[],
  topK: number = 3,
  options: RetrieveOptions = {}
): Promise<RetrievedChunkScore[]> {
  if (!question.trim() || chunks.length === 0) return [];

  const queryEmbedding = await embedText(question);
  const scores: RetrievedChunkScore[] = [];

  for (const chunk of chunks) {
    if (!chunk.embedding || chunk.embedding.length === 0) continue;

    const baseSim = cosineSimilarity(queryEmbedding, chunk.embedding);
    const weight = weightForSection(chunk.section);
    const score = baseSim * weight;

    scores.push({ id: chunk.id, score });
  }

  if (scores.length === 0) return [];

  // Sort by score (desc)
  scores.sort((a, b) => b.score - a.score);

  // Apply relevance threshold
  const minScore = options.minScore ?? 0.2; // tweak as needed
  const filtered = scores.filter((s) => s.score >= minScore);

  if (filtered.length === 0) {
    // If everything is below threshold, just return an empty array
    // The route already knows how to fall back to raw-text context.
    return [];
  }

  return filtered.slice(0, topK);
}
