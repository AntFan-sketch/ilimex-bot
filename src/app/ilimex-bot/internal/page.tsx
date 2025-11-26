// src/app/ilimex-bot/internal/page.tsx

import ChatWidget from "@/components/ChatWidget/ChatWidget";

export default function IlimexBotInternalPage() {
  return (
    <main className="min-h-screen p-6">
      <h1 className="text-xl font-semibold mb-4">
        IlimexBot – Internal Mode
      </h1>
      <p className="text-sm text-gray-600 mb-4">
        This view is for Ilimex staff only. Use it to draft emails,
        summaries, and internal notes with the internal IlimexBot
        configuration.
      </p>
      <div className="max-w-3xl">
        <ChatWidget />
      </div>
    </main>
  );
}
