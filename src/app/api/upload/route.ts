// src/app/api/upload/route.ts

import { NextRequest } from "next/server";
import mammoth from "mammoth";
// If you already use "@/lib/..." elsewhere, use this:
//import {
//  extractPdfStructure,
//  flattenPdfBlocksToText,
//  PdfBlock,
//} from "@/lib/pdfStructure";
// If you do NOT have the "@" alias, comment the above and use:
 import {
  extractPdfStructure,
  flattenPdfBlocksToText,
  PdfBlock,
} from "../../../lib/pdfStructure";

export const runtime = "nodejs";

type UploadResponse = {
  filename: string;
  url: string;
  textPreview: string;
  text: string;
  pdfStructure?: PdfBlock[];
};

/**
 * Extract plain text from a DOCX buffer using mammoth.
 */
async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || "").trim();
  } catch (err) {
    console.error("DOCX parse error:", err);
    return "[DOCX uploaded, but text could not be extracted on this server build.]";
  }
}

/**
 * Extract structured text from a PDF buffer using pdf-parse + structural heuristics.
 */
async function extractPdfText(buffer: Buffer): Promise<{
  text: string;
  structure?: PdfBlock[];
}> {
  try {
    const pdfModule: any = await import("pdf-parse");

    // Try to resolve the actual parsing function in a robust way
    let pdfParse: any = null;

    // 1) Module itself is a function (CommonJS default)
    if (typeof pdfModule === "function") {
      pdfParse = pdfModule;
    }
    // 2) Default export is a function (ESM default)
    else if (typeof pdfModule.default === "function") {
      pdfParse = pdfModule.default;
    } else {
      // 3) Fallback: scan named exports for a function
      for (const key of Object.keys(pdfModule)) {
        const val = (pdfModule as any)[key];
        if (typeof val === "function") {
          pdfParse = val;
          console.warn(
            `pdf-parse: using function export "${key}" as parser function.`
          );
          break;
        }
      }
    }

    if (typeof pdfParse !== "function") {
      const keys = Object.keys(pdfModule);
      const msg = `pdf-parse module did not expose a callable function. Available keys: [${keys.join(
        ", "
      )}]`;
      console.error(msg, pdfModule);
      return {
        text: `[PDF uploaded, but pdf-parse is not a callable function on this server build.\n${msg}]`,
      };
    }

    const parsed = await pdfParse(buffer);
    const rawText: string = parsed?.text ?? "";
    const trimmed = rawText.trim();

    if (!trimmed) {
      return {
        text: "[PDF uploaded, but contained no extractable text.]",
      };
    }

    const blocks = extractPdfStructure(trimmed);
    const flattened = flattenPdfBlocksToText(blocks);

    if (!flattened) {
      return {
        text: "[PDF uploaded, but could not be parsed into structured text.]",
      };
    }

    return {
      text: flattened,
      structure: blocks,
    };
  } catch (err: any) {
    console.error("PDF parse error:", err);
    return {
      text: `[PDF uploaded, but pdf-parse threw an error on this server build:\n${
        err instanceof Error ? err.message : String(err)
      }]`,
    };
  }
}

/**
 * Extract text from a generic file, based on extension / mime.
 */
async function extractTextFromFile(
  file: File
): Promise<{ text: string; structure?: PdfBlock[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".docx")) {
    const text = await extractDocxText(buffer);
    return { text };
  }

  if (lowerName.endsWith(".pdf")) {
    return await extractPdfText(buffer);
  }

  // Simple text-like files
  if (
    file.type.startsWith("text/") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md")
  ) {
    return { text: buffer.toString("utf8").trim() };
  }

  // Fallback for unsupported types
  return {
    text: `[${file.name}] was uploaded, but automatic text extraction is not implemented for this file type.`,
  };
}

/**
 * API route – accepts multipart/form-data with a single "file" field.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: "No file uploaded." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const safeName = file.name.replace(/[^\w.-]+/g, "_") || "uploaded-file";
    const filename = `${Date.now()}_${safeName}`;

    const { text: fullText, structure } = await extractTextFromFile(file);

    const textPreview =
      fullText.length > 24000
        ? fullText.slice(0, 24000) + "\n\n[Text truncated...]"
        : fullText;

    const responseBody: UploadResponse = {
      filename,
      url: filename,
      textPreview,
      text: fullText,
      ...(process.env.NODE_ENV === "development" && structure
        ? { pdfStructure: structure }
        : {}),
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Upload route error:", err);
    return new Response(
      JSON.stringify({
        error:
          "There was a problem processing the uploaded file on the server.",
        details: String(err),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
