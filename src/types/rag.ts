// src/types/rag.ts (or similar)

export type UIMode = "internal" | "external";

export interface SourceChunk {
  id: string;
  rank: number;              // 1, 2, 3... based on score order
  section?: string;          // e.g. "its1_fungal", "s16_bacteria"
  textPreview: string;       // short snippet of the chunk
  score?: number;            // final score from retrieval
  documentLabel?: string;    // e.g. "Poultry Trial – CG NGS Report"
  debug?: {
    baseSim?: number;
    normalizedSim?: number;
    sectionWeight?: number;
  };
}
