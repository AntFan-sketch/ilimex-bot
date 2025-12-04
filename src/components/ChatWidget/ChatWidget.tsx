"use client";

import React, { useState } from "react";
import { StarterPrompts } from "./StarterPrompts";

type ChatMode = "public" | "internal";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatWidgetProps {
  initialMode?: ChatMode;
}

const ChatWidget: React.FC<ChatWidgetProps> = ({
  initialMode = "public",
}) => {
  const [mode, setMode] = useState<ChatMode>(initialMode);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // NEW: file-upload / RAG state
  const [uploadedText, setUploadedText] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "ready" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(
    null,
  );

  const handleStarterSelect = (prompt: string) => {
    setInput(prompt);
  };

  // NEW: handle file selection + call /api/upload
  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadStatus("uploading");
    setUploadedFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Upload failed with status ${res.status}`);
      }

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Upload failed");
      }

      if (!data.textPreview) {
        // File recognised but no text extracted (e.g. scanned-only PDF)
        setUploadedText(null);
        setUploadStatus("error");
        setUploadError(
          "File uploaded but no text could be extracted (e.g. scanned PDF).",
        );
        return;
      }

      setUploadedText(data.textPreview as string);
      setUploadStatus("ready");
    } catch (err: any) {
      console.error("Upload error:", err);
      setUploadedText(null);
      setUploadStatus("error");
      setUploadError(err?.message ?? "Upload failed");
    }
  };

const handleSend = async () => {
  const trimmed = input.trim();
  if (!trimmed || loading) return;

  const newUserMessage: ChatMessage = {
    id: `user-${Date.now()}`,
    role: "user",
    content: trimmed,
  };

  const nextMessages = [...messages, newUserMessage];
  setMessages(nextMessages);
  setInput("");
  setLoading(true);

  try {
    const endpoint =
      mode === "public"
        ? "/api/chat-public"
        : "/api/chat-internal";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: nextMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        uploadedText: uploadedText ?? undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const assistantContent =
      data?.message?.content ?? "No response received.";

    const newAssistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: assistantContent,
    };

    setMessages((prev) => [...prev, newAssistantMessage]);
  } catch (err) {
    console.error("ChatWidget error:", err);
    setMessages((prev) => [
      ...prev,
      {
        id: `error-${Date.now()}`,
        role: "assistant",
        content:
          "Sorry, something went wrong while contacting IlimexBot.",
      },
    ]);
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="flex flex-col h-full border rounded-xl p-4">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-3">
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

      {/* Messages */}
      <div className="flex-1 border rounded-lg p-3 mb-3 overflow-auto text-sm space-y-2">
        {messages.length === 0 ? (
          <div className="text-xs text-gray-500">
            Ask IlimexBot a question to get started.
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${
                m.role === "user"
                  ? "justify-end"
                  : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 ${
                  m.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-900"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Starter prompts */}
      <StarterPrompts
        mode={mode}
        onSelect={handleStarterSelect}
      />

      {/* File upload for RAG */}
      <div className="mt-3 mb-2 flex flex-col gap-1 text-xs">
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".pdf,.txt,.md"
            onChange={handleFileChange}
            className="text-xs"
          />
          {uploadStatus === "uploading" && (
            <span className="text-gray-600">Uploading…</span>
          )}
          {uploadStatus === "ready" && uploadedFileName && (
            <span className="text-green-700">
              Attached: {uploadedFileName}
            </span>
          )}
        </div>
        {uploadStatus === "error" && uploadError && (
          <span className="text-red-600">
            {uploadError}
          </span>
        )}
      </div>

      {/* Input */}
      <div className="mt-1 flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask IlimexBot a question…"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={loading}
          className="px-3 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-60"
        >
          {loading ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
};

export default ChatWidget;
