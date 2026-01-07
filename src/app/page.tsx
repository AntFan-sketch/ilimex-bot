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

/** -----------------------------------------
 * Robust multi-match highlighter (case-insensitive + light fuzzy)
 * ------------------------------------------ */
type MarkRange = { start: number; end: number };

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mergeRanges(ranges: MarkRange[]) {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: MarkRange[] = [{ start: sorted[0].start, end: sorted[0].end }];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= prev.end) prev.end = Math.max(prev.end, cur.end);
    else merged.push({ start: cur.start, end: cur.end });
  }
  return merged;
}

function pickAnchors(text: string) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const parts = cleaned
    .split(/(?<=[.!?])\s+|\n+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const candidates = parts.length ? parts : [cleaned];

  const scored = candidates
    .map((s) => {
      const len = s.length;
      const lenScore = len >= 40 && len <= 140 ? 3 : len >= 25 && len <= 200 ? 2 : 1;
      const wordCount = (s.match(/\b\w+\b/g) || []).length;
      return { s, score: lenScore * 10 + Math.min(wordCount, 30) };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);

  const out: string[] = [];
  for (const s of scored) {
    if (out.length >= 3) break;
    if (s.length < 25) continue;

    const cropped = s.length > 140 ? s.slice(0, 140).trim() : s;
    const key = cropped.slice(0, 30).toLowerCase();
    if (!out.some((p) => p.slice(0, 30).toLowerCase() === key)) out.push(cropped);
  }
  return out;
}

function foldWithMap(input: string) {
  const lower = (input || "").toLowerCase();

  let folded = "";
  const map: number[] = []; // foldedIdx -> originalIdx
  let prevWasSpace = false;

  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    const isWord = /[a-z0-9]/.test(ch);
    const isSpace = /\s/.test(ch);

    if (isWord) {
      folded += ch;
      map.push(i);
      prevWasSpace = false;
      continue;
    }

    if (isSpace) {
      if (!prevWasSpace) {
        folded += " ";
        map.push(i);
        prevWasSpace = true;
      }
      continue;
    }

    // punctuation/symbol: drop
  }

  return { folded, map };
}

function findFuzzyRanges(haystack: string, needle: string, maxRanges = 60): MarkRange[] {
  const h = haystack || "";
  const n = (needle || "").trim();
  if (!h || !n) return [];

  const { folded: fh, map } = foldWithMap(h);
  const { folded: fn } = foldWithMap(n);
  if (!fn.trim()) return [];

  const ranges: MarkRange[] = [];
  let from = 0;

  while (ranges.length < maxRanges) {
    const idx = fh.indexOf(fn, from);
    if (idx === -1) break;

    const startOrig = map[idx] ?? 0;
    const endFold = idx + fn.length - 1;
    const endOrig = (map[endFold] ?? startOrig) + 1;

    let end = endOrig;
    while (end < h.length && /[)\].,;:"'!\s]/.test(h[end])) end++;

    ranges.push({ start: startOrig, end });
    from = idx + Math.max(1, fn.length);
  }

  return mergeRanges(ranges);
}

function buildMarkRanges({
  haystack,
  needle,
  maxRanges = 60,
}: {
  haystack: string;
  needle: string;
  maxRanges?: number;
}): MarkRange[] {
  const h = haystack || "";
  const n = (needle || "").trim();
  if (!h || !n) return [];

  // 1) Exact case-insensitive multi-match
  const exact: MarkRange[] = [];
  const re = new RegExp(escapeRegExp(n), "gi");
  let m: RegExpExecArray | null;

  while ((m = re.exec(h)) && exact.length < maxRanges) {
    exact.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++;
  }
  if (exact.length) return mergeRanges(exact);

  // 2) Light fuzzy (ignore punctuation, normalize whitespace)
  const fuzzy = findFuzzyRanges(h, n, maxRanges);
  if (fuzzy.length) return fuzzy;

  // 3) Anchor fallback (best effort)
  const anchors = pickAnchors(n);
  const anchorRanges: MarkRange[] = [];

  for (const a of anchors) {
    const are = new RegExp(escapeRegExp(a), "gi");
    while ((m = are.exec(h)) && anchorRanges.length < maxRanges) {
      anchorRanges.push({ start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) are.lastIndex++;
    }
  }

  return mergeRanges(anchorRanges).slice(0, maxRanges);
}

function MarkedText({ text, ranges }: { text: string; ranges: MarkRange[] }) {
  if (!ranges.length) return <pre>{text}</pre>;

  const out: React.ReactNode[] = [];
  let cursor = 0;

  for (const r of ranges) {
    if (r.start > cursor) out.push(text.slice(cursor, r.start));
    out.push(
      <mark key={`${r.start}-${r.end}`} className="bg-yellow-200 text-gray-900 rounded px-1">
        {text.slice(r.start, r.end)}
      </mark>
    );
    cursor = r.end;
  }

  if (cursor < text.length) out.push(text.slice(cursor));
  return <pre className="whitespace-pre-wrap">{out}</pre>;
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

  const highlightRef = useRef<HTMLElement | null>(null);
  const debugPanelRef = useRef<HTMLDivElement | null>(null);

  // Focus history stack
  const [focusedHistory, setFocusedHistory] = useState<SourceChunk[]>([]);
  const [focusedHistoryIndex, setFocusedHistoryIndex] = useState<number>(-1);

  // Refs to avoid stale closures inside callbacks
  const focusedHistoryRef = useRef<SourceChunk[]>([]);
  const focusedHistoryIndexRef = useRef<number>(-1);

  useEffect(() => {
    focusedHistoryRef.current = focusedHistory;
    focusedHistoryIndexRef.current = focusedHistoryIndex;
  }, [focusedHistory, focusedHistoryIndex]);

  // Ensure activeId is set after first render
  useEffect(() => {
    if (!activeId && conversations[0]?.id) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  function resetFocusState() {
    setFocusedSource(null);
    setFocusedHistory([]);
    setFocusedHistoryIndex(-1);
    setSourcesDimBackground(true);
  }

  // Auto-scroll highlight into view when focusing a chunk (single-mark fallback)
  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusedSource]);

  // When we have multi-marks, scroll to first mark in the debug panel
  useEffect(() => {
    if (!debugPanelRef.current) return;
    const el = debugPanelRef.current.querySelector("mark");
    if (el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedSource?.id, debugExpanded, debugDocIndex]);

  // Mode switch behaviour
  useEffect(() => {
    if (mode === "external") {
      setSourcesOpen(false);
      setDebugExpanded(false);
      resetFocusState();
    }
  }, [mode]);

  // Keyboard navigation for focus history: Ctrl/Cmd + [ / ]
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (mode !== "internal" || !debugExpanded) return;

      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      if (e.key === "[") {
        e.preventDefault();
        const cur = focusedHistoryRef.current;
        const curIdx = focusedHistoryIndexRef.current;
        const nextIdx = Math.max(0, curIdx - 1);
        const src = cur[nextIdx];
        if (src) {
          setFocusedHistoryIndex(nextIdx);
          setFocusedSource(src);
        }
      }

      if (e.key === "]") {
        e.preventDefault();
        const cur = focusedHistoryRef.current;
        const curIdx = focusedHistoryIndexRef.current;
        const nextIdx = Math.min(cur.length - 1, curIdx + 1);
        const src = cur[nextIdx];
        if (src) {
          setFocusedHistoryIndex(nextIdx);
          setFocusedSource(src);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
  }, [currentDebugDoc?.text, previewLineCount]);

  const markRanges = useMemo(() => {
    const full = focusedSource?.fullText?.trim() || "";
    const preview = focusedSource?.textPreview?.trim() || "";

    // Prefer a short target likely to exist in preview
    const needle = preview || (full ? pickAnchors(full)[0] || full.slice(0, 140) : "");

    return buildMarkRanges({
      haystack: debugPreview,
      needle,
      maxRanges: 60,
    });
  }, [debugPreview, focusedSource?.fullText, focusedSource?.textPreview]);

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
        data.reply ?? {
          role: "assistant",
          content: "Sorry, we could not generate a reply just now.",
        };

      updateConversation(current.id, (c) => ({
        ...c,
        messages: [...newMessages, aiReply],
      }));

      type RetrievedChunkWire = {
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
      };

      const retrieved = (data as unknown as { retrievedChunks?: RetrievedChunkWire[] }).retrievedChunks;

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
                <span
                  style={{ width: "8px", height: "8px", borderRadius: "999px", background: "#10b981" }}
                />
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
                  View evidence
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

            {loading && (
              <div style={{ marginTop: "8px", fontSize: "12px", color: "#6b7280" }}>
                IlimexBot is thinking…
              </div>
            )}

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
              <input id="ilimex-file-input" type="file" multiple style={{ display: "none" }} onChange={handleFileInput} />
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
                    ref={debugPanelRef}
                    className="mt-2 max-h-40 overflow-y-auto rounded border border-dashed border-gray-300 bg-white p-2 font-mono text-[10px] leading-snug text-gray-700"
                  >
                    {/* UX helper text */}
                    <div className="mb-2 text-[10px] text-gray-500">
                      Tip: use <span className="font-semibold">View evidence</span> to jump to the exact evidence used in
                      the answer.
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
                                const cur = focusedHistoryRef.current;
                                const curIdx = focusedHistoryIndexRef.current;
                                const nextIdx = Math.max(0, curIdx - 1);
                                const src = cur[nextIdx];
                                if (src) {
                                  setFocusedHistoryIndex(nextIdx);
                                  setFocusedSource(src);
                                }
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
                                const cur = focusedHistoryRef.current;
                                const curIdx = focusedHistoryIndexRef.current;
                                const nextIdx = Math.min(cur.length - 1, curIdx + 1);
                                const src = cur[nextIdx];
                                if (src) {
                                  setFocusedHistoryIndex(nextIdx);
                                  setFocusedSource(src);
                                }
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
                                  focusedHistoryIndex >= focusedHistory.length - 1 ? "not-allowed" : "pointer",
                                opacity: focusedHistoryIndex >= focusedHistory.length - 1 ? 0.5 : 1,
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

                    {/* Multi-highlight preview */}
                    {markRanges.length > 0 ? (
                      <MarkedText text={debugPreview} ranges={markRanges} />
                    ) : (
                      <pre>{debugPreview}</pre>
                    )}
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

          // Browser-like history: trim forward history, then append (dedupe end)
          const cur = focusedHistoryRef.current;
          const curIdx = focusedHistoryIndexRef.current;

          const base = curIdx >= 0 ? cur.slice(0, curIdx + 1) : cur;
          const last = base[base.length - 1];
          const next = last && last.id === source.id ? base : [...base, source];

          setFocusedHistory(next);
          setFocusedHistoryIndex(next.length - 1);
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
