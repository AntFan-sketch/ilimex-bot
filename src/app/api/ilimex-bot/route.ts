// src/app/api/ilimex-bot/route.ts

import { NextRequest } from "next/server";
import { embedText } from "@/lib/rag/embed";
import { retrieveRelevantChunks } from "@/lib/rag/retrieve";
import { chunkTextWithSections } from "@/lib/rag/chunk";

// --------------------------------------------------
// Types
// --------------------------------------------------
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
}

interface ChatApiResponse {
  reply: ChatMessage;
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
import type { SectionLabel } from "@/lib/rag/chunk";

const ragMemory = new Map<
  string,
  {
    docs: {
      [docName: string]: {
        docKey: string;
        chunks: {
          id: string;
          localId: string;
          text: string;
          embedding: number[];
          docName: string;
          section: SectionLabel;
        }[];
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
• At the end, add a "Sources:" section
• Group sources by document name
• For each footnote, show:
  – The document name
  – The document-local chunk id (e.g. "poultry-trial-notes:0")
  – A short direct quote (max ~12 words)

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
  return name
    .toLowerCase()
    .replace(/\.[^/.]+$/, "") // remove extension
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "document";
}

function softenForExternal(text: string): string {
  let out = text;

  // House labels → generic wording
  out = out.replace(/\bHouse\s*18\b/gi, "the treated house");
  out = out.replace(/\bHouse\s*20\b/gi, "the control house");
  // Any other house labels become generic
  out = out.replace(/\bHouse\s*\d+\b/gi, "one of the trial houses");

  // Percentages → qualitative
  out = out.replace(/\b\d+(\.\d+)?\s*%/g, "a noticeable change");

  // Yields / productivity with units → qualitative
  out = out.replace(
    /\b\d{3,5}(?:[.,]\d+)?\s*(lb\/T(?:\/day)?|kg\/t(?:\/day)?)\b/gi,
    "higher yield levels"
  );

  // CFU / log reductions → qualitative
  out = out.replace(/\b\d+(\.\d+)?\s*log10\b/gi, "a multi-log reduction");
  out = out.replace(/\b\d+(?:\.\d+)?\s*cfu\b/gi, "lower CFU levels");

  return out;
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
    uploadedText, // legacy single-text
    uploadedDocsText, // preferred multi-doc text
    conversationId = "default",
    mode,
  } = body;

  const modeResolved: "internal" | "external" =
    mode ?? (documents.length > 0 ? "internal" : "external");

  const lastUser =
    [...messages].reverse().find((m) => m.role === "user") ?? null;
  const userQuestion = lastUser?.content ?? "";

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
};

  let allRelevant: RetrievedWithMeta[] = [];

  // Only attempt RAG if we have any chunks
  const hasAnyChunks = Object.values(memory.docs).some(
    (docStore) => docStore.chunks.length > 0
  );

  if (hasAnyChunks && userQuestion.trim().length > 0) {
    for (const [docName, docStore] of Object.entries(memory.docs)) {
      if (docStore.chunks.length === 0) continue;

      // retrieveRelevantChunks uses embeddings inside; we pass docStore.chunks as-is
      const topForDoc = await retrieveRelevantChunks(
        userQuestion,
        docStore.chunks,
        3
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
        });
      }
    }

    // Sort globally and keep top 6
    allRelevant.sort((a, b) => b.score - a.score);
    allRelevant = allRelevant.slice(0, 6);
  }

  // --------------------------------------------------
  // Build RAG context with grouped documents + citation instructions
  // --------------------------------------------------
  let ragContext = "";
  if (allRelevant.length > 0) {
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

Example:

House 20 had higher Aspergillus levels¹ and Wallemia decreased in House 18².

Sources:
Poultry Trial Notes.docx
  ¹ poultry-trial-notes:0 — "Aspergillus increased in House 20..."
  ² poultry-trial-notes:1 — "Wallemia decreased in House 18..."

Do NOT invent chunk ids or quotes.
Only use chunk ids and text that appear in the context below.

[BEGIN CONTEXT]

${contextParts.join("\n\n")}

[END CONTEXT]
`.trim();
  }

  // --------------------------------------------------
  // Build messages for OpenAI
  // --------------------------------------------------
  const messagesForAI: { role: "system" | "user" | "assistant"; content: string }[] =
    [];

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

  // Add conversation history as-is
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
    const openAiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
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
      }
    );

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

// Apply external-mode softening layer
if (modeResolved === "external") {
  finalText = softenForExternal(finalText);
}

const reply: ChatMessage = {
  role: "assistant",
  content: finalText,
};

return new Response(JSON.stringify({ reply } as ChatApiResponse), {
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

    return new Response(JSON.stringify({ reply } as ChatApiResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
} // END POST HANDLER

