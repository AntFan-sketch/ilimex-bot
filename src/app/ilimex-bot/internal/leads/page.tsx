"use client";

import React, { useEffect, useMemo, useState } from "react";

type LeadRow = {
  id: string;
  created_at: string;
  lead_score: number;
  intent: string | null;
  segment: string | null;
  scale: string | null;
  timeline?: string | null; // optional, safe if not returned by API
  status: string | null;
  user_snippet: string | null;
};

type LeadStatus = "new" | "contacted" | "qualified" | "closed";

function priorityOf(score: number) {
  if (score >= 85) return { label: "HOT", bg: "#fee2e2", fg: "#991b1b" };
  if (score >= 70) return { label: "WARM", bg: "#fef3c7", fg: "#92400e" };
  return { label: "MONITOR", bg: "#e5e7eb", fg: "#374151" };
}

function safeStatus(s: string | null | undefined): LeadStatus {
  if (s === "contacted" || s === "qualified" || s === "closed") return s;
  return "new";
}

export default function LeadsDashboardPage() {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [sort, setSort] = useState<"created_desc" | "score_desc">("score_desc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/leads", {
        headers: {
          // If ADMIN_DASH_TOKEN is set server-side, pass it here (optional for local dev).
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
    } catch (e: any) {
      setError(e?.message || "Failed to load leads.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statuses = useMemo(() => ["new", "contacted", "qualified", "closed"], []);

  const segments = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.segment) s.add(r.segment);
    return Array.from(s).sort();
  }, [rows]);

  const viewRows = useMemo(() => {
    let out = [...rows];

    if (statusFilter !== "all") {
      out = out.filter((r) => safeStatus(r.status) === statusFilter);
    }
    if (segmentFilter !== "all") {
      out = out.filter((r) => (r.segment ?? "") === segmentFilter);
    }

    if (sort === "score_desc") {
      out.sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0));
    } else {
      out.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    }

    return out;
  }, [rows, sort, statusFilter, segmentFilter]);

  async function setStatus(id: string, status: LeadStatus) {
    // optimistic update
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));

    const res = await fetch("/api/leads", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": (process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ?? "").toString(),
      },
      body: JSON.stringify({ id, status }),
    });

    if (!res.ok) {
      // revert by reload (simple + safe)
      await load();
      alert("Failed to update status. Refreshed.");
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>IlimexBot — Leads</h1>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "#374151" }}>
            Sort{" "}
            <select value={sort} onChange={(e) => setSort(e.target.value as any)}>
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
                {["priority", "created_at", "lead_score", "intent", "segment", "scale", "status", "actions", "user_snippet"].map(
                  (h) => (
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
                  )
                )}
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

                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" }}>
                      {new Date(r.created_at).toLocaleString()}
                    </td>

                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", fontWeight: 800 }}>
                      {r.lead_score}
                    </td>

                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>{r.intent ?? ""}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>{r.segment ?? ""}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>{r.scale ?? ""}</td>

                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>{status}</td>

                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" }}>
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
                        style={{ fontSize: 12 }}
                      >
                        <option value="new">new</option>
                        <option value="contacted">contacted</option>
                        <option value="qualified">qualified</option>
                        <option value="closed">closed</option>
                      </select>
                    </td>

                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", minWidth: 420 }}>
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
    </div>
  );
}