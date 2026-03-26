"use client";

import React, { useEffect, useMemo, useState } from "react";

type LeadRow = {
  id: string;
  created_at: string;
  last_activity_at?: string | null;
  lead_score: number;
  intent: string | null;
  segment: string | null;
  scale: string | null;
  est_value?: number | null;
  timeline?: string | null;
  status: string | null;
  mode?: string | null;
  source?: string | null;
  contact_name?: string | null;
  company?: string | null;
  farm?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
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
type SortMode = "priority_activity" | "score_desc" | "activity_desc" | "value_desc";

type ManualLeadFormState = {
  contactName: string;
  company: string;
  farm: string;
  email: string;
  phone: string;
  source: string;
  segment: string;
  timeline: string;
  houses: string;
  birdCount: string;
  notes: string;
};

const EMPTY_MANUAL_LEAD: ManualLeadFormState = {
  contactName: "",
  company: "",
  farm: "",
  email: "",
  phone: "",
  source: "manual",
  segment: "",
  timeline: "",
  houses: "",
  birdCount: "",
  notes: "",
};

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

function activityAt(row: { last_activity_at?: string | null; created_at: string }) {
  return row.last_activity_at ?? row.created_at;
}

function formatScale(scale: string | null | undefined): string {
  if (!scale) return "—";

  try {
    const parsed = JSON.parse(scale) as { unit?: string; count?: number };
    if (typeof parsed?.count === "number" && typeof parsed?.unit === "string") {
      return `${parsed.count} ${parsed.unit}`;
    }
  } catch {
    // ignore and fall back to raw string
  }

  return scale;
}

function farmTier(scale: string | null | undefined): string {
  if (!scale) return "—";

  try {
    const parsed = JSON.parse(scale) as { unit?: string; count?: number };

    if (!parsed?.count) return "—";

    const n = parsed.count;

    if (n >= 50) return "Enterprise";
    if (n >= 15) return "Large";
    if (n >= 5) return "Medium";
    return "Small";
  } catch {
    return "—";
  }
}

function formatValue(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(2).replace(/\.00$/, "")}m`;
  if (value >= 1_000) return `£${Math.round(value / 1_000)}k`;
  return `£${value.toLocaleString()}`;
}

function sumValue(rows: LeadRow[]): number {
  return rows.reduce((sum, r) => sum + (typeof r.est_value === "number" ? r.est_value : 0), 0);
}

function primaryLeadLabel(row: LeadRow): string {
  return row.contact_name || row.company || row.farm || "—";
}

function secondaryLeadLabel(row: LeadRow): string {
  const parts = [row.company, row.farm].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "";
}

export default function LeadsDashboardPage() {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [sort, setSort] = useState<SortMode>("activity_desc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");

  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailLead, setDetailLead] = useState<LeadDetailRow | null>(null);
  const [detailEvents, setDetailEvents] = useState<LeadEventRow[]>([]);

  const [showAddLead, setShowAddLead] = useState(false);
  const [addingLead, setAddingLead] = useState(false);
  const [addLeadError, setAddLeadError] = useState("");
  const [addLeadSuccess, setAddLeadSuccess] = useState("");
  const [manualLead, setManualLead] = useState<ManualLeadFormState>(EMPTY_MANUAL_LEAD);

  function sourceBadgeStyle(source?: string | null) {
  switch (source) {
    case "meeting":
      return { background: "#dbeafe", color: "#1d4ed8" };
    case "referral":
      return { background: "#dcfce7", color: "#166534" };
    case "trade_show":
      return { background: "#fed7aa", color: "#c2410c" };
    case "sales":
      return { background: "#ede9fe", color: "#6d28d9" };
    case "inbound_call":
      return { background: "#fef3c7", color: "#92400e" };
    case "whatsapp":
      return { background: "#d1fae5", color: "#065f46" };
    case "email":
      return { background: "#e0f2fe", color: "#0369a1" };
    case "manual":
      return { background: "#f3f4f6", color: "#374151" };
    case "external":
      return { background: "#ede9fe", color: "#7c3aed" };
    case "internal":
      return { background: "#e0e7ff", color: "#4338ca" };
    default:
      return { background: "#f3f4f6", color: "#374151" };
  }
}
  function updateManualLead<K extends keyof ManualLeadFormState>(
    key: K,
    value: ManualLeadFormState[K]
  ) {
    setManualLead((prev) => ({ ...prev, [key]: value }));
  }

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

  const totalPipelineValue = useMemo(() => sumValue(rows), [rows]);

  const hotPipelineValue = useMemo(
    () => sumValue(rows.filter((r) => priorityOf(r.lead_score).label === "HOT")),
    [rows]
  );

  const viewRows = useMemo(() => {
    let out = [...rows];

    if (statusFilter !== "all") {
      out = out.filter((r) => safeStatus(r.status) === statusFilter);
    }

    if (segmentFilter !== "all") {
      out = out.filter((r) => (r.segment ?? "") === segmentFilter);
    }

    if (sort === "priority_activity") {
      out.sort((a, b) => {
        const pa = priorityOf(a.lead_score ?? 0).rank;
        const pb = priorityOf(b.lead_score ?? 0).rank;
        if (pb !== pa) return pb - pa;

        const dateDiff = +new Date(activityAt(b)) - +new Date(activityAt(a));
        if (dateDiff !== 0) return dateDiff;

        return (b.lead_score ?? 0) - (a.lead_score ?? 0);
      });
    } else if (sort === "score_desc") {
      out.sort((a, b) => {
        const scoreDiff = (b.lead_score ?? 0) - (a.lead_score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return +new Date(activityAt(b)) - +new Date(activityAt(a));
      });
    } else if (sort === "value_desc") {
      out.sort((a, b) => {
        const av = typeof a.est_value === "number" ? a.est_value : 0;
        const bv = typeof b.est_value === "number" ? b.est_value : 0;
        if (bv !== av) return bv - av;

        const pa = priorityOf(a.lead_score ?? 0).rank;
        const pb = priorityOf(b.lead_score ?? 0).rank;
        if (pb !== pa) return pb - pa;

        return +new Date(activityAt(b)) - +new Date(activityAt(a));
      });
    } else {
      out.sort((a, b) => +new Date(activityAt(b)) - +new Date(activityAt(a)));
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

  async function createManualLead() {
    try {
      setAddingLead(true);
      setAddLeadError("");
      setAddLeadSuccess("");

      const res = await fetch("/api/leads/manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": (process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ?? "").toString(),
        },
        body: JSON.stringify({
          contactName: manualLead.contactName,
          company: manualLead.company,
          farm: manualLead.farm,
          email: manualLead.email,
          phone: manualLead.phone,
          source: manualLead.source,
          segment: manualLead.segment || undefined,
          timeline: manualLead.timeline || undefined,
          houses: manualLead.houses || null,
          birdCount: manualLead.birdCount || null,
          notes: manualLead.notes,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        row?: LeadRow;
      };

      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      if (json.row) {
        setRows((prev) => [json.row as LeadRow, ...prev]);
      }

      setAddLeadSuccess("Lead added successfully.");
      setManualLead({ ...EMPTY_MANUAL_LEAD });

      setTimeout(() => {
        setShowAddLead(false);
        setAddLeadSuccess("");
      }, 700);

      void load();
    } catch (e: unknown) {
      setAddLeadError(e instanceof Error ? e.message : "Failed to add lead.");
    } finally {
      setAddingLead(false);
    }
  }

  function exportCsv() {
    const headers = [
      "id",
      "priority",
      "last_activity",
      "created_at",
      "lead_score",
      "est_value",
      "farm_tier",
      "intent",
      "segment",
      "scale",
      "timeline",
      "status",
      "source",
      "user_snippet",
    ];

    const lines = [
      headers.join(","),
      ...viewRows.map((r) =>
        [
          escapeCsv(r.id),
          escapeCsv(priorityOf(r.lead_score).label),
          escapeCsv(activityAt(r)),
          escapeCsv(r.created_at),
          escapeCsv(r.lead_score),
          escapeCsv(r.est_value),
          escapeCsv(farmTier(r.scale)),
          escapeCsv(r.intent),
          escapeCsv(r.segment),
          escapeCsv(formatScale(r.scale)),
          escapeCsv(r.timeline),
          escapeCsv(safeStatus(r.status)),
          escapeCsv(r.source ?? r.mode),
          escapeCsv(r.notes ?? r.user_snippet),
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
              <option value="priority_activity">Priority then last activity</option>
              <option value="score_desc">Lead score (desc)</option>
              <option value="activity_desc">Last activity (newest)</option>
              <option value="value_desc">Estimated value (desc)</option>
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
            onClick={() => {
              setShowAddLead(true);
              setAddLeadError("");
              setAddLeadSuccess("");
            }}
            style={{
              border: "1px solid #e5e7eb",
              padding: "6px 10px",
              borderRadius: 8,
              background: "white",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Add Lead
          </button>

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
            { label: "Total pipeline", value: formatValue(totalPipelineValue) },
            { label: "HOT pipeline", value: formatValue(hotPipelineValue) },
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
              <div style={{ fontSize: 24, fontWeight: 800, color: "#111827" }}>
                {String(item.value)}
              </div>
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
                  "last_activity",
                  "lead_score",
                  "value",
                  "tier",
                  "intent",
                  "segment",
                  "source",
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
                      {new Date(activityAt(r)).toLocaleString()}
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

                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatValue(r.est_value)}
                    </td>

                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {farmTier(r.scale)}
                    </td>

                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>
                      {r.intent ?? ""}
                    </td>

                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>
                      {r.segment ?? ""}
                    </td>

                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>
  <span
    style={{
      display: "inline-block",
      padding: "3px 8px",
      borderRadius: 999,
      background: sourceBadgeStyle(r.source ?? r.mode).background,
      color: sourceBadgeStyle(r.source ?? r.mode).color,
      fontSize: 12,
      fontWeight: 600,
    }}
  >
    {r.source ?? r.mode ?? "—"}
  </span>
</td>

                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatScale(r.scale)}
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
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{primaryLeadLabel(r)}</div>
                      {secondaryLeadLabel(r) && (
                        <div style={{ color: "#374151", marginBottom: 4 }}>{secondaryLeadLabel(r)}</div>
                      )}
                      <div>{r.notes ?? r.user_snippet ?? ""}</div>
                    </td>
                  </tr>
                );
              })}

              {viewRows.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ padding: 12, color: "#6b7280" }}>
                    No leads yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddLead && (
        <>
          <div
            onClick={() => {
              if (!addingLead) {
                setShowAddLead(false);
                setAddLeadError("");
                setAddLeadSuccess("");
              }
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.28)",
              zIndex: 60,
            }}
          />

          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(720px, 94vw)",
              maxHeight: "88vh",
              overflowY: "auto",
              background: "#fff",
              borderRadius: 14,
              boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
              zIndex: 70,
              padding: 16,
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
                <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>Add Lead</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  Add a manual lead into the same CRM and scoring pipeline.
                </div>
              </div>

              <button
                onClick={() => {
                  if (!addingLead) {
                    setShowAddLead(false);
                    setAddLeadError("");
                    setAddLeadSuccess("");
                  }
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
                gap: 12,
              }}
            >
              <label style={{ fontSize: 12, color: "#374151" }}>
                Contact name
                <input
                  value={manualLead.contactName}
                  onChange={(e) => updateManualLead("contactName", e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 6, padding: 8 }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Company
                <input
                  value={manualLead.company}
                  onChange={(e) => updateManualLead("company", e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 6, padding: 8 }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Farm
                <input
                  value={manualLead.farm}
                  onChange={(e) => updateManualLead("farm", e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 6, padding: 8 }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Email
                <input
                  value={manualLead.email}
                  onChange={(e) => updateManualLead("email", e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 6, padding: 8 }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Phone
                <input
                  value={manualLead.phone}
                  onChange={(e) => updateManualLead("phone", e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 6, padding: 8 }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Source
                <select
                  value={manualLead.source}
                  onChange={(e) => updateManualLead("source", e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 6, padding: 8 }}
                >
                  <option value="manual">manual</option>
                  <option value="sales">sales</option>
                  <option value="referral">referral</option>
                  <option value="trade_show">trade_show</option>
                  <option value="inbound_call">inbound_call</option>
                  <option value="meeting">meeting</option>
                  <option value="whatsapp">whatsapp</option>
                  <option value="email">email</option>
                </select>
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Segment
                <select
                  value={manualLead.segment}
                  onChange={(e) => updateManualLead("segment", e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 6, padding: 8 }}
                >
                  <option value="">auto-detect / unknown</option>
                  <option value="poultry">poultry</option>
                  <option value="mushroom">mushroom</option>
                  <option value="trial">trial</option>
                  <option value="distributor">distributor</option>
                  <option value="investor">investor</option>
                </select>
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Timeline
                <select
                  value={manualLead.timeline}
                  onChange={(e) => updateManualLead("timeline", e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 6, padding: 8 }}
                >
                  <option value="">auto-detect / unknown</option>
                  <option value="immediate">immediate</option>
                  <option value="this_quarter">this_quarter</option>
                  <option value="this_year">this_year</option>
                </select>
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Houses / rooms
                <input
                  value={manualLead.houses}
                  onChange={(e) => updateManualLead("houses", e.target.value)}
                  type="number"
                  min="0"
                  style={{ display: "block", width: "100%", marginTop: 6, padding: 8 }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Bird count
                <input
                  value={manualLead.birdCount}
                  onChange={(e) => updateManualLead("birdCount", e.target.value)}
                  type="number"
                  min="0"
                  style={{ display: "block", width: "100%", marginTop: 6, padding: 8 }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151", gridColumn: "1 / -1" }}>
                Lead summary / notes
                <textarea
                  value={manualLead.notes}
                  onChange={(e) => updateManualLead("notes", e.target.value)}
                  rows={6}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                    resize: "vertical",
                  }}
                />
              </label>
            </div>

            {addLeadError && (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 8,
                  background: "#fee2e2",
                  color: "#991b1b",
                }}
              >
                {addLeadError}
              </div>
            )}

            {addLeadSuccess && (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 8,
                  background: "#dcfce7",
                  color: "#166534",
                }}
              >
                {addLeadSuccess}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 16,
              }}
            >
              <button
                onClick={() => {
                  if (!addingLead) {
                    setShowAddLead(false);
                    setAddLeadError("");
                    setAddLeadSuccess("");
                  }
                }}
                style={{
                  border: "1px solid #e5e7eb",
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "white",
                  cursor: addingLead ? "default" : "pointer",
                }}
                disabled={addingLead}
              >
                Cancel
              </button>

              <button
                onClick={() => void createManualLead()}
                disabled={addingLead}
                style={{
                  border: "1px solid #111827",
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "#111827",
                  color: "white",
                  cursor: addingLead ? "default" : "pointer",
                  fontWeight: 700,
                }}
              >
                {addingLead ? "Adding..." : "Add Lead"}
              </button>
            </div>
          </div>
        </>
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
                  label: "Last activity",
                  value: new Date(activityAt(activeLead)).toLocaleString(),
                },
                {
                  label: "Created",
                  value: new Date(activeLead.created_at).toLocaleString(),
                },
                { label: "Lead score", value: activeLead.lead_score },
                { label: "Estimated value", value: formatValue(activeLead.est_value) },
                { label: "Farm tier", value: farmTier(activeLead.scale) },
                { label: "Intent", value: activeLead.intent ?? "—" },
                { label: "Segment", value: activeLead.segment ?? "—" },
                { label: "Source", value: activeLead.source ?? activeLead.mode ?? "—" },
                { label: "Contact", value: activeLead.contact_name ?? "—" },
                { label: "Company", value: activeLead.company ?? "—" },
                { label: "Farm", value: activeLead.farm ?? "—" },
                { label: "Email", value: activeLead.email ?? "—" },
                { label: "Phone", value: activeLead.phone ?? "—" },
                { label: "Scale", value: formatScale(activeLead.scale) },
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
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#111827",
                      wordBreak: "break-word",
                    }}
                  >
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
                {detailLead?.conversation_id ? "Conversation ID" : "Conversation"}
              </div>
              <div style={{ fontSize: 14, color: "#111827", wordBreak: "break-all" }}>
                {detailLead?.conversation_id ?? "No linked bot conversation"}
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
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Notes</div>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.5,
                  color: "#111827",
                  fontSize: 14,
                }}
              >
                {activeLead.notes ?? "—"}
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

              {detailError && <div style={{ fontSize: 14, color: "#991b1b" }}>{detailError}</div>}

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
                          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
                            User
                          </div>
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
                          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
                            Bot
                          </div>
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