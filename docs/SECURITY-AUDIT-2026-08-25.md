# IlimexBot Security Audit — 25 August 2026

## Completed hardening

- Public chatbot rate limiting now fails open if the CRM/analytics database is unavailable, so a database outage cannot take the public bot offline.
- Public chatbot no longer exposes raw HTTP/server errors in the visitor UI.
- OpenAI API clients are created lazily; missing API configuration is handled server-side.
- Public chat input is length/shape constrained before model calls.
- Public chat uses only the curated external knowledge layer. Arbitrary `uploadedText` is no longer accepted by the public endpoint.
- The legacy combined `/api/ilimex-bot` RAG endpoint now requires `ADMIN_DASH_TOKEN` for every request. Uploads can no longer silently escalate an unauthenticated request into internal mode.
- `/api/chat-internal` requires `ADMIN_DASH_TOKEN`.
- The legacy `/api/chat-lite` debug endpoint now requires `ADMIN_DASH_TOKEN`.
- `/api/upload` requires `ADMIN_DASH_TOKEN`, is limited to PDF/DOCX/TXT/MD, and rejects files over 10 MB.
- Public users are not shown internal upload controls.
- The legacy/internal clients pass the admin token from session storage rather than a `NEXT_PUBLIC_*` build-time variable.
- CRM/admin APIs use server-side `ADMIN_DASH_TOKEN`; the former `NEXT_PUBLIC_ADMIN_DASH_TOKEN` pattern has been removed.
- Public enquiry fields are length-capped and SMTP failure details are no longer returned to visitors.
- Public enquiry submission is rate-limited to reduce automated SMTP/form abuse.
- `/api/leads/daily-digest` now requires the server-side admin token; it previously exposed CRM digest rows without authentication.
- `/api/cron/daily-followups` now requires `CRON_SECRET` bearer authentication and no longer writes lead details to platform logs.
- Analytics stores hashes for IP/user-agent and redacts common email/phone patterns from sampled snippets.
- Anonymous public chat no longer creates CRM lead records or sends high-intent lead-alert emails. CRM capture now occurs only after an explicit enquiry form submission, reducing unnecessary retention of visitor data.
- Successful public enquiries are written to the CRM on a best-effort basis after email delivery, so a CRM/database failure cannot make a successfully sent enquiry appear to have failed.
- Public enquiry transcript context is role-validated and length-capped before being included in email.
- Internal upload extraction is capped at 300,000 characters in addition to the 10 MB file limit.
- Generic security headers are applied globally (`nosniff`, restrictive referrer policy, disabled camera/microphone/geolocation permissions and DNS prefetch). Frame restrictions are intentionally not set because the public bot is designed to be embeddable.
- Root metadata no longer exposes the default Create Next App identity and the application is marked `noindex`/`nofollow`.

## Deployment actions

1. Set a new high-entropy `ADMIN_DASH_TOKEN` in the hosting environment. Do not prefix it with `NEXT_PUBLIC_`.
2. Confirm `OPENAI_API_KEY`, `DATABASE_URL`, SMTP variables, and any cron secret are present only as server-side environment variables.
3. Remove any obsolete `NEXT_PUBLIC_ADMIN_DASH_TOKEN` from Vercel/environment configuration.
4. Run a clean dependency install and `npm run build` in Vercel or another Linux build environment.
5. Smoke-test `/api/chat-public`, `/ilimex-bot/external`, internal chat authentication, CRM authentication, upload authentication, cron authentication, and enquiry email delivery.
6. Run the admin-only `/api/evals/public` regression suite against the production model and review failures manually.
7. Rotate any credential that may previously have been exposed in a public build or shared archive.

## Residual considerations

- Session storage is preferable to a compiled public token but is not a full identity/authentication system. For broader staff use, replace the shared admin token with managed authentication/SSO.
- The current database-backed rate limiter deliberately fails open for availability. If abuse becomes material, move public rate limiting to an independent edge/KV service.
- Public analytics contains short redacted conversation snippets when enabled. Keep analytics disabled unless it is genuinely required, set a proportionate sampling/retention policy, and disclose analytics/contact processing appropriately in the site's privacy notice.
- Uploaded internal documents are sent to the configured OpenAI API as model context. Staff should only upload material that Ilimex is authorised to process through that service.


## 26 August follow-up hardening

- Replaced the unauthenticated filesystem-backed `/ilimex-analytics` implementation with an authenticated database-backed dashboard.
- Added `/api/analytics-summary`, protected by `ADMIN_DASH_TOKEN`; it returns aggregate counts and already-redacted question snippets only.
- Removed obsolete filesystem interaction logging helpers, which were unsuitable for durable Vercel/serverless storage.
- Added an admin-only `/api/admin/health` endpoint for deployment diagnostics without exposing secret values.
- Updated the remaining legacy combined chatbot route to use the configured current internal model rather than a hard-coded legacy model.
- Removed unused, stale embedding assets/tooling that were no longer referenced by the live application.
- Updated stale internal starter prompts and legacy context text that still described the poultry trial as awaiting results.
