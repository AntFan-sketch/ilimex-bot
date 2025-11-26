// src/app/ilimex-bot/internal/page.tsx

import ChatWidget from "@/components/ChatWidget/ChatWidget";

export default function IlimexBotInternalPage() {
  return (
    <main className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-semibold mb-2">IlimexBot – Internal</h1>
      <p className="text-sm text-gray-600 mb-4">
        Internal Ilimex assistant for drafting emails, reports, trial summaries
        and internal documents. Do not share this version outside the company.
      </p>
      <ChatWidget mode="internal" />
    </main>
  );
}
