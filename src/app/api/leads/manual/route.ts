// src/app/api/leads/manual/route.ts

import { NextRequest } from "next/server";
import { captureLead } from "@/lib/crm/captureLead";
import { scoreManualLead } from "@/lib/revenue/scoreManualLead";
import { estimateLeadValue } from "@/lib/revenue/value";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requireAdmin(req: NextRequest) {
  const expected = (
    process.env.ADMIN_DASH_TOKEN ??
    process.env.NEXT_PUBLIC_ADMIN_DASH_TOKEN ??
    ""
  ).trim();

  const received = (req.headers.get("x-admin-token") ?? "").trim();

  return !!expected && received === expected;
}

function clean(value?: string) {
  const v = String(value ?? "").trim();
  return v || undefined;
}

function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

const ALLOWED_SOURCES = new Set([
  "manual",
  "sales",
  "referral",
  "trade_show",
  "inbound_call",
  "meeting",
  "whatsapp",
  "email",
]);

const ALLOWED_STATUS = new Set(["new", "contacted", "qualified", "closed"]);

export async function POST(req: NextRequest) {
  try {
    if (!requireAdmin(req)) {
      return json(401, { error: "Unauthorized" });
    }

    const body = (await req.json().catch(() => ({}))) as {
      contactName?: string;
      company?: string;
      farm?: string;
      email?: string;
      phone?: string;
      source?: string;
      segment?: string;
      timeline?: string;
      notes?: string;
      houses?: number | string | null;
      birdCount?: number | string | null;
      status?: string;
    };

    const contactName = clean(body.contactName);
    const company = clean(body.company);
    const farm = clean(body.farm);
    const email = clean(body.email);
    const phone = clean(body.phone);
    const source = clean(body.source)?.toLowerCase() ?? "manual";
    const segment = clean(body.segment)?.toLowerCase();
    const timeline = clean(body.timeline)?.toLowerCase();
    const notes = clean(body.notes);
    const houses = parseOptionalNumber(body.houses);
    const birdCount = parseOptionalNumber(body.birdCount);
    const status = clean(body.status)?.toLowerCase() ?? "new";

    if (!ALLOWED_SOURCES.has(source)) {
      return json(400, { error: "Invalid source" });
    }

    if (!ALLOWED_STATUS.has(status)) {
      return json(400, { error: "Invalid status" });
    }

    if (!notes) {
      return json(400, { error: "Lead summary / notes are required" });
    }

    const scored = scoreManualLead({
      notes,
      company,
      farm,
      source,
      segment,
      timeline,
      houses,
      birdCount,
    });

    const row = await captureLead({
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      mode: "manual",
      leadScore: scored.leadScore,
      intent: scored.intent,
      segment: scored.segment,
      scale: scored.scale,
      timeline: scored.timeline,
      userText: scored.scoringText,
      source,
      contactName,
      company,
      farm,
      email,
      phone,
      notes,
      status: status as "new" | "contacted" | "qualified" | "closed",
    });

    const parsedScale = (() => {
      try {
        return row?.scale ? JSON.parse(row.scale) : scored.scale ?? null;
      } catch {
        return scored.scale ?? null;
      }
    })();

    const estValue = estimateLeadValue(
      row?.segment ?? scored.segment,
      parsedScale
    );

    return json(200, {
      ok: true,
      row: {
        ...row,
        intent: row?.intent ?? scored.intent,
        timeline: row?.timeline ?? scored.timeline,
        est_value: estValue,
      },
    });
  } catch (err) {
    console.error("POST /api/leads/manual error:", err);
    return json(500, { error: "Failed to create manual lead" });
  }
}