import { NextRequest } from "next/server";
import { getPool } from "@/lib/db";

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

export async function DELETE(req: NextRequest) {
  try {
    if (!requireAdmin(req)) {
      return json(401, { error: "Unauthorized" });
    }

    const body = (await req.json().catch(() => ({}))) as {
      id?: string;
      deleteTestOnly?: boolean;
      confirm?: string;
    };

    const confirm = String(body.confirm ?? "").trim();

    if (confirm !== "DELETE") {
      return json(400, { error: 'Confirmation required. Send confirm: "DELETE"' });
    }

    const pool = getPool();

    if (body.deleteTestOnly === true) {
      const result = await pool.query(
        `
        DELETE FROM crm_leads
        WHERE is_test = TRUE
        RETURNING id
        `
      );

      return json(200, {
        ok: true,
        deletedCount: result.rowCount ?? 0,
        mode: "bulk_test_cleanup",
      });
    }

    const id = String(body.id ?? "").trim();
    if (!id) {
      return json(400, { error: "Lead id is required for single delete" });
    }

    const result = await pool.query(
      `
      DELETE FROM crm_leads
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if ((result.rowCount ?? 0) === 0) {
      return json(404, { error: "Lead not found" });
    }

    return json(200, {
      ok: true,
      deletedId: id,
      mode: "single_delete",
    });
  } catch (err) {
    console.error("DELETE /api/leads/admin error:", err);
    return json(500, { error: "Failed to delete lead(s)" });
  }
}