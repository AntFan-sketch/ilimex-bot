// src/lib/rag/chunk.ts
//
// Section-aware chunking for IlimexBot
// - Detects scientific headings (strict + fuzzy)
// - Splits documents into labelled sections
// - Chunks within each section (1000 chars + overlap)
// - Returns structured section-aware chunks
//

// ---------------------------------------------
// SECTION LABEL DEFINITIONS
// ---------------------------------------------
export type SectionLabel =
  | "executive_summary"
  | "methodology"
  | "environment"
  | "performance"
  | "its1_fungal"
  | "s16_bacteria"
  | "s18_eukaryotic"
  | "microbiology_general"
  | "interpretation"
  | "conclusion"
  | "unknown";

// ---------------------------------------------
// STRICT HEADING MATCHES
// ---------------------------------------------
const strictMap: Record<string, SectionLabel> = {
  "executive summary": "executive_summary",
  summary: "executive_summary",
  introduction: "executive_summary",

  methodology: "methodology",
  "trial description": "methodology",
  "trial design": "methodology",
  protocol: "methodology",
  sampling: "methodology",

  "environmental conditions": "environment",
  environment: "environment",
  airflow: "environment",

  performance: "performance",
  yield: "performance",
  "production performance": "performance",

  its1: "its1_fungal",
  "airborne fungal": "its1_fungal",
  fungal: "its1_fungal",
  mycobiome: "its1_fungal",

  "16s": "s16_bacteria",
  bacterial: "s16_bacteria",
  microbiome: "s16_bacteria",

  "18s": "s18_eukaryotic",
  eukaryotic: "s18_eukaryotic",

  interpretation: "interpretation",
  "integrated interpretation": "interpretation",

  conclusion: "conclusion",
  "overall conclusion": "conclusion",
};

// ---------------------------------------------
// FUZZY KEYWORD MATCHES
// ---------------------------------------------
const fuzzyRules: { label: SectionLabel; patterns: RegExp[] }[] = [
  {
    label: "executive_summary",
    patterns: [/summary/i, /overview/i, /executive/i, /introduction/i],
  },
  {
    label: "methodology",
    patterns: [/method/i, /protocol/i, /sampling/i, /trial design/i, /setup/i],
  },
  {
    label: "environment",
    patterns: [/environment/i, /temperature/i, /humidity/i, /co2/i, /airflow/i],
  },
  {
    label: "performance",
    patterns: [/yield/i, /production/i, /performance/i, /kg/i, /class/i],
  },
  {
    label: "its1_fungal",
    patterns: [/its1/i, /fungal/i, /aspergillus/i, /cladosporium/i, /wallemia/i],
  },
  {
    label: "s16_bacteria",
    patterns: [/16s/i, /bacterial/i, /microbiome/i],
  },
  {
    label: "s18_eukaryotic",
    patterns: [/18s/i, /eukaryotic/i],
  },
  {
    label: "interpretation",
    patterns: [/interpretation/i, /integrated/i],
  },
  {
    label: "conclusion",
    patterns: [/conclusion/i, /overall/i],
  },
];

// ---------------------------------------------
// UTIL: Normalise text
// ---------------------------------------------
function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------
// Detect a section label from heading text
// ---------------------------------------------
function detectSection(heading: string): SectionLabel {
  const clean = heading.toLowerCase().trim();

  // 1. strict match
  if (strictMap[clean]) return strictMap[clean];

  // 2. fuzzy match
  for (const rule of fuzzyRules) {
    if (rule.patterns.some((p) => p.test(clean))) {
      return rule.label;
    }
  }

  return "unknown";
}

// ---------------------------------------------
// Split text into sections by detecting headings
// Returns array: { section, text }
// ---------------------------------------------
function splitIntoSections(fullText: string): { section: SectionLabel; text: string }[] {
  const lines = fullText.split(/\r?\n/);
  let currentSection: SectionLabel = "unknown";
  let buffer: string[] = [];

  const sections: { section: SectionLabel; text: string }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect heading lines (strict or fuzzy)
    // Heuristic: heading-like if short & not a sentence
    const isHeading =
      trimmed.length > 0 &&
      trimmed.length < 80 &&
      /^[A-Za-z0-9 ()\-–&]+$/.test(trimmed) &&
      trimmed === trimmed.toUpperCase();

    if (isHeading) {
      // Flush previous
      if (buffer.length > 0) {
        sections.push({
          section: currentSection,
          text: buffer.join("\n"),
        });
        buffer = [];
      }

      currentSection = detectSection(trimmed);
      continue;
    }

    buffer.push(line);
  }

  // Flush last section
  if (buffer.length > 0) {
    sections.push({
      section: currentSection,
      text: buffer.join("\n"),
    });
  }

  return sections;
}

// ---------------------------------------------
// Chunk text within each section
// ---------------------------------------------
function chunkSectionText(
  section: SectionLabel,
  text: string,
  chunkSize = 1000,
  overlap = 200
): { section: SectionLabel; text: string }[] {
  const chunks: { section: SectionLabel; text: string }[] = [];
  const clean = normalise(text);

  for (let i = 0; i < clean.length; i += chunkSize - overlap) {
    const chunkText = clean.slice(i, i + chunkSize);
    if (chunkText.trim().length > 0) {
      chunks.push({ section, text: chunkText });
    }
  }

  return chunks;
}

// ---------------------------------------------
// MAIN EXPORT
// Takes full document text → returns section-aware chunks
// ---------------------------------------------
export function chunkTextWithSections(
  fullText: string,
  chunkSize = 1000,
  overlap = 200
): { section: SectionLabel; text: string }[] {
  const sections = splitIntoSections(fullText);
  const output: { section: SectionLabel; text: string }[] = [];

  for (const sec of sections) {
    const chunks = chunkSectionText(sec.section, sec.text, chunkSize, overlap);
    output.push(...chunks);
  }

  return output;
}
