-- OPTIONAL: run the commission settlement automatically every day at 11:00 AM IST.
-- Supabase → SQL Editor → paste → Run (after schema.sql).
create extension if not exists pg_cron;

-- 05:30 UTC = 11:00 AM IST. Settles the day that just ended (yesterday 11 AM → today 11 AM).
select cron.schedule('daily-commission-settlement', '30 5 * * *', $$select public.run_settlement()$$);

-- To stop it later:  select cron.unschedule('daily-commission-settlement');
