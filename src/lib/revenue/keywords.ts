// src/lib/revenue/keywords.ts

export const KW = {
  pricing: ["price", "pricing", "cost", "quote", "how much", "€", "£", "$"],

  order: ["order", "buy", "purchase", "next steps", "get started"],

  install: ["install", "installation", "retrofit", "fit", "requirements"],

  trial: ["trial", "pilot", "test", "validation", "proof"],

  partnership: [
    "distributor",
    "distribution",
    "agent",
    "represent",
    "territory",
    "exclusive",
    "exclusivity",
  ],

  distributor: [
    "distributor",
    "dealer",
    "reseller",
    "agent",
    "channel partner",
    "distribution",
    "exclusive",
    "exclusivity",
    "territory",
    "represent",
    "representation",
  ],

  investor: [
    "invest",
    "investment",
    "equity",
    "raise",
    "valuation",
    "deck",
    "board pack",
  ],

  mushroom: [
    "mushroom",
    "agaricus",
    "exotics",
    "growing room",
    "tunnel",
    "flush",
    "yield",
    "ruffling",
  ],

  poultry: [
    "poultry",
    "broiler",
    "layer",
    "hatchery",
    "integrator",
    "mortality",
    "ammonia",
    "ventilation",
  ],

  biosecurityPain: [
    "pathogen",
    "aspergillus",
    "spores",
    "disease",
    "condemn",
    "infection",
    "biosecurity",
  ],

  authority: [
    "we operate",
    "our farm",
    "our houses",
    "our sites",
    "we run",
    "we manage",
  ],

  budget: ["budget", "capex", "opex", "payback", "roi"],

  urgencyImmediate: [
    "this month",
    "next month",
    "asap",
    "immediately",
    "urgent",
  ],

  urgencyQuarter: [
    "this quarter",
    "q1",
    "q2",
    "q3",
    "q4",
    "before summer",
  ],

  urgencyYear: ["this year", "2026", "2027"],

  // ✅ NEW: negative scoring dampers
  negativeDampers: [
    "student",
    "students",
    "school project",
    "college project",
    "university",
    "assignment",
    "homework",
    "thesis",
    "dissertation",
    "research paper",
    "literature review",
    "citation",
    "references",
    "bibliography",
    "academic",
    "journal",
    "study for class",
    "for a class",
    "just curious",
    "out of interest",
    "hypothetical",
    "example answer",
    "sample answer",
    "template answer",
    "practice answer",
    "roleplay",
    "pretend",
  ],
} as const;

// --------------------------------------------------

export function includesAny(text: string, needles: readonly string[]) {
  return needles.some((n) => text.includes(n));
}

export function normalizeText(s: string) {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}