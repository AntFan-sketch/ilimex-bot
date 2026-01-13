"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";

type PublicChatMessage = {
  role: Role;
  content: string;
};

type PublicChatApiResponse = {
  message?: { content?: string };
  // allow other fields without breaking
    [key: string]: unknown;
};

const BRAND = {
  primary: "#004d71",
  bg: "#f5f7fa",
  panel: "#ffffff",
  border: "#e5e7eb",
  text: "#111827",
  muted: "#6b7280",
  danger: "#b91c1c",
  dangerBg: "#fee2e2",
};

const MAX_TURNS = 20;

const QUICK_STARTERS: { title: string; prompt: string }[] = [
  {
    title: "How it works",
    prompt:
      "In simple terms, how does Ilimex treat incoming air and what problems is it designed to help with?",
  },
  {
    title: "Poultry fit",
    prompt:
      "We have a poultry house — where would the unit sit, and what benefits might we expect (air quality, disease pressure, performance)?",
  },
  {
    title: "Mushrooms fit",
    prompt:
      "We grow mushrooms — how could air-sterilisation help with contamination pressure, and what would an installation look like?",
  },
  {
    title: "Trials & evidence",
    prompt:
      "What trials have been run so far, and what kinds of outcomes are you aiming to measure?",
  },
  {
    title: "Next steps",
    prompt:
      "What information do you need from me to advise whether Ilimex is a good fit for my site?",
  },
];

function safeTrim(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

export default function ExternalIlimexBotPage() {
  const [messages, setMessages] = useState<PublicChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi — I’m IlimexBot. Tell me a bit about your site (poultry / mushrooms / other) and what you’re trying to improve (air quality, disease pressure, performance, energy, etc.).",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show the tips/quick starters only until the user actually starts chatting.
  const [showTips, setShowTips] = useState(true);

  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const turnsUsed = useMemo(() => {
    // count user messages as "turns"
    return messages.filter((m) => m.role === "user").length;
  }, [messages]);

  const hasInteracted = turnsUsed > 0; // derived state

  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].content;
    }
    return "";
  }, [messages]);

  // Auto scroll to bottom on new messages
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  // Optional: help iframe auto-height on Shopify (if you implement a listener)
  useEffect(() => {
    const el = document.documentElement;
    const body = document.body;

    const postHeight = () => {
      const height = Math.max(
        el?.scrollHeight ?? 0,
        body?.scrollHeight ?? 0,
        el?.offsetHeight ?? 0,
        body?.offsetHeight ?? 0
      );
      // Parent can ignore this if it doesn't listen.
      window.parent?.postMessage({ type: "ILIMEXBOT_HEIGHT", height }, "*");
    };

    const t = window.setInterval(postHeight, 750);
    postHeight();

    return () => window.clearInterval(t);
  }, []);

  async function sendMessage(text?: string) {
    if (loading) return;

    const content = safeTrim(typeof text === "string" ? text : input);
    if (!content) return;

    if (turnsUsed >= MAX_TURNS) {
      setError("This demo session has reached the limit. Please click Reset to start again.");
      return;
    }

    // ✅ As soon as the user sends their first message, hide the quick starters
    // (prevents answers being "covered" on mobile by the tips panel).
    if (showTips) setShowTips(false);

    setError(null);
    setLoading(true);
    setInput("");

    const nextMessages: PublicChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);

    try {
      const res = await fetch("/api/chat-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as PublicChatApiResponse;
      const reply =
        data?.message?.content?.toString().trim() ||
        "Sorry — I couldn’t generate a reply just now. Please try again.";

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Server error.";
      setError(msg);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry — something went wrong connecting to the server. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
      // return focus to input for faster chatting
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function copyText(text: string) {
    const t = (text || "").trim();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  function reset() {
    setMessages([
      {
        role: "assistant",
        content:
          "Hi — I’m IlimexBot. Tell me a bit about your site (poultry / mushrooms / other) and what you’re trying to improve (air quality, disease pressure, performance, energy, etc.).",
      },
    ]);
    setInput("");
    setError(null);
    setLoading(false);
    setShowTips(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div
      style={{
        // ✅ Use dynamic viewport height (better on iOS than 100vh)
        minHeight: "100dvh",
        width: "100%",
        background: BRAND.bg,
        color: BRAND.text,
        display: "flex",
        justifyContent: "center",
        padding: "12px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "900px",
          // ✅ Fill the available dynamic viewport height
          minHeight: "100%",
          display: "flex",
          flexDirection: "column",
          border: `1px solid ${BRAND.border}`,
          borderRadius: "14px",
          overflow: "hidden",
          background: BRAND.panel,
          boxShadow: "0 10px 30px rgba(17,24,39,0.08)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 14px",
            borderBottom: `1px solid ${BRAND.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              aria-hidden="true"
              style={{
                height: "34px",
                width: "34px",
                borderRadius: "999px",
                background: BRAND.primary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 800,
              }}
            >
              I
            </div>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontWeight: 700 }}>IlimexBot</div>
              <div style={{ fontSize: "12px", color: BRAND.muted }}>
                Public demo • website embed-ready
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "12px",
                color: BRAND.muted,
                padding: "4px 8px",
                borderRadius: "999px",
                border: `1px solid ${BRAND.border}`,
                background: "#f9fafb",
              }}
              title="This demo limits turns to prevent abuse/spam."
            >
              Turns: {turnsUsed}/{MAX_TURNS}
            </span>

            <button
              type="button"
              onClick={() => setShowTips((v) => !v)}
              style={{
                borderRadius: "999px",
                border: `1px solid ${BRAND.border}`,
                background: "#f9fafb",
                padding: "6px 10px",
                fontSize: "12px",
                cursor: "pointer",
                color: BRAND.text,
              }}
            >
              {showTips ? "Hide tips" : "Show tips"}
            </button>

            <button
              type="button"
              onClick={() => copyText(lastAssistant)}
              disabled={!lastAssistant}
              style={{
                borderRadius: "999px",
                border: `1px solid ${BRAND.border}`,
                background: lastAssistant ? "#f9fafb" : "#f3f4f6",
                padding: "6px 10px",
                fontSize: "12px",
                cursor: lastAssistant ? "pointer" : "not-allowed",
                color: lastAssistant ? BRAND.text : "#9ca3af",
              }}
              title="Copy the most recent answer"
            >
              Copy answer
            </button>

            <button
              type="button"
              onClick={reset}
              style={{
                borderRadius: "999px",
                border: `1px solid ${BRAND.border}`,
                background: "#fff",
                padding: "6px 10px",
                fontSize: "12px",
                cursor: "pointer",
                color: BRAND.text,
              }}
              title="Start a fresh demo chat"
            >
              Reset
            </button>

            <a
              href="mailto:info@ilimex.co?subject=Ilimex%20Enquiry%20from%20Website%20Chat&body=Hi%20Ilimex%2C%0A%0AI%27d%20like%20to%20enquire%20about%20air-sterilisation%20for%20my%20site.%20Here%27s%20a%20summary%3A%0A%0A-%20Site%20type%3A%0A-%20Location%3A%0A-%20Shed%2Fhouse%20size%20or%20no.%20of%20houses%3A%0A-%20Main%20problem%20to%20solve%3A%0A-%20Best%20contact%20number%3A%0A%0AThanks"
              style={{
                borderRadius: "999px",
                border: "none",
                background: BRAND.primary,
                padding: "7px 12px",
                fontSize: "12px",
                cursor: "pointer",
                color: "#fff",
                textDecoration: "none",
                fontWeight: 600,
              }}
              title="Email us to get a quote / site assessment"
            >
              Enquire
            </a>
          </div>
        </div>

        {/* Tips / quick starters */}
        {showTips && (
          <div
            style={{
              padding: "12px 14px",
              borderBottom: `1px solid ${BRAND.border}`,
              background: "#f9fafb",
              // ✅ Prevent the tips panel from hogging the screen on mobile
              maxHeight: hasInteracted ? "0px" : "none",
            }}
          >
            <div style={{ fontSize: "12px", color: BRAND.muted, marginBottom: "10px" }}>
              <strong>Public demo notice:</strong> IlimexBot provides general guidance and uses cautious language.
              Outcomes may vary by site, and trials are ongoing. Please avoid sharing confidential information in chat.
              <span style={{ marginLeft: "10px" }}>Enter to send • Shift+Enter for newline</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "10px",
              }}
            >
              {QUICK_STARTERS.map((q) => (
                <button
                  key={q.title}
                  type="button"
                  onClick={() => sendMessage(q.prompt)}
                  disabled={loading || turnsUsed >= MAX_TURNS}
                  style={{
                    textAlign: "left",
                    borderRadius: "12px",
                    border: `1px solid ${BRAND.border}`,
                    background: "#fff",
                    padding: "10px 12px",
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  <div style={{ fontWeight: 700, color: BRAND.primary, fontSize: "13px" }}>
                    {q.title}
                  </div>
                  <div style={{ marginTop: "4px", fontSize: "12px", color: BRAND.muted }}>
                    {q.prompt}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px",
            background: "#ffffff",
          }}
        >
          {messages.map((m, idx) => {
            const isUser = m.role === "user";
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: isUser ? "flex-end" : "flex-start",
                  margin: "10px 0",
                }}
              >
                <div
                  style={{
                    maxWidth: "78%",
                    padding: "10px 12px",
                    borderRadius: "14px",
                    background: isUser ? BRAND.primary : "#f3f4f6",
                    color: isUser ? "#fff" : BRAND.text,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "break-word",
                    border: isUser ? "none" : `1px solid ${BRAND.border}`,
                  }}
                >
                  {m.content}
                </div>
              </div>
            );
          })}

          {loading && (
            <div style={{ marginTop: "6px", fontSize: "12px", color: BRAND.muted }}>
              IlimexBot is thinking…
            </div>
          )}

          {error && (
            <div
              style={{
                marginTop: "10px",
                fontSize: "12px",
                color: BRAND.danger,
                background: BRAND.dangerBg,
                borderRadius: "10px",
                padding: "8px 10px",
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Composer */}
        <div
          style={{
            // ✅ Keep composer visible on mobile and avoid iOS fixed-position issues
            position: "sticky",
            bottom: 0,
            zIndex: 5,
            borderTop: `1px solid ${BRAND.border}`,
            padding: "12px 14px",
            background: "#ffffff",
            // ✅ iOS safe-area so Send button isn’t clipped by the home indicator
            paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
          }}
        >
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about your site… (e.g., shed size, number of houses, main problem, location)"
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: "52px",
                maxHeight: "120px",
                padding: "10px 12px",
                borderRadius: "12px",
                border: `1px solid ${BRAND.border}`,
                outline: "none",
                fontSize: "14px",
                resize: "vertical",
                background: "#fff",
              }}
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={loading || !safeTrim(input) || turnsUsed >= MAX_TURNS}
              style={{
                flexShrink: 0,
                height: "42px",
                padding: "0 14px",
                borderRadius: "12px",
                border: "none",
                background:
                  loading || !safeTrim(input) || turnsUsed >= MAX_TURNS ? "#9ca3af" : BRAND.primary,
                color: "#ffffff",
                cursor:
                  loading || !safeTrim(input) || turnsUsed >= MAX_TURNS ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: 700,
              }}
            >
              {loading ? "Sending…" : "Send"}
            </button>
          </div>

          <div style={{ marginTop: "8px", fontSize: "12px", color: BRAND.muted }}>
            Public demo • no file uploads • cautious wording
          </div>
        </div>
      </div>
    </div>
  );
}
