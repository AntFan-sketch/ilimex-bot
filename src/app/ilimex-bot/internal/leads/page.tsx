"use client";

import React, { useEffect, useMemo, useState } from "react";

type LeadRow = {
  id: string;
  created_at: string;
  lead_score: number;
  intent: string | null;
  segment: string | null;
  scale: string | null;
  timeline?: string | null;
  status: string | null;
  user_snippet: string | null;
};

type LeadDetailRow = LeadRow & {
  conversation_id?: string | null;
};

type LeadEventRow = {
  id: string;
  created_at: string;
  event_type: string | null;
  intent: string | null;
  segment: string | null;
  timeline?: string | null;
  lead_score?: number | null;
  user_snippet?: string | null;
  assistant_snippet?: string | null;
  payload?: Record<string, unknown> | null;
};

type LeadDetailResponse = {
  lead: LeadDetailRow;
  events: LeadEventRow[];
};

type LeadStatus = "new" | "contacted" | "qualified" | "closed";
type SortMode = "priority_newest" | "score_desc" | "created_desc";

function priorityOf(score: number) {
  if (score >= 85) return { label: "HOT", rank: 3, bg: "#fee2e2", fg: "#991b1b" };
  if (score >= 70) return { label: "WARM", rank: 2, bg: "#fef3c7", fg: "#92400e" };
  return { label: "MONITOR", rank: 1, bg: "#e5e7eb", fg: "#374151" };
}

function safeStatus(s: string | null | undefined): LeadStatus {
  if (s === "contacted" || s === "qualified" || s === "closed") return s;
  return "new";
}

function escapeCsv(value: unknown) {
  const s = String(value ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default function LeadsDashboardPage() {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [sort, setSort] = useState<SortMode>("priority_newest");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");

  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailLead, setDetailLead] = useState<LeadDetailRow | null>(null);
  const [detailEvents, setDetailEvents] = useState<LeadEventRow[]>([]);

  async function load() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/leads", {
        headers: {
          "x-admin-token": (process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ?? "").toString(),
        },
        cache: "no-store",
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${t}`);
      }

      const json = (await res.json()) as { rows: LeadRow[] };
      setRows(json.rows ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load leads.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const statuses = useMemo(() => ["new", "contacted", "qualified", "closed"], []);

  const segments = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.segment) s.add(r.segment);
    }
    return Array.from(s).sort();
  }, [rows]);

  const counts = useMemo(() => {
    return {
      new: rows.filter((r) => safeStatus(r.status) === "new").length,
      contacted: rows.filter((r) => safeStatus(r.status) === "contacted").length,
      qualified: rows.filter((r) => safeStatus(r.status) === "qualified").length,
      closed: rows.filter((r) => safeStatus(r.status) === "closed").length,
    };
  }, [rows]);

  const viewRows = useMemo(() => {
    let out = [...rows];

    if (statusFilter !== "all") {
      out = out.filter((r) => safeStatus(r.status) === statusFilter);
    }

    if (segmentFilter !== "all") {
      out = out.filter((r) => (r.segment ?? "") === segmentFilter);
    }

    if (sort === "priority_newest") {
      out.sort((a, b) => {
        const pa = priorityOf(a.lead_score ?? 0).rank;
        const pb = priorityOf(b.lead_score ?? 0).rank;
        if (pb !== pa) return pb - pa;

        const dateDiff = +new Date(b.created_at) - +new Date(a.created_at);
        if (dateDiff !== 0) return dateDiff;

        return (b.lead_score ?? 0) - (a.lead_score ?? 0);
      });
    } else if (sort === "score_desc") {
      out.sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0));
    } else {
      out.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    }

    return out;
  }, [rows, sort, statusFilter, segmentFilter]);

  async function openLeadDetail(row: LeadRow) {
    setSelectedLead(row);
    setDetailLead(null);
    setDetailEvents([]);
    setDetailError("");
    setDetailLoading(true);

    try {
      const res = await fetch(`/api/leads/${row.id}`, {
        headers: {
          "x-admin-token": (process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ?? "").toString(),
        },
        cache: "no-store",
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${t}`);
      }

      const json = (await res.json()) as LeadDetailResponse;
      setDetailLead(json.lead);
      setDetailEvents(json.events ?? []);
    } catch (e: unknown) {
      setDetailError(e instanceof Error ? e.message : "Failed to load lead detail.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function setStatus(id: string, status: LeadStatus) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    setSelectedLead((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
    setDetailLead((prev) => (prev && prev.id === id ? { ...prev, status } : prev));

    const res = await fetch("/api/leads", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": (process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ?? "").toString(),
      },
      body: JSON.stringify({ id, status }),
    });

    if (!res.ok) {
      await load();
      alert("Failed to update status. Refreshed.");
    }
  }

  function exportCsv() {
    const headers = [
      "id",
      "priority",
      "created_at",
      "lead_score",
      "intent",
      "segment",
      "scale",
      "timeline",
      "status",
      "user_snippet",
    ];

    const lines = [
      headers.join(","),
      ...viewRows.map((r) =>
        [
          escapeCsv(r.id),
          escapeCsv(priorityOf(r.lead_score).label),
          escapeCsv(r.created_at),
          escapeCsv(r.lead_score),
          escapeCsv(r.intent),
          escapeCsv(r.segment),
          escapeCsv(r.scale),
          escapeCsv(r.timeline),
          escapeCsv(safeStatus(r.status)),
          escapeCsv(r.user_snippet),
        ].join(",")
      ),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `ilimex-leads-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const selectedLeadFresh =
    selectedLead ? rows.find((r) => r.id === selectedLead.id) ?? selectedLead : null;

  const activeLead = detailLead ?? selectedLeadFresh;

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>IlimexBot — Leads</h1>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "#374151" }}>
            Sort{" "}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
              <option value="priority_newest">Priority then newest</option>
              <option value="score_desc">Lead score (desc)</option>
              <option value="created_desc">Created (newest)</option>
            </select>
          </label>

          <label style={{ fontSize: 12, color: "#374151" }}>
            Status{" "}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 12, color: "#374151" }}>
            Segment{" "}
            <select value={segmentFilter} onChange={(e) => setSegmentFilter(e.target.value)}>
              <option value="all">All</option>
              {segments.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={exportCsv}
            disabled={viewRows.length === 0}
            style={{
              border: "1px solid #e5e7eb",
              padding: "6px 10px",
              borderRadius: 8,
              background: viewRows.length === 0 ? "#f3f4f6" : "white",
              cursor: viewRows.length === 0 ? "default" : "pointer",
              fontSize: 12,
            }}
          >
            Export CSV
          </button>

          <button
            onClick={() => void load()}
            style={{
              border: "1px solid #e5e7eb",
              padding: "6px 10px",
              borderRadius: 8,
              background: "white",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {!loading && !error && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 10,
            marginTop: 8,
            marginBottom: 12,
          }}
        >
          {[
            { label: "New", value: counts.new },
            { label: "Contacted", value: counts.contacted },
            { label: "Qualified", value: counts.qualified },
            { label: "Closed", value: counts.closed },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                background: "#fff",
                padding: 12,
              }}
            >
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#111827" }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div>Loading…</div>}

      {error && (
        <div style={{ padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {[
                  "priority",
                  "created_at",
                  "lead_score",
                  "intent",
                  "segment",
                  "scale",
                  "status",
                  "actions",
                  "user_snippet",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #e5e7eb",
                      padding: "8px 10px",
                      fontSize: 12,
                      color: "#374151",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {viewRows.map((r) => {
                const p = priorityOf(r.lead_score);
                const status = safeStatus(r.status);

                return (
                  <tr key={r.id}>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: p.bg,
                          color: p.fg,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {p.label}
                      </span>
                    </td>

                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {new Date(r.created_at).toLocaleString()}
                    </td>

                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        fontWeight: 800,
                      }}
                    >
                      {r.lead_score}
                    </td>

                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>
                      {r.intent ?? ""}
                    </td>

                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>
                      {r.segment ?? ""}
                    </td>

                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>
                      {r.scale ?? ""}
                    </td>

                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>
                      {status}
                    </td>

                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <button
                        disabled={status === "contacted"}
                        onClick={() => void setStatus(r.id, "contacted")}
                        style={{
                          border: "1px solid #e5e7eb",
                          padding: "6px 10px",
                          borderRadius: 8,
                          background: status === "contacted" ? "#f3f4f6" : "white",
                          cursor: status === "contacted" ? "default" : "pointer",
                          fontSize: 12,
                          marginRight: 8,
                        }}
                      >
                        Mark contacted
                      </button>

                      <select
                        value={status}
                        onChange={(e) => void setStatus(r.id, e.target.value as LeadStatus)}
                        style={{ fontSize: 12, marginRight: 8 }}
                      >
                        <option value="new">new</option>
                        <option value="contacted">contacted</option>
                        <option value="qualified">qualified</option>
                        <option value="closed">closed</option>
                      </select>

                      <button
                        onClick={() => void openLeadDetail(r)}
                        style={{
                          border: "1px solid #e5e7eb",
                          padding: "6px 10px",
                          borderRadius: 8,
                          background: "white",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        View
                      </button>
                    </td>

                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        minWidth: 420,
                      }}
                    >
                      {r.user_snippet ?? ""}
                    </td>
                  </tr>
                );
              })}

              {viewRows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 12, color: "#6b7280" }}>
                    No leads yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeLead && (
        <>
          <div
            onClick={() => {
              setSelectedLead(null);
              setDetailLead(null);
              setDetailEvents([]);
              setDetailError("");
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.28)",
              zIndex: 40,
            }}
          />

          <aside
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              width: "min(520px, 92vw)",
              height: "100vh",
              background: "#ffffff",
              boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
              zIndex: 50,
              padding: 16,
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>Lead Detail</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  Review lead information and linked conversation activity.
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedLead(null);
                  setDetailLead(null);
                  setDetailEvents([]);
                  setDetailError("");
                }}
                style={{
                  border: "1px solid #e5e7eb",
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "white",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 12,
                  gridColumn: "1 / -1",
                }}
              >
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Priority</div>
                <span
                  style={{
                    display: "inline-block",
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: priorityOf(activeLead.lead_score).bg,
                    color: priorityOf(activeLead.lead_score).fg,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {priorityOf(activeLead.lead_score).label}
                </span>
              </div>

              {[
                { label: "Lead ID", value: activeLead.id },
                {
                  label: "Created",
                  value: new Date(activeLead.created_at).toLocaleString(),
                },
                { label: "Lead score", value: activeLead.lead_score },
                { label: "Intent", value: activeLead.intent ?? "—" },
                { label: "Segment", value: activeLead.segment ?? "—" },
                { label: "Scale", value: activeLead.scale ?? "—" },
                { label: "Timeline", value: activeLead.timeline ?? "—" },
                { label: "Status", value: safeStatus(activeLead.status) },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", wordBreak: "break-word" }}>
                    {String(item.value)}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Update status</div>
              <select
                value={safeStatus(activeLead.status)}
                onChange={(e) => void setStatus(activeLead.id, e.target.value as LeadStatus)}
                style={{ fontSize: 14, padding: 8, minWidth: 180 }}
              >
                <option value="new">new</option>
                <option value="contacted">contacted</option>
                <option value="qualified">qualified</option>
                <option value="closed">closed</option>
              </select>
            </div>

            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                Conversation ID
              </div>
              <div style={{ fontSize: 14, color: "#111827", wordBreak: "break-all" }}>
              {detailLead?.conversation_id ?? "—"}
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>User snippet</div>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.5,
                  color: "#111827",
                  fontSize: 14,
                }}
              >
                {activeLead.user_snippet ?? "—"}
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 12,
                marginTop: 16,
              }}
            >
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
                Recent conversation activity
              </div>

              {detailLoading && (
                <div style={{ fontSize: 14, color: "#6b7280" }}>Loading conversation…</div>
              )}

              {detailError && (
                <div style={{ fontSize: 14, color: "#991b1b" }}>{detailError}</div>
              )}

              {!detailLoading && !detailError && detailEvents.length === 0 && (
                <div style={{ fontSize: 14, color: "#6b7280" }}>
                  No linked conversation events found.
                </div>
              )}

              {!detailLoading &&
                !detailError &&
                detailEvents.map((ev) => {
                  const payloadAssistant =
                    ev.payload && typeof ev.payload.assistantSnippet === "string"
                      ? ev.payload.assistantSnippet
                      : null;

                  const botText = ev.assistant_snippet ?? payloadAssistant;

                  return (
                    <div
                      key={ev.id}
                      style={{
                        borderTop: "1px solid #f3f4f6",
                        paddingTop: 12,
                        marginTop: 12,
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                        {new Date(ev.created_at).toLocaleString()}
                      </div>

                      {ev.user_snippet && (
                        <div
                          style={{
                            background: "#f9fafb",
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            padding: 10,
                            marginBottom: 8,
                          }}
                        >
                          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>User</div>
                          <div style={{ fontSize: 14, color: "#111827", whiteSpace: "pre-wrap" }}>
                            {ev.user_snippet}
                          </div>
                        </div>
                      )}

                      {botText && (
                        <div
                          style={{
                            background: "#eff6ff",
                            border: "1px solid #dbeafe",
                            borderRadius: 10,
                            padding: 10,
                          }}
                        >
                          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Bot</div>
                          <div style={{ fontSize: 14, color: "#111827", whiteSpace: "pre-wrap" }}>
                            {botText}
                          </div>
                        </div>
                      )}

                      {!ev.user_snippet && !botText && (
                        <div style={{ fontSize: 13, color: "#6b7280" }}>
                          Event logged with no displayable snippets.
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}