import React, { useState } from "react";
import { StarterPrompts } from "./StarterPrompts";

type ChatMode = "public" | "internal";

export const ChatWidget: React.FC = () => {
  const [mode, setMode] = useState<ChatMode>("public");
  const [input, setInput] = useState("");

  const handleStarterSelect = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-600">
          Mode:
        </span>
        <button
          type="button"
          onClick={() => setMode("public")}
          className={`px-2 py-1 text-xs rounded ${
            mode === "public"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          Public
        </button>
        <button
          type="button"
          onClick={() => setMode("internal")}
          className={`px-2 py-1 text-xs rounded ${
            mode === "internal"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          Internal
        </button>
      </div>

      {/* Chat log etc… */}

      {/* Starter prompts */}
      <StarterPrompts mode={mode} onSelect={handleStarterSelect} />

      {/* Input box */}
      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask IlimexBot a question…"
        />
        {/* send button here */}
      </div>
    </div>
  );
};
