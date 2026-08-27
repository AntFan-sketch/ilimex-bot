import { NextRequest } from "next/server";
import { getPool } from "@/lib/db";

function isAuthorized(req: NextRequest) {
  const expected = process.env.ADMIN_DASH_TOKEN?.trim() ?? "";
  const received = req.headers.get("x-admin-token")?.trim() ?? "";
  return Boolean(expected) && received === expected;
}

const REQUIRED_TABLES = ["crm_leads", "lead_activity", "bot_events", "rate_limits"] as const;

const REQUIRED_COLUMNS: Record<(typeof REQUIRED_TABLES)[number], string[]> = {
  crm_leads: [
    "id",
    "created_at",
    "updated_at",
    "last_activity_at",
    "env",
    "mode",
    "conversation_id",
    "lead_score",
    "deal_score",
    "intent",
    "segment",
    "scale",
    "timeline",
    "user_text_hash",
    "user_snippet",
    "source",
    "contact_name",
    "company",
    "farm",
    "email",
    "phone",
    "notes",
    "ip_hash",
    "ua_hash",
    "status",
    "is_test",
    "deal_stage",
    "next_action",
    "next_action_priority",
    "next_action_due",
    "last_contacted_at",
    "follow_up_count",
    "next_follow_up_at",
    "owner",
    "role_title",
    "geography",
    "company_size",
    "linkedin_url",
    "website",
    "sector",
    "annual_bird_count",
    "partnership_type",
    "estimated_unit_count",
    "estimated_annual_value",
    "chat_summary",
    "last_user_message",
    "last_bot_message",
    "role",
    "updated_by",
  ],
  lead_activity: [
    "id",
    "created_at",
    "lead_id",
    "field_changed",
    "old_value",
    "new_value",
    "changed_by",
  ],
  bot_events: [
    "id",
    "created_at",
    "env",
    "mode",
    "event_type",
    "conversation_id",
    "lead_score",
    "score_band",
    "damped",
    "damper_value",
    "cta_eligible",
    "cta_auto_opened",
    "qualification_asked",
    "intent",
    "segment",
    "scale",
    "timeline",
    "msg_len",
    "user_text_hash",
    "user_snippet",
    "assistant_snippet",
    "ip_hash",
    "ua_hash",
    "latency_ms",
    "model",
    "payload",
  ],
  rate_limits: ["key", "window_start", "count", "updated_at"],
};

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const openAiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const legacyModel = process.env.ILIMEX_OPENAI_MODEL?.trim() ?? "";
  const publicModel = process.env.OPENAI_PUBLIC_MODEL?.trim() || legacyModel || "gpt-5.6-luna";
  const internalModel = process.env.OPENAI_INTERNAL_MODEL?.trim() || legacyModel || "gpt-5.6-luna";
  const usingLegacyModelFallback =
    Boolean(legacyModel) &&
    !process.env.OPENAI_PUBLIC_MODEL?.trim() &&
    !process.env.OPENAI_INTERNAL_MODEL?.trim();
  const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());
  const adminTokenConfigured = Boolean(process.env.ADMIN_DASH_TOKEN?.trim());
  const cronSecretConfigured = Boolean(process.env.CRON_SECRET?.trim());
  const analyticsEnabled = process.env.ILIMEX_ANALYTICS_ENABLED === "true";
  const smtpConfigured = [
    process.env.SMTP_HOST,
    process.env.SMTP_USER,
    process.env.SMTP_PASS,
    process.env.FROM_EMAIL,
    process.env.TO_EMAIL,
  ].every((value) => Boolean(value?.trim()));

  let databaseReachable: boolean | null = null;
  const tableAvailability: Record<string, boolean | null> = Object.fromEntries(
    REQUIRED_TABLES.map((name) => [name, null]),
  );
  const missingColumns: Record<string, string[]> = {};
  let crmConversationUniqueIndex: boolean | null = null;
  let rateLimitKeyUniqueIndex: boolean | null = null;

  if (databaseConfigured) {
    try {
      const pool = getPool();
      await pool.query("SELECT 1");
      databaseReachable = true;

      const schemaResult = await pool.query(
        `
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
        `,
        [REQUIRED_TABLES],
      );

      const foundColumns = new Map<string, Set<string>>();
      for (const row of schemaResult.rows as { table_name: string; column_name: string }[]) {
        if (!foundColumns.has(row.table_name)) foundColumns.set(row.table_name, new Set());
        foundColumns.get(row.table_name)?.add(row.column_name);
      }

      for (const table of REQUIRED_TABLES) {
        const columns = foundColumns.get(table);
        tableAvailability[table] = Boolean(columns);
        if (columns) {
          const missing = REQUIRED_COLUMNS[table].filter((column) => !columns.has(column));
          if (missing.length) missingColumns[table] = missing;
        }
      }

      const uniqueIndexResult = await pool.query(
        `
        SELECT
          t.relname AS table_name,
          ARRAY_AGG(a.attname ORDER BY key_cols.ordinality) AS columns
        FROM pg_index i
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN LATERAL UNNEST(i.indkey) WITH ORDINALITY AS key_cols(attnum, ordinality)
          ON key_cols.attnum > 0
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = key_cols.attnum
        WHERE n.nspname = 'public'
          AND t.relname = ANY($1::text[])
          AND i.indisunique = TRUE
        GROUP BY t.relname, i.indexrelid
        `,
        [["crm_leads", "rate_limits"]],
      );

      for (const row of uniqueIndexResult.rows as { table_name: string; columns: string[] }[]) {
        const columns = row.columns ?? [];
        if (
          row.table_name === "crm_leads" &&
          columns.length === 3 &&
          columns[0] === "mode" &&
          columns[1] === "env" &&
          columns[2] === "conversation_id"
        ) {
          crmConversationUniqueIndex = true;
        }
        if (
          row.table_name === "rate_limits" &&
          columns.length === 1 &&
          columns[0] === "key"
        ) {
          rateLimitKeyUniqueIndex = true;
        }
      }

      if (crmConversationUniqueIndex === null) crmConversationUniqueIndex = false;
      if (rateLimitKeyUniqueIndex === null) rateLimitKeyUniqueIndex = false;
    } catch {
      databaseReachable = false;
    }
  }

  const schemaHealthy =
    databaseReachable === true &&
    REQUIRED_TABLES.every((table) => tableAvailability[table] === true) &&
    Object.keys(missingColumns).length === 0 &&
    crmConversationUniqueIndex === true &&
    rateLimitKeyUniqueIndex === true;

  const readyForPublicChat = openAiConfigured;
  const readyForEnquiries = smtpConfigured;
  const readyForCrm =
    databaseReachable === true &&
    tableAvailability.crm_leads === true &&
    tableAvailability.lead_activity === true &&
    !missingColumns.crm_leads &&
    !missingColumns.lead_activity &&
    crmConversationUniqueIndex === true;
  const readyForRateLimiting =
    databaseReachable === true &&
    tableAvailability.rate_limits === true &&
    !missingColumns.rate_limits &&
    rateLimitKeyUniqueIndex === true;
  const readyForAnalytics = analyticsEnabled
    ? databaseReachable === true &&
      tableAvailability.bot_events === true &&
      !missingColumns.bot_events
    : true;

  const deploymentReady =
    readyForPublicChat &&
    readyForEnquiries &&
    readyForCrm &&
    readyForRateLimiting &&
    readyForAnalytics &&
    adminTokenConfigured &&
    cronSecretConfigured;

  return Response.json({
    status: deploymentReady ? "ok" : "attention_required",
    checks: {
      openAiConfigured,
      models: {
        public: publicModel,
        internal: internalModel,
        usingLegacyFallback: usingLegacyModelFallback,
      },
      databaseConfigured,
      databaseReachable,
      smtpConfigured,
      analyticsEnabled,
      cronSecretConfigured,
      adminTokenConfigured,
      schemaHealthy,
      tables: tableAvailability,
      missingColumns,
      requiredUniqueIndexes: {
        crmConversation: crmConversationUniqueIndex,
        rateLimitKey: rateLimitKeyUniqueIndex,
      },
    },
    capabilities: {
      publicChat: readyForPublicChat,
      enquiries: readyForEnquiries,
      crm: readyForCrm,
      rateLimiting: readyForRateLimiting,
      analytics: readyForAnalytics,
    },
  });
}
