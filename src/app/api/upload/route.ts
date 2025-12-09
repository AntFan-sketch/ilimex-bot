// src/app/api/upload/route.ts

import { NextRequest } from "next/server";
import mammoth from "mammoth";

export const runtime = "nodejs";

type UploadResponse = {
  filename: string;
  url: string;
  textPreview: string;
  text: string;
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
 * Extract plain text from a PDF buffer using pdf-parse.
 * Uses dynamic import to avoid Turbopack static export issues.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import so Turbopack doesn't try to statically analyse exports
    const pdfModule: any = await import("pdf-parse");
    const pdfParse =
      (pdfModule && pdfModule.default) || pdfModule;

    if (typeof pdfParse !== "function") {
      console.error("pdf-parse module did not resolve to a callable function.");
      return "[PDF uploaded, but could not be parsed on this server build.]";
    }

    const parsed = await pdfParse(buffer);
    const text: string = parsed?.text ?? "";
    return text.trim() || "[PDF uploaded, but contained no extractable text.]";
  } catch (err) {
    console.error("PDF parse error:", err);
    return "[PDF uploaded, but could not be parsed on this server build.]";
  }
}

/**
 * Extract text from a generic file, based on extension / mime.
 */
async function extractTextFromFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".docx")) {
    return await extractDocxText(buffer);
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
    return buffer.toString("utf8").trim();
  }

  // Fallback for unsupported types
  return `[${file.name}] was uploaded, but automatic text extraction is not implemented for this file type.`;
}

/**
 * API route – accepts multipart/form-data with a single "file" field.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: "No file uploaded." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Generate a server-side filename (doesn't actually write to disk here)
    const safeName =
      file.name.replace(/[^\w.-]+/g, "_") || "uploaded-file";
    const filename = `${Date.now()}_${safeName}`;

    // Extract text
    const fullText = await extractTextFromFile(file);

    const textPreview =
      fullText.length > 24000
        ? fullText.slice(0, 24000) + "\n\n[Text truncated...]"
        : fullText;

    const responseBody: UploadResponse = {
      filename,
      // We don't actually serve the file from disk; this is just a display label.
      url: filename,
      textPreview,
      text: fullText,
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Upload route error:", err);
    return new Response(
      JSON.stringify({
        error:
          "There was a problem processing the uploaded file on the server.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
