// src/lib/chunkText.ts

export interface Chunk {
  id: string;            // e.g. "docKey:0" (you can prepend docKey externally)
  text: string;
  startChar: number;
  endChar: number;
  sectionHeading?: string;
  sectionLevel?: number;
  sectionIndex?: number; // index of the section in the doc
}

interface ChunkOptions {
  maxChunkSize?: number;   // default 1000
  overlap?: number;        // default 200
}

/**
 * Split text into chunks, respecting markdown headings (#, ##, ###).
 * Assumes `text` can include headings that came from DOCX, TXT, or PDFs.
 */
export function chunkTextWithHeadings(
  text: string,
  opts: ChunkOptions = {}
): Chunk[] {
  const maxChunkSize = opts.maxChunkSize ?? 1000;
  const overlap = opts.overlap ?? 200;

  const lines = text.split(/\r?\n/);

  type Section = {
    heading?: string;
    level?: number;
    startLine: number;
    endLine: number;
  };

  const sections: Section[] = [];
  let currentSection: Section | null = null;

  const flushSection = (endLineIdx: number) => {
    if (!currentSection) return;
    currentSection.endLine = endLineIdx;
    sections.push(currentSection);
    currentSection = null;
  };

  const headingRegex = /^(#{1,6})\s+(.*)$/;

  // 1) Identify sections based on markdown headings
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(headingRegex);

    if (match) {
      // Close previous section (ends at previous line)
      flushSection(i - 1);

      const hashes = match[1];
      const headingText = match[2].trim();

      currentSection = {
        heading: headingText,
        level: hashes.length,
        startLine: i,
        endLine: i, // temporary, updated when section closes
      };
    }
  }

  // Close final section, or create a fallback if none detected
  if (currentSection) {
    flushSection(lines.length - 1);
  } else {
    sections.push({
      heading: undefined,
      level: undefined,
      startLine: 0,
      endLine: lines.length - 1,
    });
  }

  // 2) Within each section, build chunks up to maxChunkSize, with overlap
  const chunks: Chunk[] = [];
  const textLength = text.length;

  // Precompute cumulative char offsets at line boundaries
  const lineStartOffsets: number[] = [];
  {
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      lineStartOffsets.push(offset);
      // +1 for the newline we split on (approximate; OK for range tracking)
      offset += lines[i].length + 1;
    }
  }

  let chunkIndex = 0;

  sections.forEach((section, sectionIndex) => {
    const { heading, level, startLine, endLine } = section;

    // Concatenate lines for this section
    const sectionLines = lines.slice(startLine, endLine + 1);
    const sectionText = sectionLines.join("\n").trim();

    if (!sectionText) return;

    let cursor = 0;
    while (cursor < sectionText.length) {
      const chunkStart = cursor;
      let chunkEnd = Math.min(cursor + maxChunkSize, sectionText.length);

      // Try not to break in the middle of a sentence if we can avoid it
      if (chunkEnd < sectionText.length) {
        const lastSentenceBoundary = sectionText.lastIndexOf(
          /[.!?]\s+/ as any,
          chunkEnd
        ) as unknown as number; // TS hack; we'll do manual fallback

        if (lastSentenceBoundary > chunkStart + maxChunkSize * 0.6) {
          chunkEnd = lastSentenceBoundary + 1;
        }
      }

      const chunkText = sectionText.slice(chunkStart, chunkEnd).trim();
      if (!chunkText) break;

      // Approximate start/end char positions in original document
      const sectionStartChar =
        lineStartOffsets[startLine] ?? 0; // start of section in doc
      const startChar = sectionStartChar + chunkStart;
      const endChar = sectionStartChar + chunkEnd;

      chunks.push({
        id: `${chunkIndex}`, // you'll prepend docKey elsewhere: `${docKey}:${chunkIndex}`
        text: chunkText,
        startChar: clamp(startChar, 0, textLength),
        endChar: clamp(endChar, 0, textLength),
        sectionHeading: heading,
        sectionLevel: level,
        sectionIndex,
      });

      chunkIndex++;

      if (chunkEnd >= sectionText.length) break;

      // Move cursor forward with overlap
      cursor = chunkEnd - overlap;
      if (cursor <= chunkStart) {
        cursor = chunkEnd; // safety to avoid infinite loops
      }
    }
  });

  return chunks;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
