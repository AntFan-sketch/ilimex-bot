// src/components/HelpBox.tsx

"use client";

import React from "react";

type HelpBoxProps = {
  compact?: boolean;
};

export function HelpBox({ compact }: HelpBoxProps) {
  if (compact) {
    return (
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "999px",
          padding: "4px 8px",
          fontSize: "11px",
          color: "#374151",
          background: "#f9fafb",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          cursor: "default",
        }}
        title="How IlimexBot uses uploads and internal reasoning"
      >
        <span
          style={{
            width: "16px",
            height: "16px",
            borderRadius: "999px",
            background: "#004d71",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            fontWeight: 600,
          }}
        >
          ?
        </span>
        <span>Uploads trigger internal Ilimex analysis</span>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "10px",
        padding: "8px 10px",
        fontSize: "12px",
        color: "#374151",
        background: "#f9fafb",
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: "4px" }}>
        How IlimexBot uses your questions and uploads
      </div>
      <div style={{ marginBottom: "4px" }}>
        • Normal questions are treated as{" "}
        <strong>farmer-facing mode</strong> — clear, cautious explanations with
        no guarantees.
      </div>
      <div style={{ marginBottom: "4px" }}>
        • When you or the team upload internal documents (trial notes,
        engineering, microbiology, etc.), IlimexBot switches into{" "}
        <strong>internal analysis mode</strong> and uses R&amp;D-style
        reasoning for interpretation and synthesis.
      </div>
      <div style={{ marginBottom: "4px" }}>
        • IlimexBot can directly read text files and modern Word documents
        (.txt, .md, .csv, .json, .log, .docx). PDFs, Excel and old .doc files
        often cannot be read automatically — paste key sections as text if you
        need detailed analysis.
      </div>
      <div>
        • Uploaded material is used only inside this chat to help answer your
        question. It is not treated as a forever-growing external knowledge
        base.
      </div>
    </div>
  );
}
