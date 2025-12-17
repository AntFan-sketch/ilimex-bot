"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, ChatResponseBody } from "@/types/chat";
import { SourcesDrawer } from "@/components/SourcesDrawer";
import type { SourceChunk, UIMode } from "@/components/SourcesDrawer";

type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
};

type UploadedDoc = {
  filename: string;
  url: string;
};

type UploadedDocText = {
  docName: string;
  text: string;
};

const STORAGE_KEY = "ilimexbot_conversations_v1";
const ACTIVE_ID_KEY = "ilimexbot_active_conversation_v1";
const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024;

function createInitialConversation(): Conversation {
  return {
    id: `conv_${Date.now()}`,
    title: "New chat",
    messages: [
      {
        role: "assistant",
        content:
          "Hello, we are Ilimex. Ask us anything about our air-sterilisation systems, trials or how our technology could apply to your site.",
      },
    ],
  };
}

/**
 * Highlight helper that works reliably even when debugPreview is truncated.
 * We highlight an anchor (first ~80 chars) of the focused text.
 */
function splitTextForHighlight(
  fullText: string,
  highlightText: string
): { before: string; match: string; after: string } | null {
  if (!fullText) return null;

  const needleRaw = (highlightText ?? "").trim();
  if (!needleRaw) return null;

  // Anchor keeps things stable even if highlightText is huge
  const anchorRaw = needleRaw.slice(0, 120).trim();
  if (!anchorRaw) return null;

  // 1) Exact match
  {
    const start = fullText.indexOf(anchorRaw);
    if (start !== -1) {
      const end = Math.min(fullText.length, start + anchorRaw.length);
      return {
        before: fullText.slice(0, start),
        match: fullText.slice(start, end),
        after: fullText.slice(end),
      };
    }
  }

  // 2) Case-insensitive match
  {
    const hay = fullText.toLowerCase();
    const needle = anchorRaw.toLowerCase();
    const start = hay.indexOf(needle);
    if (start !== -1) {
      const end = Math.min(fullText.length, start + needle.length);
      return {
        before: fullText.slice(0, start),
        match: fullText.slice(start, end),
        after: fullText.slice(end),
      };
    }
  }

  // 3) Whitespace-normalised match with mapping back to original indices
  //    e.g. handles extra newlines/spaces differences between "fullText" and "highlightText"
  const normalizeWithMap = (s: string) => {
    const outChars: string[] = [];
    const map: number[] = []; // map[i] = original index in s for outChars[i]

    let inWs = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const isWs = ch === " " || ch === "\n" || ch === "\r" || ch === "\t";
      if (isWs) {
        if (!inWs) {
          outChars.push(" ");
          map.push(i);
          inWs = true;
        }
      } else {
        outChars.push(ch);
        map.push(i);
        inWs = false;
      }
    }

    // trim leading/trailing single-space we may have introduced
    // keep mapping consistent by trimming both arrays
    while (outChars.length && outChars[0] === " ") {
      outChars.shift();
      map.shift();
    }
    while (outChars.length && outChars[outChars.length - 1] === " ") {
      outChars.pop();
      map.pop();
    }

    return { norm: outChars.join(""), map };
  };

  {
    const { norm: hay, map } = normalizeWithMap(fullText);
    const { norm: needle } = normalizeWithMap(anchorRaw);

    if (hay && needle) {
      const startNorm = hay.toLowerCase().indexOf(needle.toLowerCase());
      if (startNorm !== -1) {
        const endNorm = Math.min(hay.length, startNorm + needle.length);

        // Map normalized indices back to original indices
        const startOrig = map[startNorm] ?? 0;
        const endOrig =
          (map[endNorm - 1] ?? startOrig) + 1; // +1 to make it an exclusive end

        return {
          before: fullText.slice(0, startOrig),
          match: fullText.slice(startOrig, Math.min(fullText.length, endOrig)),
          after: fullText.slice(Math.min(fullText.length, endOrig)),
        };
      }
    }
  }

  return null;
}

export default function HomePage() {
  // Create initial conversation ONCE
  const [conversations, setConversations] = useState<Conversation[]>(() => [
    createInitialConversation(),
  ]);
  const [activeId, setActiveId] = useState<string>(() => "");

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Raw File objects just for chips
  const [files, setFiles] = useState<File[]>([]);
  // Uploaded docs stored server-side (url references)
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  // Legacy single-text (kept for compatibility)
  const [uploadedText, setUploadedText] = useState<string | null>(null);
  // Extracted text per uploaded file (for multi-doc RAG + debug)
  const [docsText, setDocsText] = useState<UploadedDocText[]>([]);

  const [mode, setMode] = useState<UIMode>("internal");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sources drawer
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sources, setSources] = useState<SourceChunk[]>([]);
  const [sourcesDimBackground, setSourcesDimBackground] = useState(true);
  const [focusedSource, setFocusedSource] = useState<SourceChunk | null>(null);

  // Debug: view processed doc text
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [debugDocIndex, setDebugDocIndex] = useState<number | null>(null);

  const highlightRef = useRef<HTMLElement | null>(null); // recommended

  const [focusedHistory, setFocusedHistory] = useState<SourceChunk[]>([]);
  const [focusedHistoryIndex, setFocusedHistoryIndex] = useState<number>(-1);

  // Ensure activeId is set after first render
  useEffect(() => {
    if (!activeId && conversations[0]?.id) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  // Auto-scroll highlight into view when focusing a chunk
  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusedSource]);

useEffect(() => {
  if (mode === "external") {
    setSourcesOpen(false);
    setDebugExpanded(false);
    resetFocusState();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [mode]);

  // --------------------------------------------------
  // Load from localStorage
  // --------------------------------------------------
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;

      const savedRaw = window.localStorage.getItem(STORAGE_KEY);
      const savedActiveId = window.localStorage.getItem(ACTIVE_ID_KEY);

      if (savedRaw) {
        const parsed = JSON.parse(savedRaw) as Conversation[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConversations(parsed);

          const validActive =
            savedActiveId && parsed.some((c) => c.id === savedActiveId)
              ? savedActiveId
              : parsed[0].id;

          setActiveId(validActive);
        }
      }
    } catch (err) {
      console.error("Error loading conversations:", err);
    }
  }, []);

  // --------------------------------------------------
  // Save to localStorage
  // --------------------------------------------------
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;

      const trimmed = conversations.map((c) => {
        const MAX_MESSAGES = 80;
        return {
          ...c,
          messages:
            c.messages.length > MAX_MESSAGES
              ? c.messages.slice(c.messages.length - MAX_MESSAGES)
              : c.messages,
        };
      });

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      window.localStorage.setItem(ACTIVE_ID_KEY, activeId);
    } catch (err) {
      console.error("Error saving conversations:", err);
    }
  }, [conversations, activeId]);

  const activeConversation =
    conversations.find((c) => c.id === activeId) ?? conversations[0];

  function updateConversation(id: string, updater: (c: Conversation) => Conversation) {
    setConversations((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
  }

function resetFocusState() {
  setFocusedSource(null);
  setFocusedHistory([]);
  setFocusedHistoryIndex(-1);
  setSourcesDimBackground(true);
}

  function handleNewConversation() {
    const conv = createInitialConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setInput("");
    setDocs([]);
    setFiles([]);
    setDocsText([]);
    setUploadedText(null);
    setError(null);
    setDebugExpanded(false);
    setDebugDocIndex(null);
    resetFocusState();
  }

  function handleSelectConversation(id: string) {
    setActiveId(id);
    setInput("");
    setFiles([]);
    setDocs([]);
    setDocsText([]);
    setUploadedText(null);
    setError(null);
    setDebugExpanded(false);
    setDebugDocIndex(null);
    resetFocusState();
  }

  function handleDeleteConversation(id: string) {
    setConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (activeId === id && filtered.length > 0) setActiveId(filtered[0].id);
      return filtered;
    });
  }

  // --------------------------------------------------
  // Debug doc selection + preview
  // --------------------------------------------------
  const currentDebugDoc = useMemo(() => {
    if (debugDocIndex != null && docsText[debugDocIndex]) return docsText[debugDocIndex];
    return docsText[0] ?? null;
  }, [debugDocIndex, docsText]);

  const previewLineCount = focusedSource ? 400 : 40;

  const debugPreview = useMemo(() => {
    const txt = currentDebugDoc?.text ?? "";
    if (!txt) return "";
    return txt.split(/\r?\n/).slice(0, previewLineCount).join("\n");
  }, [currentDebugDoc, previewLineCount]);

  // --------------------------------------------------
  // File upload helpers
  // --------------------------------------------------
  async function uploadSingleFile(file: File): Promise<UploadedDoc | null> {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        console.error("Upload failed", res.status);
        return null;
      }

      const data = (await res.json()) as {
        filename?: string;
        url?: string;
        textPreview?: string;
        text?: string;
      };

      const extracted = (data.textPreview || data.text || "").toString();

      if (extracted.trim().length > 0) {
        setDocsText((prev) => [
          ...prev,
          { docName: data.filename || file.name || "Uploaded document", text: extracted },
        ]);
        setUploadedText(extracted); // legacy support
      }

      if (!data.url || !data.filename) {
        console.error("Upload response missing url/filename", data);
        return null;
      }

      return { filename: data.filename, url: data.url };
    } catch (err) {
      console.error("Upload error:", err);
      return null;
    }
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const incoming = Array.from(e.target.files);
    setError(null);

    for (const file of incoming) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(`File ${file.name} is too large.`);
        continue;
      }

      setFiles((prev) => [...prev, file]);

      const uploaded = await uploadSingleFile(file);
      if (uploaded) {
        setDocs((prev) => [...prev, uploaded]);
      } else {
        setFiles((prev) => prev.filter((f) => f.name !== file.name));
        setError(`Upload failed for ${file.name}`);
      }
    }

    e.target.value = "";
  }

  function handleRemoveFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    setDocs((prev) => prev.filter((d) => d.filename !== name));
    setDocsText((prev) => prev.filter((d) => d.docName !== name));
  }

  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setError(null);

    const dropped = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    for (const file of dropped) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(`File ${file.name} is too large.`);
        continue;
      }

      setFiles((prev) => [...prev, file]);

      const uploaded = await uploadSingleFile(file);
      if (uploaded) {
        setDocs((prev) => [...prev, uploaded]);
      } else {
        setFiles((prev) => prev.filter((f) => f.name !== file.name));
        setError(`Upload failed for ${file.name}`);
      }
    }

    e.dataTransfer.clearData();
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  // --------------------------------------------------
  // Clear server-side RAG memory for this conversation
  // --------------------------------------------------
  async function handleClearContext() {
    try {
      const res = await fetch("/api/ilimex-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [],
          documents: [],
          conversationId: activeConversation.id,
          mode,
          clearMemory: true,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as ChatResponseBody;

      const aiReply: ChatMessage =
        data.reply ?? {
          role: "assistant",
          content: "I’ve cleared all uploaded-document context for this conversation.",
        };

      updateConversation(activeConversation.id, (c) => ({
        ...c,
        messages: [...c.messages, aiReply],
      }));

      setDocs([]);
      setDocsText([]);
      setDebugExpanded(false);
      setDebugDocIndex(null);
      resetFocusState();
    } catch (err) {
      console.error("Error clearing IlimexBot RAG memory:", err);
      const message = err instanceof Error ? err.message : "Failed to clear document context.";
      setError(message);
    }
  }

  // --------------------------------------------------
  // Send message to IlimexBot
  // --------------------------------------------------
  async function sendMessage() {
    if (loading) return;
    if (!input.trim() && docs.length === 0) return;

    setError(null);

    const current = activeConversation;
    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim() || "[File(s) uploaded]",
    };

    const newMessages = [...current.messages, userMessage];

    updateConversation(current.id, (c) => ({
      ...c,
      messages: newMessages,
      title:
        c.title === "New chat" && input.trim().length > 0 ? input.slice(0, 40) : c.title,
    }));

    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ilimex-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          documents: docs,
          uploadedText: uploadedText ?? undefined,
          uploadedDocsText: docsText,
          conversationId: current.id,
          mode,
          quotedMode: mode === "internal",
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as ChatResponseBody;

      const aiReply: ChatMessage =
        data.reply ?? { role: "assistant", content: "Sorry, we could not generate a reply just now." };

      updateConversation(current.id, (c) => ({
        ...c,
        messages: [...newMessages, aiReply],
      }));

      const retrieved = (data as any).retrievedChunks as
        | {
            id: string;
            score?: number;
            section?: string;
            textPreview?: string;
            fullText?: string;
            documentLabel?: string;
            debug?: {
              baseSim?: number;
              normalizedSim?: number;
              sectionWeight?: number;
            };
          }[]
        | undefined;

      if (Array.isArray(retrieved) && retrieved.length > 0) {
        setSources(
          retrieved.map((chunk, index) => ({
            id: chunk.id,
            rank: index + 1,
            section: chunk.section,
            textPreview: chunk.textPreview || (chunk.fullText ? chunk.fullText.slice(0, 300) : ""),
            score: chunk.score,
            documentLabel: chunk.documentLabel,
            fullText: chunk.fullText,
            debug: chunk.debug,
          }))
        );
      } else {
        setSources([]);
      }

      resetFocusState();
    } catch (err) {
      console.error("IlimexBot API error:", err);
      const message = err instanceof Error ? err.message : "Server error.";
      setError(message);

      updateConversation(current.id, (c) => ({
        ...c,
        messages: [
          ...newMessages,
          { role: "assistant", content: "We ran into a problem connecting to the server." },
        ],
      }));
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // --------------------------------------------------
  // UI
  // --------------------------------------------------
  return (
    <>
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          background: "#f5f7fa",
          color: "#111827",
        }}
      >
        {/* Sidebar */}
        <aside
          style={{
            width: "260px",
            borderRight: "1px solid #e5e7eb",
            background: "#ffffff",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                height: "32px",
                width: "32px",
                borderRadius: "999px",
                background: "#004d71",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
              }}
            >
              I
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>IlimexBot</div>
              <div style={{ fontSize: "11px", color: "#6b7280" }}>
                Internal Biosecurity Assistant
              </div>
            </div>
          </div>

          <div style={{ padding: "12px", borderBottom: "1px solid #e5e7eb" }}>
            <button
              onClick={handleNewConversation}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "8px",
                border: "none",
                background: "#004d71",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              + New Chat
            </button>

            <button
              onClick={() => {
                const conv = createInitialConversation();
                setConversations([conv]);
                setActiveId(conv.id);
                setInput("");
                setFiles([]);
                setDocs([]);
                setDocsText([]);
                setUploadedText(null);
                setError(null);
                setDebugExpanded(false);
                setDebugDocIndex(null);
                resetFocusState();

                if (typeof window !== "undefined") {
                  window.localStorage.removeItem(STORAGE_KEY);
                  window.localStorage.removeItem(ACTIVE_ID_KEY);
                }
              }}
              style={{
                marginTop: "8px",
                width: "100%",
                padding: "6px 10px",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                color: "#6b7280",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              Clear all chats
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
            {conversations.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "4px",
                }}
              >
                <button
                  onClick={() => handleSelectConversation(c.id)}
                  style={{
                    flex: 1,
                    textAlign: "left",
                    padding: "6px 8px",
                    borderRadius: "8px",
                    border: c.id === activeId ? "1px solid #004d71" : "1px solid transparent",
                    background: c.id === activeId ? "#ecf5f9" : "transparent",
                    fontSize: "13px",
                    color: c.id === activeId ? "#004d71" : "#374151",
                    cursor: "pointer",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {c.title === "New chat" && c.messages.length <= 1 ? "Untitled chat" : c.title}
                </button>

                <button
                  onClick={() => handleDeleteConversation(c.id)}
                  style={{
                    marginLeft: "4px",
                    border: "none",
                    background: "transparent",
                    color: "#9ca3af",
                    cursor: "pointer",
                    fontSize: "11px",
                  }}
                  title="Delete conversation"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div
            style={{
              padding: "8px 12px 12px",
              borderTop: "1px solid #e5e7eb",
              fontSize: "11px",
              color: "#6b7280",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Quick Prompts</div>
            <button
              style={{
                display: "block",
                width: "100%",
                border: "none",
                background: "transparent",
                textAlign: "left",
                padding: "2px 0",
                cursor: "pointer",
                color: "#374151",
              }}
              onClick={() =>
                setInput("Explain the mushroom trial (House 18 vs House 20) in farmer-friendly language.")
              }
            >
              • Explain mushroom trial for a farmer
            </button>
            <button
              style={{
                display: "block",
                width: "100%",
                border: "none",
                background: "transparent",
                textAlign: "left",
                padding: "2px 0",
                cursor: "pointer",
                color: "#374151",
              }}
              onClick={() =>
                setInput(
                  "Write a conservative PR paragraph about the ADOPT poultry trials, including sequencing and Ulster University review."
                )
              }
            >
              • Draft ADOPT PR paragraph
            </button>
            <button
              style={{
                display: "block",
                width: "100%",
                border: "none",
                background: "transparent",
                textAlign: "left",
                padding: "2px 0",
                cursor: "pointer",
                color: "#374151",
              }}
              onClick={() =>
                setInput(
                  "Summarise our current poultry, mushroom and pig pipeline for internal use, including approximate volumes and weighted revenue."
                )
              }
            >
              • Internal pipeline summary
            </button>
          </div>
        </aside>

        {/* Main chat area */}
        <section style={{ flex: 1, display: "flex", flexDirection: "column" }}>
{/* Header */}
<div
  style={{
    padding: "12px 16px",
    borderBottom: "1px solid #e5e7eb",
    background: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  }}
>
  <div>
    <div style={{ fontWeight: 600 }}>
      IlimexBot – {mode === "internal" ? "Internal Test Chat" : "External Demo Chat"}
    </div>
    <div style={{ fontSize: "11px", color: "#6b7280" }}>
      Ask about air-sterilisation systems, trials, ADOPT, or how Ilimex could apply to your site.
    </div>
  </div>

  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "10px",
      fontSize: "11px",
      color: "#6b7280",
    }}
  >
    {/* Mode toggle */}
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px",
        borderRadius: "999px",
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
      }}
    >
      <button
        onClick={() => setMode("internal")}
        style={{
          padding: "3px 8px",
          borderRadius: "999px",
          border: "none",
          fontSize: "11px",
          cursor: "pointer",
          background: mode === "internal" ? "#004d71" : "transparent",
          color: mode === "internal" ? "#ffffff" : "#6b7280",
        }}
      >
        Internal
      </button>
      <button
        onClick={() => setMode("external")}
        style={{
          padding: "3px 8px",
          borderRadius: "999px",
          border: "none",
          fontSize: "11px",
          cursor: "pointer",
          background: mode === "external" ? "#004d71" : "transparent",
          color: mode === "external" ? "#ffffff" : "#6b7280",
        }}
      >
        External
      </button>
    </div>

    {/* Online indicator */}
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <span style={{ width: "8px", height: "8px", borderRadius: "999px", background: "#10b981" }} />
      <span>Online</span>
    </div>

    {/* Sources drawer trigger */}
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
      <button
        type="button"
        disabled={mode !== "internal" || sources.length === 0}
        onClick={() => {
          if (mode !== "internal") return;
          setSourcesDimBackground(true);
          setSourcesOpen(true);
        }}
        style={{
          borderRadius: "999px",
          border: "1px solid #e5e7eb",
          padding: "4px 8px",
          fontSize: "11px",
          background: mode === "internal" && sources.length > 0 ? "#f9fafb" : "#f3f4f6",
          color: mode === "internal" && sources.length > 0 ? "#374151" : "#9ca3af",
          cursor: mode === "internal" && sources.length > 0 ? "pointer" : "not-allowed",
          opacity: mode === "internal" && sources.length > 0 ? 1 : 0.7,
        }}
      >
        View sources
      </button>

      {mode === "internal" && sources.length > 0 && (
        <span style={{ marginTop: "2px", fontSize: "10px", color: "#6b7280" }}>
          Evidence used in this answer
        </span>
      )}

      {mode === "external" && (
        <span style={{ marginTop: "2px", fontSize: "10px", color: "#9ca3af" }}>
          Internal mode only
        </span>
      )}
    </div>
  </div>
</div>

{/* Messages */}

          <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: "#f9fafb" }}>
            {activeConversation.messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  margin: "8px 0",
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "70%",
                    padding: "10px 14px",
                    borderRadius: "12px",
                    background: msg.role === "user" ? "#004d71" : "#ffffff",
                    color: msg.role === "user" ? "#ffffff" : "#111827",
                    border: msg.role === "assistant" ? "1px solid #e5e7eb" : "none",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "break-word",
                    fontSize: "14px",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && <div style={{ marginTop: "8px", fontSize: "12px", color: "#6b7280" }}>IlimexBot is thinking…</div>}

            {error && (
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "12px",
                  color: "#b91c1c",
                  background: "#fee2e2",
                  borderRadius: "8px",
                  padding: "6px 8px",
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* Input + upload area */}
          <div
            style={{
              borderTop: "1px solid #e5e7eb",
              background: "#ffffff",
              padding: "10px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {/* Drag & drop zone */}
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => {
                const inputEl = document.getElementById("ilimex-file-input") as HTMLInputElement | null;
                inputEl?.click();
              }}
              style={{
                border: "2px dashed",
                borderColor: isDragging ? "#004d71" : "#d1d5db",
                borderRadius: "10px",
                padding: "8px 10px",
                fontSize: "12px",
                color: "#6b7280",
                background: isDragging ? "#ecf5f9" : "#f9fafb",
                cursor: "pointer",
              }}
            >
              Drag & drop files here, or <span style={{ color: "#004d71" }}>click to upload</span> (PDF, Word, Excel,
              text).
              <input
                id="ilimex-file-input"
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={handleFileInput}
              />
            </div>

            {/* File chips */}
            {files.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", fontSize: "12px" }}>
                {files.map((file) => (
                  <div
                    key={file.name + file.lastModified}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "#e5e7eb",
                      borderRadius: "999px",
                      padding: "4px 8px",
                    }}
                  >
                    <span
                      style={{
                        maxWidth: "160px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.name}
                    </span>
                    <button
                      onClick={() => handleRemoveFile(file.name)}
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontSize: "11px",
                        color: "#6b7280",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Active documents panel + debug */}
            {(docs.length > 0 || docsText.length > 0) && (
              <div className="mb-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs">
                <div className="mb-1 font-semibold text-gray-700">Documents currently informing IlimexBot:</div>

                <ul className="list-inside list-disc space-y-1">
                  {docs.map((d) => (
                    <li
                      key={d.filename}
                      className="cursor-pointer text-gray-700 hover:underline"
                      onClick={() => {
                        const idx = docsText.findIndex((t) => t.docName === d.filename);
                        if (idx !== -1) {
                          setDebugDocIndex(idx);
                          if (!debugExpanded && mode === "internal") setDebugExpanded(true);
                        }
                      }}
                    >
                      {d.filename}
                    </li>
                  ))}

                  {docs.length === 0 &&
                    docsText.map((d, idx) => (
                      <li
                        key={d.docName}
                        className="cursor-pointer text-gray-700 hover:underline"
                        onClick={() => {
                          setDebugDocIndex(idx);
                          if (!debugExpanded && mode === "internal") setDebugExpanded(true);
                        }}
                      >
                        {d.docName}
                      </li>
                    ))}
                </ul>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearContext}
                    className="rounded border px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100"
                  >
                    Clear uploaded document context
                  </button>

                  {mode === "internal" && docsText.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDebugExpanded((prev) => !prev)}
                      className="rounded border px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100"
                    >
                      {debugExpanded ? "Hide processed text (debug)" : "Show processed text (debug)"}
                    </button>
                  )}
                </div>

{mode === "internal" && debugExpanded && debugPreview && (
  <div
    id="ilimex-debug-panel"
    className="mt-2 max-h-40 overflow-y-auto rounded border border-dashed border-gray-300 bg-white p-2 font-mono text-[10px] leading-snug text-gray-700"
  >
    {/* UX helper text */}
    <div className="mb-2 text-[10px] text-gray-500">
      Tip: use <span className="font-semibold">View sources</span> to jump to the exact evidence used in the answer.
    </div>

    {focusedSource && (
      <div
        style={{
          marginBottom: "6px",
          borderRadius: "6px",
          border: "1px solid #f59e0b",
          backgroundColor: "#fffbeb",
          padding: "6px",
          fontSize: "10px",
          color: "#78350f",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: "2px" }}>
          Focused chunk from: {focusedSource.documentLabel ?? "Unknown document"}
        </div>

         {focusedHistory.length > 1 && (
          <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
            <button
              type="button"
              onClick={() => {
                setFocusedHistoryIndex((idx) => {
                  const nextIdx = Math.max(0, idx - 1);
                  const src = focusedHistory[nextIdx];
                  if (src) setFocusedSource(src);
                  return nextIdx;
                });
              }}
              disabled={focusedHistoryIndex <= 0}
              style={{
                fontSize: "10px",
                padding: "3px 8px",
                borderRadius: "999px",
                border: "1px solid #f59e0b",
                background: "transparent",
                color: "#78350f",
                cursor: focusedHistoryIndex <= 0 ? "not-allowed" : "pointer",
                opacity: focusedHistoryIndex <= 0 ? 0.5 : 1,
              }}
            >
              ◀ Prev
            </button>

            <button
              type="button"
              onClick={() => {
                setFocusedHistoryIndex((idx) => {
                  const nextIdx = Math.min(focusedHistory.length - 1, idx + 1);
                  const src = focusedHistory[nextIdx];
                  if (src) setFocusedSource(src);
                  return nextIdx;
                });
              }}
              disabled={focusedHistoryIndex >= focusedHistory.length - 1}
              style={{
                fontSize: "10px",
                padding: "3px 8px",
                borderRadius: "999px",
                border: "1px solid #f59e0b",
                background: "transparent",
                color: "#78350f",
                cursor:
                  focusedHistoryIndex >= focusedHistory.length - 1
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  focusedHistoryIndex >= focusedHistory.length - 1 ? 0.5 : 1,
              }}
            >
              Next ▶
            </button>

            <div style={{ marginLeft: "auto", fontSize: "9px", color: "#92400e" }}>
              {focusedHistoryIndex + 1}/{focusedHistory.length}
            </div>
          </div>
        )}

        {focusedSource.section && (
          <div style={{ fontSize: "9px", color: "#92400e", marginBottom: "4px" }}>
            Section: {focusedSource.section}
          </div>
        )}

        <pre style={{ whiteSpace: "pre-wrap" }}>
          {focusedSource.fullText || focusedSource.textPreview}
        </pre>
      </div>
    )}
                
    <div className="mb-1 text-[10px] font-semibold text-gray-500">
      Preview from: {currentDebugDoc?.docName ?? "Unknown document"} (first ~
      {focusedSource ? "400" : "40"} lines)
    </div>

    {(() => {
      if (!focusedSource?.fullText) return <pre>{debugPreview}</pre>;

      const split = splitTextForHighlight(debugPreview, focusedSource.fullText);
      if (!split) return <pre>{debugPreview}</pre>;

      return (
        <pre className="whitespace-pre-wrap">
          {split.before}
          <mark ref={highlightRef} className="bg-yellow-200 text-gray-900 rounded px-1">
            {split.match}
          </mark>
          {split.after}
        </pre>
      );
    })()}
  </div>
)}
              </div>
            )}

            {/* Text input + send */}
            <div style={{ display: "flex", gap: "8px" }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask IlimexBot a question..."
                style={{
                  flex: 1,
                  minHeight: "50px",
                  maxHeight: "120px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  outline: "none",
                  fontSize: "14px",
                  resize: "vertical",
                }}
              />
              <button
                onClick={sendMessage}
                disabled={loading || (!input.trim() && docs.length === 0)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: loading || (!input.trim() && docs.length === 0) ? "#9ca3af" : "#004d71",
                  color: "#ffffff",
                  cursor: loading || (!input.trim() && docs.length === 0) ? "default" : "pointer",
                  fontSize: "14px",
                  fontWeight: 500,
                }}
              >
                {loading ? "Sending..." : "Send"}
              </button>
            </div>

            <div style={{ fontSize: "11px", color: "#9ca3af" }}>
              Press Enter to send, Shift+Enter for a new line. Uploaded files are stored securely and used only for this
              chat.
            </div>
          </div>
        </section>
      </main>

      <SourcesDrawer
        open={sourcesOpen}
        mode={mode}
        sources={sources}
        dimBackground={sourcesDimBackground}
onClose={() => setSourcesOpen(false)}
        onJumpToChunk={(source) => {
  if (mode !== "internal") return;

  // Push into history (dedupe by id, keep order)
  setFocusedHistory((prev) => {
    const without = prev.filter((s) => s.id !== source.id);
    const next = [...without, source];
    setFocusedHistoryIndex(next.length - 1);
    return next;
  });

  setFocusedSource(source);

  if (source.documentLabel) {
    const idx = docsText.findIndex((d) => d.docName === source.documentLabel);
    if (idx !== -1) setDebugDocIndex(idx);
  }

  if (!debugExpanded) setDebugExpanded(true);

  setSourcesDimBackground(false);

  setTimeout(() => {
    document.getElementById("ilimex-debug-panel")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, 0);
}}
      />
    </>
  );
}
