-- ============================================================================
-- 0042_cron_licitacoes.sql — agenda a busca diária de licitações
--
-- pg_cron chama a Edge Function buscar-licitacoes via pg_net (HTTP POST).
-- Horário: 11:30 UTC (~08:30 BRT) — FORA da janela de manutenção da API
-- Alerta Licitação (05:50-06:10 UTC) e fora dos outros jobs.
--
-- A apikey abaixo é a ANON KEY do Supabase (pública — já vai no bundle do
-- frontend). A função foi publicada com --no-verify-jwt; ela usa o service
-- role internamente. O body {} faz busca incremental (data_insercao = hoje).
-- ============================================================================

do $$ begin perform cron.unschedule('buscar_licitacoes'); exception when others then null; end $$;

select cron.schedule('buscar_licitacoes', '30 11 * * *', $job$
  select net.http_post(
    url := 'https://fpyvdwpvxrubrkdwrqbs.supabase.co/functions/v1/buscar-licitacoes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZweXZkd3B2eHJ1YnJrZHdycWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNTQyNTYsImV4cCI6MjA5MzczMDI1Nn0.Npvrjuu8gGrGugw-RVHI6ZgvoKqJSPW93inC4rw3lWU',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZweXZkd3B2eHJ1YnJrZHdycWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNTQyNTYsImV4cCI6MjA5MzczMDI1Nn0.Npvrjuu8gGrGugw-RVHI6ZgvoKqJSPW93inC4rw3lWU'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$job$);
