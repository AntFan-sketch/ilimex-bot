import { NextRequest } from "next/server";

function isAuthorised(req: NextRequest) {
  const expected = process.env.ADMIN_DASH_TOKEN?.trim() ?? "";
  const received = req.headers.get("x-admin-token")?.trim() ?? "";
  return Boolean(expected) && received === expected;
}

export async function POST(req: NextRequest) {
  if (!isAuthorised(req)) {
    return new Response(JSON.stringify({ reply: "Unauthorised." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const body = await req.json().catch((err) => {
    console.error("Error parsing JSON body in chat-lite:", err);
    return null;
  });

  if (!body) {
    return new Response(
      JSON.stringify({ reply: "DEBUG: chat-lite – could not parse request body" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const messages = body.messages ?? [];
  const files = body.files ?? [];

  return new Response(
    JSON.stringify({
      reply: `DEBUG: chat-lite – messages=${messages.length}, files=${files.length}, filesData=${JSON.stringify(
        files
      )}`,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
