"use client";

import React from "react";

export type UIMode = "internal" | "external";

export type SourceChunk = {
  id: string;
  rank: number;
  section?: string;
  textPreview: string;
  score?: number;
  documentLabel?: string;
  fullText?: string;
  debug?: {
    baseSim?: number;
    normalizedSim?: number;
    sectionWeight?: number;
  };
};

interface SourcesDrawerProps {
  open: boolean;
  mode: UIMode;
  sources: SourceChunk[];
  dimBackground?: boolean;
  onClose: () => void;
  onJumpToChunk?: (source: SourceChunk) => void; // NOTE: full source, not id
}

export function SourcesDrawer({
  open,
  mode,
  sources,
  dimBackground = true,
  onClose,
  onJumpToChunk,
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
        aria-label="Evidence drawer"
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid rgba(148,163,184,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "12px",
          }}
        >
          <div>
<div style={{ fontWeight: 600, letterSpacing: "0.08em" }}>
  EVIDENCE
</div>
<div style={{ fontSize: "11px", color: "#9ca3af" }}>
  Evidence used to support this answer
</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              borderRadius: "999px",
              border: "1px solid rgba(148,163,184,0.5)",
              padding: "3px 8px",
              fontSize: "11px",
              background: "transparent",
              color: "#e5e7eb",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 12px 14px",
            fontSize: "11px",
          }}
        >
          {sources.length === 0 ? (
            <div style={{ color: "#9ca3af" }}>
              No retrieved chunks for this answer.
            </div>
          ) : (
            <>
<div style={{ marginBottom: "6px", color: "#9ca3af" }}>
  {sources.length} evidence snippets ranked by relevance.
  {isInternal && " Debug info (scores & weights) visible in internal mode."}
</div>

              {sources.map((source) => (
                <div
                  key={source.id}
                  style={{
                    borderRadius: "10px",
                    border: "1px solid rgba(148,163,184,0.4)",
                    background:
                      source.rank === 1
                        ? "linear-gradient(135deg, #020617, #020617)"
                        : "#020617",
                    padding: "8px 10px",
                    marginBottom: "8px",
                  }}
                >
                  {/* Header row: rank, section, score */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div
                        style={{
                          minWidth: "18px",
                          height: "18px",
                          borderRadius: "999px",
                          background: "#0f172a",
                          border: "1px solid rgba(148,163,184,0.6)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "10px",
                          fontWeight: 600,
                        }}
                      >
                        {source.rank}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "11px" }}>
                          {source.section || "Source"}
                        </div>
                        {source.documentLabel && (
                          <div style={{ fontSize: "10px", color: "#9ca3af" }}>
                            {source.documentLabel}
                          </div>
                        )}
                      </div>
                    </div>

                    {typeof source.score === "number" && (
                      <div style={{ fontSize: "10px", color: "#9ca3af" }}>
                        Score: {source.score.toFixed(3)}
                      </div>
                    )}
                  </div>

                  {/* Preview text */}
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#e5e7eb",
                      marginBottom: "6px",
                      lineHeight: 1.4,
                    }}
                  >
                    {source.textPreview}
                  </div>

                  {/* Debug line */}
                  {isInternal && source.debug && (
                    <div
                      style={{
                        fontSize: "9px",
                        color: "#9ca3af",
                        marginBottom: "4px",
                      }}
                    >
                      sim: {source.debug.baseSim?.toFixed(3) ?? "–"}{" "}
                      norm: {source.debug.normalizedSim?.toFixed(3) ?? "–"}{" "}
                      w: {source.debug.sectionWeight?.toFixed(2) ?? "–"}
                    </div>
                  )}

                  {/* Jump button */}
                  <button
                    type="button"
                    onClick={() => onJumpToChunk?.(source)} // 🔴 IMPORTANT
                    style={{
                      fontSize: "10px",
                      padding: "3px 7px",
                      borderRadius: "999px",
                      border: "1px solid rgba(96,165,250,0.8)",
                      background: "rgba(15,23,42,0.8)",
                      color: "#bfdbfe",
                      cursor: "pointer",
                    }}
                  >
                    View evidence
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
