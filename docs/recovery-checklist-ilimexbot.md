# IlimexBot Recovery Checklist

## Critical files
- src/app/ilimex-bot/internal/leads/page.tsx
- src/app/api/leads/route.ts
- src/app/api/leads/[id]/route.ts
- src/app/api/chat-public/route.ts
- src/lib/revenue/scoring.ts
- src/lib/crm/upsertLead.ts
- src/lib/analytics/logEvent.ts
- src/lib/db.ts
- src/lib/revenue/value.ts
- src/lib/analytics/sanitize.ts
- src/lib/security/rateLimit.ts
- src/lib/alerts/leadAlerts.ts
- src/lib/alerts/sendLeadAlertEmail.ts

## Known-good checkpoint
- Branch: backup/restored-working-state
- Commit: 098d8c5
- Tag: restored-working-2026-03-11

## Known-good behaviour
- Production external bot responds correctly
- Internal leads dashboard loads
- Fresh chats create fresh CRM rows
- Recent-user-context scoring works
- Redundant qualification does not fire when shed count already provided
- Opening query with 20 sheds carries through to quote follow-up
- Lead row created with score 100, value estimate £440k, poultry, 20 houses

## Pre-edit backup steps
1. git status
2. git branch --show-current
3. git log --oneline --decorate -n 8
4. git checkout -b backup/<descriptive-name>   (if needed)
5. git add .
6. git commit -m "Backup: <description>"

## Build verification
- npm run lint
- npm run build

## Manual smoke tests
### External bot
- New session starts clean
- Query with shed count does not trigger redundant scale qualification
- Follow-up quote request carries prior context correctly
- Poultry opportunity produces expected segment/value/score behaviour

### CRM/dashboard
- New lead row appears
- Dashboard loads totals correctly
- Lead detail loads correctly
- Pipeline totals render correctly

## Emergency restore steps
### Restore full working checkpoint to a branch
- git checkout -b restore/from-restored-working-state 098d8c5

### See what differs from main
- git diff --stat main...restore/from-restored-working-state
- git diff --name-only main...restore/from-restored-working-state

### Restore a specific file from checkpoint
- git checkout 098d8c5 -- <path-to-file>

## Post-restore validation
- npm run lint
- npm run build
- Repeat smoke tests