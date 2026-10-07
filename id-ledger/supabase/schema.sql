-- =====================================================================
-- ID Ledger — database setup for Supabase
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run once on a fresh project.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Settlement day: a "day" runs from 11:00 AM IST to 11:00 AM IST next day.
-- An entry made on 6 Oct at 9:00 AM belongs to settlement day 5 Oct.
-- ---------------------------------------------------------------------
create or replace function public.settle_day(ts timestamptz default now())
returns date language sql stable as $$
  select ((ts at time zone 'Asia/Kolkata') - interval '11 hours')::date
$$;

-- ---------------------------------------------------------------------
-- Users (owner + vendors). Logins live in auth.users; this holds the role.
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique,
  name        text not null,
  phone       text,
  role        text not null default 'vendor' check (role in ('admin','vendor','investor')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active)
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active)
$$;

-- ---------------------------------------------------------------------
-- IDs given by vendors
-- ---------------------------------------------------------------------
create table public.accounts (
  id               uuid primary key default gen_random_uuid(),
  vendor_id        uuid not null references public.profiles(id),
  site_name        text,
  login_url        text,
  username         text not null,
  password         text,
  opening_balance  numeric(14,2) not null default 0,
  current_balance  numeric(14,2) not null default 0,
  deposit          numeric(14,2) not null default 0 check (deposit >= 0),   -- money the owner gave the vendor for this ID
  commission_pct   numeric(5,2)  not null default 10 check (commission_pct between 0 and 100),   -- loss commission
  upfront_pct      numeric(5,2)  not null default 10 check (upfront_pct >= 0 and upfront_pct < 100),  -- deducted when balance is bought (pay 90%)
  status           text not null default 'active' check (status in ('active','closed')),
  last_reset_at    timestamptz,     -- P&L after this time = how far the ID is from its start
  notes            text,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.accounts (vendor_id);

-- Vendors may edit login details and commission, but never balances or owner.
-- Balance changes only through accepted requests, P&L (owner) or owner edits.
create or replace function public.accounts_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  direct_client boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if direct_client and not is_admin() then
      new.vendor_id := auth.uid();
      new.deposit := 0;               -- only the owner records deposits
      new.upfront_pct := 10;
    end if;
    new.current_balance := new.opening_balance;
    new.created_by := auth.uid();
    return new;
  end if;

  new.updated_at := now();
  if direct_client and not is_admin() then
    new.vendor_id       := old.vendor_id;
    new.opening_balance := old.opening_balance;
    new.current_balance := old.current_balance;
    new.deposit         := old.deposit;
    new.upfront_pct     := old.upfront_pct;
  elsif new.opening_balance <> old.opening_balance
        and new.current_balance = old.current_balance then
    -- Owner corrected the starting balance: shift the live balance by the same amount.
    new.current_balance := old.current_balance + (new.opening_balance - old.opening_balance);
  end if;
  return new;
end $$;

create trigger accounts_guard before insert or update on public.accounts
  for each row execute function public.accounts_guard();

-- ---------------------------------------------------------------------
-- Requests to vendors: transfer A→B, cash deposit into an ID, withdrawal from an ID.
-- Owner creates them; the vendor accepts → balances update.
-- ---------------------------------------------------------------------
create table public.requests (
  id                 bigint generated always as identity primary key,
  kind               text not null check (kind in ('transfer','deposit','withdrawal','commission')),
  settlement_id      bigint,  -- kind = commission: which settlement line this pays
  vendor_id          uuid not null references public.profiles(id),
  from_account       uuid references public.accounts(id) on delete cascade,
  to_account         uuid references public.accounts(id) on delete cascade,
  amount             numeric(14,2) not null check (amount > 0),      -- deposit: money you pay
  credit_amount      numeric(14,2),
  is_reset           boolean not null default false,   -- created by "Reset all IDs to start"
  commission_amount  numeric(14,2),                    -- reset recharge: loss commission deducted from the payment   -- deposit: balance added to the ID = amount ÷ (1 − commission %), commission taken upfront
  note               text,
  status             text not null default 'pending'
                     check (status in ('pending','completed','rejected','cancelled')),
  method             text check (method in ('cash','bank_deposit','bank_transfer','upi')),
  payee_name         text,   -- cash: person who collects / brings the cash
  payee_phone        text,
  token_no           text,   -- cash withdrawal token number
  payee_details      text,   -- bank account / IFSC / UPI id
  photo_path         text,   -- owner's photo (token / slip), in storage bucket "proofs"
  response_note      text,
  proof_path         text,   -- vendor's proof photo when completing
  from_balance_after numeric(14,2),
  to_balance_after   numeric(14,2),
  created_by         uuid,
  created_at         timestamptz not null default now(),
  responded_by       uuid,
  responded_at       timestamptz
);
create index on public.requests (vendor_id, status);

-- p_extra: {"method","payee_name","payee_phone","token_no","payee_details","photo_path"}
create or replace function public.create_request(
  p_kind text, p_from uuid, p_to uuid, p_amount numeric, p_note text default null, p_extra jsonb default '{}'
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_from_vendor uuid; v_to_vendor uuid; v_vendor uuid; v_id bigint; v_pct numeric; v_credit numeric;
begin
  if not is_admin() then raise exception 'Only the owner can create requests'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be more than 0'; end if;

  if p_kind = 'transfer' then
    if p_from is null or p_to is null then raise exception 'Choose both IDs'; end if;
    if p_from = p_to then raise exception 'From and To must be different IDs'; end if;
  elsif p_kind = 'deposit' then
    if p_to is null then raise exception 'Choose the ID to deposit into'; end if;
    p_from := null;
  elsif p_kind = 'withdrawal' then
    if p_from is null then raise exception 'Choose the ID to withdraw from'; end if;
    p_to := null;
  else
    raise exception 'Unknown request type';
  end if;

  select vendor_id into v_from_vendor from accounts where id = p_from;
  select vendor_id, upfront_pct into v_to_vendor, v_pct from accounts where id = p_to;
  if p_kind = 'transfer' and v_from_vendor is distinct from v_to_vendor then
    raise exception 'Both IDs in a transfer must belong to the same vendor';
  end if;
  v_vendor := coalesce(v_from_vendor, v_to_vendor);
  if v_vendor is null then raise exception 'ID not found'; end if;
  if p_kind = 'deposit' then
    -- you pay p_amount; the ID gets it grossed up by the upfront commission (90k at 10% -> 100k)
    v_credit := coalesce((p_extra->>'credit_amount')::numeric, round(p_amount / (1 - least(coalesce(v_pct, 0), 99) / 100), 2));
  end if;
  p_extra := coalesce(p_extra, '{}');
  if p_kind = 'transfer' then p_extra := '{}'; end if;
  if p_extra->>'photo_path' is not null and p_extra->>'photo_path' not like v_vendor::text || '/%' then
    raise exception 'Photo must be stored in the vendor folder';
  end if;

  insert into requests (kind, vendor_id, from_account, to_account, amount, credit_amount, note, created_by,
                        method, payee_name, payee_phone, token_no, payee_details, photo_path)
  values (p_kind, v_vendor, p_from, p_to, round(p_amount, 2), v_credit, nullif(trim(p_note), ''), auth.uid(),
          nullif(p_extra->>'method', ''), nullif(trim(p_extra->>'payee_name'), ''),
          nullif(trim(p_extra->>'payee_phone'), ''), nullif(trim(p_extra->>'token_no'), ''),
          nullif(trim(p_extra->>'payee_details'), ''), nullif(p_extra->>'photo_path', ''))
  returning id into v_id;
  return v_id;
end $$;

-- Vendor (or owner) accepts / rejects a pending request.
create or replace function public.respond_request(p_id bigint, p_accept boolean, p_note text default null, p_proof text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r requests%rowtype; v_from numeric; v_to numeric; v_acc uuid; v_covered numeric;
begin
  select * into r from requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if not (is_admin() or (r.vendor_id = auth.uid() and is_active_user())) then
    raise exception 'Not allowed';
  end if;
  if r.status <> 'pending' then raise exception 'This request is already %', r.status; end if;
  if p_proof is not null and p_proof not like r.vendor_id::text || '/%' then
    raise exception 'Proof must be stored in the vendor folder';
  end if;
  if p_accept then
    if r.from_account is not null then
      update accounts set current_balance = current_balance - r.amount
       where id = r.from_account returning current_balance into v_from;
    end if;
    if r.to_account is not null then
      update accounts set current_balance = current_balance + coalesce(r.credit_amount, r.amount)
       where id = r.to_account returning current_balance into v_to;
    end if;
    if r.is_reset then
      v_acc := coalesce(r.to_account, r.from_account);
      update accounts set last_reset_at = r.created_at where id = v_acc;
      if coalesce(r.commission_amount, 0) > 0 then
        -- commission was taken in this recharge: mark open commission lines as received …
        select coalesce(sum(commission), 0) into v_covered from settlements where account_id = v_acc and status = 'due';
        update settlements set status = 'received', payout = 'id', request_id = r.id, received_at = now()
         where account_id = v_acc and status = 'due';
        -- … and record the rest so the 11 AM settlement does not charge it again
        if r.commission_amount - v_covered > 0 then
          insert into settlements (account_id, vendor_id, settle_date, net_pnl, commission_pct, commission, status, payout, request_id, received_at)
          select a.id, a.vendor_id, settle_day(now()), -r.credit_amount, a.commission_pct, r.commission_amount - v_covered,
                 'received', 'id', r.id, now()
            from accounts a where a.id = v_acc;
        end if;
      end if;
    end if;
  end if;
  if r.kind = 'commission' then
    update settlements set
      status      = case when p_accept then 'received' else 'due' end,
      payout      = case when p_accept then (case when r.to_account is null then 'withdrawal' else 'id' end) end,
      request_id  = case when p_accept then r.id end,
      received_at = case when p_accept then now() end
    where id = r.settlement_id;
  end if;
  update requests set
    status = case when p_accept then 'completed' else 'rejected' end,
    response_note = nullif(trim(p_note), ''),
    proof_path = p_proof,
    from_balance_after = v_from,
    to_balance_after = v_to,
    responded_by = auth.uid(),
    responded_at = now()
  where id = p_id;
end $$;

-- Reset IDs to where they started: undo the P&L since the last reset.
-- Profit -> withdrawal request; loss -> recharge (deposit) request crediting the loss, paid net of loss commission.
create or replace function public.reset_to_start(p_vendor uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare a record; diff numeric; c numeric; n integer := 0;
begin
  if not is_admin() then raise exception 'Only the owner can do this'; end if;
  for a in
    select * from accounts
     where status = 'active' and (p_vendor is null or vendor_id = p_vendor)
       and not exists (select 1 from requests r where r.is_reset and r.status = 'pending'
                        and coalesce(r.to_account, r.from_account) = accounts.id)
  loop
    select coalesce(sum(p.amount), 0) into diff from pnl_entries p
     where p.account_id = a.id and (a.last_reset_at is null or p.created_at > a.last_reset_at);
    if diff > 0 then
      insert into requests (kind, vendor_id, from_account, amount, note, created_by, is_reset)
      values ('withdrawal', a.vendor_id, a.id, diff, 'Reset to start – profit ' || diff, auth.uid(), true);
      n := n + 1;
    elsif diff < 0 then
      c := round(-diff * a.commission_pct / 100, 2);
      insert into requests (kind, vendor_id, to_account, amount, credit_amount, commission_amount, note, created_by, is_reset)
      values ('deposit', a.vendor_id, a.id, -diff - c, -diff, c,
              'Reset to start – loss ' || (-diff) || ', ' || a.commission_pct || '% commission ' || c || ' deducted', auth.uid(), true);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.cancel_request(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only the owner can cancel requests'; end if;
  update requests set status = 'cancelled', responded_by = auth.uid(), responded_at = now()
   where id = p_id and status = 'pending';
  if not found then raise exception 'Only pending requests can be cancelled'; end if;
  update settlements set status = 'due', request_id = null
   where request_id = p_id and status = 'requested';
end $$;

-- ---------------------------------------------------------------------
-- Profit & loss per ID (owner only). Positive = profit, negative = loss.
-- Changes the ID's live balance automatically.
-- ---------------------------------------------------------------------
create table public.pnl_entries (
  id          bigint generated always as identity primary key,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  settle_date date not null default public.settle_day(now()),
  amount      numeric(14,2) not null check (amount <> 0),
  note        text,
  bet_id      bigint unique,   -- set when the entry comes from a settled bet
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index on public.pnl_entries (settle_date);
create index on public.pnl_entries (account_id);

create or replace function public.pnl_apply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    update accounts set current_balance = current_balance - old.amount where id = old.account_id;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    update accounts set current_balance = current_balance + new.amount where id = new.account_id;
    return new;
  end if;
  return old;
end $$;

create trigger pnl_apply after insert or update or delete on public.pnl_entries
  for each row execute function public.pnl_apply();

-- ---------------------------------------------------------------------
-- Daily commission settlement (11:00 AM IST).
-- For each ID: net P&L of the day; if it is a loss, commission = loss × commission %.
-- ---------------------------------------------------------------------
create table public.settlements (
  id              bigint generated always as identity primary key,
  account_id      uuid not null references public.accounts(id) on delete cascade,
  vendor_id       uuid not null references public.profiles(id),
  settle_date     date not null,
  net_pnl         numeric(14,2) not null,
  commission_pct  numeric(5,2) not null,
  commission      numeric(14,2) not null,
  status          text not null default 'due' check (status in ('due','requested','received')),
  payout          text check (payout in ('id','withdrawal','other')),  -- how it was received
  request_id      bigint,
  created_at      timestamptz not null default now(),
  received_at     timestamptz
);
create index on public.settlements (account_id, settle_date);

create or replace function public.settlement_calc(d date)
returns table (account_id uuid, vendor_id uuid, net numeric, pct numeric, amt numeric)
language sql stable security definer set search_path = public as $$
  select a.id, a.vendor_id, t.net, a.commission_pct,
         round(-t.net * a.commission_pct / 100, 2) - coalesce(dn.amount, 0)
    from (select p.account_id, sum(p.amount) net from pnl_entries p where p.settle_date = d group by p.account_id) t
    join accounts a on a.id = t.account_id
    left join (select x.account_id, sum(x.commission) amount from settlements x
                where x.settle_date = d and x.status in ('requested','received') group by x.account_id) dn
           on dn.account_id = t.account_id
   where t.net < 0
$$;

-- Unpaid lines are recalculated; lines already requested / received stay; extra loss later = top-up line.
create or replace function public.run_settlement(p_date date default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  d date := coalesce(p_date, public.settle_day(now()) - 1);
  n integer;
begin
  if auth.uid() is not null and not is_admin() then raise exception 'Not allowed'; end if;
  update settlements s set commission = 0, net_pnl = 0
   where s.settle_date = d and s.status = 'due'
     and not exists (select 1 from settlement_calc(d) c where c.account_id = s.account_id and c.amt > 0);
  update settlements s set net_pnl = c.net, commission_pct = c.pct, commission = c.amt
    from settlement_calc(d) c
   where s.settle_date = d and s.status = 'due' and s.account_id = c.account_id and c.amt > 0;
  insert into settlements (account_id, vendor_id, settle_date, net_pnl, commission_pct, commission)
  select c.account_id, c.vendor_id, d, c.net, c.pct, c.amt
    from settlement_calc(d) c
   where c.amt > 0
     and not exists (select 1 from settlements s where s.account_id = c.account_id and s.settle_date = d and s.status = 'due');
  select count(*) into n from settlements where settle_date = d and status = 'due' and commission > 0;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Bets per ID (owner only). A settled bet automatically becomes a P&L entry,
-- so balances, commission and the dashboard all include it.
--   Back: won = stake × (odds − 1), lost = − stake
--   Lay:  won (selection lost) = + stake, lost (selection won) = − stake × (odds − 1)
-- ---------------------------------------------------------------------
create table public.bets (
  id           bigint generated always as identity primary key,
  account_id   uuid not null references public.accounts(id) on delete cascade,
  settle_date  date not null default public.settle_day(now()),
  event        text,
  market       text,
  selection    text,
  side         text not null default 'back' check (side in ('back','lay')),
  stake        numeric(14,2) not null check (stake > 0),
  odds         numeric(10,3) not null check (odds > 1),
  result       text not null default 'open' check (result in ('open','won','lost','void')),
  pnl          numeric(14,2) generated always as (
                 case
                   when result = 'won'  and side = 'back' then round(stake * (odds - 1), 2)
                   when result = 'lost' and side = 'back' then -stake
                   when result = 'won'  and side = 'lay'  then stake
                   when result = 'lost' and side = 'lay'  then -round(stake * (odds - 1), 2)
                   else 0
                 end) stored,
  note         text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  settled_at   timestamptz
);
create index on public.bets (account_id);
create index on public.bets (settle_date);

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
  kind        text not null default 'payment' check (kind in ('payment','deposit')),  -- deposit = security deposit with the vendor
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
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index on public.investor_stocks (investor_id);

create or replace function public.is_investor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'investor' and active)
$$;

-- An investor can add his own shares, and change/remove only his own entries before anything was returned on that stock.
create or replace function public.investor_stocks_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.investor_stocks;
begin
  if is_admin() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    return new;
  end if;
  r := old;
  if exists (select 1 from investor_returns x where x.investor_id = r.investor_id and x.symbol = r.symbol and x.exchange = r.exchange) then
    raise exception 'Shares of % were already returned – ask the owner to change this entry', r.symbol;
  end if;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by; new.investor_id := old.investor_id;
    return new;
  end if;
  return old;
end $$;
create trigger investor_stocks_lock before insert or update or delete on public.investor_stocks
  for each row execute function public.investor_stocks_lock();

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

-- Money between you and the investor: what he sent you (cash he got from selling the shares).
-- Money you pay back is an investor_returns row with mode 'cash'.
create table public.investor_money (
  id           bigint generated always as identity primary key,
  investor_id  uuid not null references public.profiles(id) on delete cascade,
  kind         text not null default 'cash' check (kind in ('shares','cash','other')),  -- shares = money from selling a stock
  symbol       text,                                   -- kind = shares: which stock …
  exchange     text check (exchange in ('NSE','BSE')),
  qty          numeric(14,4),                          -- … and how many shares were sold
  amount       numeric(14,2) not null check (amount > 0),
  paid_on      date not null default ((now() at time zone 'Asia/Kolkata')::date),
  mode         text,
  reference    text,
  note         text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index on public.investor_money (investor_id);

create or replace function public.investor_money_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare listed numeric; sent numeric;
begin
  new.symbol := nullif(upper(trim(new.symbol)), '');
  -- cash / other settlement, or shares money not tied to one stock
  if new.kind <> 'shares' or new.symbol is null then
    new.symbol := null; new.exchange := null; new.qty := null;
    return new;
  end if;
  new.exchange := coalesce(new.exchange, 'NSE');
  if coalesce(new.qty, 0) <= 0 then raise exception 'Enter how many shares were sold'; end if;
  select coalesce(sum(qty), 0) into listed from investor_stocks
   where investor_id = new.investor_id and symbol = new.symbol and exchange = new.exchange;
  select coalesce(sum(qty), 0) into sent from investor_money
   where investor_id = new.investor_id and kind = 'shares' and symbol = new.symbol and exchange = new.exchange
     and id is distinct from new.id;
  if new.qty > listed - sent + 0.0001 then
    raise exception 'Only % % shares are left', trim(to_char(listed - sent, 'FM999999990.####')), new.symbol;
  end if;
  return new;
end $$;
create trigger investor_money_check before insert or update on public.investor_money
  for each row execute function public.investor_money_check();

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
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

create or replace function public.queue_price_fetch() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; rid bigint;
begin
  if auth.uid() is not null and not (is_admin() or is_investor()) then raise exception 'Not allowed'; end if;
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
  if auth.uid() is not null and not (is_admin() or is_investor()) then raise exception 'Not allowed'; end if;
  for j in execute
    'select f.request_id, f.symbol, f.exchange, r.status_code, r.content
       from price_fetch_jobs f join net._http_response r on r.id = f.request_id
      where not f.done'
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
    update price_fetch_jobs set done = true where request_id = j.request_id;
  end loop;
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
alter table public.investor_money   enable row level security;

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
create policy inv_stocks_self_insert on public.investor_stocks for insert
  with check (is_investor() and investor_id = auth.uid() and created_by = auth.uid());
create policy inv_stocks_self_update on public.investor_stocks for update
  using (is_investor() and investor_id = auth.uid() and created_by = auth.uid())
  with check (is_investor() and investor_id = auth.uid() and created_by = auth.uid());
create policy inv_stocks_self_remove on public.investor_stocks for delete
  using (is_investor() and investor_id = auth.uid() and created_by = auth.uid());
create policy inv_returns_read  on public.investor_returns for select
  using (is_admin() or (investor_id = auth.uid() and is_active_user()));
create policy inv_returns_admin on public.investor_returns for all using (is_admin()) with check (is_admin());
create policy inv_money_read on public.investor_money for select
  using (is_admin() or (investor_id = auth.uid() and is_active_user()));
create policy inv_money_admin on public.investor_money for all using (is_admin()) with check (is_admin());
create policy inv_money_self_insert on public.investor_money for insert
  with check (is_investor() and investor_id = auth.uid() and created_by = auth.uid());
create policy inv_money_self_update on public.investor_money for update
  using (is_investor() and investor_id = auth.uid() and created_by = auth.uid())
  with check (is_investor() and investor_id = auth.uid() and created_by = auth.uid());
create policy inv_money_self_remove on public.investor_money for delete
  using (is_investor() and investor_id = auth.uid() and created_by = auth.uid());
create policy prices_read  on public.stock_prices for select
  using (is_admin() or exists (select 1 from public.profiles where id = auth.uid() and role = 'investor' and active));
create policy prices_admin on public.stock_prices for all using (is_admin()) with check (is_admin());
-- price_fetch_jobs: no policies → only the database functions use it

-- Functions: only logged-in users may call them (each checks the role inside).
revoke execute on all functions in schema public from public, anon;
grant  execute on function public.settle_day(timestamptz), public.is_admin(), public.is_active_user(),
       public.create_request(text, uuid, uuid, numeric, text, jsonb), public.respond_request(bigint, boolean, text, text),
       public.owner_contact(), public.is_investor(),
       public.cancel_request(bigint), public.run_settlement(date),
       public.request_commission(bigint, text, text, jsonb), public.reset_to_start(uuid),
       public.admin_create_investor(text, text, text, text), public.queue_price_fetch(), public.collect_prices(),
       public.admin_create_vendor(text, text, text, text), public.admin_set_password(uuid, text),
       public.admin_set_active(uuid, boolean)
  to authenticated;
revoke execute on function public._create_login(text, text, text, text, text), public.bootstrap_admin(text, text, text, text),
  public.settlement_calc(date) from authenticated;

-- Supabase grants table access to the "anon" role by default; RLS already blocks it, this makes it explicit.
revoke all on public.profiles, public.accounts, public.requests, public.pnl_entries,
              public.settlements, public.ledger, public.bets,
              public.investor_stocks, public.investor_returns, public.stock_prices, public.price_fetch_jobs, public.investor_money from anon;

-- ---------------------------------------------------------------------
-- Live updates in the browser
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.profiles, public.accounts, public.requests, public.pnl_entries, public.settlements, public.ledger, public.bets,
  public.investor_stocks, public.investor_returns, public.stock_prices, public.investor_money;

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

-- ---------------------------------------------------------------------
-- Permanent change history (for disputes). Every add / edit / delete on these tables is copied here
-- with who did it and when. Only the owner can read it; nobody can edit or delete it from the app.
-- ---------------------------------------------------------------------
create table public.audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor        uuid,
  actor_name   text,
  via          text,
  table_name   text not null,
  action       text not null,
  row_id       text,
  account_ids  uuid[],
  old_row      jsonb,
  new_row      jsonb
);
create index audit_log_accounts on public.audit_log using gin (account_ids);
create index audit_log_at on public.audit_log (at);
alter table public.audit_log enable row level security;
create policy audit_read on public.audit_log for select using (is_admin());
revoke all on public.audit_log from anon;
revoke insert, update, delete, truncate on public.audit_log from authenticated;

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
        n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
        r jsonb; ids uuid[];
begin
  if tg_op = 'UPDATE' and (o - 'updated_at') = (n - 'updated_at') then return new; end if;
  o := o - 'password'; n := n - 'password';   -- never copy ID passwords into the log
  r := coalesce(n, o);
  ids := case tg_table_name
    when 'accounts' then array[(r->>'id')::uuid]
    when 'requests' then array_remove(array[(r->>'from_account')::uuid, (r->>'to_account')::uuid], null)
    when 'pnl_entries' then array[(r->>'account_id')::uuid]
    when 'bets' then array[(r->>'account_id')::uuid]
    when 'settlements' then array[(r->>'account_id')::uuid]
    else array[]::uuid[] end;
  insert into audit_log (actor, actor_name, via, table_name, action, row_id, account_ids, old_row, new_row)
  values (auth.uid(), (select name from profiles where id = auth.uid()),
          case when current_user in ('authenticated','anon') then 'app' else 'system' end,
          tg_table_name, lower(tg_op), r->>'id', ids,
          case when tg_op = 'INSERT' then null else o end,
          case when tg_op = 'DELETE' then null else n end);
  return coalesce(new, old);
end $$;

create trigger zz_audit after insert or update or delete on public.accounts for each row execute function public.audit_trigger();
create trigger zz_audit after insert or update or delete on public.requests for each row execute function public.audit_trigger();
create trigger zz_audit after insert or update or delete on public.pnl_entries for each row execute function public.audit_trigger();
create trigger zz_audit after insert or update or delete on public.bets for each row execute function public.audit_trigger();
create trigger zz_audit after insert or update or delete on public.settlements for each row execute function public.audit_trigger();
create trigger zz_audit after insert or update or delete on public.ledger for each row execute function public.audit_trigger();
create trigger zz_audit after insert or update or delete on public.investor_stocks for each row execute function public.audit_trigger();
create trigger zz_audit after insert or update or delete on public.investor_returns for each row execute function public.audit_trigger();
create trigger zz_audit after insert or update or delete on public.investor_money for each row execute function public.audit_trigger();
alter publication supabase_realtime add table public.audit_log;
