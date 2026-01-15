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

type LeadPayload = {
  name: string;
  email: string;
  phone?: string;
  siteType?: string;
  location?: string;
  message?: string;
  company?: string; // honeypot
  transcriptTail?: PublicChatMessage[];
  source?: string;
};

function isValidEmail(email: string) {
  const e = safeTrim(email);
  // simple, permissive check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
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

  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].content;
    }
    return "";
  }, [messages]);

  const [isNarrow, setIsNarrow] = useState(false);

  // ----------------------------
  // CTA FLOW (modal + auto-open)
  // ----------------------------
  const [ctaOpen, setCtaOpen] = useState(false);
  const [ctaSent, setCtaSent] = useState(false);
  const [ctaLoading, setCtaLoading] = useState(false);
  const [ctaError, setCtaError] = useState<string | null>(null);

  const [lead, setLead] = useState({
    name: "",
    email: "",
    phone: "",
    siteType: "Poultry",
    location: "",
    message: "",
    company: "", // honeypot
  });

  // Auto-open CTA once per session after 3 user turns
  useEffect(() => {
    if (ctaOpen || ctaSent) return;
    if (turnsUsed < 3) return;

    try {
      const key = "ilimexbot_cta_shown_v1";
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {
      // ignore
    }

    setCtaOpen(true);
  }, [turnsUsed, ctaOpen, ctaSent]);

  function openCta(prefill?: Partial<typeof lead>) {
    if (prefill) setLead((p) => ({ ...p, ...prefill }));
    setCtaError(null);
    setCtaOpen(true);
    // let the modal paint first, then focus the first field
    setTimeout(() => {
      const el = document.getElementById("ilimex-lead-name") as HTMLInputElement | null;
      el?.focus();
    }, 0);
  }

  function closeCta() {
    setCtaOpen(false);
    setCtaError(null);
  }

  // Escape closes modal
  useEffect(() => {
    if (!ctaOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCta();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctaOpen]);

  async function submitLead() {
    setCtaError(null);

    const name = safeTrim(lead.name);
    const email = safeTrim(lead.email);
    const location = safeTrim(lead.location);
    const message = safeTrim(lead.message);

    if (!name) return setCtaError("Please enter your name.");
    if (!email) return setCtaError("Please enter your email.");
    if (!isValidEmail(email)) return setCtaError("Please enter a valid email address.");
    if (!location) return setCtaError("Please enter your location (e.g., Wales, UK).");
    if (!message) return setCtaError("Please add a short message (what you want to improve).");

    // Honeypot triggered -> pretend success
    if (safeTrim(lead.company)) {
      setCtaSent(true);
      setTimeout(() => setCtaOpen(false), 600);
      return;
    }

    setCtaLoading(true);
    try {
      const payload: LeadPayload = {
        name,
        email,
        phone: safeTrim(lead.phone) || undefined,
        siteType: safeTrim(lead.siteType) || undefined,
        location,
        message,
        company: lead.company,
        transcriptTail: messages.slice(-8),
        source: "ilimex-bot-external",
      };

      const res = await fetch("/api/lead-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setCtaSent(true);
      setTimeout(() => setCtaOpen(false), 900);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to submit enquiry.";
      setCtaError(msg);
    } finally {
      setCtaLoading(false);
    }
  }

  // Responsive breakpoint helper
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 520px)");
    const apply = () => setIsNarrow(mq.matches);
    apply();

    // Safari support: addListener/removeListener fallback
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    } else {
      mq.addListener(apply);
      return () => mq.removeListener(apply);
    }
  }, []);

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
    setCtaOpen(false);
    setCtaSent(false);
    setCtaLoading(false);
    setCtaError(null);
    setLead({
      name: "",
      email: "",
      phone: "",
      siteType: "Poultry",
      location: "",
      message: "",
      company: "",
    });
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const enquireButtonLabel = ctaSent ? "Enquiry sent" : "Enquire";

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

            {/* CTA modal trigger */}
            <button
              type="button"
              onClick={() => openCta()}
              disabled={ctaSent}
              style={{
                borderRadius: "999px",
                border: "none",
                background: ctaSent ? "#9ca3af" : BRAND.primary,
                padding: "7px 12px",
                fontSize: "12px",
                cursor: ctaSent ? "not-allowed" : "pointer",
                color: "#fff",
                textDecoration: "none",
                fontWeight: 800,
              }}
              title="Request a quote / site assessment"
            >
              {enquireButtonLabel}
            </button>
          </div>
        </div>

        {/* Tips / quick starters */}
        {showTips && (
          <div
            style={{
              padding: "12px 14px",
              borderBottom: `1px solid ${BRAND.border}`,
              background: "#f9fafb",
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
            position: "sticky",
            bottom: 0,
            zIndex: 5,
            borderTop: `1px solid ${BRAND.border}`,
            padding: "12px 14px",
            background: "#ffffff",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: isNarrow ? "stretch" : "flex-end",
              flexDirection: isNarrow ? "column" : "row",
              flexWrap: isNarrow ? "nowrap" : "wrap",
              width: "100%",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about your site… (e.g., shed size, number of houses, main problem, location)"
              style={{
                flex: 1,
                minWidth: 0,
                width: isNarrow ? "100%" : undefined,
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
                width: isNarrow ? "100%" : undefined,
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
                fontWeight: 800,
              }}
            >
              {loading ? "Sending…" : "Send"}
            </button>
          </div>

          <div style={{ marginTop: "8px", fontSize: "12px", color: BRAND.muted }}>
            Public demo • website embed-ready • CTA MODAL v2
          </div>
        </div>
      </div>
<div style={{ fontSize: "11px", color: BRAND.muted, marginTop: "2px" }}>
  Build: {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local"}
</div>
      {/* CTA MODAL */}
      {ctaOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Request a quote / site assessment"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "14px",
          }}
          onMouseDown={(e) => {
            // close if click outside the card
            if (e.target === e.currentTarget) closeCta();
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "560px",
              background: "#fff",
              borderRadius: "16px",
              border: `1px solid ${BRAND.border}`,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 16px",
                borderBottom: `1px solid ${BRAND.border}`,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontWeight: 800, fontSize: "16px", color: BRAND.text }}>
                  Request a quote / site assessment
                </div>
                <div style={{ marginTop: "4px", fontSize: "12px", color: BRAND.muted }}>
                  Share a few details and the Ilimex team will follow up. Please avoid confidential information.
                </div>
              </div>

              <button
                type="button"
                onClick={closeCta}
                style={{
                  border: "none",
                  background: "#f3f4f6",
                  borderRadius: "999px",
                  padding: "6px 10px",
                  cursor: "pointer",
                  color: BRAND.text,
                  fontWeight: 800,
                }}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "14px 16px" }}>
              {ctaSent ? (
                <div
                  style={{
                    borderRadius: "12px",
                    background: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    color: "#065f46",
                    padding: "12px",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  Thanks — your enquiry has been sent. A member of the team will be in touch shortly.
                </div>
              ) : (
                <>
                  {ctaError && (
                    <div
                      style={{
                        marginBottom: "10px",
                        borderRadius: "10px",
                        background: BRAND.dangerBg,
                        color: BRAND.danger,
                        padding: "8px 10px",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      {ctaError}
                    </div>
                  )}

                  {/* honeypot */}
                  <input
                    value={lead.company}
                    onChange={(e) => setLead((p) => ({ ...p, company: e.target.value }))}
                    style={{ display: "none" }}
                    tabIndex={-1}
                    autoComplete="off"
                  />

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: BRAND.text }}>
                        Name
                      </label>
                      <input
                        id="ilimex-lead-name"
                        value={lead.name}
                        onChange={(e) => setLead((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Your name"
                        autoComplete="name"
                        style={{
                          marginTop: "6px",
                          width: "100%",
                          borderRadius: "12px",
                          border: `1px solid ${BRAND.border}`,
                          padding: "10px 12px",
                          fontSize: "14px",
                          outline: "none",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: BRAND.text }}>
                        Email
                      </label>
                      <input
                        value={lead.email}
                        onChange={(e) => setLead((p) => ({ ...p, email: e.target.value }))}
                        placeholder="you@farm.com"
                        autoComplete="email"
                        inputMode="email"
                        style={{
                          marginTop: "6px",
                          width: "100%",
                          borderRadius: "12px",
                          border: `1px solid ${BRAND.border}`,
                          padding: "10px 12px",
                          fontSize: "14px",
                          outline: "none",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: BRAND.text }}>
                        Phone (optional)
                      </label>
                      <input
                        value={lead.phone}
                        onChange={(e) => setLead((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="+44…"
                        autoComplete="tel"
                        inputMode="tel"
                        style={{
                          marginTop: "6px",
                          width: "100%",
                          borderRadius: "12px",
                          border: `1px solid ${BRAND.border}`,
                          padding: "10px 12px",
                          fontSize: "14px",
                          outline: "none",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: BRAND.text }}>
                        Site type
                      </label>
                      <select
                        value={lead.siteType}
                        onChange={(e) => setLead((p) => ({ ...p, siteType: e.target.value }))}
                        style={{
                          marginTop: "6px",
                          width: "100%",
                          borderRadius: "12px",
                          border: `1px solid ${BRAND.border}`,
                          padding: "10px 12px",
                          fontSize: "14px",
                          outline: "none",
                          background: "#fff",
                        }}
                      >
                        <option value="Poultry">Poultry</option>
                        <option value="Mushrooms">Mushrooms</option>
                        <option value="Pigs">Pigs</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: BRAND.text }}>
                      Location
                    </label>
                    <input
                      value={lead.location}
                      onChange={(e) => setLead((p) => ({ ...p, location: e.target.value }))}
                      placeholder="e.g., Wales, UK"
                      autoComplete="address-level1"
                      style={{
                        marginTop: "6px",
                        width: "100%",
                        borderRadius: "12px",
                        border: `1px solid ${BRAND.border}`,
                        padding: "10px 12px",
                        fontSize: "14px",
                        outline: "none",
                      }}
                    />
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: BRAND.text }}>
                      What are you trying to improve?
                    </label>
                    <textarea
                      value={lead.message}
                      onChange={(e) => setLead((p) => ({ ...p, message: e.target.value }))}
                      placeholder="Air quality, disease pressure, performance, contamination pressure, energy, etc."
                      rows={4}
                      style={{
                        marginTop: "6px",
                        width: "100%",
                        borderRadius: "12px",
                        border: `1px solid ${BRAND.border}`,
                        padding: "10px 12px",
                        fontSize: "14px",
                        outline: "none",
                        resize: "vertical",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      marginTop: "12px",
                      display: "flex",
                      alignItems: isNarrow ? "stretch" : "center",
                      justifyContent: "space-between",
                      flexDirection: isNarrow ? "column" : "row",
                      gap: "10px",
                    }}
                  >
                    <a
                      href="https://ilimex.co.uk/pages/contact"
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: BRAND.primary,
                        fontWeight: 800,
                        textDecoration: "none",
                        fontSize: "13px",
                      }}
                    >
                      Prefer to contact us directly?
                    </a>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={closeCta}
                        style={{
                          borderRadius: "12px",
                          border: `1px solid ${BRAND.border}`,
                          background: "#fff",
                          padding: "10px 12px",
                          fontSize: "13px",
                          cursor: "pointer",
                          color: BRAND.text,
                          fontWeight: 700,
                        }}
                      >
                        Not now
                      </button>

                      <button
                        type="button"
                        onClick={submitLead}
                        disabled={ctaLoading}
                        style={{
                          borderRadius: "12px",
                          border: "none",
                          background: ctaLoading ? "#9ca3af" : BRAND.primary,
                          padding: "10px 12px",
                          fontSize: "13px",
                          cursor: ctaLoading ? "not-allowed" : "pointer",
                          color: "#fff",
                          fontWeight: 900,
                        }}
                      >
                        {ctaLoading ? "Sending…" : "Send enquiry"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
