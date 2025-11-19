import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (req: NextRequest) => {
  try {
    console.log(
      "[UPLOAD] Token present:",
      !!process.env.BLOB_READ_WRITE_TOKEN
    );

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data" },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing file field" },
        { status: 400 }
      );
    }

    const filename = file.name || "upload.bin";
    console.log("[UPLOAD] Received file:", filename, "size:", file.size);

    // Store in Vercel Blob
    const blob = await put(`ilimex-bot/${Date.now()}-${filename}`, file, {
      access: "public",
    });

    console.log("[UPLOAD] Stored at:", blob.url);


    return NextResponse.json(
      {
        url: blob.url,
        pathname: blob.pathname,
        filename,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[UPLOAD] Error during upload:", err);
    return NextResponse.json(
      {
        error: err?.message || "Upload failed on the server",
      },
      { status: 500 }
    );
  }
};
