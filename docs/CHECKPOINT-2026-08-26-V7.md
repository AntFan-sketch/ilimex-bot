# IlimexBot checkpoint v7 — 26 August 2026

## Work completed in this pass

- Re-audited every database-facing route before production configuration work.
- Expanded `/api/admin/health` schema checks to include columns that were actually used but not previously verified:
  - `crm_leads.geography`
  - `crm_leads.company_size`
  - `lead_activity.id`
  - `lead_activity.created_at`
  - `bot_events.id`
- Added required unique-index checks to `/api/admin/health` for the CRM conversation upsert key `(mode, env, conversation_id)` and the `rate_limits.key` key. Missing uniqueness here can make otherwise-correct application code fail under live traffic.
- Reduced `/api/leads/daily-digest` from `SELECT *` to the small set of operational CRM fields actually needed by the digest, avoiding unnecessary retrieval of contact and request-metadata fields.
- Added `sql/production-schema-audit.sql`, a read-only inspection script for the existing production PostgreSQL schema. It reports columns, constraints and indexes and intentionally performs no migration.
- Hardened PostgreSQL TLS. The application now verifies the database server certificate by default instead of unconditionally using `rejectUnauthorized: false`.
- Added `DATABASE_SSL_REJECT_UNAUTHORIZED=true` to `.env.example`. It should remain true for a managed provider such as Neon; disabling it should only be considered for a known self-signed/private PostgreSQL deployment.
- Added conservative PostgreSQL pool limits/timeouts suitable for serverless deployment.
- Removed a duplicated `linkedin_url` entry in CRM audit logging.

## Why the production database still needs inspection

The source code shows that the CRM evolved over time and no authoritative migration history is present in this project. The safest deployment path is therefore:

1. inspect the live schema;
2. compare it with `/api/admin/health` expectations;
3. apply only additive, data-preserving changes if required;
4. take/confirm a database backup before any schema change.

No destructive migration has been added to this checkpoint.

## Remaining deployment gates

- Confirm Vercel production environment variables.
- Confirm live database schema and indexes.
- Run a clean Vercel/Linux production build.
- Call authenticated `/api/admin/health`.
- Run the deployed public regression suite.
- Send one real test enquiry and verify both email delivery and CRM persistence.
