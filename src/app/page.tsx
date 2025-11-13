"use client";

import { useState } from "react";
import type { ChatMessage, ChatResponseBody } from "@/types/chat";

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello, we are Ilimex. Ask us anything about our air-sterilisation systems, trials or how our technology could apply to your site.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    // newMessages is explicitly ChatMessage[] and we pin role to "user"
    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: input },
    ];

    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ilimex-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = (await res.json()) as ChatResponseBody;

      const aiReply: ChatMessage =
        data.reply ?? ({
          role: "assistant",
          content:
            "Sorry, we could not generate a reply just now. Please try again in a moment.",
        } as ChatMessage);

      setMessages([...newMessages, aiReply]);
    } catch (err) {
      console.error("Error calling IlimexBot API:", err);
      const errorReply: ChatMessage = {
        role: "assistant",
        content:
          "We ran into a problem connecting to our server. Please try again shortly.",
      };
      setMessages([...newMessages, errorReply]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f5f7fa",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "600px",
          borderRadius: "12px",
          background: "#ffffff",
          boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
            background: "#004d71",
            color: "#ffffff",
            fontWeight: 600,
          }}
        >
          IlimexBot – Internal Test Chat
        </div>

        <div
          style={{
            flex: 1,
            padding: "16px",
            overflowY: "auto",
            background: "#f9fafb",
          }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                margin: "10px 0",
                textAlign: msg.role === "user" ? "right" : "left",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  maxWidth: "70%",
                  background:
                    msg.role === "user" ? "#004d71" : "#ffffff",
                  color: msg.role === "user" ? "white" : "#333",
                  border:
                    msg.role === "assistant"
                      ? "1px solid #ddd"
                      : "none",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "break-word",
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            padding: "10px 12px",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            gap: "8px",
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask IlimexBot a question..."
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: "8px",
              border: "1px solid #d1d5db",
              outline: "none",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: "none",
              background: loading ? "#9ca3af" : "#004d71",
              color: "#ffffff",
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </main>
  );
}
