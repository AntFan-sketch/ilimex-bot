# Checkpoint V8 – 27 August 2026

## Production configuration reconciliation

Production screenshots confirmed Vercel hosting, a Neon Postgres database in Frankfurt, an 08:00 UTC Vercel cron, SMTP configuration, the existing OpenAI key/model variable, and the legacy public admin token.

Changes in this checkpoint:

- Added backwards-compatible support for `ILIMEX_OPENAI_MODEL` while retaining `OPENAI_PUBLIC_MODEL` and `OPENAI_INTERNAL_MODEL` as the preferred split configuration.
- Added effective model information to the authenticated health endpoint so deployment checks show which model configuration is actually in use without revealing any secret.
- Removed unused `@vercel/blob` dependency from `package.json` and `package-lock.json`; no live source references Vercel Blob.
- Added a production-configuration document based on the actual Vercel/Neon deployment.
- Confirmed Vercel's current cron behaviour: when `CRON_SECRET` is configured, Vercel automatically sends it as a Bearer Authorization header to the scheduled route.
- Confirmed the project passes a full TypeScript `--noEmit` check and ESLint across `src` after these changes.

## Still required before deployment

- Read-only production schema audit in Neon.
- Add `CRON_SECRET` to Vercel Production.
- Deploy and run the authenticated health check and public regression suite.
- Remove `NEXT_PUBLIC_ADMIN_DASH_TOKEN` only after the repaired deployment is verified.
- Remove `BLOB_READ_WRITE_TOKEN` after verification, provided no external process outside this repository uses it.
