select cron.unschedule('zoho-auto-reconcile') where exists (select 1 from cron.job where jobname='zoho-auto-reconcile');

select cron.schedule(
  'zoho-auto-reconcile',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url:='https://cnofbtrtyiilmhlrashl.supabase.co/functions/v1/zoho-webhook',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNub2ZidHJ0eWlpbG1obHJhc2hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4MzQyOTEsImV4cCI6MjA2NDQxMDI5MX0.ld1QuWFD3ARTQWDG2ZRFpxNUIf-vzPlGcG3E8HjpFqo"}'::jsonb,
    body:='{"action":"reconcile_quantities","since_days":45}'::jsonb
  ) AS request_id;
  $$
);