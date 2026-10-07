-- ID Ledger: finish setup (part 2). Paste ALL of this into Supabase -> SQL Editor -> Run.
-- (Part 1 was installed by Claude already.)
drop function if exists public._probe();
drop function if exists public._probe2(date);
drop function if exists public._probe3(date);

create or replace function public.run_settlement(p_date date default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  d date := coalesce(p_date, public.settle_day(now()) - 1);
  n integer;
begin
  -- auth.uid() is null only for the scheduled job / SQL editor (clients can't call this as anon).
  if auth.uid() is not null and not is_admin() then raise exception 'Not allowed'; end if;

  -- Re-calculate whatever is still unpaid. Lines already requested / received stay as they are;
  -- if more loss was entered for the day afterwards, only the difference is added as a new line.
  delete from settlements where settle_date = d and status = 'due';

  insert into settlements (account_id, vendor_id, settle_date, net_pnl, commission_pct, commission)
  select a.id, a.vendor_id, d, t.net, a.commission_pct,
         round(-t.net * a.commission_pct / 100, 2) - coalesce(done.amount, 0)
    from (select account_id, sum(amount) net from pnl_entries where settle_date = d group by account_id) t
    join accounts a on a.id = t.account_id
    left join (select account_id, sum(commission) amount from settlements
                where settle_date = d and status in ('requested','received') group by account_id) done
           on done.account_id = t.account_id
   where t.net < 0
     and round(-t.net * a.commission_pct / 100, 2) - coalesce(done.amount, 0) > 0;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.bets_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    delete from pnl_entries where bet_id = old.id;
  end if;
  if tg_op in ('INSERT','UPDATE') and new.pnl <> 0 then
    insert into pnl_entries (account_id, settle_date, amount, note, bet_id, created_by)
    values (new.account_id, new.settle_date, new.pnl,
            concat_ws(' ', 'Bet #' || new.id, nullif(new.event, ''), nullif(new.selection, ''),
                      upper(new.side) || ' @ ' || rtrim(to_char(new.odds, 'FM9999990.999'), '.'),
                      'stake ' || new.stake, new.result),
            new.id, auth.uid());
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.bets_stamp() returns trigger
language plpgsql as $$
begin
  if new.result <> 'open' and (tg_op = 'INSERT' or old.result = 'open') then new.settled_at := now(); end if;
  if new.result = 'open' then new.settled_at := null; end if;
  return new;
end $$;

create trigger bets_stamp before insert or update on public.bets for each row execute function public.bets_stamp();
create trigger bets_sync after insert or update or delete on public.bets for each row execute function public.bets_sync();

-- Commission payout: ask the vendor to either credit it into the ID (p_mode 'id')
-- or pay it out like a withdrawal by cash / bank / UPI (p_mode 'withdrawal').
-- p_extra takes the same keys as create_request (method, payee_name, token_no, ...).
create or replace function public.request_commission(p_settlement bigint, p_mode text, p_note text default null, p_extra jsonb default '{}')
returns bigint
language plpgsql security definer set search_path = public as $$
declare s settlements%rowtype; v_id bigint;
begin
  if not is_admin() then raise exception 'Only the owner can do this'; end if;
  select * into s from settlements where id = p_settlement for update;
  if not found then raise exception 'Commission line not found'; end if;
  if s.status <> 'due' then raise exception 'This commission is already %', s.status; end if;
  if s.commission <= 0 then raise exception 'Nothing to collect'; end if;
  if p_mode not in ('id','withdrawal') then raise exception 'Choose credit to ID or withdrawal'; end if;
  p_extra := case when p_mode = 'id' then '{}'::jsonb else coalesce(p_extra, '{}') end;
  if p_extra->>'photo_path' is not null and p_extra->>'photo_path' not like s.vendor_id::text || '/%' then
    raise exception 'Photo must be stored in the vendor folder';
  end if;

  insert into requests (kind, vendor_id, to_account, amount, note, created_by, settlement_id,
                        method, payee_name, payee_phone, token_no, payee_details, photo_path)
  values ('commission', s.vendor_id, case when p_mode = 'id' then s.account_id end, s.commission,
          coalesce(nullif(trim(p_note), ''), 'Commission for ' || to_char(s.settle_date, 'DD Mon YYYY')),
          auth.uid(), s.id,
          nullif(p_extra->>'method', ''), nullif(trim(p_extra->>'payee_name'), ''),
          nullif(trim(p_extra->>'payee_phone'), ''), nullif(trim(p_extra->>'token_no'), ''),
          nullif(trim(p_extra->>'payee_details'), ''), nullif(p_extra->>'photo_path', ''))
  returning id into v_id;

  update settlements set status = 'requested', request_id = v_id where id = s.id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Payment ledger (owner only): money paid to / received from vendors.
-- ---------------------------------------------------------------------
create table public.ledger (
  id          bigint generated always as identity primary key,
  entry_date  date not null default ((now() at time zone 'Asia/Kolkata')::date),
  vendor_id   uuid references public.profiles(id) on delete set null,
  direction   text not null check (direction in ('out','in')),  -- out = I paid, in = I received
  amount      numeric(14,2) not null check (amount > 0),
  mode        text,
  reference   text,
  note        text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Investors (e.g. Sanjay): shares they sold to fund the business.
-- You owe them the SHARES back, so the amount due each day is
--   shares still owed × that day's closing price.
-- Returns: give shares back, or pay cash (counted as shares at that day's price).
-- ---------------------------------------------------------------------
create table public.investor_stocks (
  id           bigint generated always as identity primary key,
  investor_id  uuid not null references public.profiles(id) on delete cascade,
  symbol       text not null,                       -- ticker, e.g. RELIANCE
  exchange     text not null default 'NSE' check (exchange in ('NSE','BSE')),
  stock_name   text,
  qty          numeric(14,4) not null check (qty > 0),
  sell_rate    numeric(14,2) not null check (sell_rate > 0),
  sold_on      date not null default ((now() at time zone 'Asia/Kolkata')::date),
  note         text,
  created_at   timestamptz not null default now()
);
create index on public.investor_stocks (investor_id);

create table public.investor_returns (
  id            bigint generated always as identity primary key,
  investor_id   uuid not null references public.profiles(id) on delete cascade,
  symbol        text not null,
  exchange      text not null default 'NSE' check (exchange in ('NSE','BSE')),
  mode          text not null check (mode in ('shares','cash')),
  qty           numeric(14,4) not null,              -- shares returned (cash: equivalent shares)
  rate          numeric(14,2) not null check (rate > 0),  -- price used
  amount        numeric(14,2) not null,              -- value (cash: amount paid)
  paid_on       date not null default ((now() at time zone 'Asia/Kolkata')::date),
  payment_mode  text,
  reference     text,
  note          text,
  created_at    timestamptz not null default now()
);
create index on public.investor_returns (investor_id);

create or replace function public.investor_returns_check() returns trigger
language plpgsql set search_path = public as $$
declare owed numeric;
begin
  new.symbol := upper(trim(new.symbol));
  if new.mode = 'cash' then
    if coalesce(new.amount, 0) <= 0 then raise exception 'Enter the amount paid'; end if;
    new.qty := round(new.amount / new.rate, 4);
  else
    if coalesce(new.qty, 0) <= 0 then raise exception 'Enter the number of shares'; end if;
    new.amount := round(new.qty * new.rate, 2);
  end if;
  select coalesce((select sum(qty) from investor_stocks where investor_id = new.investor_id and symbol = new.symbol and exchange = new.exchange), 0)
       - coalesce((select sum(qty) from investor_returns where investor_id = new.investor_id and symbol = new.symbol and exchange = new.exchange
                    and id is distinct from new.id), 0)
    into owed;
  if new.qty > owed + 0.0001 then
    raise exception 'That is more than the % % shares still owed', trim(to_char(owed, 'FM999999990.####')), new.symbol;
  end if;
  return new;
end $$;
create trigger investor_returns_check before insert or update on public.investor_returns
  for each row execute function public.investor_returns_check();

create or replace function public.investor_stocks_norm() returns trigger
language plpgsql as $$
begin new.symbol := upper(trim(new.symbol)); return new; end $$;
create trigger investor_stocks_norm before insert or update on public.investor_stocks
  for each row execute function public.investor_stocks_norm();

-- Daily closing prices (filled automatically; owner can type a price, which is never overwritten).
create table public.stock_prices (
  symbol      text not null,
  exchange    text not null default 'NSE' check (exchange in ('NSE','BSE')),
  price_date  date not null,
  close       numeric(14,2) not null check (close > 0),
  source      text not null default 'auto' check (source in ('auto','manual')),
  updated_at  timestamptz not null default now(),
  primary key (symbol, exchange, price_date)
);

-- Automatic prices use the pg_net extension (enabled by automation.sql) and Yahoo Finance.
create table public.price_fetch_jobs (
  request_id  bigint primary key,
  symbol      text not null,
  exchange    text not null,
  created_at  timestamptz not null default now()
);

create or replace function public.queue_price_fetch() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; rid bigint;
begin
  if auth.uid() is not null and not is_admin() then raise exception 'Not allowed'; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'Automatic prices are off – run automation.sql in Supabase once';
  end if;
  for r in
    select s.symbol, s.exchange
      from investor_stocks s
     group by s.symbol, s.exchange
    having sum(s.qty) > coalesce((select sum(x.qty) from investor_returns x where x.symbol = s.symbol and x.exchange = s.exchange), 0)
  loop
    execute 'select net.http_get(url := $1, headers := $2)' into rid
      using 'https://query1.finance.yahoo.com/v8/finance/chart/' || r.symbol
            || case when r.exchange = 'BSE' then '.BO' else '.NS' end || '?range=1d&interval=1d',
            '{"User-Agent":"Mozilla/5.0"}'::jsonb;
    insert into price_fetch_jobs (request_id, symbol, exchange) values (rid, r.symbol, r.exchange);
    n := n + 1;
  end loop;
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
    exception when others then null;  -- skip a bad response, keep the rest
    end;
    delete from price_fetch_jobs where request_id = j.request_id;
  end loop;
  delete from price_fetch_jobs where created_at < now() - interval '1 day';
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Vendor management (owner only). Vendors log in with a username.
-- Username "ravi" becomes the login email "ravi@ledger.local" behind the scenes.
-- ---------------------------------------------------------------------
create or replace function public._create_login(p_username text, p_password text, p_name text, p_phone text, p_role text)
returns uuid
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_id uuid := gen_random_uuid();
  v_user text := lower(trim(p_username));
  v_email text;
begin
  if v_user !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Username must be 3–30 characters: letters, numbers, dot, dash or underscore';
  end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name is required'; end if;
  v_email := v_user || '@ledger.local';
  if exists (select 1 from auth.users where email = v_email) then raise exception 'Username already taken'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
          crypt(p_password, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());

  insert into profiles (id, username, name, phone, role)
  values (v_id, v_user, trim(p_name), nullif(trim(p_phone), ''), p_role);
  return v_id;
end $$;

create or replace function public.admin_create_vendor(p_username text, p_password text, p_name text, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only the owner can create vendors'; end if;
  return _create_login(p_username, p_password, p_name, p_phone, 'vendor');
end $$;

create or replace function public.admin_create_investor(p_username text, p_password text, p_name text, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only the owner can create investors'; end if;
  return _create_login(p_username, p_password, p_name, p_phone, 'investor');
end $$;

create or replace function public.admin_set_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not is_admin() then raise exception 'Only the owner can reset passwords'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
end $$;

create or replace function public.admin_set_active(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Only the owner can do this'; end if;
  if p_user = auth.uid() then raise exception 'You cannot deactivate yourself'; end if;
  update profiles set active = p_active where id = p_user;
  update auth.users set banned_until = case when p_active then null else 'infinity'::timestamptz end where id = p_user;
end $$;

-- One-time: create the owner login. Run from the SQL editor only. Refuses once an owner exists.
create or replace function public.bootstrap_admin(p_username text, p_password text, p_name text, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where role = 'admin') then raise exception 'Owner already exists'; end if;
  return _create_login(p_username, p_password, p_name, p_phone, 'admin');
end $$;

-- Lets vendors see the owner's name + WhatsApp number (nothing else about the owner).
create or replace function public.owner_contact() returns table (name text, phone text)
language sql stable security definer set search_path = public as $$
  select name, phone from profiles where role = 'admin' and active and is_active_user() order by created_at limit 1
$$;

-- ---------------------------------------------------------------------
-- Row level security: who can see / change what
-- ---------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.accounts    enable row level security;
alter table public.requests    enable row level security;
alter table public.pnl_entries enable row level security;
alter table public.settlements enable row level security;
alter table public.ledger      enable row level security;
alter table public.bets        enable row level security;
alter table public.investor_stocks  enable row level security;
alter table public.investor_returns enable row level security;
alter table public.stock_prices     enable row level security;
alter table public.price_fetch_jobs enable row level security;

create policy profiles_read   on public.profiles for select using (is_admin() or id = auth.uid());
create policy profiles_update on public.profiles for update using (is_admin()) with check (is_admin());
-- (vendors' own phone/name edits go through the owner)

create policy accounts_read   on public.accounts for select
  using (is_admin() or (vendor_id = auth.uid() and is_active_user()));
create policy accounts_insert on public.accounts for insert
  with check (is_admin() or (vendor_id = auth.uid() and is_active_user()));
create policy accounts_update on public.accounts for update
  using (is_admin() or (vendor_id = auth.uid() and is_active_user()))
  with check (is_admin() or (vendor_id = auth.uid() and is_active_user()));
create policy accounts_delete on public.accounts for delete using (is_admin());

create policy requests_read on public.requests for select
  using (is_admin() or (vendor_id = auth.uid() and is_active_user()));

create policy pnl_admin    on public.pnl_entries for all using (is_admin()) with check (is_admin());

create policy settlements_read  on public.settlements for select
  using (is_admin() or (vendor_id = auth.uid() and is_active_user()));
create policy settlements_admin on public.settlements for update using (is_admin()) with check (is_admin());

create policy ledger_admin on public.ledger for all using (is_admin()) with check (is_admin());
create policy bets_admin   on public.bets   for all using (is_admin()) with check (is_admin());

create policy inv_stocks_read  on public.investor_stocks for select
  using (is_admin() or (investor_id = auth.uid() and is_active_user()));
create policy inv_stocks_admin on public.investor_stocks for all using (is_admin()) with check (is_admin());
create policy inv_returns_read  on public.investor_returns for select
  using (is_admin() or (investor_id = auth.uid() and is_active_user()));
create policy inv_returns_admin on public.investor_returns for all using (is_admin()) with check (is_admin());
create policy prices_read  on public.stock_prices for select
  using (is_admin() or exists (select 1 from public.profiles where id = auth.uid() and role = 'investor' and active));
create policy prices_admin on public.stock_prices for all using (is_admin()) with check (is_admin());
-- price_fetch_jobs: no policies → only the database functions use it

-- Functions: only logged-in users may call them (each checks the role inside).
revoke execute on all functions in schema public from public, anon;
grant  execute on function public.settle_day(timestamptz), public.is_admin(), public.is_active_user(),
       public.create_request(text, uuid, uuid, numeric, text, jsonb), public.respond_request(bigint, boolean, text, text),
       public.owner_contact(),
       public.cancel_request(bigint), public.run_settlement(date),
       public.request_commission(bigint, text, text, jsonb),
       public.admin_create_investor(text, text, text, text), public.queue_price_fetch(), public.collect_prices(),
       public.admin_create_vendor(text, text, text, text), public.admin_set_password(uuid, text),
       public.admin_set_active(uuid, boolean)
  to authenticated;
revoke execute on function public._create_login(text, text, text, text, text), public.bootstrap_admin(text, text, text, text)
  from authenticated;

-- Supabase grants table access to the "anon" role by default; RLS already blocks it, this makes it explicit.
revoke all on public.profiles, public.accounts, public.requests, public.pnl_entries,
              public.settlements, public.ledger, public.bets,
              public.investor_stocks, public.investor_returns, public.stock_prices, public.price_fetch_jobs from anon;

-- ---------------------------------------------------------------------
-- Live updates in the browser
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.profiles, public.accounts, public.requests, public.pnl_entries, public.settlements, public.ledger, public.bets,
  public.investor_stocks, public.investor_returns, public.stock_prices;

-- ---------------------------------------------------------------------
-- Photos (cash tokens, slips, proofs). Private bucket; files are stored as
-- "<vendor id>/<random>.jpg" so each vendor can only open their own.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('proofs', 'proofs', false)
on conflict (id) do nothing;

create policy proofs_read on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and (public.is_admin()
         or ((storage.foldername(name))[1] = auth.uid()::text and public.is_active_user())));
create policy proofs_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (public.is_admin()
         or ((storage.foldername(name))[1] = auth.uid()::text and public.is_active_user())));
create policy proofs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and public.is_admin());

-- Automatic 11 AM commission settlement + daily stock prices
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 05:30 UTC = 11:00 AM IST. Settles the day that just ended.
select cron.schedule('daily-commission-settlement', '30 5 * * *', $$select public.run_settlement()$$);

-- 15:45 IST ask for prices, 15:50 IST store them (Mon–Fri). Runs again 18:30/18:35 IST as a backup.
select cron.schedule('stock-prices-fetch',    '15 10 * * 1-5', $$select public.queue_price_fetch()$$);
select cron.schedule('stock-prices-collect',  '20 10 * * 1-5', $$select public.collect_prices()$$);
select cron.schedule('stock-prices-fetch-2',  '0 13 * * 1-5',  $$select public.queue_price_fetch()$$);
select cron.schedule('stock-prices-collect-2','5 13 * * 1-5',  $$select public.collect_prices()$$);


select 'ID Ledger setup complete' as status;
