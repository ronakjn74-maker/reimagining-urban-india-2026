# ID Ledger

A live, mobile-friendly web app for tracking the IDs that vendors give you. It also handles transfer, deposit and withdrawal requests, daily P&L, loss commission and a payment ledger.

Everything runs on free tiers: **Supabase** (database, login, live updates, photos) plus any free static host (**Cloudflare Pages**, **Netlify** or **GitHub Pages**).

## Who can do what

| | Owner (you) | Vendor |
|---|---|---|
| Dashboard, totals, bets, P&L, payment ledger | ✅ | ❌ never visible |
| Create vendors, reset passwords, switch vendors off | ✅ | ❌ |
| Add an ID (username, password, login link, start balance, commission %) | ✅ any vendor | ✅ own IDs only |
| Edit an ID's login details and commission % | ✅ | ✅ own IDs only |
| Change balances | ✅ (corrections, P&L) | ❌ only by accepting your requests |
| Create transfer, deposit or withdrawal requests | ✅ | ❌ |
| Accept or reject a request (balances update instantly) | ✅ (mark done) | ✅ own requests |
| See commission statement | ✅ | ✅ own IDs |
| Accept commission requests (credit to ID or pay out) | — | ✅ |
| WhatsApp | Send requests and reminders to vendors | "WhatsApp owner" to ask you for bank or UPI details |

These rules are enforced **inside the database** (row-level security), not just hidden in the page. A vendor can't read your dashboard data even with technical tricks.

### Requests
- **Transfer**: ID A → ID B, both from the same vendor.
- **Deposit / Withdrawal**: the method is Cash, Bank deposit, Bank transfer or UPI.
  - **Cash**: person name and phone, token number, and a photo of the token or slip.
  - **Bank / UPI**: account or UPI details. Leave them empty and the vendor sees "Ask the owner" with a WhatsApp button.
- After you create a request, a ready-made WhatsApp message opens for the vendor. It includes a link to the photo, valid for 7 days.
- The vendor presses **Accept**, optionally attaching a proof photo or note. Both IDs' balances update and everyone's screen refreshes live.

### Bets, P&L and commission (owner only)
- **Bets & P&L tab → + New bet** (or **+ Bet** on an ID card): event, market, selection, **Back** or **Lay**, stake, decimal odds.
  - While a bet is **Open**, the ID balance doesn't change. Press **Won**, **Lost** or **Void** and the P&L goes onto the ID straight away.
  - **Back**: won = stake × (odds − 1), lost = − stake. Example: ₹1,000 @ 1.90 → +₹900 / −₹1,000.
  - **Lay**: won (the selection lost) = + stake, lost = − stake × (odds − 1). Example: ₹500 @ 4.00 → +₹500 / −₹1,500.
  - **Void** = 0. If you change a result or delete a bet later, the balance corrects itself.
- **Quick P&L**: no bet details? Type `+5000` or `-2000` next to each ID and press Save.
- A **settlement day** runs from 11:00 AM to 11:00 AM IST.
- **Commission** = each ID's **net loss for the day** × that ID's commission %. The default is **10%** and can be changed per ID. A profit day gives no commission.
  - Example: bets of +900, −2,000 and −1,500 give a −2,600 day, so 10% = ₹260.
- Settle a day from the **Commission** tab, or automatically at 11:00 AM (step 3 below). Then collect each line in one of three ways:
  - **Credit to ID**: the vendor accepts, and the commission is added to that ID's balance. **Credit all due to IDs** does a whole day in one tap.
  - **Withdraw**: the vendor pays it out like a withdrawal (cash with person, token and photo, or bank/UPI). The ID balance doesn't change.
  - **Mark received**: for commission already paid some other way.
- If more losses are entered for a day that was already collected, running settlement again adds a **top-up line for only the difference**.

### Payment ledger
Money you **paid** to vendors or **received** from them: date, mode, UTR or token, note. The dashboard shows totals per vendor.

---

## One-time setup (about 15 minutes, free)

### 1. Create the Supabase project
1. Sign up at <https://supabase.com> (free) → **New project**. Pick region **Mumbai (ap-south-1)**.
2. Open **SQL Editor** → **New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), and press **Run**.
3. Create **your** owner login. In a new query, run the line below with your own username, password, name and WhatsApp number:
   ```sql
   select public.bootstrap_admin('ronak', 'choose-a-strong-password', 'Ronak', '91XXXXXXXXXX');
   ```
   This works only once. After that, only you can create vendors, from inside the app.
4. **Authentication → Sign In / Providers → Email**: switch **off** "Allow new users to sign up". Vendors are created only by you.

### 2. Put it online and connect it
1. On GitHub, open this repo → **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**, pick branch **`claude/trusting-faraday-o8u6c6`** with folder **`/ (root)`**, then **Save**. After 1–2 minutes the app is live at:
   **https://ronakjn74-maker.github.io/reimagining-urban-india-2026/id-ledger/**
2. Open that link. On the **Connect ID Ledger** screen, paste the **Project URL** and the **anon public** key from Supabase → *Project Settings → API*.
3. Sign in with the owner username and password from step 1.3.
4. **Vendors → App link → Copy app link** gives the one link for you and all vendors. It already carries the connection, so vendors just open it and log in.

The anon key is designed to be public. Never paste the `service_role` key.

### 3. (Optional) Automatic settlement at 11:00 AM
In the SQL Editor, run [`supabase/auto-settlement.sql`](supabase/auto-settlement.sql).

### 4. Other free hosts (optional)
**Cloudflare Pages** (works with a private repo):
1. dash.cloudflare.com → Workers & Pages → Create → Pages → connect this GitHub repo.
2. Framework: *None*. Build command: *empty*. Output directory: `/`.
3. Deploy. You get a link like `https://id-ledger.pages.dev`. Open it on your phone and use "Add to Home screen".

Netlify works the same way (drag and drop the folder). GitHub Pages works only if the repo is public on a free plan.

### 5. Daily use
1. **Vendors → + Create vendor**. Use **Send login on WhatsApp** to share the link, username and password.
2. The vendor logs in and adds IDs, or you add them for the vendor.
3. **Requests → + New request**. The WhatsApp message opens. The vendor accepts it once done.
4. Enter each ID's P&L in the **P&L** tab. Commission settles at 11:00 AM.
5. Record payments in **Ledger**. Check everything on the **Dashboard**.

## Notes
- ID passwords are stored as plain text so you can copy them. Only you and that ID's vendor can read them.
- Usernames are turned into hidden emails like `ravi@ledger.local`. Vendors never need a real email address.
- Deactivating a vendor blocks their login immediately and hides all their data from them.
- Free-tier limits (500 MB database, 1 GB photo storage) are far more than this needs. Photos are shrunk before upload. Supabase pauses free projects after 7 days with **no visits at all**; opening the app regularly keeps it awake.
- Deleting an ID also deletes its requests, P&L and commission history. Use **Status: Closed** to keep the history.

## Files
- `index.html`, `styles.css`, `app.js`: the app (no build step).
- `config.js`: your Supabase URL and key.
- `supabase/schema.sql`: tables, security rules and functions.
- `supabase/auto-settlement.sql`: optional daily 11:00 AM settlement.
