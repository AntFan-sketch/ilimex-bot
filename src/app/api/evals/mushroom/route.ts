import { NextRequest, NextResponse } from "next/server";
import { runExternalMushroomEvals } from "@/lib/evals/runExternalMushroomEvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatPublicResponse = {
  message?: {
    content?: string;
  };
  content?: string;
  ctaAutoOpen?: boolean;
  ctaAutoOpened?: boolean;
  ctaOpened?: boolean;
  revenueMeta?: {
    ctaAutoOpen?: boolean;
    ctaAutoOpened?: boolean;
    ctaOpened?: boolean;
  };
  meta?: {
    ctaAutoOpen?: boolean;
    ctaAutoOpened?: boolean;
    ctaOpened?: boolean;
  };
  [key: string]: unknown;
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
  const provided = getAdminToken(req);
  const expected = process.env.ADMIN_DASH_TOKEN || process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN || "";

  return Boolean(expected) && provided === expected;
}

async function answerViaChatPublic(
  req: NextRequest,
  prompt: string
): Promise<{ answer: string; ctaOpened?: boolean }> {
  const origin = req.nextUrl.origin;

  const response = await fetch(`${origin}/api/chat-public`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`chat-public failed (${response.status}): ${text || "unknown error"}`);
  }

  const data = (await response.json()) as ChatPublicResponse;

  const answer =
    data.message?.content ||
    (typeof data.content === "string" ? data.content : "") ||
    "";

  const ctaOpened =
    typeof data.ctaAutoOpen === "boolean"
      ? data.ctaAutoOpen
      : typeof data.ctaAutoOpened === "boolean"
        ? data.ctaAutoOpened
        : typeof data.ctaOpened === "boolean"
          ? data.ctaOpened
          : typeof data.revenueMeta?.ctaAutoOpen === "boolean"
            ? data.revenueMeta.ctaAutoOpen
            : typeof data.revenueMeta?.ctaAutoOpened === "boolean"
              ? data.revenueMeta.ctaAutoOpened
              : typeof data.revenueMeta?.ctaOpened === "boolean"
                ? data.revenueMeta.ctaOpened
                : typeof data.meta?.ctaAutoOpen === "boolean"
                  ? data.meta.ctaAutoOpen
                  : typeof data.meta?.ctaAutoOpened === "boolean"
                    ? data.meta.ctaAutoOpened
                    : typeof data.meta?.ctaOpened === "boolean"
                      ? data.meta.ctaOpened
                      : undefined;

  return { answer, ctaOpened };
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }

  try {
    const results = await runExternalMushroomEvals((prompt) =>
      answerViaChatPublic(req, prompt)
    );

    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;

    return NextResponse.json(
      {
        ok: true,
        total: results.length,
        passed,
        failed,
        results,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown eval runner error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}