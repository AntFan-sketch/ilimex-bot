// src/lib/rag/retrieve.ts

import { embedText } from "@/lib/rag/embed";

export interface RetrievableChunk {
  id: string;
  text: string;
  embedding: number[];
  section?: string;       // Section label as a string (ex: "its1_fungal")
  uploadedAt?: string;    // Optional future field
}

export interface RetrievedChunkScore {
  id: string;
  score: number;
  debug?: {
    baseSim: number;
    normalizedSim: number;
    sectionWeight: number;
  };
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
// PRIORITY 2: Improved Section Weights
// -----------------------------
const SECTION_WEIGHTS: Record<string, number> = {
  // High-value microbiology sections
  its1_fungal: 1.25,
  s16_bacteria: 1.20,
  s18_eukaryotic: 1.10,
  microbiology_general: 1.15,

  // Interpretations & conclusions
  interpretation: 1.20,
  conclusion: 1.20,

  // Performance sections
  performance: 1.15,

  // Overview sections
  executive_summary: 1.10,
  summary: 1.10,

  // Methods, environment have lower weighting
  methodology: 0.9,
  environment: 1.0,

  // Default fallback
  unknown: 0.95,
};

function weightForSection(section?: string): number {
  if (!section) return 1.0;
  const key = section.toLowerCase();
  return SECTION_WEIGHTS[key] ?? 1.0;
}

// -----------------------------
// PRIORITY 2: Normalize similarities
// -----------------------------
function normalizeValues(values: number[]): number[] {
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (max === min) return values.map(() => 1); // avoid division by zero

  return values.map((v) => (v - min) / (max - min));
}

// -----------------------------
// Retrieval options
// -----------------------------
export interface RetrieveOptions {
  topK?: number;             // default 3

  // Backwards compatibility:
  // - minScore: older callers (e.g. route.ts) used this
  // - minNormalizedSim: new normalized similarity threshold
  minScore?: number;
  minNormalizedSim?: number; // default 0.15
}

/**
 * PRIORITY 2 UPGRADED RETRIEVAL:
 * - Compute raw cosine similarity
 * - Normalize similarities → 0..1
 * - Apply section weighting (domain-specific)
 * - Enforce a minimum normalized similarity cutoff
 * - Return top-K globally
 */
export async function retrieveRelevantChunks(
  question: string,
  chunks: RetrievableChunk[],
  topK: number = 3,
  options: RetrieveOptions = {}
): Promise<RetrievedChunkScore[]> {
  if (!question.trim() || chunks.length === 0) return [];

    const minNormalizedSim =
    options.minNormalizedSim ?? options.minScore ?? 0.15;

  const queryEmbedding = await embedText(question);

  // 1) Compute raw similarities
  const baseSims: number[] = [];

  const scored = chunks.map((chunk) => {
    const baseSim = cosineSimilarity(queryEmbedding, chunk.embedding);
    baseSims.push(baseSim);
    return { chunk, baseSim };
  });

  // 2) Normalize similarities
  const normalized = normalizeValues(baseSims);

  // 3) Apply section weighting + compute final score
  const enriched: RetrievedChunkScore[] = scored.map((entry, idx) => {
    const normSim = normalized[idx];
    const sectionWeight = weightForSection(entry.chunk.section);

    const finalScore = normSim * sectionWeight;

    return {
      id: entry.chunk.id,
      score: finalScore,
      debug: {
        baseSim: entry.baseSim,
        normalizedSim: normSim,
        sectionWeight,
      },
    };
  });

  // 4) Apply min threshold
  const filtered = enriched.filter((x) => x.debug!.normalizedSim >= minNormalizedSim);

  if (filtered.length === 0) return [];

  // 5) Sort globally & return top-K
  return filtered.sort((a, b) => b.score - a.score).slice(0, topK);
}
