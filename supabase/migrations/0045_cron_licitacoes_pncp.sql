-- ============================================================================
-- 0045_cron_licitacoes_pncp.sql — agenda a busca diária no PNCP (2ª fonte)
--
-- pg_cron chama a Edge Function buscar-licitacoes-pncp via pg_net (HTTP POST).
-- Horário: 11:45 UTC (~08:45 BRT) — 15 min depois do Alerta (11:30) pra não
-- concorrer. Body {} = só as publicações de hoje (BRT). A função usa service
-- role internamente; a apikey abaixo é a ANON KEY pública (--no-verify-jwt).
-- ============================================================================

do $$ begin perform cron.unschedule('buscar_licitacoes_pncp'); exception when others then null; end $$;

select cron.schedule('buscar_licitacoes_pncp', '45 11 * * *', $job$
  select net.http_post(
    url := 'https://fpyvdwpvxrubrkdwrqbs.supabase.co/functions/v1/buscar-licitacoes-pncp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZweXZkd3B2eHJ1YnJrZHdycWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNTQyNTYsImV4cCI6MjA5MzczMDI1Nn0.Npvrjuu8gGrGugw-RVHI6ZgvoKqJSPW93inC4rw3lWU',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZweXZkd3B2eHJ1YnJrZHdycWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNTQyNTYsImV4cCI6MjA5MzczMDI1Nn0.Npvrjuu8gGrGugw-RVHI6ZgvoKqJSPW93inC4rw3lWU'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$job$);
