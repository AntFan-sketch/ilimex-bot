// src/lib/retrieval.ts

/**
 * Minimal legacy retrieval utilities.
 * Currently not wired into the new IlimexBot RAG pipeline,
 * but kept so older imports (if any) have something to point to.
 */

export interface RetrievalResult<T = unknown> {
  item: T;
  score: number;
}

/**
 * Sorts retrieval results by score (descending) and returns the top K.
 */
export function rankByScore<T>(
  items: RetrievalResult<T>[],
  topK: number = 5
): RetrievalResult<T>[] {
  return [...items].sort((a, b) => b.score - a.score).slice(0, topK);
}
