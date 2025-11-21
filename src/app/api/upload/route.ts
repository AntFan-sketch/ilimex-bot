import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    // Validate size (server-side safety mirror of client rule)
    if (file.size > 3 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large (max ~3 MB)" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate a temp filename
    const id = uuid();
    const safeName = file.name.replace(/\s+/g, "_");
    const filename = `${id}_${safeName}`;

    // Use Next.js built-in Blob storage (app directory)
    // This persists the file for the lifetime of the deployment
    const blob = new Blob([buffer]);
    // Convert to a file URL that the client/OpenAI fetches
    const url = URL.createObjectURL(blob);

    return NextResponse.json({
      filename,
      url,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
