// src/lib/bot/retrieveExternalKnowledge.ts

import {
  EXTERNAL_KNOWLEDGE_CHUNKS,
  type ExternalKnowledgeChunk,
} from "@/lib/bot/externalKnowledge";

type SectorHint = "mushroom" | "poultry" | "general";

function normalise(text: string) {
  return text.toLowerCase();
}

function isMushroomQuery(query: string) {
  return (
    /\b(mushroom|mushrooms|tunnel|tunnels|growing room|growing rooms|aspergillus|cladosporium|penicillium|wallemia|fungi|fungal|mould|mold|ngs|sequencing)\b/i.test(
      query
    ) || /(?:around|approximately|approx\.?|~)?\s*17\s*%/i.test(query)
  );
}

function isPoultryQuery(query: string) {
  return (
    /\b(poultry|broiler|broilers|layer|layers|breeder|breeders|shed|sheds|bird|birds|flock|flocks|avian|forster|crop 1|crop 2|crop 3|birds saved|surviving birds)\b/i.test(
      query
    ) || /(?:around|approximately|approx\.?|~)?\s*(?:7|14|1\.02|0\.5)\s*%/i.test(query)
  );
}

function scoreChunk(
  query: string,
  chunk: ExternalKnowledgeChunk,
  sectorHint: SectorHint
): number {
  const q = normalise(query);
  let score = 0;

  for (const keyword of chunk.keywords ?? []) {
    if (q.includes(keyword.toLowerCase())) {
      score += keyword.length > 8 ? 5 : 3;
    }
  }

  const asksTrialResults =
    /\b(trial|trials|results|yield|performance|improvement|uplift|mortality)\b/.test(q);

  const asksSequencing =
    /\b(ngs|sequencing|aspergillus|cladosporium|penicillium|wallemia|fungi|fungal|mould|mold|viability)\b/.test(
      q
    );

  const asksCommercial =
    /\b(price|pricing|cost|quote|quotation|roi|payback|worth|estimate|commercial|fit|relevant|tunnel|tunnels|rooms|deployment)\b/.test(
      q
    );

  const asksHowItWorks =
    /\b(work|works|technology|uv|uvc|filter|air treatment|air sanitisation|air purification|ozone|ventilation|safe|safety|sealed chamber)\b/.test(
      q
    );

  const asksProfessionalAdvice =
    /\b(sick|disease|treatment|medicine|veterinarian|vet|tax|tax credit|r&d tax|legal|regulatory)\b/.test(q);

  const asksConfidential =
    /\b(investor|investors|investment|fundraising|patent|manufacturing cost|cost to manufacture|bom|bill of materials|supplier|internal|confidential|unpublished|system prompt|hidden instructions|credentials|source code)\b/.test(q);

  // Sector bias
  if (sectorHint === "mushroom") {
    if (chunk.id.includes("mushroom")) score += 20;
    if (chunk.category.toLowerCase().includes("mushroom")) score += 10;
    if (chunk.id.includes("poultry") || chunk.id.includes("forster")) score -= 25;
  }

  if (sectorHint === "poultry") {
    if (chunk.id.includes("poultry") || chunk.id.includes("forster")) score += 20;
    if (chunk.id.includes("mushroom")) score -= 25;
  }

  // Intent boosts
  if (asksTrialResults) {
    if (sectorHint === "mushroom" && chunk.id === "mushroom-trial-results") score += 18;
    if (sectorHint === "poultry" && chunk.id === "forster-trial-results") score += 18;
    if (sectorHint === "general") {
      if (chunk.id === "mushroom-trial-results") score += 8;
      if (chunk.id === "forster-trial-results") score += 8;
    }
    if (chunk.category === "trial") score += 5;
  }

  if (asksSequencing) {
    if (chunk.id === "mushroom-trial-environment") score += 20;
    if (chunk.id === "mushroom-approved-wording") score += 12;
  }

  if (asksCommercial) {
    if (sectorHint === "mushroom" && chunk.id === "mushroom-commercial-guidance") score += 18;
    if (chunk.id === "commercial-pricing") score += 10;
    if (chunk.id === "commercial-roi") score += 7;
    if (chunk.category === "conversion") score += 4;
  }

  if (asksHowItWorks) {
    if (chunk.id === "technology-how-it-works") score += 12;
    if (chunk.id === "technology-safety-and-ventilation") score += 18;
    if (chunk.category === "technology") score += 5;
  }

  if (asksProfessionalAdvice && chunk.id === "public-scope-and-professional-advice") {
    score += 30;
  }

  if (asksConfidential && chunk.id === "confidentiality-boundary") {
    score += 35;
  }

  return score;
}

export function retrieveExternalKnowledge(
  userQuery: string,
  maxChunks = 3,
  sectorHint: SectorHint = "general"
) {
  const inferredSector: SectorHint =
    sectorHint !== "general"
      ? sectorHint
      : isMushroomQuery(userQuery)
      ? "mushroom"
      : isPoultryQuery(userQuery)
      ? "poultry"
      : "general";

  const scored = EXTERNAL_KNOWLEDGE_CHUNKS.map((chunk) => ({
    chunk,
    score: scoreChunk(userQuery, chunk, inferredSector),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  let selected = scored.slice(0, maxChunks).map((item) => item.chunk);

  // Force mushroom guardrail chunk into mushroom answers
  if (inferredSector === "mushroom") {
    const approved = EXTERNAL_KNOWLEDGE_CHUNKS.find(
      (chunk) => chunk.id === "mushroom-approved-wording"
    );

    if (approved && !selected.some((chunk) => chunk.id === approved.id)) {
      selected = [approved, ...selected].slice(0, maxChunks);
    }
  }

  // Mushroom fallback
  if (selected.length === 0 && inferredSector === "mushroom") {
    return EXTERNAL_KNOWLEDGE_CHUNKS.filter((chunk) =>
      [
        "mushroom-trial-results",
        "mushroom-trial-environment",
        "mushroom-approved-wording",
      ].includes(chunk.id)
    );
  }

  // Poultry fallback
  if (selected.length === 0 && inferredSector === "poultry") {
    return EXTERNAL_KNOWLEDGE_CHUNKS.filter((chunk) =>
      [
        "forster-trial-results",
        "technology-how-it-works",
        "conversion-guidance",
      ].includes(chunk.id)
    );
  }

  // General fallback
  if (selected.length === 0) {
    return EXTERNAL_KNOWLEDGE_CHUNKS.filter((chunk) =>
      [
        "positioning-core",
        "company-public-profile",
        "technology-how-it-works",
      ].includes(chunk.id)
    );
  }

  return selected;
}

export function buildRetrievedKnowledgePrompt(
  userQuery: string,
  sectorHint: SectorHint = "general"
) {
  const chunks = retrieveExternalKnowledge(userQuery, 3, sectorHint);

  return chunks
    .map(
      (chunk) => `CHUNK: ${chunk.title}
CATEGORY: ${chunk.category}
ID: ${chunk.id}
${chunk.content}`
    )
    .join("\n\n---\n\n");
}