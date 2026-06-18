"use client";

import React, { useEffect, useMemo, useState } from "react";

type LeadRow = {
  id: string;
  created_at: string;
  last_activity_at?: string | null;
  lead_score: number;
  deal_score?: number | null;
  intent: string | null;
  segment: string | null;
  scale: string | null;
  est_value?: number | null;
  timeline?: string | null;
  status: string | null;
  deal_stage?: string | null;
  next_action?: string | null;
  next_action_priority?: string | null;
  next_action_due?: string | null;
  next_follow_up_at?: string | null;
  last_contacted_at?: string | null;
  follow_up_count?: number | null;
  owner?: string | null;
  mode?: string | null;
  source?: string | null;
  contact_name?: string | null;
  company?: string | null;
  farm?: string | null;
  email?: string | null;
  phone?: string | null;
  role_title?: string | null;
  notes?: string | null;
  linkedin_url?: string | null;
  website?: string | null;
  sector?: string | null;
  annual_bird_count?: number | null;
  partnership_type?: string | null;
  estimated_unit_count?: number | null;
  estimated_annual_value?: number | null;

  chat_summary?: string | null;
  last_user_message?: string | null;
  last_bot_message?: string | null;

  role?: string | null;
  is_test?: boolean | null;
  updated_at?: string | null;
  updated_by?: string | null;
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

type LeadActivityRow = {
  id: string;
  lead_id: number;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  created_at: string;
};

type LeadDetailResponse = {
  lead: LeadDetailRow;
  events: LeadEventRow[];
  activity: LeadActivityRow[];
};

type LeadStatus = "new" | "contacted" | "qualified" | "closed";

type DashboardMode = "all" | "my_leads" | "unassigned" | "followups_due";

type SortMode =
  | "priority_activity"
  | "score_desc"
  | "activity_desc"
  | "value_desc"
  | "weighted_value_desc";

type ImportPreviewRow = {
  row: number;
  action: "create" | "update";
  duplicate_id: string | null;
  company: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  lead_score: number;
  deal_score: number;
  estimated_annual_value: number | null;
  estimated_unit_count: number | null;
};

type ImportSummary = {
  ok?: boolean;
  dryRun?: boolean;
  processed?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: Array<{ row: number; error: string }>;
  preview?: ImportPreviewRow[];
};

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
  linkedinUrl: string;
  website: string;
  sector: string;
  partnershipType: string;

  estimatedUnitCount: string;
  estimatedAnnualValue: string;
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
  linkedinUrl: "",
  website: "",
  sector: "",
  partnershipType: "",
  estimatedUnitCount: "",
  estimatedAnnualValue: "",
};

const CURRENT_USER = "Anthony Fanning";

const COMMERCIAL_STAGES = [
  "New",
  "Contacted",
  "Qualified",
  "Meeting Planned",
  "Proposal Sent",
  "Trial Discussion",
  "Negotiation",
  "Partnership Discussion",
  "Closed Won",
  "Closed Lost",
] as const;

const CLOSED_STAGES = new Set(["Closed Won", "Closed Lost"]);

const STAGE_WEIGHTS: Record<string, number> = {
  New: 0.1,
  Contacted: 0.2,
  Qualified: 0.4,
  "Meeting Planned": 0.5,
  "Proposal Sent": 0.6,
  "Trial Discussion": 0.7,
  Negotiation: 0.8,
  "Partnership Discussion": 0.6,
  "Closed Won": 1,
  "Closed Lost": 0,
};

function stageWeight(stage?: string | null) {
  return STAGE_WEIGHTS[stage || "New"] ?? 0.1;
}

function weightedValue(row: LeadRow) {
  const base =
    typeof row.estimated_annual_value === "number" &&
    row.estimated_annual_value > 0
      ? row.estimated_annual_value
      : typeof row.est_value === "number"
        ? row.est_value
        : 0;

  return Math.round(base * stageWeight(row.deal_stage));
}

function isClosedLead(row: LeadRow) {
  return CLOSED_STAGES.has(row.deal_stage || "");
}

function priorityOf(score: number) {
  if (score >= 85)
    return { label: "HOT", rank: 3, bg: "#fee2e2", fg: "#991b1b" };
  if (score >= 70)
    return { label: "WARM", rank: 2, bg: "#fef3c7", fg: "#92400e" };
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

function activityAt(row: {
  last_activity_at?: string | null;
  created_at: string;
}) {
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
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return "—";
  if (value >= 1_000_000)
    return `£${(value / 1_000_000).toFixed(2).replace(/\.00$/, "")}m`;
  if (value >= 1_000) return `£${Math.round(value / 1_000)}k`;
  return `£${value.toLocaleString()}`;
}

function sumValue(rows: LeadRow[]): number {
  return rows.reduce(
    (sum, r) => sum + (typeof r.est_value === "number" ? r.est_value : 0),
    0,
  );
}

function renderActivityValue(value: string | null) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

export default function LeadsDashboardPage() {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [sort, setSort] = useState<SortMode>("score_desc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<
    "all" | "immediate" | "this_week" | "high_value"
  >("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("all");
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailLead, setDetailLead] = useState<LeadDetailRow | null>(null);
  const [detailEvents, setDetailEvents] = useState<LeadEventRow[]>([]);
  const [detailActivity, setDetailActivity] = useState<LeadActivityRow[]>([]);

  const [showAddLead, setShowAddLead] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [editingLead, setEditingLead] = useState<LeadRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [addingLead, setAddingLead] = useState(false);
  const [addLeadError, setAddLeadError] = useState("");
  const [addLeadSuccess, setAddLeadSuccess] = useState("");
  const [manualLead, setManualLead] =
    useState<ManualLeadFormState>(EMPTY_MANUAL_LEAD);

  function updateManualLead<K extends keyof ManualLeadFormState>(
    key: K,
    value: ManualLeadFormState[K],
  ) {
    setManualLead((prev) => ({ ...prev, [key]: value }));
  }

  async function load() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/leads", {
        headers: {
          "x-admin-token": (
            process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ?? ""
          ).toString(),
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
  useEffect(() => {
    const saved = window.localStorage.getItem("ilimex_crm_dashboard_mode");
    if (
      saved === "all" ||
      saved === "my_leads" ||
      saved === "unassigned" ||
      saved === "followups_due"
    ) {
      setDashboardMode(saved);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ilimex_crm_dashboard_mode", dashboardMode);
  }, [dashboardMode]);
  const crmCards = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();

    const immediateActions = rows.filter((r) => {
      const due = r.next_action_due ? new Date(r.next_action_due) : null;
      if (due) due.setHours(0, 0, 0, 0);
      return (
        r.next_action_priority === "Immediate" || (due !== null && due <= today)
      );
    }).length;

    const highValuePipeline = rows.filter((r) => {
  const annual =
    r.estimated_annual_value ??
    r.est_value ??
    0;

  return (
    annual >= 100000 ||
    (r.deal_score ?? r.lead_score ?? 0) >= 80
  );
}).length;

    const needsFollowUpToday = rows.filter((r) => {
      const actionDue = r.next_action_due ? new Date(r.next_action_due) : null;
      const followUpDue = r.next_follow_up_at
        ? new Date(r.next_follow_up_at)
        : null;
      if (actionDue) actionDue.setHours(0, 0, 0, 0);
      return (
        (actionDue !== null && actionDue <= today) ||
        (followUpDue !== null && followUpDue <= now)
      );
    }).length;

    const partnerships = rows.filter((r) => {
      const intent = (r.intent ?? "").toLowerCase();
      const segment = (r.segment ?? "").toLowerCase();
      return (
        intent === "partnership" ||
        segment.includes("partner") ||
        segment.includes("equipment") ||
        segment.includes("genetics") ||
        segment.includes("biosecurity")
      );
    }).length;

    return {
      immediateActions,
      highValuePipeline,
      needsFollowUpToday,
      partnerships,
    };
  }, [rows]);

  const followUpRows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();

    return rows
      .filter((r) => {
        const actionDue = r.next_action_due
          ? new Date(r.next_action_due)
          : null;
        const followUpDue = r.next_follow_up_at
          ? new Date(r.next_follow_up_at)
          : null;
        if (actionDue) actionDue.setHours(0, 0, 0, 0);
        return (
          r.next_action_priority === "Immediate" ||
          (actionDue !== null && actionDue <= today) ||
          (followUpDue !== null && followUpDue <= now)
        );
      })
      .sort((a, b) => {
        const priorityRank = (p?: string | null) => {
          if (p === "Immediate") return 0;
          if (p === "This Week") return 1;
          if (p === "Normal") return 2;
          return 3;
        };

        const priorityDiff =
          priorityRank(a.next_action_priority) -
          priorityRank(b.next_action_priority);
        if (priorityDiff !== 0) return priorityDiff;

        const scoreDiff =
          (b.deal_score ?? b.lead_score ?? 0) -
          (a.deal_score ?? a.lead_score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;

        const aDue = a.next_action_due
          ? new Date(a.next_action_due).getTime()
          : Infinity;
        const bDue = b.next_action_due
          ? new Date(b.next_action_due).getTime()
          : Infinity;
        return aDue - bDue;
      })
      .slice(0, 8);
  }, [rows]);

  const statuses = useMemo(
    () => ["new", "contacted", "qualified", "closed"],
    [],
  );

  const segments = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.segment) s.add(r.segment);
    }
    return Array.from(s).sort();
  }, [rows]);

  const owners = useMemo(() => {
    const unique = Array.from(
      new Set(rows.map((r) => r.owner ?? "").filter(Boolean)),
    );

    return unique.sort();
  }, [rows]);
  const activePipelineRows = useMemo(
    () => rows.filter((r) => !isClosedLead(r)),
    [rows],
  );

  const totalPipelineValue = useMemo(
    () => sumValue(activePipelineRows),
    [activePipelineRows],
  );

  const weightedPipelineValue = useMemo(
    () => activePipelineRows.reduce((sum, r) => sum + weightedValue(r), 0),
    [activePipelineRows],
  );

  const hotPipelineValue = useMemo(
    () =>
      sumValue(
        activePipelineRows.filter(
          (r) => priorityOf(r.deal_score ?? r.lead_score ?? 0).label === "HOT",
        ),
      ),
    [activePipelineRows],
  );

  const partnershipPipelineValue = useMemo(
    () =>
      sumValue(
        activePipelineRows.filter((r) => {
          const stage = (r.deal_stage ?? "").toLowerCase();
          const type = (r.partnership_type ?? "").toLowerCase();
          const segment = (r.segment ?? "").toLowerCase();
          return (
            stage.includes("partnership") ||
            type.length > 0 ||
            segment.includes("partner") ||
            segment.includes("distributor")
          );
        }),
      ),
    [activePipelineRows],
  );

  const viewRows = useMemo(() => {
    let out = [...rows];

    if (dashboardMode === "my_leads") {
      out = out.filter((r) => r.owner === CURRENT_USER);
    }

    if (dashboardMode === "unassigned") {
      out = out.filter((r) => !r.owner);
    }

    if (dashboardMode === "followups_due") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const now = new Date();

      out = out.filter((r) => {
        if (isClosedLead(r)) return false;

        const actionDue = r.next_action_due
          ? new Date(r.next_action_due)
          : null;
        const followUpDue = r.next_follow_up_at
          ? new Date(r.next_follow_up_at)
          : null;
        if (actionDue) actionDue.setHours(0, 0, 0, 0);

        return (
          r.next_action_priority === "Immediate" ||
          (actionDue !== null && actionDue <= today) ||
          (followUpDue !== null && followUpDue <= now)
        );
      });
    }
    if (statusFilter !== "all") {
      out = out.filter((r) => safeStatus(r.status) === statusFilter);
    }

    if (segmentFilter !== "all") {
      out = out.filter((r) => (r.segment ?? "") === segmentFilter);
    }
    if (ownerFilter === "unassigned") {
      out = out.filter((r) => !r.owner);
    } else if (ownerFilter !== "all") {
      out = out.filter((r) => r.owner === ownerFilter);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAhead = new Date(today);
    weekAhead.setDate(today.getDate() + 7);

    if (quickFilter === "immediate") {
      out = out.filter((r) => {
        const due = r.next_action_due ? new Date(r.next_action_due) : null;
        if (due) due.setHours(0, 0, 0, 0);
        return (
          r.next_action_priority === "Immediate" ||
          (due !== null && due <= today)
        );
      });
    }

    if (quickFilter === "this_week") {
      out = out.filter((r) => {
        const due = r.next_action_due ? new Date(r.next_action_due) : null;
        if (due) due.setHours(0, 0, 0, 0);
        return due !== null && due >= today && due <= weekAhead;
      });
    }

    if (quickFilter === "high_value") {
  out = out.filter((r) => {
    const annual =
      r.estimated_annual_value ??
      r.est_value ??
      0;

    return (
      annual >= 100000 ||
      (r.deal_score ?? r.lead_score ?? 0) >= 80
    );
  });
}

    if (sort === "priority_activity") {
      out.sort((a, b) => {
        const pa = priorityOf(a.deal_score ?? a.lead_score ?? 0).rank;
        const pb = priorityOf(b.deal_score ?? b.lead_score ?? 0).rank;
        if (pb !== pa) return pb - pa;

        const dateDiff = +new Date(activityAt(b)) - +new Date(activityAt(a));
        if (dateDiff !== 0) return dateDiff;

        return (
          (b.deal_score ?? b.lead_score ?? 0) -
          (a.deal_score ?? a.lead_score ?? 0)
        );
      });
    } else if (sort === "score_desc") {
      out.sort((a, b) => {
        const scoreDiff =
  (b.deal_score ?? b.lead_score ?? 0) -
  (a.deal_score ?? a.lead_score ?? 0);

if (scoreDiff !== 0) return scoreDiff;

const valueDiff =
  (b.estimated_annual_value ?? b.est_value ?? 0) -
  (a.estimated_annual_value ?? a.est_value ?? 0);

if (valueDiff !== 0) return valueDiff;

return (
  +new Date(activityAt(b))
  - +new Date(activityAt(a))
);
      });
    } else if (sort === "value_desc") {
      out.sort((a, b) => {
        const av = typeof a.est_value === "number" ? a.est_value : 0;
        const bv = typeof b.est_value === "number" ? b.est_value : 0;
        if (bv !== av) return bv - av;

        const pa = priorityOf(a.deal_score ?? a.lead_score ?? 0).rank;
        const pb = priorityOf(b.deal_score ?? b.lead_score ?? 0).rank;
        if (pb !== pa) return pb - pa;

        return +new Date(activityAt(b)) - +new Date(activityAt(a));
      });
    } else if (sort === "weighted_value_desc") {
      out.sort((a, b) => weightedValue(b) - weightedValue(a));
    } else {
      out.sort((a, b) => +new Date(activityAt(b)) - +new Date(activityAt(a)));
    }

    return out;
  }, [
    rows,
    sort,
    statusFilter,
    segmentFilter,
    quickFilter,
    ownerFilter,
    dashboardMode,
  ]);

  async function openLeadDetail(row: LeadRow) {
    setSelectedLead(row);
    setDetailLead(null);
    setDetailEvents([]);
    setDetailActivity([]);
    setDetailError("");
    setDetailLoading(true);

    try {
      const res = await fetch(`/api/leads/${row.id}`, {
        headers: {
          "x-admin-token": (
            process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ?? ""
          ).toString(),
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
      setDetailActivity(json.activity ?? []);
    } catch (e: unknown) {
      setDetailError(
        e instanceof Error ? e.message : "Failed to load lead detail.",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveLeadEdit() {
    if (!editingLead) return;

    try {
      setSavingEdit(true);

      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": (
            process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ?? ""
          ).toString(),
        },
        body: JSON.stringify({
          id: editingLead.id,
          company: editingLead.company,
          contact_name: editingLead.contact_name,
          email: editingLead.email,
          phone: editingLead.phone,
          role_title: editingLead.role_title,
          notes: editingLead.notes,
          owner: editingLead.owner,
          deal_stage: editingLead.deal_stage,
          next_action: editingLead.next_action,
          next_action_priority: editingLead.next_action_priority,
          next_action_due: editingLead.next_action_due,
          linkedin_url: editingLead.linkedin_url,
          website: editingLead.website,
          sector: editingLead.sector,
          annual_bird_count: editingLead.annual_bird_count,
          partnership_type: editingLead.partnership_type,
          estimated_unit_count: editingLead.estimated_unit_count,
          estimated_annual_value: editingLead.estimated_annual_value,
          role: editingLead.role,
        }),
      });

      if (!res.ok) {
        throw new Error("Save failed");
      }

      await load();
      setEditingLead(null);
    } catch {
      alert("Failed to save lead");
    } finally {
      setSavingEdit(false);
    }
  }

  async function markContacted(row: LeadRow) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? { ...r, status: "contacted", deal_stage: "Contacted" }
          : r,
      ),
    );

    const res = await fetch("/api/leads", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": (
          process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ?? ""
        ).toString(),
      },
      body: JSON.stringify({ id: row.id, action: "mark_contacted" }),
    });

    if (!res.ok) {
      await load();
      alert("Failed to mark contacted. Refreshed.");
      return;
    }

    await load();
  }

  async function setStatus(id: string, status: LeadStatus) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    setSelectedLead((prev) =>
      prev && prev.id === id ? { ...prev, status } : prev,
    );
    setDetailLead((prev) =>
      prev && prev.id === id ? { ...prev, status } : prev,
    );

    const res = await fetch("/api/leads", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": (
          process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ?? ""
        ).toString(),
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
          "x-admin-token": (
            process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ?? ""
          ).toString(),
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
          linkedinUrl: manualLead.linkedinUrl,
          website: manualLead.website,
          sector: manualLead.sector,
          partnershipType: manualLead.partnershipType,
          estimatedUnitCount: manualLead.estimatedUnitCount || null,
          estimatedAnnualValue: manualLead.estimatedAnnualValue || null,
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

  async function previewImport(file: File) {
  setImportLoading(true);

  try {
    const text = await file.text();

    const lines = text
      .split(/\r?\n/)
      .filter((l) => l.trim());

    if (lines.length < 2) {
      throw new Error("CSV contains no data rows");
    }

    const headers = lines[0]
      .split(",")
      .map((h) => h.trim());

    const rows = lines.slice(1).map((line) => {
      const values = line.split(",");

      return Object.fromEntries(
        headers.map((h, i) => [h, values[i] ?? ""])
      );
    });

    const res = await fetch(
      "/api/leads/import?dryRun=true",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token":
            process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ?? "",
        },
        body: JSON.stringify({
  dryRun: false,
  rows,
}),
      }
    );

    const json = await res.json();

    setImportPreview(json.preview ?? []);
  } catch (err) {
    alert(
      err instanceof Error
        ? err.message
        : "Import preview failed"
    );
  } finally {
    setImportLoading(false);
  }
}

async function executeImport() {
  if (!importFile) return;

  setImportLoading(true);

  try {
    const text = await importFile.text();

    const lines = text
      .split(/\r?\n/)
      .filter((l) => l.trim());

    const headers = lines[0]
      .split(",")
      .map((h) => h.trim());

    const rows = lines.slice(1).map((line) => {
      const values = line.split(",");

      return Object.fromEntries(
        headers.map((h, i) => [h, values[i] ?? ""])
      );
    });

    const res = await fetch(
      "/api/leads/import?dryRun=false",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token":
            process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ?? "",
        },
        body: JSON.stringify({
  dryRun: true,
  rows,
}),
      }
    );

    const json = await res.json();

    setImportSummary(json);

    await load();
  } catch {
    alert("Import failed");
  } finally {
    setImportLoading(false);
  }
}

  function exportCsv() {
  const headers = [
    "company",
    "contact_name",
    "email",
    "phone",
    "owner",
    "deal_stage",
    "deal_score",
    "lead_score",
    "next_action",
    "next_action_priority",
    "next_action_due",
    "estimated_unit_count",
    "estimated_annual_value",
    "weighted_value",
    "partnership_type",
    "sector",
    "website",
    "linkedin_url",
    "notes",
  ];

  const lines = [
    headers.join(","),
    ...viewRows.map((r) =>
      [
        escapeCsv(r.company),
        escapeCsv(r.contact_name),
        escapeCsv(r.email),
        escapeCsv(r.phone),
        escapeCsv(r.owner),
        escapeCsv(r.deal_stage),
        escapeCsv(r.deal_score ?? r.lead_score ?? 0),
        escapeCsv(r.lead_score),
        escapeCsv(r.next_action),
        escapeCsv(r.next_action_priority),
        escapeCsv(r.next_action_due),
        escapeCsv(r.estimated_unit_count),
        escapeCsv(r.estimated_annual_value),
        escapeCsv(weightedValue(r)),
        escapeCsv(r.partnership_type),
        escapeCsv(r.sector),
        escapeCsv(r.website),
        escapeCsv(r.linkedin_url),
        escapeCsv(r.notes ?? r.user_snippet),
      ].join(","),
    ),
  ];

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");

  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  a.href = url;
  a.download = `crm_export_${yyyy}_${mm}_${dd}.csv`;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}
  const selectedLeadFresh = selectedLead
    ? (rows.find((r) => r.id === selectedLead.id) ?? selectedLead)
    : null;

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
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          IlimexBot — Leads
        </h1>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <label style={{ fontSize: 12, color: "#374151" }}>
            Sort{" "}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
            >
              <option value="priority_activity">
                Priority then last activity
              </option>
              <option value="score_desc">Commercial score (desc)</option>
              <option value="activity_desc">Last activity (newest)</option>
              <option value="value_desc">Estimated value (desc)</option>
              <option value="weighted_value_desc">Weighted value (desc)</option>
            </select>
          </label>

          <label style={{ fontSize: 12, color: "#374151" }}>
            Status{" "}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
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
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
            >
              <option value="all">All</option>
              {segments.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 12, color: "#374151" }}>
            Owner{" "}
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
            >
              <option value="all">All</option>

              <option value="unassigned">Unassigned</option>

              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            <button
              onClick={() => setDashboardMode("all")}
              style={{
                border: "1px solid #e5e7eb",
                padding: "6px 10px",
                borderRadius: 8,
                background: dashboardMode === "all" ? "#dbeafe" : "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              All Leads
            </button>

            <button
              onClick={() => setDashboardMode("my_leads")}
              style={{
                border: "1px solid #e5e7eb",
                padding: "6px 10px",
                borderRadius: 8,
                background: dashboardMode === "my_leads" ? "#dbeafe" : "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              My Leads
            </button>

            <button
              onClick={() => setDashboardMode("unassigned")}
              style={{
                border: "1px solid #e5e7eb",
                padding: "6px 10px",
                borderRadius: 8,
                background:
                  dashboardMode === "unassigned" ? "#dbeafe" : "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Unassigned
            </button>

            <button
              onClick={() => setDashboardMode("followups_due")}
              style={{
                border: "1px solid #e5e7eb",
                padding: "6px 10px",
                borderRadius: 8,
                background:
                  dashboardMode === "followups_due" ? "#dbeafe" : "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Follow-Ups Due
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => setQuickFilter("immediate")}
              style={{
                border: "1px solid #e5e7eb",
                padding: "6px 10px",
                borderRadius: 8,
                background: quickFilter === "immediate" ? "#fee2e2" : "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              🔴 Immediate
            </button>

            <button
              onClick={() => setQuickFilter("this_week")}
              style={{
                border: "1px solid #e5e7eb",
                padding: "6px 10px",
                borderRadius: 8,
                background: quickFilter === "this_week" ? "#fef3c7" : "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              🟡 This Week
            </button>

            <button
              onClick={() => setQuickFilter("high_value")}
              style={{
                border: "1px solid #e5e7eb",
                padding: "6px 10px",
                borderRadius: 8,
                background: quickFilter === "high_value" ? "#dcfce7" : "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              🟢 High Value
            </button>

            <button
              onClick={() => setQuickFilter("all")}
              style={{
                border: "1px solid #e5e7eb",
                padding: "6px 10px",
                borderRadius: 8,
                background: quickFilter === "all" ? "#f3f4f6" : "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              All
            </button>
          </div>

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
  onClick={() => {
    setShowImportModal(true);
    setImportPreview([]);
    setImportSummary(null);
    setImportFile(null);
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
  Import CSV
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
            { label: "Immediate Actions", value: crmCards.immediateActions },
            { label: "High Value Pipeline", value: crmCards.highValuePipeline },
            {
              label: "Needs Follow-up Today",
              value: crmCards.needsFollowUpToday,
            },
            { label: "Partnerships", value: crmCards.partnerships },
            { label: "Total Pipeline", value: formatValue(totalPipelineValue) },
            {
              label: "Weighted Pipeline",
              value: formatValue(weightedPipelineValue),
            },
            { label: "HOT Pipeline", value: formatValue(hotPipelineValue) },
            {
              label: "Partnership Pipeline",
              value: formatValue(partnershipPipelineValue),
            },
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
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#111827" }}>
                {String(item.value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && <div>Loading…</div>}

      {error && (
        <div
          style={{
            padding: 12,
            background: "#fee2e2",
            color: "#991b1b",
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              background: "white",
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
                gap: 12,
              }}
            >
              <div>
                <h2 style={{ fontSize: 18, margin: 0, fontWeight: 800 }}>
                  Today&apos;s Follow-Ups
                </h2>
                <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
                  Immediate, due, and overdue lead actions.
                </p>
              </div>

              <button
                onClick={() => setQuickFilter("immediate")}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "white",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                View Immediate
              </button>
            </div>

            {followUpRows.length === 0 ? (
              <div style={{ color: "#6b7280", fontSize: 14 }}>
                No urgent follow-ups due.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {followUpRows.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => setEditingLead({ ...r })}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "110px 1fr 140px",
                      gap: 12,
                      alignItems: "center",
                      border:
                        r.next_action_due &&
                        new Date(r.next_action_due) <
                          new Date(new Date().setHours(0, 0, 0, 0))
                          ? "1px solid #fecaca"
                          : r.next_action_due &&
                              new Date(r.next_action_due).toDateString() ===
                                new Date().toDateString()
                            ? "1px solid #fde68a"
                            : "1px solid #bbf7d0",
                      borderRadius: 12,
                      padding: 12,
                      cursor: "pointer",
                      background: "#fff",
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 13 }}>
                      {r.next_action_priority === "Immediate"
                        ? "🔴 Immediate"
                        : r.next_action_priority === "This Week"
                          ? "🟡 This Week"
                          : "⚪ Normal"}
                    </div>

                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>
                        {r.company ||
                          r.farm ||
                          r.contact_name ||
                          "Unknown lead"}
                      </div>
                      <div style={{ color: "#6b7280", fontSize: 13 }}>
                        {r.next_action || "Follow up"}
                        {r.contact_name ? ` · ${r.contact_name}` : ""}
                      </div>
                    </div>

                    <div
                      style={{
                        textAlign: "right",
                        fontSize: 13,
                        color: "#374151",
                      }}
                    >
                      Score {r.deal_score ?? r.lead_score ?? 0}
                      <br />
                      {r.next_action_due
                        ? r.next_action_due.slice(0, 10)
                        : "No due date"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {[
                  "Priority",
                  "Score",
                  "Company / Contact",
                  "Stage",
                  "Next Action",
                  "Due",
                  "Owner",
                  "Actions",
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
                const score = r.deal_score ?? r.lead_score ?? 0;
                const p = priorityOf(score);

                return (
                  <tr key={r.id}>
                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: p.bg,
                          color: p.fg,
                          fontSize: 12,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.label}
                      </span>
                      {r.is_test && (
                        <span
                          style={{
                            display: "inline-block",
                            marginLeft: 6,
                            padding: "2px 7px",
                            borderRadius: 999,
                            background: "#111827",
                            color: "white",
                            fontSize: 10,
                            fontWeight: 700,
                            verticalAlign: "middle",
                          }}
                        >
                          TEST
                        </span>
                      )}
                    </td>

                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {score}
                    </td>

                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      <div style={{ fontWeight: 800, color: "#111827" }}>
                        {r.company || r.farm || "Unknown"}
                      </div>
                      <div
                        style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}
                      >
                        {r.contact_name || "No contact"}
                        {r.phone ? ` · ${r.phone}` : ""}
                        {r.email ? ` · ${r.email}` : ""}
                      </div>
                    </td>

                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.deal_stage || safeStatus(r.status) || "New"}
                    </td>

                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        minWidth: 220,
                      }}
                    >
                      <div style={{ color: "#111827" }}>
                        {r.next_action || "Follow up"}
                      </div>
                      <div
                        style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}
                      >
                        {r.next_action_priority || "Normal"}
                      </div>
                    </td>

                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.next_action_due ? r.next_action_due.slice(0, 10) : "—"}
                    </td>

                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.owner || "Unassigned"}
                    </td>

                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <button
                        disabled={safeStatus(r.status) === "contacted"}
                        onClick={() => void markContacted(r)}
                        style={{
                          border: "1px solid #e5e7eb",
                          padding: "6px 10px",
                          borderRadius: 8,
                          background:
                            safeStatus(r.status) === "contacted"
                              ? "#f3f4f6"
                              : "white",
                          cursor:
                            safeStatus(r.status) === "contacted"
                              ? "default"
                              : "pointer",
                          fontSize: 12,
                          marginRight: 8,
                        }}
                      >
                        Mark contacted
                      </button>

                      <button
                        onClick={() => setEditingLead({ ...r })}
                        style={{
                          border: "1px solid #e5e7eb",
                          padding: "6px 10px",
                          borderRadius: 8,
                          background: "white",
                          cursor: "pointer",
                          fontSize: 12,
                          marginRight: 8,
                        }}
                      >
                        Edit
                      </button>

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
                  </tr>
                );
              })}

              {viewRows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 12, color: "#6b7280" }}>
                    No leads yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editingLead && (
        <>
          <div
            onClick={() => {
              if (!savingEdit) setEditingLead(null);
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.28)",
              zIndex: 80,
            }}
          />

          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(640px, 94vw)",
              maxHeight: "88vh",
              overflowY: "auto",
              background: "#fff",
              borderRadius: 14,
              boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
              zIndex: 90,
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
                <div
                  style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}
                >
                  Edit Lead
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  Update contact and follow-up details. Delete remains
                  admin-only.
                </div>
              </div>

              <button
                onClick={() => setEditingLead(null)}
                disabled={savingEdit}
                style={{
                  border: "1px solid #e5e7eb",
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "white",
                  cursor: savingEdit ? "default" : "pointer",
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
                Contact
                <input
                  value={editingLead.contact_name ?? ""}
                  onChange={(e) =>
                    setEditingLead({
                      ...editingLead,
                      contact_name: e.target.value,
                    })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Company
                <input
                  value={editingLead.company ?? ""}
                  onChange={(e) =>
                    setEditingLead({ ...editingLead, company: e.target.value })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Phone
                <input
                  value={editingLead.phone ?? ""}
                  onChange={(e) =>
                    setEditingLead({ ...editingLead, phone: e.target.value })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Email
                <input
                  value={editingLead.email ?? ""}
                  onChange={(e) =>
                    setEditingLead({ ...editingLead, email: e.target.value })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Website
                <input
                  value={editingLead.website ?? ""}
                  onChange={(e) =>
                    setEditingLead({ ...editingLead, website: e.target.value })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                LinkedIn URL
                <input
                  value={editingLead.linkedin_url ?? ""}
                  onChange={(e) =>
                    setEditingLead({
                      ...editingLead,
                      linkedin_url: e.target.value,
                    })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Sector
                <input
                  value={editingLead.sector ?? ""}
                  onChange={(e) =>
                    setEditingLead({ ...editingLead, sector: e.target.value })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Partnership Type
                <input
                  value={editingLead.partnership_type ?? ""}
                  onChange={(e) =>
                    setEditingLead({
                      ...editingLead,
                      partnership_type: e.target.value,
                    })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Role / Title
                <input
                  value={editingLead.role_title ?? ""}
                  onChange={(e) =>
                    setEditingLead({
                      ...editingLead,
                      role_title: e.target.value,
                    })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Owner
                <input
                  value={editingLead.owner ?? ""}
                  onChange={(e) =>
                    setEditingLead({ ...editingLead, owner: e.target.value })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Deal Stage
                <select
                  value={editingLead.deal_stage ?? "New"}
                  onChange={(e) =>
                    setEditingLead({
                      ...editingLead,
                      deal_stage: e.target.value,
                    })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                >
                  {COMMERCIAL_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Estimated Unit Count
                <input
                  value={editingLead.estimated_unit_count ?? ""}
                  onChange={(e) =>
                    setEditingLead({
                      ...editingLead,
                      estimated_unit_count: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  type="number"
                  min="0"
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Estimated Annual Value
                <input
                  value={editingLead.estimated_annual_value ?? ""}
                  onChange={(e) =>
                    setEditingLead({
                      ...editingLead,
                      estimated_annual_value: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  type="number"
                  min="0"
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Next Action Priority
                <select
                  value={editingLead.next_action_priority ?? ""}
                  onChange={(e) =>
                    setEditingLead({
                      ...editingLead,
                      next_action_priority: e.target.value,
                    })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                >
                  <option value="">Select priority</option>
                  <option value="Immediate">Immediate</option>
                  <option value="This Week">This Week</option>
                  <option value="Normal">Normal</option>
                  <option value="Low">Low</option>
                </select>
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Next Action Due
                <input
                  type="date"
                  value={
                    editingLead.next_action_due
                      ? editingLead.next_action_due.slice(0, 10)
                      : ""
                  }
                  onChange={(e) =>
                    setEditingLead({
                      ...editingLead,
                      next_action_due: e.target.value,
                    })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label
                style={{ fontSize: 12, color: "#374151", gridColumn: "1 / -1" }}
              >
                Next Action
                <input
                  value={editingLead.next_action ?? ""}
                  onChange={(e) =>
                    setEditingLead({
                      ...editingLead,
                      next_action: e.target.value,
                    })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label
                style={{ fontSize: 12, color: "#374151", gridColumn: "1 / -1" }}
              >
                Notes
                <textarea
                  value={editingLead.notes ?? ""}
                  onChange={(e) =>
                    setEditingLead({ ...editingLead, notes: e.target.value })
                  }
                  rows={5}
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

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 16,
              }}
            >
              <button
                onClick={() => setEditingLead(null)}
                disabled={savingEdit}
                style={{
                  border: "1px solid #e5e7eb",
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "white",
                  cursor: savingEdit ? "default" : "pointer",
                }}
              >
                Cancel
              </button>

              <button
                onClick={() => void saveLeadEdit()}
                disabled={savingEdit}
                style={{
                  border: "1px solid #111827",
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "#111827",
                  color: "white",
                  cursor: savingEdit ? "default" : "pointer",
                  fontWeight: 700,
                }}
              >
                {savingEdit ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </>
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
                <div
                  style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}
                >
                  Add Lead
                </div>
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
                  onChange={(e) =>
                    updateManualLead("contactName", e.target.value)
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Company
                <input
                  value={manualLead.company}
                  onChange={(e) => updateManualLead("company", e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Website
                <input
                  value={manualLead.website}
                  onChange={(e) => updateManualLead("website", e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                LinkedIn URL
                <input
                  value={manualLead.linkedinUrl}
                  onChange={(e) =>
                    updateManualLead("linkedinUrl", e.target.value)
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Sector
                <input
                  value={manualLead.sector}
                  onChange={(e) => updateManualLead("sector", e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Partnership Type
                <input
                  value={manualLead.partnershipType}
                  onChange={(e) =>
                    updateManualLead("partnershipType", e.target.value)
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>
              <label style={{ fontSize: 12, color: "#374151" }}>
                Farm
                <input
                  value={manualLead.farm}
                  onChange={(e) => updateManualLead("farm", e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Email
                <input
                  value={manualLead.email}
                  onChange={(e) => updateManualLead("email", e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Phone
                <input
                  value={manualLead.phone}
                  onChange={(e) => updateManualLead("phone", e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Source
                <select
                  value={manualLead.source}
                  onChange={(e) => updateManualLead("source", e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
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
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
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
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
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
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Bird count
                <input
                  value={manualLead.birdCount}
                  onChange={(e) =>
                    updateManualLead("birdCount", e.target.value)
                  }
                  type="number"
                  min="0"
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Estimated Unit Count
                <input
                  value={manualLead.estimatedUnitCount}
                  onChange={(e) =>
                    updateManualLead("estimatedUnitCount", e.target.value)
                  }
                  type="number"
                  min="0"
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, color: "#374151" }}>
                Estimated Annual Value
                <input
                  value={manualLead.estimatedAnnualValue}
                  onChange={(e) =>
                    updateManualLead("estimatedAnnualValue", e.target.value)
                  }
                  type="number"
                  min="0"
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <label
                style={{ fontSize: 12, color: "#374151", gridColumn: "1 / -1" }}
              >
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

      {showImportModal && (
  <>
    <div
      onClick={() => {
        if (!importLoading) setShowImportModal(false);
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
        width: "min(900px, 94vw)",
        maxHeight: "88vh",
        overflowY: "auto",
        background: "#fff",
        borderRadius: 14,
        boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
        zIndex: 70,
        padding: 16,
      }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>Import Leads</h2>

      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          setImportFile(file);
          setImportPreview([]);
          setImportSummary(null);
        }}
      />

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button
          disabled={!importFile || importLoading}
          onClick={() => importFile && void previewImport(importFile)}
        >
          {importLoading ? "Working..." : "Preview Import"}
        </button>

        <button
          disabled={!importFile || importPreview.length === 0 || importLoading}
          onClick={() => void executeImport()}
        >
          Import Leads
        </button>

        <button
          disabled={importLoading}
          onClick={() => setShowImportModal(false)}
        >
          Close
        </button>
      </div>

      {importPreview.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3>Preview</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Row", "Action", "Company", "Contact", "Score", "Value"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #e5e7eb",
                        padding: 8,
                        fontSize: 12,
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {importPreview.map((r) => (
                <tr key={r.row}>
                  <td style={{ padding: 8 }}>{r.row}</td>
                  <td style={{ padding: 8 }}>{r.action}</td>
                  <td style={{ padding: 8 }}>{r.company ?? "—"}</td>
                  <td style={{ padding: 8 }}>{r.contact_name ?? "—"}</td>
                  <td style={{ padding: 8 }}>{r.deal_score}</td>
                  <td style={{ padding: 8 }}>
                    {formatValue(r.estimated_annual_value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {importSummary && (
        <div style={{ marginTop: 16 }}>
          <h3>Import Summary</h3>
          <p>
            Processed: {importSummary.processed ?? 0} · Created:{" "}
            {importSummary.created ?? 0} · Updated:{" "}
            {importSummary.updated ?? 0} · Skipped:{" "}
            {importSummary.skipped ?? 0}
          </p>
        </div>
      )}
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
              setDetailActivity([]);
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
                <div
                  style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}
                >
                  Lead Detail
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  Review lead information and linked conversation activity.
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedLead(null);
                  setDetailLead(null);
                  setDetailEvents([]);
                  setDetailActivity([]);
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
                <div
                  style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}
                >
                  Priority
                </div>
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
                {
                  label: "Estimated value",
                  value: formatValue(activeLead.est_value),
                },
                {
                  label: "Weighted value",
                  value: formatValue(weightedValue(activeLead)),
                },
                {
                  label: "Estimated units",
                  value: activeLead.estimated_unit_count ?? "—",
                },
                {
                  label: "Estimated annual value",
                  value: formatValue(activeLead.estimated_annual_value),
                },
                { label: "Farm tier", value: farmTier(activeLead.scale) },
                { label: "Intent", value: activeLead.intent ?? "—" },
                { label: "Segment", value: activeLead.segment ?? "—" },
                {
                  label: "Source",
                  value: activeLead.source ?? activeLead.mode ?? "—",
                },
                { label: "Contact", value: activeLead.contact_name ?? "—" },
                { label: "Company", value: activeLead.company ?? "—" },
                { label: "Website", value: activeLead.website ?? "—" },
                { label: "LinkedIn", value: activeLead.linkedin_url ?? "—" },
                { label: "Sector", value: activeLead.sector ?? "—" },
                {
                  label: "Partnership Type",
                  value: activeLead.partnership_type ?? "—",
                },
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
                  <div
                    style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}
                  >
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
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                Update status
              </div>
              <select
                value={safeStatus(activeLead.status)}
                onChange={(e) =>
                  void setStatus(activeLead.id, e.target.value as LeadStatus)
                }
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
                {detailLead?.conversation_id
                  ? "Conversation ID"
                  : "Conversation"}
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: "#111827",
                  wordBreak: "break-all",
                }}
              >
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
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                User snippet
              </div>
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
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                Notes
              </div>
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
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
                Lead activity timeline
              </div>

              {detailLoading && (
                <div style={{ fontSize: 14, color: "#6b7280" }}>
                  Loading activity…
                </div>
              )}

              {detailError && (
                <div style={{ fontSize: 14, color: "#991b1b" }}>
                  {detailError}
                </div>
              )}

              {!detailLoading &&
                !detailError &&
                detailActivity.length === 0 && (
                  <div style={{ fontSize: 14, color: "#6b7280" }}>
                    No lead activity recorded yet.
                  </div>
                )}

              {!detailLoading &&
                !detailError &&
                detailActivity.map((activity) => (
                  <div
                    key={activity.id}
                    style={{
                      borderTop: "1px solid #f3f4f6",
                      paddingTop: 12,
                      marginTop: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 4,
                      }}
                    >
                      {new Date(activity.created_at).toLocaleString()}
                      {activity.changed_by ? ` · ${activity.changed_by}` : ""}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: "#111827",
                        marginBottom: 4,
                      }}
                    >
                      {activity.field_changed ?? "change"}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "#374151",
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {renderActivityValue(activity.old_value)} →{" "}
                      {renderActivityValue(activity.new_value)}
                    </div>
                  </div>
                ))}
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
                <div style={{ fontSize: 14, color: "#6b7280" }}>
                  Loading conversation…
                </div>
              )}

              {detailError && (
                <div style={{ fontSize: 14, color: "#991b1b" }}>
                  {detailError}
                </div>
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
                    ev.payload &&
                    typeof ev.payload.assistantSnippet === "string"
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
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          marginBottom: 8,
                        }}
                      >
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
                          <div
                            style={{
                              fontSize: 11,
                              color: "#6b7280",
                              marginBottom: 4,
                            }}
                          >
                            User
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              color: "#111827",
                              whiteSpace: "pre-wrap",
                            }}
                          >
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
                          <div
                            style={{
                              fontSize: 11,
                              color: "#6b7280",
                              marginBottom: 4,
                            }}
                          >
                            Bot
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              color: "#111827",
                              whiteSpace: "pre-wrap",
                            }}
                          >
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
