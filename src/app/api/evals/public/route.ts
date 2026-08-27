import { NextRequest, NextResponse } from "next/server";
import { runExternalPublicEvals } from "@/lib/evals/runExternalPublicEvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatPublicResponse = {
  message?: { content?: string };
};

function getAdminToken(req: NextRequest) {
  const headerToken = req.headers.get("x-admin-token")?.trim();
  const authHeader = req.headers.get("authorization")?.trim();

  if (headerToken) return headerToken;
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return "";
}

function isAuthorised(req: NextRequest) {
  const expected = process.env.ADMIN_DASH_TOKEN?.trim() ?? "";
  return Boolean(expected) && getAdminToken(req) === expected;
}

async function answerViaChatPublic(req: NextRequest, prompt: string) {
  const response = await fetch(`${req.nextUrl.origin}/api/chat-public`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      conversationId: `eval-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`chat-public failed with status ${response.status}`);
  }

  const data = (await response.json()) as ChatPublicResponse;
  return data.message?.content?.trim() ?? "";
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }

  try {
    const results = await runExternalPublicEvals((prompt) =>
      answerViaChatPublic(req, prompt)
    );
    const passed = results.filter((result) => result.passed).length;

    return NextResponse.json({
      ok: true,
      total: results.length,
      passed,
      failed: results.length - passed,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown public eval error",
      },
      { status: 500 }
    );
  }
}
