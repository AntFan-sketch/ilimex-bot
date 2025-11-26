"use client";

import React, { useState } from "react";
import { ChatMessage } from "@/types/chat";
import { sendPublicChat } from "@/lib/api";
import StarterPrompts from "./StarterPrompts";

export function ChatWidget() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    setError(null);

    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
    };

    // Add the user message to the list
    const newMessages: ChatMessage[] = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Call the public API (swap to sendInternalChat if this is internal)
      const assistantReply = await sendPublicChat(newMessages);

      const updatedMessages: ChatMessage[] = [...newMessages, assistantReply];
      setMessages(updatedMessages);
    } catch (err: any) {
      console.error(err);
      setError("Sorry, something went wrong talking to IlimexBot.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[600px] border rounded-lg p-4">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3">
        {messages.map((m, index) => (
          <div
            key={index}
            className={`p-2 rounded-md text-sm ${
              m.role === "user"
                ? "bg-gray-100 self-end"
                : "bg-white border self-start"
            }`}
          >
            {m.content}
          </div>
        ))}

        {messages.length === 0 && (
          <p className="text-xs text-gray-500">
            Ask IlimexBot about Flufence, poultry or mushroom trials, or how
            biosecurity can be improved.
          </p>
        )}
      </div>

      {/* Starter prompts */}
      <StarterPrompts
        variant="public" // or "internal" in the internal app
        onSelectPrompt={(prompt) => setInput(prompt)}
      />

      {/* Error */}
      {error && (
        <p className="mt-2 text-xs text-red-500">
          {error}
        </p>
      )}

      {/* Input + Send */}
      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 border rounded-md px-3 py-2 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask IlimexBot a question..."
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="px-4 py-2 text-sm rounded-md bg-black text-white disabled:opacity-50"
        >
          {loading ? "Thinking…" : "Send"}
        </button>
      </div>

      {/* Disclaimer */}
      <p className="mt-2 text-[10px] text-gray-400">
        IlimexBot provides general information based on publicly shared Ilimex
        content. It does not provide legal, tax, medical, or veterinary advice.
      </p>
    </div>
  );
}

export default ChatWidget;
