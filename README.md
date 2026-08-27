# IlimexBot

IlimexBot is a Next.js application containing:

- the public Ilimex website chatbot and enquiry flow;
- an authenticated internal Ilimex chatbot with document upload;
- CRM lead management routes and dashboard;
- analytics and lead-scoring utilities;
- public/mushroom regression evaluation routes;
- a scheduled CRM follow-up digest.

## Main routes

- `/ilimex-bot/external` — public chatbot intended for website visitors.
- `/api/chat-public` — public chatbot API.
- `/api/lead-public` — public enquiry submission. Successful submissions are emailed and then written to the CRM on a best-effort basis.
- `/api/chat-internal` — internal chatbot; requires `ADMIN_DASH_TOKEN`.
- `/api/upload` — internal document extraction; requires `ADMIN_DASH_TOKEN`.
- `/ilimex-bot/internal/leads` — CRM dashboard; server APIs require `ADMIN_DASH_TOKEN`.
- `/api/evals/public` — authenticated public-bot regression suite.
- `/ilimex-analytics` — authenticated database-backed analytics dashboard.
- `/api/admin/health` — authenticated deployment/configuration health check.

The legacy combined `/api/ilimex-bot` route is retained for compatibility but is admin-only.

## Local setup

1. Copy `.env.example` to `.env.local` and populate server-side values.
2. Install dependencies with `npm ci`.
3. Start development with `npm run dev`.
4. Open `http://localhost:3000/ilimex-bot/external` for the public bot.

Do not commit `.env.local` or any credential file.

## Production requirements

See:

- `docs/DEPLOYMENT-CHECKLIST-2026-08-25.md`
- `docs/SECURITY-AUDIT-2026-08-25.md`
- `docs/PUBLIC-BOT-REGRESSION-PLAN-2026-08-25.md`

A clean Linux/Vercel production build is a mandatory deployment gate.

## Data handling

Anonymous public chat is scored in memory and may be sampled into analytics only when `ILIMEX_ANALYTICS_ENABLED=true`. Anonymous chat no longer creates CRM records or sends lead-alert emails. A CRM record is created only after the visitor explicitly submits the enquiry form. Email/CRM failures are isolated so a CRM outage does not take the public chatbot offline.

Internal document uploads are limited to PDF, DOCX, TXT and MD, 10 MB per file, and extracted text is capped before it is returned to the browser/model context.


## Deployment diagnostics

After configuring production environment variables, call `/api/admin/health` with the `x-admin-token` header. It checks whether OpenAI, SMTP, the database, CRM table and analytics table are available without returning secret values.
