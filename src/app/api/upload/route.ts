// src/app/api/upload/route.ts

import { NextRequest } from "next/server";

export const runtime = "nodejs";

// Helper: extract text from PDF using pdf-parse
async function extractTextFromPdf(
  buffer: Buffer,
  notes: string[]
): Promise<string> {
  try {
    const mod = await import("pdf-parse");
    const pdfParse = (mod as any).default || (mod as any);
    const result = await pdfParse(buffer);
    return (result as any).text || "";
  } catch (err: any) {
    console.error("PDF parse error:", err);
    notes.push(`PDF parse error: ${err?.message ?? String(err)}`);
    return "";
  }
}

// Helper: extract text from DOCX using mammoth
async function extractTextFromDocx(
  buffer: Buffer,
  notes: string[]
): Promise<string> {
  try {
    const mod = await import("mammoth");
    const mammoth = mod as any;
    const result = await mammoth.extractRawText({ buffer });
    return result?.value || "";
  } catch (err: any) {
    console.error("DOCX parse error:", err);
    notes.push(`DOCX parse error: ${err?.message ?? String(err)}`);
    return "";
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "No file uploaded.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const fileName = (file as any).name || "uploaded-file";
    const fileType = file.type || "";
    const fileSize = file.size;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const notes: string[] = [];
    let text = "";

    const lowerName = fileName.toLowerCase();

    const isPdf =
      fileType === "application/pdf" || lowerName.endsWith(".pdf");
    const isDocx =
      fileType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      lowerName.endsWith(".docx");

    if (isPdf) {
      text = await extractTextFromPdf(buffer, notes);
    } else if (isDocx) {
      text = await extractTextFromDocx(buffer, notes);
    } else if (
      fileType.startsWith("text/") ||
      lowerName.endsWith(".txt") ||
      lowerName.endsWith(".md")
    ) {
      // Plain text or markdown
      text = buffer.toString("utf8");
    } else {
      notes.push(
        "Unsupported file type for automatic text extraction."
      );
    }

    const textPreview = text ? text.slice(0, 8000) : null;

    // Fake a URL so existing front-end code that expects { url, filename }
    // will treat this as a successful upload. We don’t actually serve
    // the file back from this URL; it’s just metadata for now.
    const url = `/uploads/${encodeURIComponent(fileName)}`;

    return new Response(
      JSON.stringify({
        ok: true,
        fileName,          // new RAG shape
        fileType,
        fileSize,
        isPdf,
        isDocx,
        notes,
        textPreview,

        // legacy fields for src/app/page.tsx
        url,
        filename: fileName,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Upload error:", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: "Upload or parsing failed.",
        details: error?.message ?? "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
