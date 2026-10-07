-- ID Ledger: last step. Supabase -> project "id-ledger" -> SQL Editor -> New query -> paste ALL -> Run.
create or replace function public.run_settlement(p_date date default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  d date := coalesce(p_date, public.settle_day(now()) - 1);
  n integer;
begin
  if auth.uid() is not null and not is_admin() then raise exception 'Not allowed'; end if;
  delete from settlements where settle_date = d and status = 'due';
  insert into settlements (account_id, vendor_id, settle_date, net_pnl, commission_pct, commission)
  select a.id, a.vendor_id, d, t.net, a.commission_pct,
         round(-t.net * a.commission_pct / 100, 2) - coalesce(dn.amount, 0)
    from (select account_id, sum(amount) net from pnl_entries where settle_date = d group by account_id) t
    join accounts a on a.id = t.account_id
    left join (select account_id, sum(commission) amount from settlements
                where settle_date = d and status in ('requested','received') group by account_id) dn
           on dn.account_id = t.account_id
   where t.net < 0
     and round(-t.net * a.commission_pct / 100, 2) - coalesce(dn.amount, 0) > 0;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.collect_prices() returns integer
language plpgsql security definer set search_path = public as $$
declare j record; body jsonb; px numeric; ts bigint; n integer := 0;
begin
  if auth.uid() is not null and not is_admin() then raise exception 'Not allowed'; end if;
  for j in execute
    'select f.request_id, f.symbol, f.exchange, r.status_code, r.content
       from price_fetch_jobs f join net._http_response r on r.id = f.request_id'
  loop
    begin
      if j.status_code = 200 then
        body := j.content::jsonb -> 'chart' -> 'result' -> 0 -> 'meta';
        px := (body ->> 'regularMarketPrice')::numeric;
        ts := (body ->> 'regularMarketTime')::bigint;
        if px > 0 and ts is not null then
          insert into stock_prices (symbol, exchange, price_date, close, source)
          values (j.symbol, j.exchange, (to_timestamp(ts) at time zone 'Asia/Kolkata')::date, round(px, 2), 'auto')
          on conflict (symbol, exchange, price_date) do update
            set close = excluded.close, updated_at = now()
            where stock_prices.source = 'auto';
          n := n + 1;
        end if;
      end if;
    exception when others then null;
    end;
    delete from price_fetch_jobs where request_id = j.request_id;
  end loop;
  delete from price_fetch_jobs where created_at < now() - interval '1 day';
  return n;
end $$;

revoke execute on function public.run_settlement(date), public.collect_prices() from public, anon;
grant execute on function public.run_settlement(date), public.collect_prices() to authenticated;

create policy proofs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and public.is_admin());

drop function if exists public._probe();
drop function if exists public._probe2(date);
drop function if exists public._probe3(date);

-- Automatic: 11 AM commission settlement + daily stock prices (Mon-Fri after market close)
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('daily-commission-settlement', '30 5 * * *', $$select public.run_settlement()$$);
select cron.schedule('stock-prices-fetch',    '15 10 * * 1-5', $$select public.queue_price_fetch()$$);
select cron.schedule('stock-prices-collect',  '20 10 * * 1-5', $$select public.collect_prices()$$);
select cron.schedule('stock-prices-fetch-2',  '0 13 * * 1-5',  $$select public.queue_price_fetch()$$);
select cron.schedule('stock-prices-collect-2','5 13 * * 1-5',  $$select public.collect_prices()$$);

select 'ID Ledger setup complete' as status;
