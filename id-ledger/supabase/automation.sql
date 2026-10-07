-- Run once in Supabase → SQL Editor, after schema.sql. Switches on:
--   1. Commission settlement every day at 11:00 AM IST.
--   2. Investor stock prices every weekday after market close (NSE/BSE closing price).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 05:30 UTC = 11:00 AM IST. Settles the day that just ended.
select cron.schedule('daily-commission-settlement', '30 5 * * *', $$select public.run_settlement()$$);

-- 15:45 IST ask for prices, 15:50 IST store them (Mon–Fri). Runs again 18:30/18:35 IST as a backup.
select cron.schedule('stock-prices-fetch',    '15 10 * * 1-5', $$select public.queue_price_fetch()$$);
select cron.schedule('stock-prices-collect',  '20 10 * * 1-5', $$select public.collect_prices()$$);
select cron.schedule('stock-prices-fetch-2',  '0 13 * * 1-5',  $$select public.queue_price_fetch()$$);
select cron.schedule('stock-prices-collect-2','5 13 * * 1-5',  $$select public.collect_prices()$$);

-- To stop any of them later:  select cron.unschedule('<name>');
