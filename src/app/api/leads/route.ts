import { NextRequest } from "next/server";
import { getPool } from "@/lib/db";
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

function withEstimatedValue<T extends { segment?: string | null; scale?: string | null }>(row: T) {
  let scaleParsed: { unit: string; count: number } | null = null;

  try {
    scaleParsed = row.scale ? JSON.parse(row.scale) : null;
  } catch {
    scaleParsed = null;
  }

  return {
    ...row,
    est_value: estimateLeadValue(row.segment, scaleParsed),
  };
}

const LEAD_SELECT = `
  SELECT
    id,
    created_at,
    last_activity_at,
    lead_score,
    COALESCE(deal_score, lead_score) AS deal_score,
    intent,
    segment,
    scale,
    timeline,
    status,
    COALESCE(deal_stage, status, 'new') AS deal_stage,
    next_action,
    next_action_priority,
    next_action_due,
    last_contacted_at,
    follow_up_count,
    next_follow_up_at,
    owner,
    mode,
    source,
    contact_name,
    company,
    farm,
    email,
    phone,
    role_title,
    notes,
    is_test,
    updated_at,
    updated_by,
    user_snippet
  FROM crm_leads
`;

const RETURNING_SELECT = `
  RETURNING
    id,
    created_at,
    last_activity_at,
    lead_score,
    COALESCE(deal_score, lead_score) AS deal_score,
    intent,
    segment,
    scale,
    timeline,
    status,
    COALESCE(deal_stage, status, 'new') AS deal_stage,
    next_action,
    next_action_priority,
    next_action_due,
    last_contacted_at,
    follow_up_count,
    next_follow_up_at,
    owner,
    mode,
    source,
    contact_name,
    company,
    farm,
    email,
    phone,
    role_title,
    notes,
    is_test,
    updated_at,
    updated_by,
    user_snippet
`;

function cleanOptionalString(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normaliseAuditValue(value: unknown) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();

  return String(value);
}

async function logLeadChanges(
  pool: ReturnType<typeof getPool>,
  leadId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
  changedBy: string
) {
  const changes = fields
    .map((field) => ({
      field,
      oldValue: normaliseAuditValue(before[field]),
      newValue: normaliseAuditValue(after[field]),
    }))
    .filter((change) => change.oldValue !== change.newValue);

  if (changes.length === 0) return;

  const values: unknown[] = [];
  const placeholders = changes.map((change, index) => {
    const base = index * 5;

    values.push(
      leadId,
      change.field,
      change.oldValue,
      change.newValue,
      changedBy
    );

    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  await pool.query(
    `
    INSERT INTO lead_activity
      (lead_id, field_changed, old_value, new_value, changed_by)
    VALUES
      ${placeholders.join(", ")}
    `,
    values
  );
}

export async function GET(req: NextRequest) {
  try {
    if (!requireAdmin(req)) {
      return json(401, { error: "Unauthorized" });
    }

    const pool = getPool();

    const { rows } = await pool.query(`
      ${LEAD_SELECT}
      ORDER BY
        COALESCE(deal_score, lead_score, 0) DESC,
        last_activity_at DESC NULLS LAST,
        created_at DESC
      LIMIT 200;
    `);

    const rowsWithValue = rows.map((r) => withEstimatedValue(r));

    return json(200, { rows: rowsWithValue });
  } catch (err) {
    console.error("GET /api/leads error:", err);
    return json(500, { error: "Failed to load leads" });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!requireAdmin(req)) {
      return json(401, { error: "Unauthorized" });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = String(body.id ?? "").trim();

    if (!id) {
      return json(400, { error: "Missing lead id" });
    }

    const pool = getPool();

    const beforeResult = await pool.query(
      `
      SELECT *
      FROM crm_leads
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if ((beforeResult.rowCount ?? 0) === 0) {
      return json(404, { error: "Lead not found" });
    }

    const beforeRow = beforeResult.rows[0] as Record<string, unknown>;
    const changedBy = cleanOptionalString(body.updated_by) ?? "dashboard";

    if (body.action === "mark_contacted") {
      const result = await pool.query(
        `
        UPDATE crm_leads
        SET
          status = 'contacted',
          deal_stage = 'Contacted',
          last_contacted_at = now(),
          follow_up_count = COALESCE(follow_up_count, 0) + 1,
          next_follow_up_at =
            CASE
              WHEN COALESCE(deal_score, lead_score, 0) >= 85 THEN now() + INTERVAL '2 days'
              WHEN COALESCE(deal_score, lead_score, 0) >= 70 THEN now() + INTERVAL '5 days'
              WHEN COALESCE(deal_score, lead_score, 0) >= 50 THEN now() + INTERVAL '10 days'
              ELSE now() + INTERVAL '21 days'
            END,
          next_action = 'Follow up again',
          next_action_due =
            CASE
              WHEN COALESCE(deal_score, lead_score, 0) >= 85 THEN CURRENT_DATE + 2
              WHEN COALESCE(deal_score, lead_score, 0) >= 70 THEN CURRENT_DATE + 5
              WHEN COALESCE(deal_score, lead_score, 0) >= 50 THEN CURRENT_DATE + 10
              ELSE CURRENT_DATE + 21
            END,
          next_action_priority =
            CASE
              WHEN COALESCE(deal_score, lead_score, 0) >= 85 THEN 'Immediate'
              WHEN COALESCE(deal_score, lead_score, 0) >= 70 THEN 'This Week'
              WHEN COALESCE(deal_score, lead_score, 0) >= 50 THEN 'Normal'
              ELSE 'Low'
            END,
          updated_at = now(),
          updated_by = COALESCE($2, updated_by)
        WHERE id = $1
        ${RETURNING_SELECT}
        `,
        [id, cleanOptionalString(body.updated_by)]
      );

      if ((result.rowCount ?? 0) === 0) {
        return json(404, { error: "Lead not found" });
      }

      await logLeadChanges(
        pool,
        id,
        beforeRow,
        result.rows[0],
        [
          "status",
          "deal_stage",
          "last_contacted_at",
          "follow_up_count",
          "next_follow_up_at",
          "next_action",
          "next_action_due",
          "next_action_priority",
          "updated_by",
        ],
        changedBy
      );

      return json(200, { ok: true, row: withEstimatedValue(result.rows[0]) });
    }

    const allowedStatus = new Set(["new", "contacted", "qualified", "closed"]);
    const allowedFields = [
      "company",
      "contact_name",
      "email",
      "phone",
      "role_title",
      "notes",
      "owner",
      "deal_stage",
      "next_action",
      "next_action_priority",
      "next_action_due",
    ] as const;

    const updates: string[] = [];
    const values: unknown[] = [];
    let param = 1;

    if (body.status !== undefined) {
      const status = String(body.status ?? "").trim().toLowerCase();
      if (!allowedStatus.has(status)) {
        return json(400, { error: "Invalid status" });
      }

      updates.push(`status = $${param++}`);
      values.push(status);

      updates.push(`deal_stage = COALESCE(deal_stage, $${param++})`);
      values.push(status);
    }

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${param++}`);
        values.push(cleanOptionalString(body[field]));
      }
    }

    if (updates.length === 0) {
      return json(400, { error: "No editable fields supplied" });
    }

    updates.push(`updated_at = now()`);

    if (body.updated_by !== undefined) {
      updates.push(`updated_by = $${param++}`);
      values.push(cleanOptionalString(body.updated_by));
    }

    values.push(id);

    const result = await pool.query(
      `
      UPDATE crm_leads
      SET ${updates.join(", ")}
      WHERE id = $${param}
      ${RETURNING_SELECT}
      `,
      values
    );

    if ((result.rowCount ?? 0) === 0) {
      return json(404, { error: "Lead not found" });
    }

    await logLeadChanges(
      pool,
      id,
      beforeRow,
      result.rows[0],
      [
        "company",
        "contact_name",
        "email",
        "phone",
        "role_title",
        "notes",
        "owner",
        "deal_stage",
        "next_action",
        "next_action_priority",
        "next_action_due",
        "status",
        "updated_by",
      ],
      changedBy
    );

    const rowWithValue = withEstimatedValue(result.rows[0]);

    return json(200, { ok: true, row: rowWithValue });
  } catch (err) {
    console.error("PATCH /api/leads error:", err);
    return json(500, { error: "Failed to update lead" });
  }
}
