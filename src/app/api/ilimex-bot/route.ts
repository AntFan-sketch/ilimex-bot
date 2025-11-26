// src/app/api/ilimex-bot/route.ts

export const runtime = "nodejs";

// Re-use the public chat route handler so IlimexBot
// has exactly the same behaviour as /api/chat-public
export { POST } from "../chat-public/route";
