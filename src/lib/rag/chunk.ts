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
  // High-level / overview
  "executive summary": "executive_summary",
  summary: "executive_summary",
  introduction: "executive_summary",
  "ngs summary": "executive_summary",
  "sequencing summary": "executive_summary",
  "sample overview": "executive_summary",
  "sample summary": "executive_summary",

  // Methodology / trial setup
  methodology: "methodology",
  "trial description": "methodology",
  "trial design": "methodology",
  protocol: "methodology",
  sampling: "methodology",
  "materials and methods": "methodology",
  methods: "methodology",

  // Environment
  "environmental conditions": "environment",
  environment: "environment",
  airflow: "environment",
  "house environment": "environment",

  // Performance / production
  performance: "performance",
  yield: "performance",
  "production performance": "performance",
  "bird performance": "performance",

  // ITS1 – fungal / mycobiome (airborne fungi)
  its1: "its1_fungal",
  "its1 results": "its1_fungal",
  "its1 airborne fungal": "its1_fungal",
  "its1 airborne fungi": "its1_fungal",
  "airborne fungal": "its1_fungal",
  "airborne fungi": "its1_fungal",
  fungal: "its1_fungal",
  mycobiome: "its1_fungal",

  // 16S – bacterial microbiome
  "16s": "s16_bacteria",
  "16s results": "s16_bacteria",
  "16s bacterial": "s16_bacteria",
  "bacterial profile": "s16_bacteria",
  "bacterial community": "s16_bacteria",
  bacterial: "s16_bacteria",
  microbiome: "s16_bacteria",

  // 18S – eukaryotic community
  "18s": "s18_eukaryotic",
  "18s results": "s18_eukaryotic",
  "eukaryotic profile": "s18_eukaryotic",
  eukaryotic: "s18_eukaryotic",

  // General microbiology / NGS sections
  microbiology: "microbiology_general",
  "microbiology overview": "microbiology_general",
  "microbiology summary": "microbiology_general",
  "taxonomic summary": "microbiology_general",
  "ngs results": "microbiology_general",
  "sequencing results": "microbiology_general",

  // Interpretation / conclusions
  interpretation: "interpretation",
  "integrated interpretation": "interpretation",
  "overall interpretation": "interpretation",
  discussion: "interpretation",

  conclusion: "conclusion",
  "overall conclusion": "conclusion",
};

// ---------------------------------------------
// FUZZY KEYWORD MATCHES
// ---------------------------------------------
const fuzzyRules: { label: SectionLabel; patterns: RegExp[] }[] = [
  {
    label: "executive_summary",
    patterns: [
      /summary/i,
      /overview/i,
      /executive/i,
      /introduction/i,
      /sample overview/i,
      /sample summary/i,
      /ngs summary/i,
      /sequencing summary/i,
    ],
  },
  {
    label: "methodology",
    patterns: [
      /method/i,
      /protocol/i,
      /sampling/i,
      /trial design/i,
      /setup/i,
      /materials and methods/i,
      /\bmethods\b/i,
    ],
  },
  {
    label: "environment",
    patterns: [
      /environment/i,
      /temperature/i,
      /humidity/i,
      /\bco2\b/i,
      /airflow/i,
      /ventilation/i,
    ],
  },
  {
    label: "performance",
    patterns: [/yield/i, /production/i, /performance/i, /\bkg\b/i, /class/i],
  },
  {
    label: "its1_fungal",
    patterns: [
      /its1/i,
      /fungal/i,
      /fungi/i,
      /airborne fungal/i,
      /airborne fungi/i,
      /aspergillus/i,
      /cladosporium/i,
      /wallemia/i,
      /mycobiome/i,
    ],
  },
  {
    label: "s16_bacteria",
    patterns: [
      /16s/i,
      /bacterial/i,
      /microbiome/i,
      /bacterial community/i,
      /bacterial profile/i,
    ],
  },
  {
    label: "s18_eukaryotic",
    patterns: [/18s/i, /eukaryotic/i, /eukaryote/i],
  },
  {
    label: "microbiology_general",
    patterns: [
      /microbiology/i,
      /taxonomic summary/i,
      /taxa summary/i,
      /ngs results/i,
      /sequencing results/i,
    ],
  },
  {
    label: "interpretation",
    patterns: [/interpretation/i, /integrated/i, /discussion/i, /implication/i],
  },
  {
    label: "conclusion",
    patterns: [/conclusion/i, /overall/i, /summary of findings/i],
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
// Detect if a line is a heading (markdown or ALL CAPS)
// ---------------------------------------------
function detectHeadingLine(line: string): { isHeading: boolean; headingText: string } {
  const trimmed = line.trim();
  if (!trimmed) return { isHeading: false, headingText: "" };

  // 1. Markdown-style headings: "# Heading", "## Heading", etc.
  const mdMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
  if (mdMatch) {
    const headingText = mdMatch[2].trim();
    return { isHeading: true, headingText };
  }

  // 2. Existing ALL-CAPS heuristic
  const isAllCapsHeading =
    trimmed.length > 0 &&
    trimmed.length < 80 &&
    /^[A-Za-z0-9 ()\-–&]+$/.test(trimmed) &&
    trimmed === trimmed.toUpperCase();

  if (isAllCapsHeading) {
    return { isHeading: true, headingText: trimmed };
  }

  return { isHeading: false, headingText: "" };
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
    const { isHeading, headingText } = detectHeadingLine(line);

    if (isHeading) {
      // Flush previous
      if (buffer.length > 0) {
        sections.push({
          section: currentSection,
          text: buffer.join("\n"),
        });
        buffer = [];
      }

      currentSection = detectSection(headingText);
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
