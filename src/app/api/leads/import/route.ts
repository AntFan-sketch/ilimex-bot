import { NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { calculateDealScore } from "@/lib/crm/calculateDealScore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportRow = Record<string, unknown>;

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

function clean(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  return v.length ? v : null;
}

function num(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function bool(value: unknown): boolean {
  if (value === true) return true;
  const v = String(value ?? "").trim().toLowerCase();
  return v === "true" || v === "yes" || v === "1";
}

function nextActionPriority(dealScore: number) {
  if (dealScore >= 85) return "Immediate";
  if (dealScore >= 70) return "This Week";
  if (dealScore >= 50) return "Normal";
  return "Low";
}

function leadScoreFromImport(row: {
  segment: string | null;
  sector: string | null;
  estimatedAnnualValue: number | null;
  estimatedUnitCount: number | null;
}) {
  let score = 45;
  const text = `${row.segment ?? ""} ${row.sector ?? ""}`.toLowerCase();

  if (text.includes("tier 1")) score += 20;
  if (text.includes("integrator")) score += 15;
  if (text.includes("poultry")) score += 10;
  if (text.includes("producer")) score += 8;
  if (text.includes("equipment")) score += 6;
  if (text.includes("genetics")) score += 6;

  if ((row.estimatedAnnualValue ?? 0) >= 100000) score += 10;
  if ((row.estimatedUnitCount ?? 0) >= 10) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

async function findDuplicate(pool: ReturnType<typeof getPool>, row: {
  email: string | null;
  company: string | null;
  phone: string | null;
}) {
  if (row.email) {
    const byEmail = await pool.query(
      `SELECT * FROM crm_leads WHERE lower(email) = lower($1) LIMIT 1`,
      [row.email],
    );
    if ((byEmail.rowCount ?? 0) > 0) return byEmail.rows[0];
  }

  if (row.company) {
    const byCompany = await pool.query(
      `SELECT * FROM crm_leads WHERE lower(company) = lower($1) LIMIT 1`,
      [row.company],
    );
    if ((byCompany.rowCount ?? 0) > 0) return byCompany.rows[0];
  }

  if (row.phone) {
    const byPhone = await pool.query(
      `SELECT * FROM crm_leads WHERE phone = $1 LIMIT 1`,
      [row.phone],
    );
    if ((byPhone.rowCount ?? 0) > 0) return byPhone.rows[0];
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    if (!requireAdmin(req)) {
      return json(401, { error: "Unauthorized" });
    }

    const body = (await req.json().catch(() => ({}))) as {
      rows?: ImportRow[];
      dryRun?: boolean;
    };

    const importRows = Array.isArray(body.rows) ? body.rows : [];
    const dryRun = body.dryRun !== false;

    if (importRows.length === 0) {
      return json(400, { error: "No rows supplied" });
    }

    const pool = getPool();

    let created = 0;
    let updated = 0;
    let skipped = 0;

    const errors: Array<{ row: number; error: string }> = [];
    const preview: Array<Record<string, unknown>> = [];

    for (let i = 0; i < importRows.length; i += 1) {
      const raw = importRows[i];

      const company = clean(raw.company);
      const contactName = clean(raw.contact_name);
      const roleTitle = clean(raw.role_title);
      const email = clean(raw.email);
      const phone = clean(raw.phone);
      const farm = clean(raw.farm);
      const source = clean(raw.source) ?? "csv_import";
      const segment = clean(raw.segment);
      const sector = clean(raw.sector);
      const website = clean(raw.website);
      const linkedinUrl = clean(raw.linkedin_url);
      const geography = clean(raw.geography);
      const companySize = clean(raw.company_size);
      const annualBirdCount = num(raw.annual_bird_count);
      const estimatedUnitCount = num(raw.estimated_unit_count);
      const estimatedAnnualValue = num(raw.estimated_annual_value);
      const partnershipType = clean(raw.partnership_type);
      const dealStage = clean(raw.deal_stage) ?? "New";
      const nextAction = clean(raw.next_action) ?? "Review imported lead";
      const owner = clean(raw.owner);
      const notes = clean(raw.notes) ?? "Imported lead";
      const isTest = bool(raw.is_test);

      if (!company && !email && !phone) {
        skipped += 1;
        errors.push({
          row: i + 1,
          error: "Missing required identity field: company, email or phone",
        });
        continue;
      }

      const leadScore = leadScoreFromImport({
        segment,
        sector,
        estimatedAnnualValue,
        estimatedUnitCount,
      });

      const dealScore = calculateDealScore({
        leadScore,
        segment,
        sector,
        partnershipType,
        estimatedUnitCount,
        estimatedAnnualValue,
        company,
        dealStage,
      });

      const priority = clean(raw.next_action_priority) ?? nextActionPriority(dealScore);

      const duplicate = await findDuplicate(pool, { email, company, phone });

      preview.push({
        row: i + 1,
        action: duplicate ? "update" : "create",
        duplicate_id: duplicate?.id ?? null,
        company,
        contact_name: contactName,
        email,
        phone,
        lead_score: leadScore,
        deal_score: dealScore,
        estimated_annual_value: estimatedAnnualValue,
        estimated_unit_count: estimatedUnitCount,
      });

      if (dryRun) continue;

      if (duplicate) {
        const result = await pool.query(
          `
          UPDATE crm_leads
          SET
            contact_name = COALESCE(contact_name, $2),
            role_title = COALESCE(role_title, $3),
            email = COALESCE(email, $4),
            phone = COALESCE(phone, $5),
            farm = COALESCE(farm, $6),
            source = COALESCE(source, $7),
            segment = COALESCE(segment, $8),
            sector = COALESCE(sector, $9),
            website = COALESCE(website, $10),
            linkedin_url = COALESCE(linkedin_url, $11),
            geography = COALESCE(geography, $12),
            company_size = COALESCE(company_size, $13),
            annual_bird_count = COALESCE(annual_bird_count, $14),
            estimated_unit_count = COALESCE(estimated_unit_count, $15),
            estimated_annual_value = COALESCE(estimated_annual_value, $16),
            partnership_type = COALESCE(partnership_type, $17),
            deal_stage = COALESCE(deal_stage, $18),
            next_action = COALESCE(next_action, $19),
            next_action_priority = COALESCE(next_action_priority, $20),
            owner = COALESCE(owner, $21),
            notes = COALESCE(notes, $22),
            deal_score = GREATEST(COALESCE(deal_score, 0), $23),
            lead_score = GREATEST(COALESCE(lead_score, 0), $24),
            updated_at = now(),
            updated_by = 'crm_import'
          WHERE id = $1
          `,
          [
            duplicate.id,
            contactName,
            roleTitle,
            email,
            phone,
            farm,
            source,
            segment,
            sector,
            website,
            linkedinUrl,
            geography,
            companySize,
            annualBirdCount,
            estimatedUnitCount,
            estimatedAnnualValue,
            partnershipType,
            dealStage,
            nextAction,
            priority,
            owner,
            notes,
            dealScore,
            leadScore,
          ],
        );

        if ((result.rowCount ?? 0) > 0) updated += 1;
        else skipped += 1;
      } else {
        const result = await pool.query(
          `
          INSERT INTO crm_leads (
            env,
            mode,
            lead_score,
            deal_score,
            source,
            contact_name,
            company,
            farm,
            email,
            phone,
            role_title,
            notes,
            status,
            is_test,
            linkedin_url,
            website,
            sector,
            annual_bird_count,
            partnership_type,
            estimated_unit_count,
            estimated_annual_value,
            geography,
            company_size,
            deal_stage,
            next_action,
            next_action_priority,
            owner,
            user_text_hash,
            user_snippet,
            last_activity_at,
            updated_at,
            updated_by
          )
          VALUES (
            $1,'import',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
            'new',$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
            $22,$23,$24,$25,'',$26,now(),now(),'crm_import'
          )
          `,
          [
            process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production",
            leadScore,
            dealScore,
            source,
            contactName,
            company,
            farm,
            email,
            phone,
            roleTitle,
            notes,
            isTest,
            linkedinUrl,
            website,
            sector,
            annualBirdCount,
            partnershipType,
            estimatedUnitCount,
            estimatedAnnualValue,
            geography,
            companySize,
            dealStage,
            nextAction,
            priority,
            owner,
            notes,
          ],
        );

        if ((result.rowCount ?? 0) > 0) created += 1;
        else skipped += 1;
      }
    }

    return json(200, {
      ok: true,
      dryRun,
      processed: importRows.length,
      created,
      updated,
      skipped,
      errors,
      preview,
    });
  } catch (err) {
    console.error("POST /api/leads/import error:", err);
    return json(500, { error: "Failed to import leads" });
  }
}