"use client";

import { useState } from "react";
import type { ChatMessage } from "@/types/chat";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

    async function sendMessage() {
    if (!input.trim()) return;

    const newMessages = [
      ...messages,
      { role: "user", content: input.trim() },
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
        const text = await res.text();
        console.error("API error response:", res.status, text);
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: `Error from server (${res.status}): ${text}`,
          },
        ]);
        setLoading(false);
        return;
      }

      const data = await res.json();
      console.log("API success response:", data);

      const reply =
        data.reply?.content || "No response content from server.";

      setMessages([
        ...newMessages,
        { role: "assistant", content: reply },
      ]);
    } catch (err) {
      console.error("Network or parsing error:", err);
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content:
            "There was a network or parsing error talking to IlimexBot. Check the console for details.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>IlimexBot – Local Test UI</h1>
      <p>Type a question below to chat with IlimexBot.</p>

      <div
        style={{
          marginTop: "20px",
          padding: "20px",
          border: "1px solid #ccc",
          borderRadius: "8px",
          height: "400px",
          overflowY: "auto",
          background: "#fafafa",
        }}
      >
        {messages.map((msg, i) => (
<div
  style={{
    display: "inline-block",
    padding: "10px 14px",
    borderRadius: "10px",
    maxWidth: "70%",
    background: msg.role === "user" ? "#004d71" : "#ffffff",
    color: msg.role === "user" ? "white" : "#333",
    border: msg.role === "assistant" ? "1px solid #ddd" : "none",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  }}
>
  {msg.content}
</div>


        ))}
        {loading && (
          <div style={{ margin: "10px 0" }}>
            <em>Thinking…</em>
          </div>
        )}
      </div>

      <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          style={{ flex: 1, padding: "10px", fontSize: "16px" }}
          placeholder="Ask about Ilimex systems, trials, etc..."
        />
        <button
          onClick={sendMessage}
          style={{
            padding: "10px 20px",
            background: "#004d71",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </div>
    </main>
  );
}
