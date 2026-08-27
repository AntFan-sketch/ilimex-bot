# IlimexBot production configuration – 27 August 2026

This note reconciles the repaired codebase with the production screenshots supplied from Vercel and Neon.

## Confirmed production architecture

- Hosting: Vercel, production branch `main`.
- Database: Neon Postgres, AWS Europe Central 1 (Frankfurt).
- Scheduled job: `/api/cron/daily-followups` at `0 8 * * *` (08:00 UTC).
- SMTP variables are present for enquiry delivery.
- `OPENAI_API_KEY` is present.
- Existing model variable: `ILIMEX_OPENAI_MODEL`.
- Existing admin variables include both `ADMIN_DASH_TOKEN` and the legacy `NEXT_PUBLIC_ADMIN_DASH_TOKEN`.
- Neon/Vercel integration has provisioned multiple Postgres variables; the application itself uses `DATABASE_URL`.

## Changes made for compatibility

The bot now resolves models in this order:

1. `OPENAI_PUBLIC_MODEL` / `OPENAI_INTERNAL_MODEL`
2. legacy `ILIMEX_OPENAI_MODEL`
3. application default

This means the repaired code can be deployed without immediately changing the existing model environment variable. The public and internal model variables can be introduced later when desired.

The unused `@vercel/blob` package has been removed from the project dependency list. No live application code references Vercel Blob. After the repaired deployment is verified, the obsolete `BLOB_READ_WRITE_TOKEN` can therefore be removed from Vercel.

## Required production additions before final deployment

### `CRON_SECRET`

Create a high-entropy server-side secret in Vercel Production named `CRON_SECRET`.

Vercel Cron automatically sends this value in the request as:

`Authorization: Bearer <CRON_SECRET>`

The repaired cron route verifies that header and fails closed if the secret is absent or incorrect.

### Existing `ADMIN_DASH_TOKEN`

Keep `ADMIN_DASH_TOKEN`. Do not expose its value publicly. It protects the CRM, internal bot, analytics, evaluations, uploads and health endpoint.

## Required removal after successful deployment verification

### `NEXT_PUBLIC_ADMIN_DASH_TOKEN`

The repaired application no longer uses this variable. It must be removed after the new deployment has been confirmed working. Because variables prefixed with `NEXT_PUBLIC_` can be exposed to browser bundles, it should not be retained as an admin credential.

### `BLOB_READ_WRITE_TOKEN`

The repaired code does not use Vercel Blob. Remove this variable after deployment verification unless another external process not present in this repository depends on it.

## Neon / database

Keep `DATABASE_URL` managed by the Neon/Vercel integration. Do not copy database credentials into source files.

The application verifies TLS certificates by default. Neon uses publicly trusted TLS certificates, so `DATABASE_SSL_REJECT_UNAUTHORIZED=false` should not be set for this deployment.

Before any schema changes, run the read-only script at:

`sql/production-schema-audit.sql`

Do not create or modify indexes until its output has been reviewed. In particular, the application expects:

- a unique key/index on `crm_leads(mode, env, conversation_id)`; and
- a unique key/index on `rate_limits(key)`.

## Current production variables seen in screenshots

Keep in place for the deployment unless specifically retired above:

- `ADMIN_DASH_TOKEN`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `FROM_EMAIL`
- `TO_EMAIL`
- `OPENAI_API_KEY`
- `ILIMEX_OPENAI_MODEL`
- `ILIMEX_ANALYTICS_ENABLED`
- `ILIMEX_ANALYTICS_SAMPLE_RATE`
- `DATABASE_URL` and Neon-managed Postgres variables

The Vercel "Needs Attention" badges on integration-managed variables should be reviewed in Vercel/Neon, but the values should not be deleted or manually replaced merely because of the badge.

## Deployment sequence

1. Run the read-only Neon schema audit and review its results.
2. Add `CRON_SECRET` to Vercel Production.
3. Leave the existing production variables in place for the first repaired deployment.
4. Deploy the repaired build.
5. Call the authenticated `/api/admin/health` endpoint and verify all required capabilities are green.
6. Run `/api/evals/public` with the admin token.
7. Test normal public chat, including "What's the latest news?".
8. Submit a real test enquiry and confirm both email delivery and CRM creation.
9. Confirm the daily cron route authenticates successfully (a manual Vercel Run is suitable after `CRON_SECRET` exists).
10. Verify the internal bot, CRM and analytics dashboard with the admin token.
11. Remove `NEXT_PUBLIC_ADMIN_DASH_TOKEN`.
12. Remove `BLOB_READ_WRITE_TOKEN` if no external dependency is identified.
13. Optionally add `OPENAI_PUBLIC_MODEL` and `OPENAI_INTERNAL_MODEL` later; until then, `ILIMEX_OPENAI_MODEL` remains a supported compatibility fallback.
