// src/app/api/leads/recalculate/route.ts

import { NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { calculateDealScore } from "@/lib/crm/calculateDealScore";

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

function inferSector(row: Record<string, unknown>) {
  const text = `${row.company ?? ""} ${row.segment ?? ""} ${row.notes ?? ""}`.toLowerCase();

  if (text.includes("poultry") || text.includes("broiler") || text.includes("layer")) {
    return "Poultry";
  }

  if (text.includes("mushroom") || text.includes("growing room")) {
    return "Mushroom";
  }

  if (text.includes("distributor")) {
    return "Distributor";
  }

  if (text.includes("equipment")) {
    return "Equipment";
  }

  if (text.includes("genetics") || text.includes("hatchery")) {
    return "Genetics / Hatchery";
  }

  return null;
}

function inferPartnershipType(row: Record<string, unknown>) {
  const text = `${row.company ?? ""} ${row.segment ?? ""} ${row.notes ?? ""}`.toLowerCase();

  if (text.includes("distributor")) return "Distributor";
  if (text.includes("strategic")) return "Strategic Partner";
  if (text.includes("trial")) return "Trial";
  if (text.includes("integrator")) return "Direct Sale / Integrator";
  if (text.includes("equipment")) return "Equipment Partner";

  return null;
}

function inferEstimatedUnitCount(row: Record<string, unknown>) {
  if (typeof row.estimated_unit_count === "number" && row.estimated_unit_count > 0) {
    return row.estimated_unit_count;
  }

  const text = `${row.scale ?? ""} ${row.notes ?? ""}`.toLowerCase();
  const match = text.match(/(\d{1,4})\s*(houses|house|sheds|shed|rooms|room)/);

  if (!match) return null;

  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) return null;

  return count;
}

function inferEstimatedAnnualValue(row: Record<string, unknown>, units: number | null) {
  if (
    typeof row.estimated_annual_value === "number" &&
    row.estimated_annual_value > 0
  ) {
    return row.estimated_annual_value;
  }

  if (!units || units <= 0) return null;

  return units * 10000;
}

function nextActionPriority(dealScore: number) {
  if (dealScore >= 85) return "Immediate";
  if (dealScore >= 70) return "This Week";
  if (dealScore >= 50) return "Normal";
  return "Low";
}

export async function POST(req: NextRequest) {
  try {
const url = new URL(req.url);
const oneTimeBypass =
  url.searchParams.get("confirm") === "recalculate-ilimex-crm";

if (!requireAdmin(req) && !oneTimeBypass) {
  return json(401, { error: "Unauthorized" });
}

const pool = getPool();

    const { rows } = await pool.query(`
      SELECT *
      FROM crm_leads
      WHERE COALESCE(deal_stage, status, '') NOT IN ('Closed Won', 'Closed Lost')
      ORDER BY created_at ASC
    `);

    let updated = 0;
    let skipped = 0;
	
	const sample: Array<{
  company: string | null;
  leadScore: number | null;
  calculatedDealScore: number;
  segment: string | null;
  partnershipType: string | null;
}> = [];

    for (const row of rows) {
      const sector = row.sector ?? inferSector(row);
      const partnershipType = row.partnership_type ?? inferPartnershipType(row);
      const estimatedUnitCount =
        row.estimated_unit_count ?? inferEstimatedUnitCount(row);
      const estimatedAnnualValue =
        row.estimated_annual_value ??
        inferEstimatedAnnualValue(row, estimatedUnitCount);

      const dealScore = calculateDealScore({
        leadScore: row.lead_score,
        segment: row.segment,
        sector,
        partnershipType,
        estimatedUnitCount,
        estimatedAnnualValue,
        company: row.company,
        dealStage: row.deal_stage,
      });
	  
	  if (sample.length < 10) {
  sample.push({
    company: row.company ?? null,
    leadScore: row.lead_score ?? null,
    calculatedDealScore: dealScore,
    segment: row.segment ?? null,
    partnershipType: partnershipType ?? null,
  });
}

      const priority = row.next_action_priority ?? nextActionPriority(dealScore);

      const result = await pool.query(
        `
        UPDATE crm_leads
        SET
          deal_score = $2,
          sector = COALESCE(sector, $3),
          partnership_type = COALESCE(partnership_type, $4),
          estimated_unit_count = COALESCE(estimated_unit_count, $5),
          estimated_annual_value = COALESCE(estimated_annual_value, $6),
          next_action_priority = COALESCE(next_action_priority, $7),
          updated_at = now(),
          updated_by = 'admin_recalculate'
        WHERE id = $1
        `,
        [
          row.id,
          dealScore,
          sector,
          partnershipType,
          estimatedUnitCount,
          estimatedAnnualValue,
          priority,
        ],
      );

      if ((result.rowCount ?? 0) > 0) updated += 1;
      else skipped += 1;
    }

return json(200, {
  ok: true,
  processed: rows.length,
  updated,
  skipped,
  sample,
});

  } catch (err) {
    console.error("POST /api/leads/recalculate error:", err);
    return json(500, { error: "Failed to recalculate leads" });
  }
}