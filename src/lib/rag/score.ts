// src/lib/rag/score.ts

import type { SectionLabel } from "./chunk";

export interface ScoredChunkInput {
  id: string;                 // `${docId}:${chunkIndex}` etc.
  docId: string;
  section: SectionLabel;
  text: string;
  similarity: number;         // raw cosine similarity from embeddings
  uploadedAt?: string;        // ISO date string, if available
}

export interface ScoredChunk extends ScoredChunkInput {
  score: number;              // final combined score
  debug?: {
    normalizedSim: number;
    sectionWeight: number;
    recencyWeight: number;
  };
}

export interface ScoreOptions {
  minNormalizedSim?: number;  // default 0.1
  topK?: number;              // default 6
  now?: Date;                 // for recency; default = new Date()
}

/**
 * Main entry point:
 *  - normalizes similarities
 *  - applies section weighting
 *  - applies recency bias
 *  - filters by minNormalizedSim
 *  - sorts and returns topK
 */
export function scoreAndFilterChunks(
  chunks: ScoredChunkInput[],
  options: ScoreOptions = {}
): ScoredChunk[] {
  if (chunks.length === 0) return [];

  const { minNormalizedSim = 0.1, topK = 6, now = new Date() } = options;

  const normalizedSims = normalizeSimilarities(chunks.map((c) => c.similarity));

  const scored: ScoredChunk[] = chunks.map((chunk, idx) => {
    const normalizedSim = normalizedSims[idx];

    const sectionWeight = getSectionWeight(chunk.section);
    const recencyWeight = getRecencyWeight(chunk.uploadedAt, now);

    // Base score is normalized similarity times the weights
    const score = normalizedSim * sectionWeight * recencyWeight;

    return {
      ...chunk,
      score,
      debug: {
        normalizedSim,
        sectionWeight,
        recencyWeight,
      },
    };
  });

  // Filter out very weak matches
  const filtered = scored.filter(
    (c) => c.debug && c.debug.normalizedSim >= minNormalizedSim
  );

  // Sort by score descending and take topK
  return filtered.sort((a, b) => b.score - a.score).slice(0, topK);
}

// ---------------------------------------------------------
// Similarity normalization
// ---------------------------------------------------------

/**
 * Normalize similarities into [0, 1] using min-max scaling.
 * If all values are identical, they all become 1.
 */
function normalizeSimilarities(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Avoid divide-by-zero: if all equal, treat them all as strongest (1)
  if (max === min) {
    return values.map(() => 1);
  }

  return values.map((v) => (v - min) / (max - min));
}

// ---------------------------------------------------------
// Section weighting
// ---------------------------------------------------------

/**
 * Per-section weights.
 * Values > 1 boost, < 1 down-weight.
 * Tuned for Ilimex's typical questions (microbiology-heavy).
 */
function getSectionWeight(section: SectionLabel): number {
  switch (section) {
    case "executive_summary":
      return 1.0; // good general context, but not overly boosted
    case "methodology":
      return 0.9; // useful but often secondary for direct "what happened" questions
    case "environment":
      return 1.0;
    case "performance":
      return 1.1; // often directly relevant (yields, kg, classes)
    case "its1_fungal":
      return 1.2; // key section for fungal / Aspergillus / Cladosporium questions
    case "s16_bacteria":
      return 1.1; // bacterial questions
    case "s18_eukaryotic":
      return 1.0;
    case "microbiology_general":
      return 1.05;
    case "interpretation":
      return 1.1; // high value for "what does this mean" type questions
    case "conclusion":
      return 1.15; // nice high-level summary
    case "unknown":
    default:
      return 0.9; // slightly down-weight unknown sections
  }
}

// ---------------------------------------------------------
// Recency bias
// ---------------------------------------------------------

/**
 * Compute a recency weight in [0.8, 1.2] based on age in days.
 * - < 30 days: 1.2
 * - 30–180 days: 1.0
 * - > 180 days: 0.9
 * If no timestamp, neutral weight (1.0).
 */
function getRecencyWeight(
  uploadedAt: string | undefined,
  now: Date
): number {
  if (!uploadedAt) return 1.0;

  const uploadedDate = new Date(uploadedAt);
  if (isNaN(uploadedDate.getTime())) return 1.0;

  const msPerDay = 1000 * 60 * 60 * 24;
  const ageDays = (now.getTime() - uploadedDate.getTime()) / msPerDay;

  if (ageDays <= 30) return 1.2;
  if (ageDays <= 180) return 1.0;
  return 0.9;
}
