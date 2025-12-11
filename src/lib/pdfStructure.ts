// src/lib/pdfStructure.ts

export type PdfBlockType = "heading" | "paragraph" | "table" | "table_raw" | "figure";

export interface PdfBlock {
  type: PdfBlockType;
  level?: number;        // for headings (1–3)
  text?: string;         // heading / paragraph / raw table / caption text
  rows?: string[][];     // for parsed tables
}

/**
 * Main entry point: take raw PDF text (from pdf-parse) and convert to structured blocks.
 */
export function extractPdfStructure(raw: string): PdfBlock[] {
  const normalised = normaliseWhitespace(raw);
  const lines = normalised.split("\n");

  const blocks: PdfBlock[] = [];
  let currentParagraphLines: string[] = [];

  const flushParagraph = () => {
    if (!currentParagraphLines.length) return;
    const text = mergeSoftWrappedLines(currentParagraphLines).trim();
    if (text.length > 0) {
      blocks.push({ type: "paragraph", text });
    }
    currentParagraphLines = [];
  };

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Blank line → paragraph boundary
    if (!line) {
      flushParagraph();
      i++;
      continue;
    }

    // Table region detection: consecutive "grid-like" lines
    if (looksLikeTableRow(line)) {
      flushParagraph();
      const tableLines: string[] = [rawLine];

      let j = i + 1;
      while (j < lines.length && looksLikeTableRow(lines[j].trim())) {
        tableLines.push(lines[j]);
        j++;
      }

      const tableBlock = parseTableBlock(tableLines);
      blocks.push(tableBlock);
      i = j;
      continue;
    }

    // Figure / caption detection
    if (looksLikeFigureCaption(line)) {
      flushParagraph();

      blocks.push({
        type: "figure",
        text: line.trim(),
      });

      i++;
      continue;
    }

    // Heading detection
    if (isHeading(line)) {
      flushParagraph();
      const headingLevel = getHeadingLevel(line);
      const headingText = cleanHeading(line);
      blocks.push({
        type: "heading",
        level: headingLevel,
        text: headingText,
      });
      i++;
      continue;
    }

    // Default → part of a paragraph
    currentParagraphLines.push(rawLine);
    i++;
  }

  // Flush trailing paragraph
  flushParagraph();

  return blocks;
}

/**
 * Flatten blocks back to text for the RAG pipeline.
 * Headings → markdown-style (#, ##, ###)
 * Tables → simple markdown tables where possible
 * Figures → FIGURE: caption
 */
export function flattenPdfBlocksToText(blocks: PdfBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    if (block.type === "heading") {
      const level = block.level ?? 2;
      const hashes = "#".repeat(Math.min(Math.max(level, 1), 6));
      parts.push(`${hashes} ${block.text ?? ""}`.trim(), "");
      continue;
    }

    if (block.type === "paragraph") {
      if (block.text && block.text.trim().length > 0) {
        parts.push(block.text.trim(), "");
      }
      continue;
    }

    if (block.type === "table" && block.rows && block.rows.length > 0) {
      const [header, ...rows] = block.rows;
      const headerLine = `| ${header.join(" | ")} |`;
      const dividerLine = `| ${header.map(() => "---").join(" | ")} |`;
      const rowLines = rows.map((row) => `| ${row.join(" | ")} |`);

      parts.push(headerLine, dividerLine, ...rowLines, "");
      continue;
    }

    if (block.type === "table_raw" && block.text) {
      parts.push("TABLE:", block.text.trim(), "");
      continue;
    }

    if (block.type === "figure" && block.text) {
      parts.push(`FIGURE: ${block.text.trim()}`, "");
      continue;
    }
  }

  // Join with newlines, collapse multiple blank lines
  const text = parts.join("\n");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/* ---------- Helpers ---------- */

function normaliseWhitespace(raw: string): string {
  let txt = raw.replace(/\r\n/g, "\n");
  txt = txt.replace(/\t/g, "    ");
  return txt;
}

/**
 * Merge lines that are likely soft-wrapped (i.e., same paragraph).
 */
function mergeSoftWrappedLines(lines: string[]): string {
  if (lines.length === 1) return lines[0];

  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (i === 0) {
      result.push(line.trim());
      continue;
    }

    const prev = result[result.length - 1];
    const prevChar = prev.slice(-1);

    if (/[.!?:"”)]/.test(prevChar) || prev.endsWith("-")) {
      // Likely a new sentence or hyphenation; join with newline
      result[result.length - 1] = prev + "\n" + line.trim();
    } else {
      // Soft wrap → join with space
      result[result.length - 1] = prev + " " + line.trim();
    }
  }

  return result.join("");
}

/**
 * Basic heading detection using textual heuristics
 * tuned for scientific / report-style PDFs.
 */
function isHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Ignore page numbers / bare numbers
  if (/^(page\s+\d+|\d+)$/i.test(trimmed)) return false;

  // Common NGS / report headings
  const keywordHeadings = [
    "introduction",
    "summary",
    "conclusion",
    "results",
    "discussion",
    "methods",
    "materials and methods",
    "sample overview",
    "sample summary",
    "sample information",
    "ngs summary",
    "sequencing summary",
    "taxonomic summary",
    "alpha diversity",
    "beta diversity",
    "quality control",
    "qc summary",
    "table of contents",
  ];

  const lower = trimmed.toLowerCase();
  if (keywordHeadings.includes(lower)) {
    return true;
  }

  // Short, title-like line
  if (trimmed.length <= 70) {
    const words = trimmed.split(/\s+/);
    const longWords = words.filter((w) => w.length > 2);

    const isMostlyCaps =
      longWords.length > 0 &&
      longWords.filter((w) => w === w.toUpperCase()).length / longWords.length >
        0.6;

    const isTitleCase =
      longWords.length > 0 &&
      longWords.filter((w) => /^[A-Z][a-z]+$/.test(w)).length / longWords.length >
        0.6;

    const endsWithColon = trimmed.endsWith(":");
    const endsWithSentencePunc = /[.!?]$/.test(trimmed);

    if ((isMostlyCaps || isTitleCase || endsWithColon) && !endsWithSentencePunc) {
      return true;
    }
  }

  // Numbered sections / figures / tables
  if (
    /^(\d+(\.\d+)*)\s+\S+/.test(trimmed) || // "1", "1.1", "2.3.4 Title"
    /^(section|chapter|figure|table)\s+\d+/i.test(trimmed)
  ) {
    return true;
  }

  return false;
}

/**
 * Infer heading "level" from simple cues.
 */
function getHeadingLevel(line: string): number {
  const trimmed = line.trim();
  const lower = trimmed.toLowerCase();

  if (
    /^(introduction|summary|results|discussion|conclusion|methods|materials and methods|ngs summary|sequencing summary)$/.test(
      lower
    )
  ) {
    return 1;
  }

  // Numbered headings: "1. Title", "2.1 Subtitle"
  if (/^\d+(\.\d+)*\s+\S+/.test(trimmed)) {
    const dotCount = (trimmed.split(" ")[0].match(/\./g) || []).length;
    if (dotCount === 0) return 1;
    if (dotCount === 1) return 2;
    return 3;
  }

  // Figures/Tables -> treat as level 3
  if (/^(figure|table)\s+\d+/i.test(trimmed)) {
    return 3;
  }

  return 2;
}

/**
 * Remove trailing colon and excessive spaces from heading text.
 */
function cleanHeading(line: string): string {
  return line.trim().replace(/:$/, "").replace(/\s{2,}/g, " ");
}

/**
 * Heuristic for detecting "tabular" lines: multiple columns separated by 2+ spaces or '|'.
 */
function looksLikeTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length < 5) return false;

  if (trimmed.includes("|")) return true;

  const columns = trimmed.split(/\s{2,}/).filter(Boolean);
  if (columns.length >= 2) {
    const shortCols = columns.filter((c) => c.length <= 25).length;
    return shortCols / columns.length >= 0.5;
  }

  return false;
}

/**
 * Parse lines that we believe are part of the same table into a PdfBlock.
 */
function parseTableBlock(lines: string[]): PdfBlock {
  const rows: string[][] = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.includes("|")) {
      return trimmed
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean);
    }

    return trimmed
      .split(/\s{2,}/)
      .map((cell) => cell.trim())
      .filter(Boolean);
  });

  if (!rows.length || rows.every((r) => r.length === 1)) {
    return {
      type: "table_raw",
      text: lines.join("\n"),
    };
  }

  return {
    type: "table",
    rows,
  };
}

/**
 * Heuristic to detect figure / chart / graph captions.
 */
function looksLikeFigureCaption(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^(figure|fig\.?|chart|graph)\s*\d+/i.test(trimmed)) {
    return true;
  }
  return false;
}
