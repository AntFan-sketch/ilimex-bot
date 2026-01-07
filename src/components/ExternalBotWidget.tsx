"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, ChatResponseBody } from "@/types/chat";

type LeadState = {
  name: string;
  email: string;
  company?: string;
  message?: string;
};

const STORAGE_KEY = "ilimexbot_external_conversation_v1";

function safeTrim(s: string) {
  return (s || "").trim();
}

function createInitialMessages(): ChatMessage[] {
  return [
    {
      role: "assistant",
      content:
        "Hi — I’m IlimexBot (public demo). Ask me about Ilimex air-sterilisation systems, typical installation considerations, or what info we’d need to assess your site.\n\nFor site-specific advice or pricing, please contact the team.",
    },
  ];
}

export function ExternalBotWidget() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => createInitialMessages());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lightweight lead capture after a few turns
  const [leadOpen, setLeadOpen] = useState(false);
  const [lead, setLead] = useState<LeadState>({ name: "", email: "", company: "", message: "" });

  const listRef = useRef<HTMLDivElement | null>(null);

  // Load conversation
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ChatMessage[];
      if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
    } catch {
      // ignore
    }
  }, []);

  // Save conversation
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const MAX = 60;
      const trimmed = messages.length > MAX ? messages.slice(messages.length - MAX) : messages;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // ignore
    }
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  const turnCount = useMemo(() => {
    // count user turns
    return messages.filter((m) => m.role === "user").length;
  }, [messages]);

  useEffect(() => {
    // Open lead capture after 3 user turns (non-blocking)
    if (turnCount >= 3 && !leadOpen) setLeadOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnCount]);

  async function sendMessage() {
    if (loading) return;

    const text = safeTrim(input);
    if (!text) return;

    setError(null);
    setInput("");

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/chat-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Keep payload simple; external endpoint should enforce strict system prompt server-side
        body: JSON.stringify({
          messages: newMessages,
          mode: "external",
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as ChatResponseBody;

      const aiReply: ChatMessage =
        data.reply ?? {
          role: "assistant",
          content: "Sorry — I couldn’t generate a reply just now. Please try again.",
        };

      setMessages((prev) => [...prev, aiReply]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Server error.";
      setError(msg);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "We ran into a problem connecting to the server." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    setMessages(createInitialMessages());
    setInput("");
    setError(null);
    setLeadOpen(false);
    setLead({ name: "", email: "", company: "", message: "" });
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  function applyPrompt(p: string) {
    setInput(p);
  }

  // Shopify-friendly: keep styling self-contained + inline-ish
  return (
    <section
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        background: "#ffffff",
        boxShadow: "0 8px 24px rgba(17,24,39,0.06)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              background: "#004d71",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontWeight: 800,
              fontSize: 14,
            }}
            aria-hidden="true"
          >
            I
          </div>

          <div>
            <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>IlimexBot (Public)</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              Fast answers • Conservative wording • Contact us for site specifics
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a
            href="mailto:mahadychristy@gmail.com"
            style={{
              fontSize: 12,
              textDecoration: "none",
              color: "#004d71",
              fontWeight: 600,
            }}
          >
            Email us
          </a>

          <button
            type="button"
            onClick={clearChat}
            style={{
              fontSize: 12,
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              padding: "6px 10px",
              background: "#f9fafb",
              cursor: "pointer",
              color: "#374151",
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 0 }}>
        {/* Messages */}
        <div
          ref={listRef}
          style={{
            height: 420,
            overflowY: "auto",
            padding: 16,
            background: "#f9fafb",
          }}
        >
          {messages.map((msg, i) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: isUser ? "flex-end" : "flex-start",
                  margin: "8px 0",
                }}
              >
                <div
                  style={{
                    maxWidth: "78%",
                    padding: "10px 12px",
                    borderRadius: 14,
                    background: isUser ? "#004d71" : "#ffffff",
                    color: isUser ? "#ffffff" : "#111827",
                    border: isUser ? "none" : "1px solid #e5e7eb",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "break-word",
                    fontSize: 14,
                    lineHeight: 1.35,
                  }}
                >
                  {msg.content}
                </div>
              </div>
            );
          })}

          {loading && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>IlimexBot is thinking…</div>
          )}

          {error && (
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "#b91c1c",
                background: "#fee2e2",
                borderRadius: 10,
                padding: "8px 10px",
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginTop: 14, fontSize: 11, color: "#6b7280" }}>
            Note: This public demo provides general information only. For site-specific biosecurity recommendations or
            performance claims, please contact Ilimex directly.
          </div>
        </div>

        {/* Suggested prompts */}
        <div style={{ padding: "10px 16px", borderTop: "1px solid #e5e7eb", background: "#ffffff" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
            Suggested questions
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              "What information do you need to assess my site for an Ilimex system?",
              "How does an Ilimex unit fit into typical ventilation/airflow setups?",
              "What are the typical benefits operators look for (air quality, dust, odour, etc.)?",
              "What’s the usual process from first call to installation?",
            ].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPrompt(p)}
                style={{
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  padding: "6px 10px",
                  background: "#f9fafb",
                  cursor: "pointer",
                  color: "#374151",
                  fontSize: 12,
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Lead capture (optional, non-blocking) */}
        {leadOpen && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", background: "#ffffff" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>
                  Want a site-specific assessment?
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  Leave your details and we’ll follow up (optional).
                </div>
              </div>

              <button
                type="button"
                onClick={() => setLeadOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "#9ca3af",
                  fontSize: 12,
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <input
                value={lead.name}
                onChange={(e) => setLead((p) => ({ ...p, name: e.target.value }))}
                placeholder="Name"
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 10,
                  padding: "8px 10px",
                  fontSize: 13,
                  outline: "none",
                }}
              />
              <input
                value={lead.email}
                onChange={(e) => setLead((p) => ({ ...p, email: e.target.value }))}
                placeholder="Email"
                type="email"
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 10,
                  padding: "8px 10px",
                  fontSize: 13,
                  outline: "none",
                }}
              />
              <input
                value={lead.company || ""}
                onChange={(e) => setLead((p) => ({ ...p, company: e.target.value }))}
                placeholder="Farm / Company (optional)"
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 10,
                  padding: "8px 10px",
                  fontSize: 13,
                  outline: "none",
                  gridColumn: "1 / -1",
                }}
              />
              <textarea
                value={lead.message || ""}
                onChange={(e) => setLead((p) => ({ ...p, message: e.target.value }))}
                placeholder="What are you trying to achieve? (optional)"
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 10,
                  padding: "8px 10px",
                  fontSize: 13,
                  outline: "none",
                  gridColumn: "1 / -1",
                  minHeight: 70,
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
              <a
                href={`mailto:mahadychristy@gmail.com?subject=${encodeURIComponent(
                  "Ilimex website enquiry"
                )}&body=${encodeURIComponent(
                  `Name: ${lead.name}\nEmail: ${lead.email}\nFarm/Company: ${lead.company || ""}\n\nMessage:\n${
                    lead.message || ""
                  }\n`
                )}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 10,
                  border: "none",
                  padding: "9px 12px",
                  background: "#004d71",
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Email Ilimex
              </a>

              <button
                type="button"
                onClick={() => setLeadOpen(false)}
                style={{
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  padding: "9px 12px",
                  background: "#f9fafb",
                  cursor: "pointer",
                  color: "#374151",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Not now
              </button>

              <div style={{ marginLeft: "auto", fontSize: 11, color: "#6b7280" }}>
                Tip: press <b>Enter</b> to send • <b>Shift+Enter</b> new line
              </div>
            </div>
          </div>
        )}

        {/* Input */}
        <div style={{ borderTop: "1px solid #e5e7eb", padding: 12, background: "#ffffff" }}>
          <div style={{ display: "flex", gap: 10 }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask a question…"
              style={{
                flex: 1,
                minHeight: 48,
                maxHeight: 140,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #d1d5db",
                outline: "none",
                fontSize: 14,
                resize: "vertical",
              }}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={loading || !safeTrim(input)}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "none",
                background: loading || !safeTrim(input) ? "#9ca3af" : "#004d71",
                color: "#ffffff",
                cursor: loading || !safeTrim(input) ? "default" : "pointer",
                fontSize: 14,
                fontWeight: 700,
                minWidth: 110,
              }}
            >
              {loading ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
