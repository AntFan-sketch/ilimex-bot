// src/app/api/ilimex-bot/route.ts

import { NextRequest } from "next/server";
import { embedText } from "@/lib/rag/embed";
import { retrieveRelevantChunks } from "@/lib/rag/retrieve";
import { chunkTextWithSections, type SectionLabel } from "@/lib/rag/chunk";
import { softenInternalTone } from "@/lib/toneMiddleware";
import type { RetrievedChunk } from "@/types/chat";

type Role = "user" | "assistant" | "system";

interface ChatMessage {
  role: Role;
  content: string;
}

interface UploadedDocMeta {
  filename: string;
  url?: string;
}

interface UploadedDocText {
  docName: string;
  text: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  mode?: "internal" | "external";
  documents?: UploadedDocMeta[];
  uploadedText?: string; // legacy single-text support
  uploadedDocsText?: UploadedDocText[]; // NEW: multi-doc text support
  conversationId?: string;
  quotedMode?: boolean; // NEW: longer evidence excerpts for INTERNAL
  clearMemory?: boolean; // NEW: wipe RAG memory for this conversation
}

interface CitationMeta {
  footnote: number;
  docName: string;
  localId: string;
  quote: string;
}

interface ChatApiResponse {
  reply: ChatMessage;
  citations?: CitationMeta[];
  retrievedChunks?: RetrievedChunk[];
  retrievalDebug?: {
    id: string;
    localId: string;
    docName: string;
    score: number;
    section: SectionLabel;
    debug?: {
      baseSim?: number;
      normalizedSim?: number;
      sectionWeight?: number;
    };
  }[];
  [key: string]: any;
}

// A single RAG chunk stored per document
interface RagChunk {
  id: string; // global unique id
  localId: string; // document-local id (e.g. "poultry-trial-notes:0")
  text: string;
  embedding: number[];
  docName: string;
  section: SectionLabel;
}

// --------------------------------------------------
// In-memory RAG store (per conversation) — multi-doc, section-aware
// --------------------------------------------------

const ragMemory = new Map<
  string,
  {
    docs: {
      [docName: string]: {
        docKey: string;
        chunks: RagChunk[];
      };
    };
    nextGlobalIndex: number;
  }
>();

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function systemPromptForMode(mode: "internal" | "external"): string {
  if (mode === "external") {
    return `
You are IlimexBot, a public-facing assistant for farmers and potential customers.

Your tone:
• Clear, professional, cautious
• Use phrases like “may help”, “designed to”, “supports”
• Do NOT reveal internal strategy, raw trial data, or confidential details
• Keep technical accuracy while remaining farmer-friendly

Core knowledge:
• UVC-based closed-loop air sterilisation
• Environmental stability
• Pathogen load reduction
• Poultry & mushroom applications

Do NOT invent numbers, trial results, or guarantees. If information is not available, say so.
`.trim();
  } else {
    return `
You are IlimexBot, an internal assistant for Ilimex staff, directors, and R&D partners.

You MAY discuss:
• Poultry trials (e.g. House 18 vs 20), mushroom trials
• Environmental data and stability
• Microbiome / NGS outputs
• ADOPT project plans
• Commercial rollouts at a high level

You now support Retrieval-Augmented Generation (RAG) with document-level citations.

When you use information that comes from uploaded documents, you MUST:
• Add superscript footnote-style citations (¹, ², ³, …) in the body of your answer
• At the end, add a "Sources:" or "Evidence excerpts:" section (depending on mode)
• Group sources by document name
• For each footnote, show:
  – The document name
  – The document-local chunk id (e.g. "poultry-trial-notes:0")
  – A direct quote from that chunk (length depends on mode)

Do NOT invent citations or quotes. If you cannot ground a statement in a chunk, do not add a citation.
If data is uncertain or preliminary, say so.
`.trim();
  }
}

function buildFallbackAnswer(opts: {
  question: string;
  mode: "internal" | "external";
  uploadedDocsText?: UploadedDocText[];
  documents?: UploadedDocMeta[];
}): string {
  const { question, mode, uploadedDocsText = [], documents = [] } = opts;

  const docNamesFromText = uploadedDocsText
    .map((d) => d.docName)
    .filter(Boolean);
  const docNamesFromMeta = documents.map((d) => d.filename);

  const allDocNames = Array.from(
    new Set([...docNamesFromText, ...docNamesFromMeta])
  );

  const docLine =
    allDocNames.length > 0
      ? `Documents seen in this conversation: ${allDocNames.join(", ")}`
      : "No uploaded document text was available in this fallback response.";

  return `
I’m currently running in fallback mode because the AI service did not respond in time.

Mode: ${mode}
Question: ${question}

${docLine}
`.trim();
}

function slugifyDocName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\.[^/.]+$/, "") // remove extension
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "document"
  );
}

function softenForExternal(text: string): string {
  let out = text;

  // House labels → generic wording
  out = out.replace(/\bHouse\s*18\b/gi, "the treated house");
  out = out.replace(/\bHouse\s*20\b/gi, "the control house");
  // Any other house labels become generic
  out = out.replace(/\bHouse\s*\d+\b/gi, "one of the trial houses");

  // Percentages → qualitative
  // Handle both "a 17%" and "17%" without creating "a a noticeable change"
  out = out.replace(/\ba\s+\d+(\.\d+)?\s*%/gi, "a noticeable change");
  out = out.replace(/\b\d+(\.\d+)?\s*%/gi, "a noticeable change");

  // Yields / productivity with units → qualitative
  out = out.replace(
    /\b\d{3,5}(?:[.,]\d+)?\s*(lb\/T(?:\/day)?|kg\/t(?:\/day)?)\b/gi,
    "higher yield levels"
  );

  // CFU / log reductions → qualitative
  out = out.replace(/\b\d+(\.\d+)?\s*log10\b/gi, "a multi-log reduction");
  out = out.replace(/\b\d+(?:\.\d+)?\s*cfu\b/gi, "lower CFU levels");

  // Safety net: collapse any duplicate article if it still sneaks through
  out = out.replace(/\ba\s+a noticeable change\b/gi, "a noticeable change");

  return out;
}

// Parse "Sources:" or "Evidence excerpts:" section into structured citations
function parseCitationsFromAnswer(text: string): CitationMeta[] {
  const results: CitationMeta[] = [];

  const sourcesIndex = text.search(/(Sources:|Evidence excerpts:)/i);
  if (sourcesIndex === -1) return results;

  const tail = text.slice(sourcesIndex);
  const lines = tail.split("\n");

  const superscriptMap: Record<string, number> = {
    "¹": 1,
    "²": 2,
    "³": 3,
    "⁴": 4,
    "⁵": 5,
    "⁶": 6,
    "⁷": 7,
    "⁸": 8,
    "⁹": 9,
  };

  let currentDocName = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Skip the heading line itself
    if (/^(Sources:|Evidence excerpts:)/i.test(line)) continue;

    const firstChar = line[0];

    // If line doesn't start with a superscript, treat it as a doc name
    if (!superscriptMap[firstChar]) {
      currentDocName = line;
      continue;
    }

    // Footnote line format:
    //  ¹ ilimex-mushroom-trial-report:0 — "17% increase in yield..."
    const m = line.match(
      /^([¹²³⁴⁵⁶⁷⁸⁹])\s+(\S+)\s+—\s+"(.+)"\s*$/i
    );
    if (!m) continue;

    const [, sup, localId, quote] = m;
    const footnote = superscriptMap[sup] ?? 0;

    results.push({
      footnote,
      docName: currentDocName || "Unknown document",
      localId,
      quote,
    });
  }

  return results;
}

// --------------------------------------------------
// MAIN ROUTE HANDLER
// --------------------------------------------------

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  let body: ChatRequestBody;

  try {
    body = (await req.json()) as ChatRequestBody;
  } catch (err) {
    console.error("Error parsing /api/ilimex-bot body:", err);
    const reply: ChatMessage = {
      role: "assistant",
      content:
        "I couldn’t parse the request body in this demo build. Please refresh and try again.",
    };
    return new Response(JSON.stringify({ reply } as ChatApiResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const {
    messages = [],
    documents = [],
    uploadedText,
    uploadedDocsText,
    conversationId = "default",
    mode,
    quotedMode = false,
    clearMemory = false,
  } = body;

  const modeResolved: "internal" | "external" =
    mode ?? (documents.length > 0 ? "internal" : "external");

  const lastUser =
    [...messages].reverse().find((m) => m.role === "user") ?? null;
  const userQuestion = lastUser?.content ?? "";

  // --------------------------------------------------
  // Handle clearMemory early
  // --------------------------------------------------
  if (clearMemory) {
    ragMemory.set(conversationId, { docs: {}, nextGlobalIndex: 0 });

    const reply: ChatMessage = {
      role: "assistant",
      content: "I’ve cleared all uploaded-document context for this conversation.",
    };

    return new Response(JSON.stringify({ reply } as ChatApiResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Normalise uploaded text into an array of documents
  let docsTextArray: UploadedDocText[] = [];

  if (uploadedDocsText && uploadedDocsText.length > 0) {
    docsTextArray = uploadedDocsText
      .map((d) => ({
        docName: d.docName || "Uploaded document",
        text: (d.text || "").trim(),
      }))
      .filter((d) => d.text.length > 0);
  } else if (uploadedText && uploadedText.trim().length > 0) {
    docsTextArray = [
      {
        docName: "Uploaded text",
        text: uploadedText.trim(),
      },
    ];
  }

  // --------------------------------------------------
  // Init conversation memory
  // --------------------------------------------------
  if (!ragMemory.has(conversationId)) {
    ragMemory.set(conversationId, { docs: {}, nextGlobalIndex: 0 });
  }
  const memory = ragMemory.get(conversationId)!;

  // --------------------------------------------------
  // INGEST: Chunk + embed new uploaded document text
  // --------------------------------------------------
  if (docsTextArray.length > 0) {
    const chunkSize = 1000;
    const overlap = 200;

    for (const doc of docsTextArray) {
      const docName = doc.docName || "Uploaded document";
      const text = (doc.text || "").trim();
      if (!text) continue;

      if (!memory.docs[docName]) {
        memory.docs[docName] = {
          chunks: [],
          docKey: slugifyDocName(docName),
        };
      }

      const docStore = memory.docs[docName];
      const chunks = chunkTextWithSections(text, chunkSize, overlap);

      for (const c of chunks) {
        const globalIndex = memory.nextGlobalIndex++;
        const globalId = `${conversationId}-chunk-${globalIndex}`;

        const localIndex = docStore.chunks.length;
        const localId = `${docStore.docKey}:${localIndex}`;

        const embedding = await embedText(c.text);

        const ragChunk: RagChunk = {
          id: globalId,
          localId,
          text: c.text,
          embedding,
          docName,
          section: c.section,
        };

        docStore.chunks.push(ragChunk);
      }
    }
  }

  // --------------------------------------------------
  // RAG RETRIEVAL: top 3 per document → merge → top 6 overall
  // --------------------------------------------------
  type RetrievedWithMeta = {
    id: string;
    localId: string;
    docName: string;
    text: string;
    score: number;
    section: SectionLabel;
    debug?: {
      baseSim?: number;
      normalizedSim?: number;
      sectionWeight?: number;
    };
  };

  let allRelevant: RetrievedWithMeta[] = [];
  let retrievalDebug: {
    id: string;
    localId: string;
    docName: string;
    score: number;
    section: SectionLabel;
    debug?: {
      baseSim?: number;
      normalizedSim?: number;
      sectionWeight?: number;
    };
  }[] = [];

// Only attempt RAG if we have any chunks
const hasAnyChunks = Object.values(memory.docs).some(
  (docStore) => docStore.chunks.length > 0
);

if (hasAnyChunks && userQuestion.trim().length > 0) {
  const minScore =
    modeResolved === "internal" ? 0.18 : 0.25;

  for (const [docName, docStore] of Object.entries(memory.docs)) {
    if (docStore.chunks.length === 0) continue;

    const topForDoc = await retrieveRelevantChunks(
      userQuestion,
      docStore.chunks,
      3,
      { minScore }
    );

    for (const r of topForDoc) {
      const original = docStore.chunks.find((c) => c.id === r.id);
      if (!original) continue;

      allRelevant.push({
        id: original.id,
        localId: original.localId,
        docName: original.docName,
        text: original.text,
        score: r.score,
        section: original.section,
        debug: (r as any).debug, // safe even if debug is missing
      });
    }
  }

  allRelevant.sort((a, b) => b.score - a.score);
  allRelevant = allRelevant.slice(0, 6);

  retrievalDebug = allRelevant.map((r) => ({
    id: r.id,
    localId: r.localId,
    docName: r.docName,
    score: r.score,
    section: r.section,
    debug: r.debug,
  }));
}

  // --------------------------------------------------
  // Map retrieval results to UI-friendly chunks
  // --------------------------------------------------
  let retrievedChunksForUi: RetrievedChunk[] | undefined;

  if (allRelevant.length > 0) {
    retrievedChunksForUi = allRelevant.map((r, index) => ({
      id: r.id,
      score: r.score,
      section: r.section,
      textPreview:
        r.text.length > 400 ? r.text.slice(0, 400) + "…" : r.text,
      documentLabel: r.docName,
      fullText: r.text, // NEW: send full chunk text
      debug: r.debug,
    }));
  }

// --------------------------------------------------
// Build RAG context with grouped documents + citation instructions
// --------------------------------------------------
let ragContext = "";

if (allRelevant.length > 0) {
  // ✅ Normal path: we have retrieved top chunks
  const byDoc: Record<string, RetrievedWithMeta[]> = {};
  for (const r of allRelevant) {
    if (!byDoc[r.docName]) byDoc[r.docName] = [];
    byDoc[r.docName].push(r);
  }

  const contextParts: string[] = [];

  for (const [docName, chunks] of Object.entries(byDoc)) {
    contextParts.push(`DOCUMENT: ${docName}`);
    for (const c of chunks) {
      const sectionLabel = c.section || "unknown";
      contextParts.push(
        `(${c.localId} — global: ${c.id} — section: ${sectionLabel})\n${c.text}`
      );
    }
  }

  const contextBody = contextParts.join("\n\n");

  if (modeResolved === "internal") {
    // 🔹 INTERNAL: full citation instructions (quoted or short)
    if (quotedMode) {
      ragContext = `
You are provided with excerpts from uploaded Ilimex documents.

Your job:
- Use these excerpts as factual grounding for your answer.
- When you state an important factual claim that is supported by a document excerpt:
  • You may include a short direct quote inline in quotation marks, and
  • You should still add a superscript footnote (¹, ², ³, …) immediately after the sentence or clause.
- At the end of your answer, add a section titled "Evidence excerpts:".
- In "Evidence excerpts:", group entries by document name.
- For each footnote number, include:
  • The document name
  • The document-local chunk id (e.g. "poultry-trial-notes:0")
  • A longer supporting excerpt (up to ~3 sentences) from that chunk that supports your statement.

Do NOT invent chunk ids or quotes.
Only use chunk ids and text that appear in the context below.

[BEGIN CONTEXT]

${contextBody}

[END CONTEXT]
`.trim();
    } else {
      ragContext = `
You are provided with excerpts from uploaded Ilimex documents.

Your job:
- Use these excerpts as factual grounding for your answer.
- Whenever you state a fact that is supported by a document excerpt, add a superscript footnote (¹, ², ³, …) immediately after the sentence or clause.
- Each footnote must correspond to ONE specific chunk (by its document-local id, e.g. "poultry-trial-notes:0").
- At the end of your answer, add a section titled "Sources:".
- In "Sources:", group citations by document name.
- For each footnote number, include:
  • The document name
  • The document-local chunk id (e.g. "poultry-trial-notes:0")
  • A short direct quote (max ~12 words) from that chunk that supports your statement.

Do NOT invent chunk ids or quotes.
Only use chunk ids and text that appear in the context below.

[BEGIN CONTEXT]

${contextBody}

[END CONTEXT]
`.trim();
    }
  } else {
    // 🔹 EXTERNAL: grounded but no visible citations
    ragContext = `
You have access to internal Ilimex trial documents summarised below.

Use them as background factual context to answer the user's question for a farmer or external audience.

Rules:
- Do NOT show a "Sources" or "Evidence excerpts" section in your answer.
- Do NOT use superscript citation markers.
- Do NOT mention document names or chunk IDs.
- Use the excerpts to keep your answer accurate and conservative.
- If the excerpts do not support a specific numerical claim, speak qualitatively instead or say that detailed data is not available.

[BEGIN CONTEXT]

${contextBody}

[END CONTEXT]
`.trim();
  }
} else if (docsTextArray.length > 0) {
  // 🛟 Fallback path: no retrieved chunks, but we DO have uploaded text
  // Feed raw doc text as context so the model still "knows" about the document.

  const rawParts: string[] = docsTextArray.map(
    (d, idx) => `DOCUMENT ${idx + 1}: ${d.docName}\n\n${d.text}`
  );
  const rawBody = rawParts.join("\n\n---\n\n");

  if (modeResolved === "internal") {
    ragContext = `
You are provided with textual content from uploaded Ilimex documents.

These may not be pre-chunked or ranked, but they should still be used
as factual grounding when you answer the user's question.

Rules:
- Refer to the information in these documents when you summarise or explain results.
- If the information is unclear, say so rather than inventing details.
- You may still use superscript citations (¹, ², ³, …) and a short "Sources:" section
  if you can clearly associate statements with specific document passages;
  otherwise keep the answer qualitative.

[BEGIN CONTEXT]

${rawBody}

[END CONTEXT]
`.trim();
  } else {
    ragContext = `
You have access to the following Ilimex documents as background context.

Use them to keep your answer accurate and conservative.
Do NOT expose document names or raw passages directly; summarise them
in farmer-friendly language instead.

[BEGIN CONTEXT]

${rawBody}

[END CONTEXT]
`.trim();
  }
}

  // --------------------------------------------------
  // Build messages for OpenAI
  // --------------------------------------------------
const messagesForAI: { role: "system" | "user" | "assistant"; content: string }[] = [];

messagesForAI.push({
  role: "system",
  content: systemPromptForMode(modeResolved),
});

if (ragContext) {
  messagesForAI.push({
    role: "system",
    content: ragContext,
  });
}

// then your conversation history ...
for (const m of messages) {
  messagesForAI.push({
    role: m.role,
    content: m.content,
  });
}

  // --------------------------------------------------
  // If no API key → fallback only
  // --------------------------------------------------
  if (!apiKey) {
    console.warn("OPENAI_API_KEY missing – using fallback answer only");
    const reply: ChatMessage = {
      role: "assistant",
      content: buildFallbackAnswer({
        question: userQuestion,
        mode: modeResolved,
        uploadedDocsText: docsTextArray,
        documents,
      }),
    };
    return new Response(JSON.stringify({ reply } as ChatApiResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // --------------------------------------------------
  // Call OpenAI
  // --------------------------------------------------
  try {
    const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: messagesForAI,
      }),
    });

    if (!openAiRes.ok) {
      console.error(
        "OpenAI HTTP error in /api/ilimex-bot:",
        openAiRes.status,
        await openAiRes.text()
      );
      throw new Error(`OpenAI HTTP ${openAiRes.status}`);
    }

    const json = await openAiRes.json();
    const aiText: string = json?.choices?.[0]?.message?.content ?? "";

    // Build base text (AI or fallback)
    let finalText =
      aiText ||
      buildFallbackAnswer({
        question: userQuestion,
        mode: modeResolved,
        uploadedDocsText: docsTextArray,
        documents,
      });

    let citations: CitationMeta[] | undefined;

    if (modeResolved === "external") {
      // Farmer-facing softening (no explicit trial-house labels or raw numbers)
      finalText = softenForExternal(finalText);

      // Strip any residual internal-style citations for external mode
      finalText = finalText
        // Remove superscript citation markers ¹²³…
        .replace(/[¹²³⁴⁵⁶⁷⁸⁹]/g, "")
        // Remove trailing "Sources:" or "Evidence excerpts:" section if the model produced one
        .replace(/\n?(Sources:|Evidence excerpts:)[\s\S]*$/i, "")
        .trim();
    } else {
      // Internal tone softening (confident but conservative)
      finalText = softenInternalTone(finalText, {
        sensitivity: "medium",
      });

      // Parse structured citation metadata from the final internal answer
      const parsed = parseCitationsFromAnswer(finalText);
      if (parsed.length > 0) {
        citations = parsed;
      }
    }

const reply: ChatMessage = {
  role: "assistant",
  content: finalText,
};

const payload: ChatApiResponse = {
  reply,
  retrievalDebug,
  retrievedChunks: retrievedChunksForUi,
};

if (citations && citations.length > 0) {
  payload.citations = citations;
}

return new Response(JSON.stringify(payload), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

  } catch (err) {
    console.error("OpenAI failure in /api/ilimex-bot:", err);

    const reply: ChatMessage = {
      role: "assistant",
      content: buildFallbackAnswer({
        question: userQuestion,
        mode: modeResolved,
        uploadedDocsText: docsTextArray,
        documents,
      }),
    };

return new Response(
  JSON.stringify({ reply, retrievalDebug: [] } as ChatApiResponse),
  {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }
);
  }
}
