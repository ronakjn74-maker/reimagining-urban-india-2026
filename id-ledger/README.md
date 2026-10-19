# Investor Ledger

A live, mobile-friendly web app for the money an investor has put in. Two separate accounts per investor:

- **Shares account**: shares the investor sold (leveraged) to fund the business. The basket is tracked at the daily market price, Kite style (qty, avg, LTP, P&L). The amount due is the **money received when the shares were sold, moved up or down by the whole basket's change since then**.
- **Cash account**: plain money given and paid back, shown as a UPI-style transaction feed with a running balance. Fees (DP, pledge, sell charges) live here.

Runs on **Supabase** (database, login, live updates, automatic prices) plus **GitHub Pages**.

## Who can do what

| | Owner | Investor |
|---|---|---|
| See every investor's shares, cash, totals | ✅ | ❌ own data only |
| Add investor, reset password, deactivate | ✅ | ❌ |
| Add a share sale entry | ✅ | ✅ own entries |
| Record money received for shares | ✅ | ❌ |
| Record cash received / paid back | ✅ | ✅ can add money they gave |
| Return shares, type a price | ✅ | ❌ |
| Update prices | ✅ | ✅ |
| WhatsApp statement | ✅ to the investor | "WhatsApp owner" button |

Rules are enforced in the database (row-level security), not just hidden in the page.

## Tabs

- **Overview**: total due (shares + cash), with each account's figures and the WhatsApp statement button.
- **Stocks**: holdings bar (basket value, total P&L, day's P&L, base received, due), then each stock with qty, avg, LTP, day change and P&L; daily value table; sale entries.
- **Cash**: cash owed, then every entry grouped by date with description, mode, amount and running balance; month filter.
- **More**: investors, money received for shares, owner details, app link.

## Prices

`queue_price_fetch` + `collect_prices` pull closing prices from Yahoo Finance via `pg_net`; `supabase/automation.sql` schedules them on weekday afternoons. A price typed by the owner is never overwritten.

## Files

- `index.html`, `styles.css`, `app.js`: the app (no build step).
- `config.js`: Supabase URL and anon key (public by design; never the service key).
- `supabase/schema.sql`, `supabase/automation.sql`: tables, security rules, functions and schedules. Cash repayments use the `investor_cash_payments` table.

## Hosting

GitHub → Settings → Pages → deploy branch `claude/trusting-faraday-o8u6c6`, folder `/ (root)`. The app lives at `/id-ledger/`.
