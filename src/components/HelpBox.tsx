"use client";

import React, { useState } from "react";

interface HelpBoxProps {
  compact?: boolean;
}

export function HelpBox({ compact = false }: HelpBoxProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative", fontSize: "12px" }}>
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: compact ? "4px 8px" : "6px 10px",
          borderRadius: "999px",
          border: "1px solid #d1d5db",
          background: "#ffffff",
          cursor: "pointer",
          fontSize: "12px",
          color: "#374151",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "16px",
            height: "16px",
            borderRadius: "999px",
            background: "#004d71",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: "11px",
          }}
        >
          ?
        </span>
        <span>IlimexBot help</span>
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: compact ? "30px" : "34px",
            width: "340px",
            maxHeight: "70vh",
            overflowY: "auto",
            background: "#ffffff",
            borderRadius: "10px",
            boxShadow: "0 12px 30px rgba(0,0,0,0.15)",
            padding: "12px 14px",
            zIndex: 20,
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "6px",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "#111827",
              }}
            >
              IlimexBot — Internal Assistant
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: "14px",
                lineHeight: 1,
                color: "#9ca3af",
              }}
              aria-label="Close help"
            >
              ×
            </button>
          </div>

          {/* Sections */}
          <div style={{ fontSize: "12px", color: "#4b5563", lineHeight: 1.5 }}>
            <p style={{ marginBottom: "6px" }}>
              IlimexBot helps the team analyse trial notes, engineering docs,
              microbiology results, airflow logs and internal reports. It
              automatically switches into{" "}
              <strong>internal analysis mode</strong> when it recognises Ilimex
              material.
            </p>

            <div style={{ marginTop: "8px", marginBottom: "4px", fontWeight: 600 }}>
              Uploads — what works best
            </div>
            <ul style={{ paddingLeft: "16px", margin: "0 0 6px" }}>
              <li style={{ marginBottom: "2px" }}>
                <strong>Best:</strong> .txt, .md, .csv, .json, .log — full text
                is extracted and analysed.
              </li>
              <li>
                <strong>Limited:</strong> .pdf, .docx, .xlsx, images — the bot
                can’t read these automatically; paste key sections as text.
              </li>
            </ul>
            <p style={{ marginBottom: "6px" }}>
              Uploaded files are processed securely and only used within the
              current chat.
            </p>

            <div style={{ marginTop: "8px", marginBottom: "4px", fontWeight: 600 }}>
              Internal mode (R&amp;D / trials / engineering)
            </div>
            <ul style={{ paddingLeft: "16px", margin: "0 0 6px" }}>
              <li style={{ marginBottom: "2px" }}>
                Triggers when you upload Ilimex trial notes, sequencing data,
                airflow logs, engineering notes or internal summaries.
              </li>
              <li style={{ marginBottom: "2px" }}>
                Triggers when you ask for comparisons, synthesis, engineering
                reasoning or microbiology interpretation.
              </li>
              <li style={{ marginBottom: "2px" }}>
                Uses internal technical language and focuses on Ilimex trials,
                product strategy and design trade-offs.
              </li>
              <li>
                Does <strong>not</strong> talk about “your farm” or “your poultry”
                unless you clearly ask for farm-facing guidance.
              </li>
            </ul>

            <div style={{ marginTop: "8px", marginBottom: "4px", fontWeight: 600 }}>
              External mode (farmer / producer facing)
            </div>
            <p style={{ marginBottom: "4px" }}>
              Used only when the user is clearly an external farmer, producer or
              integrator asking about their site.
            </p>
            <ul style={{ paddingLeft: "16px", margin: "0 0 6px" }}>
              <li>Language is farmer-friendly and conservative.</li>
              <li>
                Focuses on practical implications, site-specificity and sensible
                next steps (drawings, surveys, contact with the team).
              </li>
            </ul>

            <div style={{ marginTop: "8px", marginBottom: "4px", fontWeight: 600 }}>
              Good internal prompts
            </div>
            <ul style={{ paddingLeft: "16px", margin: "0 0 6px" }}>
              <li style={{ marginBottom: "2px" }}>
                “Compare the airflow constraints for mushrooms vs poultry in
                these documents.”
              </li>
              <li style={{ marginBottom: "2px" }}>
                “Synthesise these two trial notes and highlight data gaps.”
              </li>
              <li>
                “Explain the engineering trade-offs between external integrations
                and internal recirculation units.”
              </li>
            </ul>

            <div style={{ marginTop: "8px", marginBottom: "4px", fontWeight: 600 }}>
              Limitations
            </div>
            <ul style={{ paddingLeft: "16px", margin: "0" }}>
              <li style={{ marginBottom: "2px" }}>
                Cannot auto-read PDFs/Word/Excel without pasted text.
              </li>
              <li style={{ marginBottom: "2px" }}>
                Cannot give legal or patent opinions.
              </li>
              <li style={{ marginBottom: "2px" }}>
                Cannot guarantee performance figures or log-kill outcomes.
              </li>
              <li>
                Does not produce final engineering layouts; those must be
                confirmed by the Ilimex engineering team.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
