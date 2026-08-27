-- Read-only production schema audit for IlimexBot.
-- Safe to run before deployment: this script does not alter data or schema.

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('crm_leads', 'lead_activity', 'bot_events', 'rate_limits')
ORDER BY table_name, ordinal_position;

SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('crm_leads', 'lead_activity', 'bot_events', 'rate_limits')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position;

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('crm_leads', 'lead_activity', 'bot_events', 'rate_limits')
ORDER BY tablename, indexname;
