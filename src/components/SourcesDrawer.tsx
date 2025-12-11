"use client";

import React from "react";

export type UIMode = "internal" | "external";

export interface SourceChunk {
  id: string;
  rank: number;
  section?: string;
  textPreview: string;
  score?: number;
  documentLabel?: string;
  debug?: {
    baseSim?: number;
    normalizedSim?: number;
    sectionWeight?: number;
  };
}

interface SourcesDrawerProps {
  open: boolean;
  mode: UIMode;
  sources: SourceChunk[];
  onClose: () => void;
  onJumpToChunk?: (source: SourceChunk) => void;
  dimBackground?: boolean; // NEW
}

export function SourcesDrawer({
  open,
  mode,
  sources,
  onClose,
  onJumpToChunk,
  dimBackground = true, // NEW default
}: SourcesDrawerProps) {
  if (!open) return null;

  const isInternal = mode === "internal";

  return (
    <>
      {/* Backdrop */}
      {dimBackground && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 40,
          }}
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100%",
          width: "420px",
          maxWidth: "100vw",
          backgroundColor: "#020617",
          color: "#e5e7eb",
          zIndex: 50,
          boxShadow: "-4px 0 16px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
        }}
        aria-label="Sources drawer"
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid #1f2937",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#9ca3af",
                fontWeight: 600,
              }}
            >
              Sources
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "#9ca3af",
              }}
            >
              Retrieved chunks informing the current answer
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              borderRadius: "999px",
              border: "1px solid #374151",
              padding: "4px 10px",
              fontSize: "11px",
              background: "transparent",
              color: "#e5e7eb",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        {/* Summary */}
        <div
          style={{
            borderBottom: "1px solid #1f2937",
            padding: "6px 14px",
            fontSize: "11px",
            color: "#9ca3af",
          }}
        >
          <span style={{ fontWeight: 600, color: "#e5e7eb" }}>
            {sources.length} source{sources.length === 1 ? "" : "s"}
          </span>{" "}
          ranked by relevance.
          {isInternal && (
            <> Debug info (scores & weights) visible in internal mode.</>
          )}
        </div>

        {/* List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 10px",
          }}
        >
          {sources.length === 0 && (
            <div
              style={{
                marginTop: "40px",
                textAlign: "center",
                fontSize: "11px",
                color: "#6b7280",
              }}
            >
              No sources available for this answer.
            </div>
          )}

          {sources.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              isInternal={isInternal}
              onJumpToChunk={onJumpToChunk}
            />
          ))}
        </div>
      </aside>
    </>
  );
}

interface SourceCardProps {
  source: SourceChunk;
  isInternal: boolean;
  onJumpToChunk?: (source: SourceChunk) => void;
}

function SourceCard({ source, isInternal, onJumpToChunk }: SourceCardProps) {
  const { id, rank, section, textPreview, score, documentLabel, debug } = source;

  const sectionLabel = formatSectionLabel(section);

  const handleJump = () => {
    if (onJumpToChunk) onJumpToChunk(source);
  };

  return (
    <article
      style={{
        borderRadius: "10px",
        border: "1px solid #1f2937",
        backgroundColor: "#020617",
        padding: "8px 10px",
        fontSize: "11px",
        marginBottom: "6px",
      }}
    >
      {/* Top line */}
      <div
        style={{
          marginBottom: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: "20px",
              width: "20px",
              borderRadius: "999px",
              backgroundColor: "#111827",
              fontSize: "11px",
              fontWeight: 600,
              color: "#f9fafb",
            }}
          >
            {rank}
          </span>

          {sectionLabel && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: "999px",
                backgroundColor: "#111827",
                padding: "2px 6px",
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {sectionLabel}
            </span>
          )}
        </div>

        {typeof score === "number" && (
          <span
            style={{
              fontSize: "10px",
              color: "#9ca3af",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco",
            }}
          >
            Score: <span style={{ color: "#e5e7eb" }}>{score.toFixed(3)}</span>
          </span>
        )}
      </div>

      {/* Document label */}
      {documentLabel && (
        <div
          style={{
            fontSize: "10px",
            color: "#9ca3af",
            marginBottom: "2px",
          }}
        >
          {documentLabel}
        </div>
      )}

      {/* Preview text */}
      <p
        style={{
          marginBottom: "4px",
          whiteSpace: "pre-wrap",
          lineHeight: 1.4,
          color: "#e5e7eb",
        }}
      >
        {textPreview}
      </p>

      {/* Footer row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "4px",
        }}
      >
        <button
          type="button"
          onClick={handleJump}
          style={{
            border: "none",
            background: "transparent",
            fontSize: "10px",
            color: "#6ee7b7",
            cursor: "pointer",
          }}
        >
          Jump to source
        </button>

        {isInternal && debug && <SourceDebug debug={debug} />}
      </div>
    </article>
  );
}

function SourceDebug({
  debug,
}: {
  debug: { baseSim?: number; normalizedSim?: number; sectionWeight?: number };
}) {
  const { baseSim, normalizedSim, sectionWeight } = debug;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "9px",
        color: "#9ca3af",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco",
      }}
    >
      {typeof baseSim === "number" && (
        <span>sim: {baseSim.toFixed(3)}</span>
      )}
      {typeof normalizedSim === "number" && (
        <span>norm: {normalizedSim.toFixed(3)}</span>
      )}
      {typeof sectionWeight === "number" && (
        <span>w: {sectionWeight.toFixed(2)}</span>
      )}
    </div>
  );
}

function formatSectionLabel(section?: string): string | null {
  if (!section) return null;
  const key = section.toLowerCase();

  switch (key) {
    case "executive_summary":
      return "Executive Summary";
    case "methodology":
      return "Methodology";
    case "environment":
      return "Environment";
    case "performance":
      return "Performance";
    case "its1_fungal":
      return "ITS1 Fungal";
    case "s16_bacteria":
      return "16S Bacterial";
    case "s18_eukaryotic":
      return "18S Eukaryotic";
    case "microbiology_general":
      return "Microbiology";
    case "interpretation":
      return "Interpretation";
    case "conclusion":
      return "Conclusion";
    case "unknown":
      return "Other";
    default:
      return key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
