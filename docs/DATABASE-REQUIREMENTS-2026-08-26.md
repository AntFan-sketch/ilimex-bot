# IlimexBot database requirements — 26 August 2026

The production PostgreSQL database is used for four separate concerns:

- `crm_leads` — explicit website enquiries and CRM records.
- `lead_activity` — audit history for CRM edits.
- `bot_events` — optional, redacted bot analytics when `ILIMEX_ANALYTICS_ENABLED=true`.
- `rate_limits` — database-backed abuse protection for public chat and the enquiry form.

The application intentionally allows public chat to fail open if the database or `rate_limits` table is unavailable, so a database outage does not take IlimexBot offline. In production, however, a missing `rate_limits` table means abuse protection is degraded and should be treated as a deployment issue.

## Deployment verification

Use the authenticated `/api/admin/health` endpoint after deployment. It now verifies all four tables and the columns required by the current application. It reports missing table/column names but never returns database credentials.

Do not run an automatic destructive migration against the existing production database without first inspecting its current schema. The CRM predates this repair pass and may contain live data.

## Important CRM fix in v6

A parameter/column mismatch was found in `src/lib/crm/upsertLead.ts`. The code supplied 33 SQL parameters but the INSERT declared only 32 placeholders because `deal_score` was omitted from the column list. As a result, explicit website enquiries could email successfully while the subsequent CRM write failed and was caught by the best-effort CRM error handler.

The INSERT now includes `deal_score`, uses all 33 parameters in the intended order, and returns `deal_score` to callers. This should be verified with a real test enquiry after deployment.
