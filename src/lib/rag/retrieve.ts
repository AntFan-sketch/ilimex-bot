// src/lib/rag/retrieve.ts
//
// Retrieval logic for IlimexBot RAG system.
// Now includes:
//  - Section-aware query intent classification
//  - Weighted semantic scoring
//  - Top-K chunk selection
//

import { embedText } from "./embed";
import type { SectionLabel } from "./chunk";

export interface RAGChunk {
  id: string;
  text: string;
  embedding: number[];
  docName?: string;
  section?: SectionLabel;
}

export interface RetrievedChunk {
  id: string;
  text: string;
  score: number;
  docName?: string;
  section?: SectionLabel;
}

// -----------------------------------------------------
// 1. Infer section intent from user query
// -----------------------------------------------------
export function inferQueryIntent(query: string): SectionLabel[] {
  const q = query.toLowerCase();

  const intents: SectionLabel[] = [];

  // Methodology
  if (/method|protocol|design|sampling|setup|how.*trial/i.test(q)) {
    intents.push("methodology");
  }

  // Environment
  if (/enviro|temp|humidity|co2|stability|airflow/i.test(q)) {
    intents.push("environment");
  }

  // Performance
  if (/yield|kg|output|production|performance|class/i.test(q)) {
    intents.push("performance");
  }

  // ITS1
  if (/its1|fungal|aspergillus|cladosporium|wallemia|mycobiome/i.test(q)) {
    intents.push("its1_fungal");
  }

  // 16S
  if (/16s|bacterial|microbiome/i.test(q)) {
    intents.push("s16_bacteria");
  }

  // 18S
  if (/18s|eukaryotic/i.test(q)) {
    intents.push("s18_eukaryotic");
  }

  // Interpretation
  if (/interpretation|integrated|summary.*findings/i.test(q)) {
    intents.push("interpretation");
  }

  // Conclusion
  if (/conclusion|overall.*results/i.test(q)) {
    intents.push("conclusion");
  }

  // Executive Summary
  if (/summary|overview/i.test(q)) {
    intents.push("executive_summary");
  }

  return intents.length > 0 ? intents : ["unknown"];
}

// -----------------------------------------------------
// 2. Compute cosine similarity
// -----------------------------------------------------
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// -----------------------------------------------------
// 3. Section-aware scoring
// -----------------------------------------------------
function applySectionBoost(
  score: number,
  section: SectionLabel | undefined,
  queryIntents: SectionLabel[]
): number {
  if (!section) return score;

  // Strong boost if section directly matches intent
  if (queryIntents.includes(section)) {
    return score * 1.5;
  }

  // Weak boost for microbiology if intent is ITS1/16S/18S
  if (
    section === "microbiology_general" &&
    (queryIntents.includes("its1_fungal") ||
      queryIntents.includes("s16_bacteria") ||
      queryIntents.includes("s18_eukaryotic"))
  ) {
    return score * 1.2;
  }

  return score; // unchanged otherwise
}

// -----------------------------------------------------
// 4. Main function: retrieveRelevantChunks
// -----------------------------------------------------
export async function retrieveRelevantChunks(
  query: string,
  chunks: RAGChunk[],
  topK = 5
): Promise<RetrievedChunk[]> {
  if (chunks.length === 0) return [];

  const queryEmbedding = await embedText(query);
  const queryIntents = inferQueryIntent(query);

  const scored: RetrievedChunk[] = chunks.map((chunk) => {
    let score = cosineSimilarity(queryEmbedding, chunk.embedding);
    score = applySectionBoost(score, chunk.section, queryIntents);

    return {
      id: chunk.id,
      text: chunk.text,
      score,
      docName: chunk.docName,
      section: chunk.section,
    };
  });

  // Sort highest score first
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}
