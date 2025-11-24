"use client";

import React, { useState, useEffect } from "react";
import type { ChatMessage, ChatResponseBody } from "@/types/chat";
import { HelpBox } from "@/components/HelpBox";

function cleanContent(text: string): string {
  return text
    .replace(/&lt;PARA&gt;/g, "")
    .replace(/&lt;\/PARA&gt;/g, "")
    .replace(/<PARA>/g, "")
    .replace(/<\/PARA>/g, "")
    .trim();
}

const STORAGE_KEY = "ilimexbot_conversations_v1";
const ACTIVE_ID_KEY = "ilimexbot_active_conversation_v1";

type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
};

type UploadedDoc = {
  filename: string;
  url: string;
};

const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024; // ~3 MB per file

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

// Simple heuristic for INTERNAL vs EXTERNAL mode (UI only)
function inferModeForConversation(
  messages: ChatMessage[],
  documents: UploadedDoc[]
): "internal" | "external" {
  if (documents.length > 0) return "internal";

  const text = messages.map((m) => m.content.toLowerCase()).join(" ");
  const internalKeywords = [
    "trial",
    "trials",
    "house 18",
    "house 20",
    "mushroom",
    "poultry",
    "sequencing",
    "aspergillus",
    "adopt",
    "airflow",
    "uvc",
    "log reduction",
    "cfu",
    "internal report",
    "ilimexbot",
  ];

  const isInternal = internalKeywords.some((kw) => text.includes(kw));
  return isInternal ? "internal" : "external";
}

export default function HomePage() {
  const [conversations, setConversations] = useState<Conversation[]>([
    createInitialConversation(),
  ]);
  const [activeId, setActiveId] = useState(conversations[0].id);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);

  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // INTERNAL / EXTERNAL mode indicator for the UI only
  const [mode, setMode] = useState<"internal" | "external">("external");

  // Load conversations from localStorage on first mount
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

          const initialConv =
            parsed.find((c) => c.id === validActive) ?? parsed[0];
          setMode(inferModeForConversation(initialConv.messages, []));
        }
      }
    } catch (err) {
      console.error("Error loading conversations from localStorage:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist conversations and active conversation ID whenever they change
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;

      const trimmed = conversations.map((c) => {
        const MAX_MESSAGES = 80;
        const msgs =
          c.messages.length > MAX_MESSAGES
            ? c.messages.slice(c.messages.length - MAX_MESSAGES)
            : c.messages;

        return { ...c, messages: msgs };
      });

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      window.localStorage.setItem(ACTIVE_ID_KEY, activeId);
    } catch (err) {
      console.error("Error saving conversations to localStorage:", err);
    }
  }, [conversations, activeId]);

  const activeConversation =
    conversations.find((c) => c.id === activeId) ?? conversations[0];

  function updateConversation(
    id: string,
    updater: (c: Conversation) => Conversation
  ) {
    setConversations((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
  }

  function handleNewConversation() {
    const conv = createInitialConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setInput("");
    setFiles([]);
    setDocs([]);
    setError(null);
    setMode("external");
  }

  function handleSelectConversation(id: string) {
    setActiveId(id);
    setInput("");
    setFiles([]);
    setDocs([]);
    setError(null);

    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      setMode(inferModeForConversation(conv.messages, []));
    }
  }

  function handleDeleteConversation(id: string) {
    setConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (activeId === id && filtered.length > 0) {
        setActiveId(filtered[0].id);
        setMode(inferModeForConversation(filtered[0].messages, []));
      }
      return filtered;
    });
  }

  async function uploadSingleFile(file: File): Promise<UploadedDoc | null> {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        console.error("Upload failed with status", res.status);
        return null;
      }

      const data = await res.json();
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
        setError(
          `File ${file.name} is too large (max ~3 MB). Please upload a smaller file or paste key sections.`
        );
        continue;
      }

      setFiles((prev) => [...prev, file]);

      const uploaded = await uploadSingleFile(file);
      if (uploaded) {
        setDocs((prev) => [...prev, uploaded]);
        setMode("internal");
      } else {
        setFiles((prev) => prev.filter((f) => f.name !== file.name));
        setError(
          `There was a problem uploading ${file.name}. Please try again or paste the key sections as text.`
        );
      }
    }

    e.target.value = "";
  }

  function handleRemoveFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    setDocs((prev) => prev.filter((d) => d.filename !== name));
  }

  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setError(null);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const incoming = Array.from(e.dataTransfer.files);

      for (const file of incoming) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setError(
            `File ${file.name} is too large (max ~3 MB). Please upload a smaller file or paste key sections.`
          );
          continue;
        }

        setFiles((prev) => [...prev, file]);

        const uploaded = await uploadSingleFile(file);
        if (uploaded) {
          setDocs((prev) => [...prev, uploaded]);
          setMode("internal");
        } else {
          setFiles((prev) => prev.filter((f) => f.name !== file.name));
          setError(
            `There was a problem uploading ${file.name}. Please try again or paste the key sections as text.`
          );
        }
      }

      e.dataTransfer.clearData();
    }
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

    const inferredMode = inferModeForConversation(newMessages, docs);
    setMode(inferredMode);

    updateConversation(current.id, (c) => ({
      ...c,
      messages: newMessages,
      title:
        c.title === "New chat" && input.trim().length > 0
          ? input.slice(0, 40)
          : c.title,
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
        }),
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = (await res.json()) as ChatResponseBody;

      const aiReply: ChatMessage =
        data.reply ?? {
          role: "assistant",
          content:
            "Sorry, we could not generate a reply just now. Please try again in a moment.",
        };

      updateConversation(current.id, (c) => ({
        ...c,
        messages: [...newMessages, aiReply],
      }));

      setDocs([]);
      setFiles([]);
    } catch (err: any) {
      console.error("Error calling IlimexBot API:", err);
      setError(
        err?.message ||
          "We ran into a problem connecting to our server. Please try again shortly."
      );
      updateConversation(current.id, (c) => ({
        ...c,
        messages: [
          ...newMessages,
          {
            role: "assistant",
            content:
              "We ran into a problem connecting to our server. Please try again shortly.",
          },
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

  return (
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
              setError(null);
              setMode("external");
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

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 8px 8px",
          }}
        >
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
                  border:
                    c.id === activeId
                      ? "1px solid #004d71"
                      : "1px solid transparent",
                  background: c.id === activeId ? "#ecf5f9" : "transparent",
                  fontSize: "13px",
                  color: c.id === activeId ? "#004d71" : "#374151",
                  cursor: "pointer",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
              >
                {c.title === "New chat" && c.messages.length <= 1
                  ? "Untitled chat"
                  : c.title}
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
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>
            Quick Prompts
          </div>
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
                "Explain where Ilimex air-sterilisation fits in a modern poultry house, using cautious, farmer-friendly language."
              )
            }
          >
            • Explain Ilimex to a poultry farmer
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
                "I run a poultry farm. Help me check if Ilimex might be a fit, without making any guarantees."
              )
            }
          >
            • Check if Ilimex is a fit for my farm
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
                "Prepare some talking points for a call between Ilimex and a potential poultry customer, including caveats and site-specific notes."
              )
            }
          >
            • Prep for a call with Ilimex
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
                "Based on the trial information you know, what can a realistic poultry customer expect from Ilimex in cautious, non-promissory terms?"
              )
            }
          >
            • What can I realistically expect?
          </button>
        </div>
      </aside>

      {/* Main chat area */}
      <section
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
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
            <div style={{ fontWeight: 600 }}>IlimexBot – Internal Test Chat</div>
            <div style={{ fontSize: "11px", color: "#6b7280" }}>
              Ask about air-sterilisation systems, trials, ADOPT, or how Ilimex
              could apply to your site.
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
            <HelpBox compact />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "999px",
                  background: "#10b981",
                }}
              />
              <span>Online</span>
            </div>
          </div>
        </div>

        {/* Internal mode banner */}
        {mode === "internal" && (
          <div
            style={{
              background: "#004d71",
              color: "#ffffff",
              padding: "8px 16px",
              fontSize: "12px",
              borderBottom: "1px solid #00344e",
            }}
          >
            Internal analysis mode — Ilimex R&D and trial reasoning is active
            (triggered by internal-style questions or uploads).
          </div>
        )}

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            background: "#f9fafb",
          }}
        >
          {activeConversation.messages.map((msg, i) => (
            <div
              key={i}
              style={{
                margin: "8px 0",
                display: "flex",
                justifyContent:
                  msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "70%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  background: msg.role === "user" ? "#004d71" : "#ffffff",
                  color: msg.role === "user" ? "#ffffff" : "#111827",
                  border:
                    msg.role === "assistant"
                      ? "1px solid #e5e7eb"
                      : "none",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "break-word",
                  fontSize: "14px",
                }}
              >
                {cleanContent(msg.content)}
              </div>
            </div>
          ))}
          {loading && (
            <div
              style={{ marginTop: "8px", fontSize: "12px", color: "#6b7280" }}
            >
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
          {/* Upload capability notice */}
          <div
            style={{
              fontSize: "11px",
              color: "#6b7280",
              background: "#f3f4f6",
              padding: "6px 10px",
              borderRadius: "6px",
              lineHeight: "1.45",
            }}
          >
            <strong>Upload behaviour:</strong> IlimexBot can automatically read
            text files and modern Word documents (.txt, .md, .csv, .json, .log,
            .docx). PDFs, Excel files and old .doc files usually cannot be read
            automatically in this deployment — please paste key sections as
            text if needed. Uploaded files are used only for this chat.
          </div>

          {/* Drag & drop zone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => {
              const inputEl = document.getElementById(
                "ilimex-file-input"
              ) as HTMLInputElement | null;
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
            Drag & drop files here, or{" "}
            <span style={{ color: "#004d71" }}>click to upload</span> (PDF,
            Word, Excel, text).
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
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                fontSize: "12px",
              }}
            >
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
                background:
                  loading || (!input.trim() && docs.length === 0)
                    ? "#9ca3af"
                    : "#004d71",
                color: "#ffffff",
                cursor:
                  loading || (!input.trim() && docs.length === 0)
                    ? "default"
                    : "pointer",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              {loading ? "Sending..." : "Send"}
            </button>
          </div>

          <div style={{ fontSize: "11px", color: "#9ca3af" }}>
            Press Enter to send, Shift+Enter for a new line. Uploaded files are
            stored securely and used only for this chat.
          </div>
        </div>
      </section>
    </main>
  );
}
