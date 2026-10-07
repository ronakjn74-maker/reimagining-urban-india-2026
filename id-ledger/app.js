import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const CFG = { LOGIN_DOMAIN: 'ledger.local', ...(window.APP_CONFIG || {}) };
const placeholder = (v) => !v || /YOUR-/.test(v);
(() => {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('s') && h.get('k')) {
    try { localStorage.setItem('idl-cfg', JSON.stringify({ url: h.get('s'), key: h.get('k') })); } catch {}
    history.replaceState(null, '', location.pathname);
  }
  if (placeholder(CFG.SUPABASE_URL) || placeholder(CFG.SUPABASE_ANON_KEY)) {
    try { const c = JSON.parse(localStorage.getItem('idl-cfg') || 'null'); if (c) { CFG.SUPABASE_URL = c.url; CFG.SUPABASE_ANON_KEY = c.key; } } catch {}
  }
})();
const CONFIGURED = !placeholder(CFG.SUPABASE_URL) && !placeholder(CFG.SUPABASE_ANON_KEY);
const sb = createClient(CONFIGURED ? CFG.SUPABASE_URL : 'https://setup.invalid', CONFIGURED ? CFG.SUPABASE_ANON_KEY : 'setup');
// Link that carries the connection, so vendors open it once and are set up.
const shareLink = () => `${location.origin}${location.pathname}#s=${encodeURIComponent(CFG.SUPABASE_URL)}&k=${encodeURIComponent(CFG.SUPABASE_ANON_KEY)}`;
const APP_URL = location.origin + location.pathname;

const KIND = { transfer: 'Transfer', deposit: 'Deposit', withdrawal: 'Withdrawal', commission: 'Commission' };
const METHOD = { cash: 'Cash', bank_deposit: 'Bank deposit', bank_transfer: 'Bank transfer', upi: 'UPI' };
const LEDGER_MODES = ['Cash', 'UPI', 'Bank transfer', 'Bank deposit', 'Other'];

const S = {
  me: null,
  owner: null,
  view: null,
  live: false,
  data: { profiles: [], accounts: [], requests: [], pnl: [], settlements: [], ledger: [], bets: [], invStocks: [], invReturns: [], prices: [], invMoney: [] },
  f: { idSearch: '', idVendor: '', idStatus: 'active', reqTab: 'pending', reqVendor: '', pnlDate: null, comDate: null, ledVendor: '' },
};
const isAdmin = () => S.me?.role === 'admin';
const isInvestor = () => S.me?.role === 'investor';

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const money = (n) => inr.format(Number(n || 0));
const signed = (n) => `<span class="num ${n > 0 ? 'pos' : n < 0 ? 'neg' : ''}">${n > 0 ? '+' : ''}${money(n)}</span>`;
const sum = (arr, fn) => arr.reduce((t, x) => t + Number(fn(x) || 0), 0);
const fmtDT = (s) => s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const fmtD = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
// Settlement day: 11:00 AM IST → 11:00 AM IST (IST = UTC+5:30, minus 11h = UTC−5:30)
const settleDay = (d = new Date()) => new Date(d.getTime() - 5.5 * 3600e3).toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

const acc = (id) => S.data.accounts.find((a) => a.id === id);
const prof = (id) => S.data.profiles.find((p) => p.id === id);
const accName = (a) => a ? `${a.site_name ? a.site_name + ' · ' : ''}${a.username}` : '(deleted ID)';
const vendorName = (id) => prof(id)?.name || (id === S.me?.id ? S.me.name : '—');
const vendors = () => S.data.profiles.filter((p) => p.role === 'vendor').sort((a, b) => a.name.localeCompare(b.name));

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), type === 'error' ? 5000 : 2600);
}
const fail = (e) => toast(e?.message || String(e), 'error');

const modal = $('#modal');
modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) modal.close(); });
function openModal(title, html, mount) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  if (!modal.open) modal.showModal();
  mount?.($('#modal-body'));
}

async function copy(text, what = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(what); } catch { prompt('Copy:', text); }
}

function waUrl(phone, text) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
const openWA = (phone, text) => window.open(waUrl(phone, text), '_blank', 'noopener');
// Opens the tab during the click (so phones don't block it), then fills in the link once the text is ready.
async function openWAAsync(phone, textPromise) {
  const w = window.open('about:blank', '_blank');
  try { const url = waUrl(phone, await textPromise); if (w) w.location.href = url; else location.href = url; }
  catch (e) { w?.close(); throw e; }
}

const formObj = (form) => Object.fromEntries(new FormData(form).entries());
const busy = async (btn, fn) => {
  const label = btn?.innerHTML; if (btn) { btn.disabled = true; btn.innerHTML = 'Please wait…'; }
  try { return await fn(); } catch (e) { fail(e); } finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
};
const must = ({ data, error }) => { if (error) throw error; return data; };

// ---------- photos ----------
async function compressImage(file, max = 1400) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.8));
}
async function uploadPhoto(file, vendorId) {
  if (!file || !file.size) return null;
  const blob = await compressImage(file);
  const path = `${vendorId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  must(await sb.storage.from('proofs').upload(path, blob, { contentType: 'image/jpeg' }));
  return path;
}
async function photoUrl(path, seconds = 3600) {
  const { data, error } = await sb.storage.from('proofs').createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}
async function showPhoto(path) {
  try {
    const url = await photoUrl(path);
    openModal('Photo', `<img src="${esc(url)}" alt="Photo" style="width:100%;border-radius:10px">
      <div class="row" style="margin-top:10px"><a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener">Open full size</a></div>`);
  } catch (e) { fail(e); }
}

// ---------- data ----------
async function fetchAll(table, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await sb.from(table).select('*').order(order, { ascending: false }).range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
async function loadData() {
  const admin = isAdmin(); const inv = admin || isInvestor(); const ven = !isInvestor();
  const [profiles, accounts, requests, settlements, pnl, ledger, bets, invStocks, invReturns, prices, invMoney] = await Promise.all([
    fetchAll('profiles', 'created_at'),
    ven ? fetchAll('accounts', 'created_at') : [],
    ven ? fetchAll('requests', 'created_at') : [],
    ven ? fetchAll('settlements', 'settle_date') : [],
    admin ? fetchAll('pnl_entries', 'created_at') : [],
    admin ? fetchAll('ledger', 'entry_date') : [],
    admin ? fetchAll('bets', 'created_at') : [],
    inv ? fetchAll('investor_stocks', 'created_at') : [],
    inv ? fetchAll('investor_returns', 'created_at') : [],
    inv ? fetchAll('stock_prices', 'price_date') : [],
    inv ? fetchAll('investor_money', 'paid_on') : [],
  ]);
  // a settlement line recalculated to 0 (loss later corrected) is kept in the database but hidden here
  S.data = { profiles, accounts, requests, settlements: settlements.filter((x) => Number(x.commission) > 0), pnl, ledger, bets, invStocks, invReturns, prices, invMoney };
  const me = profiles.find((p) => p.id === S.me.id);
  if (me) S.me = me;
}

let reloadTimer;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    try { await loadData(); renderView(); } catch (e) { console.error(e); }
  }, 350);
}
let channel;
function subscribeLive() {
  channel?.unsubscribe();
  channel = sb.channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, scheduleReload)
    .subscribe((status) => { S.live = status === 'SUBSCRIBED'; const d = $('.live-dot'); d?.classList.toggle('on', S.live); });
}

// ---------- auth ----------
function renderSetup() {
  $('#app').innerHTML = `
    <div class="login"><div class="card">
      <h1>Connect ID Ledger</h1>
      <p class="muted small" style="margin:0 0 16px">One-time setup. In Supabase open <b>Project Settings → API</b> and paste the two values.</p>
      <form id="setup-form">
        <div class="field"><label>Project URL</label><input name="url" placeholder="https://xxxx.supabase.co" inputmode="url" autocapitalize="none" required></div>
        <div class="field"><label>anon public key</label><textarea name="key" autocapitalize="none" required></textarea></div>
        <button class="btn primary block">Connect</button>
      </form>
    </div></div>`;
  $('#setup-form').onsubmit = (e) => {
    e.preventDefault(); const f = formObj(e.target);
    location.hash = `s=${encodeURIComponent(f.url.trim().replace(/\/$/, ''))}&k=${encodeURIComponent(f.key.trim())}`;
    location.reload();
  };
}
function renderLogin(msg = '') {
  if (!CONFIGURED) return renderSetup();
  const missing = false;
  $('#app').innerHTML = `
    <div class="login">
      <div class="card">
        <h1>ID Ledger</h1>
        <p class="muted small" style="margin:0 0 16px">Sign in with the username and password you were given.</p>
        ${missing ? `<p class="neg small">Setup needed: fill in <b>config.js</b> with your Supabase URL and key.</p>` : ''}
        <form id="login-form">
          <div class="field"><label for="lu">Username</label><input id="lu" name="username" autocomplete="username" autocapitalize="none" required></div>
          <div class="field"><label for="lp">Password</label><input id="lp" name="password" type="password" autocomplete="current-password" required></div>
          ${msg ? `<p class="neg small">${esc(msg)}</p>` : ''}
          <button class="btn primary block" type="submit">Sign in</button>
        </form>
      </div>
    </div>`;
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { username, password } = formObj(e.target);
    const u = username.trim().toLowerCase();
    const email = u.includes('@') ? u : `${u}@${CFG.LOGIN_DOMAIN || 'ledger.local'}`;
    await busy(e.submitter, async () => {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return renderLogin(error.message === 'Invalid login credentials' ? 'Wrong username or password' : error.message);
    });
  });
}

async function startSession(user) {
  const { data: me } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!me || !me.active) {
    await sb.auth.signOut();
    return renderLogin('This login is not active. Contact the owner.');
  }
  S.me = me;
  S.view = S.view || (isAdmin() ? 'dashboard' : isInvestor() ? 'investors' : 'ids');
  try { await loadData(); } catch (e) { fail(e); }
  if (!isAdmin()) {
    const { data } = await sb.rpc('owner_contact');
    S.owner = data?.[0] || null;
  }
  renderShell();
  subscribeLive();
}

let sessionUser; // undefined until the first auth event, so a logged-out start still shows the login
sb.auth.onAuthStateChange((event, session) => {
  const uid = session?.user?.id || null;
  if (uid === sessionUser) return;
  sessionUser = uid;
  if (uid) setTimeout(() => startSession(session.user), 0);
  else { channel?.unsubscribe(); S.me = null; S.view = null; renderLogin(); }
});

// ---------- shell ----------
function navItems() {
  const pend = S.data.requests.filter((r) => r.status === 'pending').length;
  if (isInvestor()) return [['investors', 'My stocks']];
  return isAdmin()
    ? [['dashboard', 'Dashboard'], ['ids', 'IDs'], ['requests', 'Requests', pend], ['pnl', 'Bets & P&L'], ['commission', 'Commission'], ['ledger', 'Ledger'], ['investors', 'Investors'], ['vendors', 'Vendors']]
    : [['ids', 'My IDs'], ['requests', 'Requests', pend], ['commission', 'Commission to pay']];
}
function renderShell() {
  $('#app').innerHTML = `
    <header class="topbar">
      <div class="topbar-row">
        <span class="brand">ID Ledger</span>
        <span class="live-dot ${S.live ? 'on' : ''}" title="Live updates"></span>
        <span class="spacer"></span>
        ${!isAdmin() && S.owner?.phone ? `<button class="btn sm wa" id="ask-owner">WhatsApp owner</button>` : ''}
        <span class="muted small who">${esc(S.me.name)}</span>
        <button class="btn sm" id="logout">Sign out</button>
      </div>
      <nav class="tabs" id="tabs"></nav>
    </header>
    <main id="view"></main>`;
  $('#logout').onclick = () => sb.auth.signOut();
  $('#ask-owner')?.addEventListener('click', () => openWA(S.owner.phone, `Hi ${S.owner.name}, `));
  $('#tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-view]'); if (!t) return;
    S.view = t.dataset.view; renderView(); window.scrollTo(0, 0);
  });
  renderView();
}
function renderTabs() {
  $('#tabs').innerHTML = navItems().map(([k, label, n]) =>
    `<button class="tab ${S.view === k ? 'active' : ''}" data-view="${k}">${label}${n ? `<span class="badge-count">${n}</span>` : ''}</button>`).join('');
}
function renderView() {
  if (!S.me || !$('#view')) return;
  renderTabs();
  const v = $('#view');
  const views = { dashboard: viewDashboard, ids: viewIds, requests: viewRequests, pnl: viewPnl, commission: viewCommission, ledger: viewLedger, investors: viewInvestors, vendors: viewVendors };
  const fn = isInvestor() ? viewInvestors : (views[S.view] || viewIds);
  // keep focus/scroll on live refresh
  const active = document.activeElement?.id; const pos = active ? document.activeElement.selectionStart : null;
  const typed = [...v.querySelectorAll('form[id] input[name]:not([type=file]):not([type=radio]):not([type=checkbox])')]
    .filter((i) => i.value !== i.defaultValue).map((i) => [i.form.id, i.name, i.value]);
  fn(v);
  typed.forEach(([f, n, val]) => { const i = document.getElementById(f)?.elements[n]; if (i && 'value' in i) i.value = val; });
  if (active && document.getElementById(active)) {
    const el = document.getElementById(active); el.focus();
    try { if (pos != null) el.setSelectionRange(pos, pos); } catch {}
  }
}

// ---------- numbers ----------
// Deposit request: amount = money you pay; credit_amount = balance added to the ID (amount ÷ (1 − commission %)).
const depCredit = (r) => r.kind === 'deposit' ? Number(r.credit_amount ?? r.amount) : Number(r.amount);
// Commission is taken upfront: for ₹1,00,000 credited at 10% you pay ₹90,000.
// credited = start balance + completed deposit requests into the ID.
function idCredit(a) {
  const pct = Number(a.upfront_pct ?? 10) / 100;   // upfront deduction, separate from the loss commission %
  // reset recharges replace lost balance (paid net of loss commission) – they are not balance bought at the upfront rate
  const deps = S.data.requests.filter((r) => r.kind === 'deposit' && r.status === 'completed' && r.to_account === a.id && !r.is_reset);
  const credited = Number(a.opening_balance || 0) + sum(deps, (r) => depCredit(r));
  const paid = Number(a.deposit || 0) + sum(deps, (r) => r.amount);
  const shouldPay = credited * (1 - pct);
  return { credited, shouldPay, paid, short: Math.round((shouldPay - paid) * 100) / 100, upfront: credited * pct, pct };
}
function vendorStats(vid) {
  const accs = S.data.accounts.filter((a) => a.vendor_id === vid);
  const ids = new Set(accs.map((a) => a.id));
  const pnl = S.data.pnl.filter((p) => ids.has(p.account_id));
  const day = settleDay();
  const all = S.data.ledger.filter((l) => l.vendor_id === vid);
  const led = all.filter((l) => (l.kind || 'payment') === 'payment');
  const dep = all.filter((l) => l.kind === 'deposit');
  // deposit = deposits written on each ID + any deposit entries in the ledger (given − returned)
  const act = accs.filter((a) => a.status === 'active'); const cr = act.map(idCredit);
  const deposit = sum(cr, (c) => c.paid)
    + sum(dep.filter((l) => l.direction === 'out'), (l) => l.amount) - sum(dep.filter((l) => l.direction === 'in'), (l) => l.amount);
  const shouldPay = sum(cr, (c) => c.shouldPay);
  const balance = sum(act, (a) => a.current_balance);
  return {
    deposit, shouldPay, credited: sum(cr, (c) => c.credited), upfront: sum(cr, (c) => c.upfront),
    overDeposit: Math.round((shouldPay - deposit) * 100) / 100,   // > 0 = you still owe the vendor (short)
    count: accs.filter((a) => a.status === 'active').length,
    balance,
    todayPnl: sum(pnl.filter((p) => p.settle_date === day), (p) => p.amount),
    totalPnl: sum(pnl, (p) => p.amount),
    commDue: sum(S.data.settlements.filter((s) => s.vendor_id === vid && s.status !== 'received'), (s) => s.commission),
    paid: sum(led.filter((l) => l.direction === 'out'), (l) => l.amount),
    received: sum(led.filter((l) => l.direction === 'in'), (l) => l.amount),
    pending: S.data.requests.filter((r) => r.vendor_id === vid && r.status === 'pending'),
  };
}
// Live (not yet settled) commission estimate for a settlement day
function commissionPreview(day) {
  const byAcc = {};
  S.data.pnl.filter((p) => p.settle_date === day).forEach((p) => { byAcc[p.account_id] = (byAcc[p.account_id] || 0) + Number(p.amount); });
  return Object.entries(byAcc).map(([id, net]) => {
    const a = acc(id); const pct = Number(a?.commission_pct || 0);
    return { account_id: id, vendor_id: a?.vendor_id, net, pct, commission: net < 0 ? Math.round(-net * pct) / 100 : 0 };
  });
}

// Withdrawal, or commission paid out by cash / bank / UPI (not credited into an ID)
const isPayout = (r) => r.kind === 'withdrawal' || (r.kind === 'commission' && !r.to_account);

// ---------- WhatsApp texts ----------
async function requestMessage(r) {
  const lines = [`*${KIND[r.kind]} request #${r.id}*`];
  if (r.kind === 'transfer') lines.push(`From ID: ${accName(acc(r.from_account))}`, `To ID: ${accName(acc(r.to_account))}`);
  if (r.kind === 'deposit') lines.push(`Deposit into ID: ${accName(acc(r.to_account))}`);
  if (r.kind === 'withdrawal') lines.push(`Withdraw from ID: ${accName(acc(r.from_account))}`);
  if (r.kind === 'commission') lines.push(r.to_account ? `Credit my commission into ID: ${accName(acc(r.to_account))}` : 'Pay my commission (withdrawal)');
  if (r.kind === 'deposit') lines.push(`Money paid: ${money(r.amount)}`, `Add to ID balance: *${money(depCredit(r))}*`);
  else lines.push(`Amount: ${money(r.amount)}`);
  if (r.method) lines.push(`Method: ${METHOD[r.method]}`);
  if (r.payee_name || r.payee_phone) lines.push(`${isPayout(r) ? 'Cash to be given to' : 'Person'}: ${[r.payee_name, r.payee_phone].filter(Boolean).join(' – ')}`);
  if (r.token_no) lines.push(`Token no: ${r.token_no}`);
  if (r.payee_details) lines.push(`Details: ${r.payee_details}`);
  else if (r.method && r.method !== 'cash') lines.push(`Ask me for the ${METHOD[r.method]} details before doing this.`);
  if (r.photo_path) { try { lines.push(`Photo: ${await photoUrl(r.photo_path, 7 * 86400)}`); } catch {} }
  if (r.note) lines.push(`Note: ${r.note}`);
  if (r.status === 'pending') lines.push('', `Please complete it and press *Accept* in the app: ${APP_URL}`);
  else lines.push('', `Status: ${r.status}`);
  return lines.join('\n');
}
function reminderMessage(vid) {
  const pend = S.data.requests.filter((r) => r.vendor_id === vid && r.status === 'pending').sort((a, b) => a.id - b.id);
  const v = prof(vid);
  if (!pend.length) return `Hi ${v?.name || ''}, `;
  return [`Hi ${v?.name || ''}, reminder – ${pend.length} pending request${pend.length > 1 ? 's' : ''}:`, '',
    ...pend.map((r) => `#${r.id} ${KIND[r.kind]} ${money(r.amount)} – ${r.kind === 'transfer' ? `${accName(acc(r.from_account))} → ${accName(acc(r.to_account))}` : accName(acc(r.from_account || r.to_account))}${r.method ? ` (${METHOD[r.method]})` : ''}`),
    '', `Please complete and accept in the app: ${APP_URL}`].join('\n');
}

// ============================================================
// DASHBOARD (owner only)
// ============================================================
function viewDashboard(v) {
  if (!isAdmin()) return viewIds(v);
  const day = settleDay();
  const active = S.data.accounts.filter((a) => a.status === 'active');
  const todayPnl = sum(S.data.pnl.filter((p) => p.settle_date === day), (p) => p.amount);
  const totalPnl = sum(S.data.pnl, (p) => p.amount);
  const commDue = sum(S.data.settlements.filter((s) => s.status !== 'received'), (s) => s.commission);
  const commToday = sum(commissionPreview(day), (c) => c.commission);
  const payments = S.data.ledger.filter((l) => (l.kind || 'payment') === 'payment');
  const paid = sum(payments.filter((l) => l.direction === 'out'), (l) => l.amount);
  const received = sum(payments.filter((l) => l.direction === 'in'), (l) => l.amount);
  const vs = vendors().map((p) => vendorStats(p.id));
  const depTotal = sum(vs, (x) => x.deposit); const overTotal = sum(vs.filter((x) => x.overDeposit > 0), (x) => x.overDeposit);
  const pending = S.data.requests.filter((r) => r.status === 'pending');

  v.innerHTML = `
    <div class="section kpis">
      ${kpi('Balance in IDs', money(sum(active, (a) => a.current_balance)), `${active.length} active IDs`)}
      ${kpi("Today's P&L", signed(todayPnl), `Settlement day ${fmtD(day)}`)}
      ${kpi('Total P&L', signed(totalPnl), 'All time')}
      ${kpi('Commission earned', money(sum(S.data.settlements, (s) => s.commission)), `To collect ${money(commDue)} · today ${money(commToday)}`)}
      ${kpi('Pending requests', pending.length, pending.length ? 'Waiting for vendors' : 'All clear')}
      ${kpi('Deposits with vendors', money(depTotal), 'Given − returned')}
      ${kpi('Short on deposits', overTotal > 0 ? `<span class="neg">${money(overTotal)}</span>` : money(0), overTotal > 0 ? 'You still owe vendors (after the upfront deduction)' : 'All IDs paid for')}
      ${kpi('Upfront commission', money(sum(vs, (x) => x.upfront)), 'Deducted at source on balance credited')}
      ${kpi('Paid to vendors', money(paid), 'Payment ledger')}
      ${kpi('Received from vendors', money(received), 'Payment ledger')}
      ${kpi('Ledger net', signed(received - paid), 'Received − paid')}
      ${investors().length ? kpi('Due to investors', money(sum(investors(), (p) => investorPosition(p.id).tot.due)), 'Shares owed × latest price') : ''}
    </div>
    <div class="section">
      <div class="section-head"><h2>Vendors</h2></div>
      ${vendors().length ? `<div class="table-wrap"><table>
        <thead><tr><th>Vendor</th><th class="r">IDs</th><th class="r">Balance</th><th class="r">Today P&L</th><th class="r">Total P&L</th><th class="r">Comm. due</th><th class="r">Deposit paid</th><th class="r">Short</th><th class="r">Paid</th><th class="r">Received</th><th class="r">Pending</th><th></th></tr></thead>
        <tbody>${vendors().map((p) => { const s = vendorStats(p.id); return `<tr>
          <td><b>${esc(p.name)}</b>${p.active ? '' : ' <span class="pill closed">off</span>'}</td>
          <td class="r">${s.count}</td><td class="r num">${money(s.balance)}</td>
          <td class="r">${signed(s.todayPnl)}</td><td class="r">${signed(s.totalPnl)}</td>
          <td class="r num">${money(s.commDue)}</td><td class="r num">${money(s.deposit)}</td>
          <td class="r">${s.overDeposit > 0 ? `<span class="neg num">${money(s.overDeposit)}</span>` : s.overDeposit < 0 ? `<span class="pos num">extra ${money(-s.overDeposit)}</span>` : '<span class="pos">✓</span>'}</td>
          <td class="r num">${money(s.paid)}</td><td class="r num">${money(s.received)}</td>
          <td class="r">${s.pending.length || ''}</td>
          <td><button class="btn sm wa" data-remind="${p.id}" ${p.phone ? '' : 'disabled title="Add phone in Vendors"'}>${s.pending.length ? 'Remind' : 'WhatsApp'}</button></td>
        </tr>`; }).join('')}</tbody></table></div>` : `<div class="empty">No vendors yet. Create one in <b>Vendors</b>.</div>`}
    </div>
    <div class="section">
      <div class="section-head"><h2>Pending requests</h2><button class="btn sm" id="dash-reset">↺ Reset all IDs to start</button><button class="btn sm primary" id="dash-new-req">+ New request</button></div>
      <div class="list" id="dash-pending">${pending.length ? pending.map(requestCard).join('') : '<div class="empty">No pending requests</div>'}</div>
    </div>`;
  v.querySelectorAll('[data-remind]').forEach((b) => b.onclick = () => openWA(prof(b.dataset.remind)?.phone, reminderMessage(b.dataset.remind)));
  $('#dash-new-req').onclick = () => requestForm();
  $('#dash-reset').onclick = () => resetForm();
  bindRequestCards($('#dash-pending'));
}
const kpi = (label, value, sub = '') => `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

// ============================================================
// IDs
// ============================================================
function viewIds(v) {
  v.innerHTML = `
    <div class="section-head"><h2>${isAdmin() ? 'IDs' : 'My IDs'}</h2>${isAdmin() ? '<button class="btn" id="reset-ids">↺ Reset all to start</button>' : ''}<button class="btn primary" id="add-id">+ Add ID</button></div>
    <div class="toolbar">
      <input id="id-search" type="search" placeholder="Search site / username" value="${esc(S.f.idSearch)}">
      ${isAdmin() ? `<select id="id-vendor"><option value="">All vendors</option>${vendors().map((p) => `<option value="${p.id}" ${S.f.idVendor === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
      <select id="id-status"><option value="active">Active</option><option value="closed">Closed</option><option value="">All</option></select>
    </div>
    <div id="id-summary" class="muted small" style="margin-bottom:10px"></div>
    <div class="grid" id="id-list"></div>`;
  $('#id-status').value = S.f.idStatus;
  $('#add-id').onclick = () => idForm();
  $('#reset-ids')?.addEventListener('click', () => resetForm(S.f.idVendor || null));
  $('#id-search').oninput = (e) => { S.f.idSearch = e.target.value; drawIdList(); };
  $('#id-vendor')?.addEventListener('change', (e) => { S.f.idVendor = e.target.value; drawIdList(); });
  $('#id-status').onchange = (e) => { S.f.idStatus = e.target.value; drawIdList(); };
  $('#id-list').addEventListener('click', onIdListClick);
  drawIdList();
}
function filteredIds() {
  const q = S.f.idSearch.trim().toLowerCase();
  return S.data.accounts.filter((a) =>
    (!S.f.idStatus || a.status === S.f.idStatus) &&
    (!S.f.idVendor || a.vendor_id === S.f.idVendor) &&
    (!q || `${a.site_name} ${a.username} ${vendorName(a.vendor_id)}`.toLowerCase().includes(q)));
}
function drawIdList() {
  const list = filteredIds();
  $('#id-summary').textContent = `${list.length} ID${list.length === 1 ? '' : 's'} · Total balance ${money(sum(list, (a) => a.current_balance))}`;
  const day = settleDay();
  $('#id-list').innerHTML = list.length ? list.map((a) => {
    const today = sum(S.data.pnl.filter((p) => p.account_id === a.id && p.settle_date === day), (p) => p.amount);
    const pend = S.data.requests.filter((r) => r.status === 'pending' && (r.from_account === a.id || r.to_account === a.id)).length;
    return `<div class="card stack" data-id="${a.id}">
      <div class="row between">
        <div><h3>${esc(accName(a))}</h3>${isAdmin() ? `<div class="muted small">${esc(vendorName(a.vendor_id))}</div>` : ''}</div>
        <span class="pill ${a.status}">${a.status}</span>
      </div>
      <div class="row between">
        <div><div class="muted small">Current balance</div><div class="big">${money(a.current_balance)}</div></div>
        <div style="text-align:right"><div class="muted small">Start ${money(a.opening_balance)}</div>
          ${isAdmin() ? (() => { const c = idCredit(a); return `<div class="small">Pay ${Math.round((1 - c.pct) * 100)}%: <b>${money(c.shouldPay)}</b> · Paid <b>${money(c.paid)}</b></div>
          <div class="small">${c.short > 0 ? `<span class="neg">Short ${money(c.short)}</span>` : c.short < 0 ? `<span class="pos">Paid extra ${money(-c.short)}</span>` : '<span class="pos">Fully paid</span>'} · Upfront comm. ${money(c.upfront)}</div>`; })() : ''}
          <div class="small">Commission <b>${Number(a.commission_pct)}%</b></div>
          ${isAdmin() && today ? `<div class="small">Today ${signed(today)}</div>` : ''}</div>
      </div>
      <dl class="kv">
        <dt>Username</dt><dd><span class="secret">${esc(a.username)}</span> <button class="icon-btn" data-act="copy-user" title="Copy">⧉</button></dd>
        <dt>Password</dt><dd><span class="secret" data-pw>••••••</span> <button class="icon-btn" data-act="show-pw" title="Show">👁</button><button class="icon-btn" data-act="copy-pw" title="Copy">⧉</button></dd>
        ${a.login_url ? `<dt>Login</dt><dd><a href="${esc(safeUrl(a.login_url))}" target="_blank" rel="noopener noreferrer">${esc(a.login_url)}</a></dd>` : ''}
        ${a.notes ? `<dt>Notes</dt><dd>${esc(a.notes)}</dd>` : ''}
      </dl>
      ${pend ? `<div class="small"><span class="pill pending">${pend} pending request${pend > 1 ? 's' : ''}</span></div>` : ''}
      <div class="row">
        <button class="btn sm" data-act="statement">Statement</button>
        <button class="btn sm" data-act="edit">Edit</button>
        ${isAdmin() ? `<button class="btn sm" data-act="bet">+ Bet</button><button class="btn sm" data-act="req">Request</button>` : ''}
      </div>
    </div>`;
  }).join('') : `<div class="empty" style="grid-column:1/-1">No IDs here yet.</div>`;
}
const safeUrl = (u) => /^https?:\/\//i.test(u) ? u : `https://${u}`;
function onIdListClick(e) {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const card = btn.closest('[data-id]'); const a = acc(card.dataset.id); if (!a) return;
  const act = btn.dataset.act;
  if (act === 'copy-user') copy(a.username, 'Username copied');
  if (act === 'copy-pw') copy(a.password || '', 'Password copied');
  if (act === 'show-pw') { const s = card.querySelector('[data-pw]'); s.textContent = s.textContent.startsWith('•') ? (a.password || '—') : '••••••'; }
  if (act === 'edit') idForm(a);
  if (act === 'statement') statement(a);
  if (act === 'bet') betForm({ account_id: a.id });
  if (act === 'req') requestForm({ vendor: a.vendor_id, from: a.id });
}

// P&L since the last reset = how far the ID is from where it started.
function resetPlan(vendorId = null) {
  const pendingReset = new Set(S.data.requests.filter((r) => r.is_reset && r.status === 'pending').map((r) => r.to_account || r.from_account));
  return S.data.accounts.filter((a) => a.status === 'active' && (!vendorId || a.vendor_id === vendorId)).map((a) => {
    const diff = Math.round(sum(S.data.pnl.filter((p) => p.account_id === a.id && (!a.last_reset_at || p.created_at > a.last_reset_at)), (p) => p.amount) * 100) / 100;
    const comm = diff < 0 ? Math.round(-diff * Number(a.commission_pct) ) / 100 : 0;
    return { a, diff, comm, start: Number(a.current_balance) - diff, pending: pendingReset.has(a.id) };
  });
}
function resetForm(vendorId = null) {
  const plan = resetPlan(vendorId);
  const todo = plan.filter((x) => x.diff !== 0 && !x.pending);
  const wd = sum(todo.filter((x) => x.diff > 0), (x) => x.diff);
  const rc = sum(todo.filter((x) => x.diff < 0), (x) => -x.diff);
  const comm = sum(todo, (x) => x.comm);
  const pay = rc - comm;
  openModal('Reset all IDs to start', `
    <p class="small muted">Every ID goes back to where it started. Profit is withdrawn, loss is recharged – you pay the loss minus your loss commission.</p>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th class="r">Now</th><th class="r">Start</th><th class="r">Action</th><th class="r">Commission</th></tr></thead><tbody>
      ${plan.map((x) => `<tr><td>${esc(accName(x.a))}</td><td class="r num">${money(x.a.current_balance)}</td><td class="r num">${money(x.start)}</td>
        <td class="r">${x.pending ? '<span class="pill pending">reset pending</span>' : x.diff > 0 ? `<span class="pos">Withdraw ${money(x.diff)}</span>` : x.diff < 0 ? `<span class="neg">Recharge ${money(-x.diff)}</span>` : '<span class="muted">at start</span>'}</td>
        <td class="r num">${x.comm && !x.pending ? money(x.comm) : ''}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="kpis" style="margin:12px 0">
      ${kpi('You receive (withdrawals)', money(wd))}
      ${kpi('You pay (recharges)', money(pay), `Loss ${money(rc)} − commission ${money(comm)}`)}
      ${kpi('Loss commission', `<span class="pos">${money(comm)}</span>`, 'Deducted from the recharges')}
      ${kpi('Net result', signed(wd - pay), 'Received − paid')}
    </div>
    ${todo.length ? `<button class="btn primary block" id="do-reset">Send ${todo.length} request${todo.length > 1 ? 's' : ''} to the vendor${vendorId ? '' : 's'}</button>
      <p class="muted small">The balances change when the vendor accepts each request.</p>` : '<div class="empty">All IDs are already at their start balance</div>'}`, (root) => {
    $('#do-reset', root)?.addEventListener('click', (e) => busy(e.target, async () => {
      const n = must(await sb.rpc('reset_to_start', { p_vendor: vendorId }));
      modal.close(); toast(`${n} reset request${n === 1 ? '' : 's'} sent`);
      await loadData(); renderView();
      const vids = [...new Set(todo.map((x) => x.a.vendor_id))].filter((v) => prof(v)?.phone);
      if (vids.length) openModal('Send on WhatsApp', vids.map((v) => `<a class="btn wa block" style="margin-bottom:8px" href="${esc(waUrl(prof(v).phone, reminderMessage(v)))}" target="_blank" rel="noopener">WhatsApp ${esc(vendorName(v))}</a>`).join(''));
    }));
  });
}
function idForm(a = null) {
  const admin = isAdmin();
  const vs = vendors().filter((p) => p.active || p.id === a?.vendor_id);
  if (admin && !vs.length) return toast('Create a vendor first (Vendors tab)', 'error');
  openModal(a ? 'Edit ID' : 'Add ID', `
    <form id="id-form">
      ${admin ? `<div class="field"><label>Vendor</label><select name="vendor_id" required>${vs.map((p) => `<option value="${p.id}" ${a?.vendor_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>` : ''}
      <div class="fields two">
        <div class="field"><label>Site / panel name</label><input name="site_name" value="${esc(a?.site_name)}" placeholder="e.g. SiteX"></div>
        <div class="field"><label>Login link</label><input name="login_url" value="${esc(a?.login_url)}" inputmode="url" placeholder="https://…"></div>
        <div class="field"><label>ID / username *</label><input name="username" value="${esc(a?.username)}" required autocapitalize="none"></div>
        <div class="field"><label>Password</label><input name="password" value="${esc(a?.password)}" autocapitalize="none"></div>
        ${!a || admin ? `<div class="field"><label>Start balance ₹</label><input name="opening_balance" type="number" step="0.01" inputmode="decimal" value="${esc(a?.opening_balance ?? '')}" required></div>` : ''}
        ${a && admin ? `<div class="field"><label>Current balance ₹ (correction)</label><input name="current_balance" type="number" step="0.01" inputmode="decimal" value="${esc(a.current_balance)}"></div>` : ''}
        ${admin ? `<div class="field"><label>Upfront deduction % (you pay the rest)</label><input name="upfront_pct" type="number" step="0.01" min="0" max="99" inputmode="decimal" value="${esc(a?.upfront_pct ?? 10)}"></div>` : ''}
        ${admin ? `<div class="field"><label>Deposit you paid ₹ <span data-dep-hint></span></label><input name="deposit" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(a?.deposit ?? 0)}"></div>` : ''}
        <div class="field"><label>Loss commission % (on daily loss)</label><input name="commission_pct" type="number" step="0.01" min="0" max="100" inputmode="decimal" value="${esc(a?.commission_pct ?? 10)}" required></div>
        ${a ? `<div class="field"><label>Status</label><select name="status"><option value="active">Active</option><option value="closed" ${a.status === 'closed' ? 'selected' : ''}>Closed</option></select></div>` : ''}
      </div>
      <div class="field"><label>Notes</label><textarea name="notes">${esc(a?.notes)}</textarea></div>
      ${a && !admin ? `<p class="muted small">Balance changes only through requests you accept.</p>` : ''}
      <button class="btn primary block" type="submit">${a ? 'Save' : 'Add ID'}</button>
      ${a && admin ? `<button class="btn danger block" type="button" id="del-id" style="margin-top:8px">Delete ID and its history</button>` : ''}
    </form>`, (root) => {
    const idf = $('#id-form', root); const ie = idf.elements;
    let depTouched = !!(a && Number(a.deposit));
    ie.deposit?.addEventListener('input', () => { depTouched = true; });
    const depSync = (e) => {
      if (!ie.deposit) return;
      const bal = Number(ie.opening_balance?.value || 0); const pct = Number(ie.upfront_pct?.value ?? 10);
      const pay = Math.round(bal * (100 - pct)) / 100;
      $('[data-dep-hint]', root).textContent = `(${100 - pct}% of start balance = ${money(pay)})`;
      if (!depTouched && e?.target !== ie.deposit) ie.deposit.value = bal ? pay : 0;
    };
    idf.addEventListener('input', depSync); depSync();
    $('#id-form', root).onsubmit = (e) => {
      e.preventDefault();
      const f = formObj(e.target);
      const row = {
        site_name: f.site_name.trim() || null, login_url: f.login_url.trim() || null, username: f.username.trim(),
        password: f.password || null, commission_pct: Number(f.commission_pct || 0), notes: f.notes.trim() || null,
      };
      if (f.status) row.status = f.status;
      if (admin) row.vendor_id = f.vendor_id;
      if ('opening_balance' in f) row.opening_balance = Number(f.opening_balance || 0);
      if ('deposit' in f) row.deposit = Number(f.deposit || 0);
      if ('upfront_pct' in f) row.upfront_pct = Number(f.upfront_pct || 0);
      if (a && admin && f.current_balance !== '' && Number(f.current_balance) !== Number(a.current_balance)) row.current_balance = Number(f.current_balance);
      busy(e.submitter, async () => {
        if (a) must(await sb.from('accounts').update(row).eq('id', a.id));
        else must(await sb.from('accounts').insert(row));
        modal.close(); toast(a ? 'Saved' : 'ID added'); scheduleReload();
      });
    };
    $('#del-id', root)?.addEventListener('click', (e) => {
      if (!confirm(`Delete ${accName(a)}? This also deletes its requests, P&L and commission records.`)) return;
      busy(e.target, async () => { must(await sb.from('accounts').delete().eq('id', a.id)); modal.close(); toast('Deleted'); scheduleReload(); });
    });
  });
}

function statement(a) {
  const rows = [];
  S.data.requests.filter((r) => r.from_account === a.id || r.to_account === a.id).forEach((r) => {
    const out = r.from_account === a.id;
    const other = r.kind === 'transfer' ? ` ${out ? '→' : '←'} ${accName(acc(out ? r.to_account : r.from_account))}` : '';
    rows.push({ t: r.responded_at || r.created_at, label: `#${r.id} ${KIND[r.kind]}${other}${r.method ? ` · ${METHOD[r.method]}` : ''}`,
      amt: r.status === 'completed' ? (out ? -r.amount : +depCredit(r)) : null, raw: out ? r.amount : depCredit(r), status: r.status,
      after: r.status === 'completed' ? (out ? r.from_balance_after : r.to_balance_after) : null });
  });
  if (isAdmin()) S.data.pnl.filter((p) => p.account_id === a.id).forEach((p) =>
    rows.push({ t: p.created_at, label: `P&L for ${fmtD(p.settle_date)}${p.note ? ` · ${p.note}` : ''}`, amt: Number(p.amount), status: 'pnl' }));
  rows.sort((x, y) => new Date(y.t) - new Date(x.t));
  openModal(`Statement · ${accName(a)}`, `
    <div class="row between" style="margin-bottom:12px">
      <div><div class="muted small">Current balance</div><div class="big">${money(a.current_balance)}</div></div>
      <div class="muted small" style="text-align:right">Start ${money(a.opening_balance)}<br>Added ${fmtDT(a.created_at)}</div>
    </div>
    ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Entry</th><th class="r">Amount</th><th class="r">Balance after</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${fmtDT(r.t)}</td><td>${esc(r.label)} ${r.status !== 'completed' && r.status !== 'pnl' ? `<span class="pill ${r.status}">${r.status}</span>` : ''}</td>
        <td class="r">${r.amt == null ? `<span class="muted num">${money(r.raw)}</span>` : signed(r.amt)}</td><td class="r num">${r.after != null ? money(r.after) : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">No entries yet</div>'}`);
}

// ============================================================
// REQUESTS (transfer / deposit / withdrawal)
// ============================================================
function viewRequests(v) {
  const tabs = [['pending', 'Pending'], ['completed', 'Completed'], ['all', 'All']];
  v.innerHTML = `
    <div class="section-head"><h2>Requests</h2>${isAdmin() ? '<button class="btn primary" id="new-req">+ New request</button>' : ''}</div>
    <div class="toolbar">
      <div class="seg" id="req-tabs">${tabs.map(([k, l]) => `<label><input type="radio" name="rt" value="${k}" ${S.f.reqTab === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      ${isAdmin() ? `<select id="req-vendor"><option value="">All vendors</option>${vendors().map((p) => `<option value="${p.id}" ${S.f.reqVendor === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
    </div>
    <div class="list" id="req-list"></div>`;
  $('#new-req')?.addEventListener('click', () => requestForm());
  $('#req-tabs').onchange = (e) => { S.f.reqTab = e.target.value; drawReqs(); };
  $('#req-vendor')?.addEventListener('change', (e) => { S.f.reqVendor = e.target.value; drawReqs(); });
  bindRequestCards($('#req-list'));
  drawReqs();
}
function drawReqs() {
  const list = S.data.requests.filter((r) =>
    (S.f.reqTab === 'all' || (S.f.reqTab === 'pending' ? r.status === 'pending' : r.status === 'completed')) &&
    (!S.f.reqVendor || r.vendor_id === S.f.reqVendor));
  $('#req-list').innerHTML = list.length ? list.slice(0, 300).map(requestCard).join('') : '<div class="empty">Nothing here</div>';
}
function requestCard(r) {
  const admin = isAdmin();
  const vendorPhone = prof(r.vendor_id)?.phone;
  const needsDetails = r.method && r.method !== 'cash' && !r.payee_details;
  return `<div class="item" data-req="${r.id}">
    <div class="row between">
      <div class="row"><span class="pill kind">${KIND[r.kind]}</span><b>#${r.id}</b><span class="big" style="font-size:1.1rem">${money(r.kind === 'deposit' ? depCredit(r) : r.amount)}</span>${r.kind === 'deposit' ? `<span class="muted small">paid ${money(r.amount)}</span>` : ''}</div>
      <span class="pill ${r.status}">${r.status}</span>
    </div>
    <dl class="kv" style="margin-top:8px">
      ${admin ? `<dt>Vendor</dt><dd>${esc(vendorName(r.vendor_id))}</dd>` : ''}
      ${r.from_account ? `<dt>From ID</dt><dd>${esc(accName(acc(r.from_account)))}${r.from_balance_after != null ? ` <span class="muted small">→ ${money(r.from_balance_after)}</span>` : ''}</dd>` : ''}
      ${r.kind === 'commission' && !r.to_account ? `<dt>Pay as</dt><dd>Withdrawal (not from an ID)</dd>` : ''}
      ${r.to_account ? `<dt>${r.kind === 'commission' ? 'Credit to ID' : 'To ID'}</dt><dd>${esc(accName(acc(r.to_account)))}${r.to_balance_after != null ? ` <span class="muted small">→ ${money(r.to_balance_after)}</span>` : ''}</dd>` : ''}
      ${r.method ? `<dt>Method</dt><dd>${METHOD[r.method]}</dd>` : ''}
      ${r.payee_name || r.payee_phone ? `<dt>${isPayout(r) ? 'Cash to' : 'Person'}</dt><dd>${esc(r.payee_name)} ${r.payee_phone ? `<a href="tel:${esc(r.payee_phone)}">${esc(r.payee_phone)}</a>` : ''}</dd>` : ''}
      ${r.token_no ? `<dt>Token</dt><dd><b>${esc(r.token_no)}</b></dd>` : ''}
      ${r.payee_details ? `<dt>Details</dt><dd style="white-space:pre-line">${esc(r.payee_details)}</dd>` : ''}
      ${needsDetails ? `<dt>Details</dt><dd class="neg">${admin ? 'Not given – vendor will ask you' : 'Ask the owner for details'}</dd>` : ''}
      ${r.note ? `<dt>Note</dt><dd>${esc(r.note)}</dd>` : ''}
      <dt>Asked</dt><dd>${fmtDT(r.created_at)}</dd>
      ${r.responded_at ? `<dt>${r.status === 'completed' ? 'Done' : r.status}</dt><dd>${fmtDT(r.responded_at)}${r.response_note ? ` · ${esc(r.response_note)}` : ''}</dd>` : ''}
    </dl>
    <div class="actions">
      ${r.photo_path ? `<button class="btn sm" data-ract="photo">📷 Token photo</button>` : ''}
      ${r.proof_path ? `<button class="btn sm" data-ract="proof">📷 Proof</button>` : ''}
      ${r.status === 'pending' ? (admin
        ? `<button class="btn sm wa" data-ract="wa" ${vendorPhone ? '' : 'disabled title="Add vendor phone"'}>WhatsApp vendor</button>
           <button class="btn sm" data-ract="accept">Mark done</button><button class="btn sm danger" data-ract="cancel">Cancel</button>`
        : `<button class="btn sm good" data-ract="accept">Accept (done)</button><button class="btn sm danger" data-ract="reject">Reject</button>
           ${S.owner?.phone ? `<button class="btn sm wa" data-ract="ask">${needsDetails ? 'Ask details' : 'Ask owner'}</button>` : ''}`)
        : (admin && vendorPhone ? `<button class="btn sm wa" data-ract="wa">WhatsApp</button>` : '')}
    </div>
  </div>`;
}
function bindRequestCards(root) {
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ract]'); if (!b) return;
    const r = S.data.requests.find((x) => x.id === Number(b.closest('[data-req]').dataset.req)); if (!r) return;
    const act = b.dataset.ract;
    if (act === 'photo') showPhoto(r.photo_path);
    if (act === 'proof') showPhoto(r.proof_path);
    if (act === 'wa') busy(b, () => openWAAsync(prof(r.vendor_id)?.phone, requestMessage(r)));
    if (act === 'ask') openWA(S.owner.phone, `Hi ${S.owner.name}, about request #${r.id} (${KIND[r.kind]} ${money(r.amount)}${r.method ? `, ${METHOD[r.method]}` : ''}): ${r.method && r.method !== 'cash' && !r.payee_details ? `please send the ${METHOD[r.method]} details.` : ''}`);
    if (act === 'cancel' && confirm(`Cancel request #${r.id}?`)) busy(b, async () => { must(await sb.rpc('cancel_request', { p_id: r.id })); toast('Cancelled'); scheduleReload(); });
    if (act === 'accept' || act === 'reject') respondForm(r, act === 'accept');
  });
}
function respondForm(r, accept) {
  openModal(`${accept ? 'Complete' : 'Reject'} request #${r.id}`, `
    <form id="resp-form">
      <p>${KIND[r.kind]} of <b>${money(r.kind === 'deposit' ? depCredit(r) : r.amount)}</b>${r.kind === 'transfer' ? ` from ${esc(accName(acc(r.from_account)))} to ${esc(accName(acc(r.to_account)))}`
        : r.kind === 'commission' && !r.to_account ? ' paid out (cash / bank / UPI)'
        : ` ${r.kind === 'withdrawal' ? 'from' : 'into'} ${esc(accName(acc(r.from_account || r.to_account)))}`}.</p>
      ${accept ? `<p class="muted small">${r.from_account || r.to_account ? `The ID balance${r.kind === 'transfer' ? 's' : ''} will update immediately.` : 'No ID balance changes.'}</p>
        <div class="field"><label>Proof photo / screenshot (optional)</label><input type="file" name="proof" accept="image/*"></div>` : ''}
      <div class="field"><label>Note (optional)</label><input name="note" placeholder="${accept ? 'e.g. done, UTR no.' : 'Reason'}"></div>
      <button class="btn ${accept ? 'good' : 'danger'} block" type="submit">${accept ? 'Confirm – done' : 'Reject request'}</button>
    </form>`, (root) => {
    $('#resp-form', root).onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      busy(e.submitter, async () => {
        const proof = accept ? await uploadPhoto(fd.get('proof'), r.vendor_id) : null;
        must(await sb.rpc('respond_request', { p_id: r.id, p_accept: accept, p_note: fd.get('note') || null, p_proof: proof }));
        modal.close(); toast(accept ? 'Done – balances updated' : 'Rejected'); scheduleReload();
      });
    };
  });
}

function accountOptions(vendorId, selected) {
  const list = S.data.accounts.filter((a) => a.status === 'active' && (!vendorId || a.vendor_id === vendorId));
  return `<option value="">Choose ID…</option>` + list.map((a) =>
    `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(accName(a))} · ${money(a.current_balance)}${vendorId ? '' : ` (${esc(vendorName(a.vendor_id))})`}</option>`).join('');
}
async function afterRequestCreated(id, sendWa = true) {
  await loadData(); renderView();
  const r = S.data.requests.find((x) => x.id === id);
  if (!sendWa || !r) return;
  const phone = prof(r.vendor_id)?.phone;
  if (!phone) return toast('Vendor has no phone number – add it in Vendors', 'error');
  const text = await requestMessage(r);
  openModal('Send on WhatsApp', `<p>Request #${id} is ready to send to ${esc(vendorName(r.vendor_id))}.</p><a class="btn wa block" href="${esc(waUrl(phone, text))}" target="_blank" rel="noopener">Open WhatsApp</a>`);
}
function requestForm(pre = {}) {
  if (!vendors().length) return toast('Create a vendor first', 'error');
  const vid = pre.vendor || vendors()[0].id;
  openModal('New request', `
    <form id="req-form">
      <div class="field"><div class="seg" id="rk">${Object.entries(KIND).filter(([k]) => k !== 'commission').map(([k, l], i) => `<label><input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      <div class="field"><label>Vendor</label><select name="vendor">${vendors().map((p) => `<option value="${p.id}" ${p.id === vid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field" data-show="transfer withdrawal"><label>From ID</label><select name="from">${accountOptions(vid, pre.from)}</select></div>
      <div class="field" data-show="transfer deposit"><label>To ID</label><select name="to">${accountOptions(vid, pre.to)}</select></div>
      <div class="field"><label>Amount ₹ <span class="muted" data-show="deposit">(money you pay)</span></label><input name="amount" type="number" step="0.01" min="0.01" inputmode="decimal" required>
        <div class="muted small" data-show="deposit" id="req-pay-hint" style="margin-top:4px"></div></div>
      <div class="field" data-show="deposit withdrawal"><label>Method</label>
        <select name="method">${Object.entries(METHOD).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
      <div data-show="cash">
        <div class="fields two">
          <div class="field"><label data-lbl-person>Person name</label><input name="payee_name"></div>
          <div class="field"><label>Person phone</label><input name="payee_phone" type="tel" inputmode="tel"></div>
        </div>
        <div class="field"><label>Token number</label><input name="token_no"></div>
        <div class="field"><label>Token / slip photo</label><input name="photo" type="file" accept="image/*"></div>
      </div>
      <div class="field" data-show="bank"><label>Bank / UPI details</label>
        <textarea name="payee_details" placeholder="Name, A/c no, IFSC or UPI id. Leave empty if the vendor should ask you."></textarea></div>
      <div class="field"><label>Note / instruction</label><input name="note"></div>
      <label class="row" style="font-weight:500;color:var(--text)"><input type="checkbox" name="send_wa" checked style="width:auto;min-height:0"> Open WhatsApp to send it to the vendor</label>
      <button class="btn primary block" type="submit" style="margin-top:12px">Create request</button>
    </form>`, (root) => {
    const form = $('#req-form', root);
    const sync = () => {
      const el = form.elements; const kind = el.kind.value; const method = el.method.value;
      const showMethod = kind !== 'transfer';
      root.querySelectorAll('[data-show]').forEach((el) => {
        const keys = el.dataset.show.split(' ');
        let show = keys.includes(kind);
        if (keys.includes('cash')) show = showMethod && method === 'cash';
        if (keys.includes('bank')) show = showMethod && method !== 'cash';
        el.classList.toggle('hidden', !show);
      });
      $('[data-lbl-person]', root).textContent = kind === 'withdrawal' ? 'Cash to be given to (name)' : 'Person bringing cash (name)';
      const ta = acc(form.elements.to.value); const amt = Number(form.elements.amount.value || 0);
      if (kind === 'deposit') { const pct = Number(ta?.upfront_pct ?? 10);
        const credit = Math.round(amt / (1 - pct / 100) * 100) / 100;
        $('#req-pay-hint', root).textContent = amt ? `ID gets ${money(credit)} – your upfront commission ${money(credit - amt)} (${pct}%)` : `The ID gets your payment + ${pct}% commission (pay 90k → 1 lakh)`; }
    };
    form.addEventListener('input', sync);
    form.addEventListener('change', (e) => {
      if (e.target.name === 'vendor') { const el = form.elements; el.from.innerHTML = accountOptions(el.vendor.value); el.to.innerHTML = accountOptions(el.vendor.value); }
      sync();
    });
    sync();
    form.onsubmit = (e) => {
      e.preventDefault();
      const f = formObj(form); const kind = f.kind;
      const cash = kind !== 'transfer' && f.method === 'cash';
      busy(e.submitter, async () => {
        const extra = kind === 'transfer' ? {} : {
          method: f.method,
          ...(cash ? { payee_name: f.payee_name, payee_phone: f.payee_phone, token_no: f.token_no } : { payee_details: f.payee_details }),
        };
        if (cash) extra.photo_path = await uploadPhoto(form.elements.photo.files[0], f.vendor);
        const id = must(await sb.rpc('create_request', {
          p_kind: kind, p_from: kind === 'deposit' ? null : f.from || null, p_to: kind === 'withdrawal' ? null : f.to || null,
          p_amount: Number(f.amount), p_note: f.note || null, p_extra: extra,
        }));
        modal.close(); toast(`Request #${id} created`);
        await afterRequestCreated(id, f.send_wa);
      });
    };
  });
}

// ============================================================
// P&L (owner only) — daily sheet
// ============================================================
function viewPnl(v) {
  if (!isAdmin()) return viewIds(v);
  const day = S.f.pnlDate || settleDay();
  const ids = S.data.accounts.filter((a) => a.status === 'active' || S.data.pnl.some((p) => p.account_id === a.id && p.settle_date === day))
    .sort((a, b) => vendorName(a.vendor_id).localeCompare(vendorName(b.vendor_id)) || accName(a).localeCompare(accName(b)));
  const dayEntries = S.data.pnl.filter((p) => p.settle_date === day);
  const net = (id) => sum(dayEntries.filter((p) => p.account_id === id), (p) => p.amount);
  const total = sum(dayEntries, (p) => p.amount);
  const comm = sum(commissionPreview(day), (c) => c.commission);
  v.innerHTML = `
    <div class="section-head"><h2>Bets & P&L</h2><button class="btn primary" id="new-bet">+ New bet</button></div>
    <div class="toolbar">
      <div><label for="pnl-date">Settlement day (11 AM → 11 AM)</label><input type="date" id="pnl-date" value="${day}"></div>
    </div>
    <div class="kpis section">
      ${kpi('Day P&L', signed(total), fmtD(day))}
      ${kpi('Commission on losses', money(comm), day === settleDay() ? 'Running – settles at 11 AM' : '')}
    </div>
    ${betsSection(day)}
    <div class="section-head" style="margin-top:20px"><h2>Quick P&L</h2></div>
    <p class="muted small">No bet details? Type a number for each ID: <b>positive = profit</b>, <b>negative = loss</b> (e.g. −2000). Saving adds it to that day and updates the ID balance. You can add more than once a day.</p>
    ${ids.length ? `<form id="pnl-form"><div class="table-wrap"><table>
      <thead><tr><th>ID</th><th class="r">Day so far</th><th class="r">Add ±</th></tr></thead>
      <tbody>${ids.map((a) => `<tr><td style="white-space:normal"><b>${esc(accName(a))}</b><div class="muted small">${esc(vendorName(a.vendor_id))} · ${money(a.current_balance)}</div></td>
        <td class="r">${signed(net(a.id))}</td><td class="r"><input class="pnl-input" name="${a.id}" type="text" inputmode="text" placeholder="±0" aria-label="P&L for ${esc(accName(a))}"></td></tr>`).join('')}</tbody>
    </table></div>
    <div class="field" style="margin-top:12px"><label>Note (optional, applies to all rows)</label><input name="__note"></div>
    <button class="btn primary block" type="submit">Save P&L</button></form>` : '<div class="empty">No IDs yet</div>'}
    <div class="section" style="margin-top:20px">
      <div class="section-head"><h2>Entries on ${fmtD(day)}</h2></div>
      <div class="list">${dayEntries.length ? dayEntries.map((p) => `<div class="item row between">
        <div><b>${esc(accName(acc(p.account_id)))}</b> <span class="muted small">${esc(vendorName(acc(p.account_id)?.vendor_id))} · ${fmtDT(p.created_at)}${p.note ? ` · ${esc(p.note)}` : ''}</span></div>
        <div class="row">${signed(Number(p.amount))}${p.bet_id ? '<span class="pill kind">bet</span>' : `<button class="icon-btn" data-del-pnl="${p.id}" title="Delete">🗑</button>`}</div></div>`).join('') : '<div class="empty">No entries for this day</div>'}</div>
    </div>`;
  $('#pnl-date').onchange = (e) => { S.f.pnlDate = e.target.value || null; renderView(); };
  $('#new-bet').onclick = () => betForm({ settle_date: day });
  bindBets(v);
  $('#pnl-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formObj(e.target);
    const rows = []; const bad = [];
    for (const [k, val] of Object.entries(f)) {
      if (k === '__note' || !String(val).trim()) continue;
      const n = Number(String(val).replace(/[,\s₹]/g, '').replace('−', '-'));
      if (!Number.isFinite(n)) bad.push(accName(acc(k)));
      else if (n !== 0) rows.push({ account_id: k, settle_date: day, amount: n, note: f.__note || null });
    }
    if (bad.length) return toast(`Not a number: ${bad.join(', ')}`, 'error');
    if (!rows.length) return toast('Enter at least one amount', 'error');
    busy(e.submitter, async () => { must(await sb.from('pnl_entries').insert(rows)); e.target.reset(); toast(`Saved ${rows.length} entr${rows.length > 1 ? 'ies' : 'y'}`); scheduleReload(); });
  });
  v.querySelectorAll('[data-del-pnl]').forEach((b) => b.onclick = () => {
    if (!confirm('Delete this P&L entry? The ID balance will be reversed.')) return;
    busy(b, async () => { must(await sb.from('pnl_entries').delete().eq('id', b.dataset.delPnl)); toast('Deleted'); scheduleReload(); });
  });
}
// Back: won = stake × (odds − 1), lost = −stake.  Lay: won = +stake, lost = −stake × (odds − 1).
function betPnl(side, stake, odds, result) {
  stake = Number(stake) || 0; odds = Number(odds) || 0;
  const r2 = (n) => Math.round(n * 100) / 100;
  if (result === 'won') return side === 'lay' ? stake : r2(stake * (odds - 1));
  if (result === 'lost') return side === 'lay' ? -r2(stake * (odds - 1)) : -stake;
  return 0;
}
const betLabel = (b) => [b.event, b.market, b.selection].filter(Boolean).join(' · ') || 'Bet';
function betItem(b) {
  return `<div class="item" data-bet="${b.id}">
    <div class="row between">
      <div><b>${esc(betLabel(b))}</b><div class="muted small">${esc(accName(acc(b.account_id)))} · ${esc(vendorName(acc(b.account_id)?.vendor_id))} · ${fmtD(b.settle_date)}</div></div>
      <span class="pill ${b.result === 'open' ? 'pending' : b.result === 'won' ? 'completed' : b.result === 'lost' ? 'rejected' : ''}">${b.result}</span>
    </div>
    <div class="row between" style="margin-top:6px">
      <span class="small"><span class="pill kind">${b.side.toUpperCase()}</span> ${money(b.stake)} @ <b>${Number(b.odds)}</b></span>
      ${b.result === 'open' ? `<span class="muted small">If ${esc(b.selection || 'it')} wins ${signed(betPnl(b.side, b.stake, b.odds, b.side === 'lay' ? 'lost' : 'won'))} · loses ${signed(betPnl(b.side, b.stake, b.odds, b.side === 'lay' ? 'won' : 'lost'))}</span>` : signed(Number(b.pnl))}
    </div>
    <div class="actions">
      ${b.result === 'open' ? `<button class="btn sm good" data-bact="won">Bet won</button><button class="btn sm danger" data-bact="lost">Bet lost</button><button class="btn sm" data-bact="void">Void</button>` : ''}
      <button class="btn sm" data-bact="edit">Edit</button>
    </div>
  </div>`;
}
// For each match + selection: total P&L if it wins / loses, plus the loss commission earned from losing IDs.
function positionSection(open) {
  const groups = {};
  open.forEach((b) => { const k = `${(b.event || '').trim().toLowerCase()}|${(b.selection || '').trim().toLowerCase()}`;
    (groups[k] ||= { event: b.event || '(no event)', selection: b.selection || '(no selection)', bets: [] }).bets.push(b); });
  const list = Object.values(groups);
  if (!list.length) return '';
  return `<div class="section"><div class="section-head"><h2>Position by match</h2></div>
    <p class="muted small">If the selection wins / loses: total P&L of all open bets, plus the loss commission (each ID's loss × its loss commission %) you earn back.</p>
    ${list.map((g) => {
      const ids = {};
      g.bets.forEach((b) => { const r = (ids[b.account_id] ||= { win: 0, lose: 0 });
        // selection wins: a back bet is won, a lay bet is lost (and the other way round)
        r.win += betPnl(b.side, b.stake, b.odds, b.side === 'lay' ? 'lost' : 'won');
        r.lose += betPnl(b.side, b.stake, b.odds, b.side === 'lay' ? 'won' : 'lost'); });
      const rows = Object.entries(ids).map(([id, r]) => { const a = acc(id); const pct = Number(a?.commission_pct || 0) / 100;
        return { a, ...r, cWin: r.win < 0 ? -r.win * pct : 0, cLose: r.lose < 0 ? -r.lose * pct : 0 }; });
      const T = (k) => sum(rows, (r) => r[k]);
      return `<div class="table-wrap" style="margin-bottom:12px"><table>
        <thead><tr><th>${esc(g.event)} – <b>${esc(g.selection)}</b></th><th class="r">If it wins</th><th class="r">If it loses</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${esc(accName(r.a))} <span class="muted small">${Number(r.a?.commission_pct || 0)}%</span></td><td class="r">${signed(r.win)}</td><td class="r">${signed(r.lose)}</td></tr>`).join('')}</tbody>
        <tfoot>
          <tr><td>Bets total</td><td class="r">${signed(T('win'))}</td><td class="r">${signed(T('lose'))}</td></tr>
          <tr><td>+ Loss commission</td><td class="r">${signed(T('cWin'))}</td><td class="r">${signed(T('cLose'))}</td></tr>
          <tr><td><b>Net result</b></td><td class="r"><b>${signed(T('win') + T('cWin'))}</b></td><td class="r"><b>${signed(T('lose') + T('cLose'))}</b></td></tr>
        </tfoot></table></div>`; }).join('')}
  </div>`;
}
function betsSection(day) {
  const open = S.data.bets.filter((b) => b.result === 'open');
  const settled = S.data.bets.filter((b) => b.result !== 'open' && b.settle_date === day);
  return `${positionSection(open)}<div class="section"><div class="section-head"><h2>Open bets (${open.length})</h2></div>
      <div class="list">${open.length ? open.map(betItem).join('') : '<div class="empty">No open bets</div>'}</div></div>
    <div class="section"><div class="section-head"><h2>Settled bets on ${fmtD(day)}</h2><span class="muted small">${signed(sum(settled, (b) => b.pnl))}</span></div>
      <div class="list">${settled.length ? settled.map(betItem).join('') : '<div class="empty">No settled bets this day</div>'}</div></div>`;
}
function bindBets(root) {
  root.querySelectorAll('[data-bact]').forEach((btn) => btn.onclick = () => {
    const b = S.data.bets.find((x) => x.id === Number(btn.closest('[data-bet]').dataset.bet)); if (!b) return;
    if (btn.dataset.bact === 'edit') return betForm(b);
    busy(btn, async () => {
      must(await sb.from('bets').update({ result: btn.dataset.bact }).eq('id', b.id));
      const p = betPnl(b.side, b.stake, b.odds, btn.dataset.bact);
      toast(`Bet ${btn.dataset.bact}: ${p > 0 ? '+' : ''}${money(p)}`); scheduleReload();
    });
  });
}
function betForm(b = {}) {
  const ids = S.data.accounts.filter((a) => a.status === 'active' || a.id === b.account_id);
  if (!ids.length) return toast('Add an ID first', 'error');
  const seg = (name, opts, cur) => `<div class="seg">${opts.map(([k, l]) => `<label><input type="radio" name="${name}" value="${k}" ${k === cur ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
  openModal(b.id ? `Edit bet #${b.id}` : 'New bet', `
    <form id="bet-form">
      <div class="field"><label>ID</label><select name="account_id" required>${ids.map((a) => `<option value="${a.id}" ${a.id === b.account_id ? 'selected' : ''}>${esc(accName(a))} (${esc(vendorName(a.vendor_id))})</option>`).join('')}</select></div>
      <div class="fields two">
        <div class="field"><label>Event / match</label><input name="event" value="${esc(b.event)}" placeholder="e.g. IND v AUS"></div>
        <div class="field"><label>Market</label><input name="market" value="${esc(b.market)}" placeholder="e.g. Match odds"></div>
      </div>
      <div class="field"><label>Selection</label><input name="selection" value="${esc(b.selection)}" placeholder="e.g. India"></div>
      <div class="field"><label>Type</label>${seg('side', [['back', 'Back (for)'], ['lay', 'Lay (against)']], b.side || 'back')}</div>
      <div class="fields two">
        <div class="field"><label>Stake ₹</label><input name="stake" type="number" step="0.01" min="0.01" inputmode="decimal" value="${esc(b.stake ?? '')}" required></div>
        <div class="field"><label>Odds (decimal)</label><input name="odds" type="number" step="0.001" min="1.001" inputmode="decimal" value="${esc(b.odds ?? '')}" placeholder="e.g. 1.90" required></div>
      </div>
      <div class="field"><label>Result</label>${seg('result', [['open', 'Open'], ['won', 'Won'], ['lost', 'Lost'], ['void', 'Void']], b.result || 'open')}</div>
      <div class="card small" id="bet-preview" style="margin-bottom:12px"></div>
      <div class="fields two">
        <div class="field"><label>Settlement day</label><input name="settle_date" type="date" value="${esc(b.settle_date || settleDay())}" required></div>
        <div class="field"><label>Note</label><input name="note" value="${esc(b.note)}"></div>
      </div>
      <button class="btn primary block" type="submit">${b.id ? 'Save' : 'Add bet'}</button>
      ${b.id ? '<button class="btn danger block" type="button" id="del-bet" style="margin-top:8px">Delete bet</button>' : ''}
    </form>`, (root) => {
    const form = $('#bet-form', root);
    const preview = () => {
      const f = formObj(form);
      const w = betPnl(f.side, f.stake, f.odds, 'won'); const l = betPnl(f.side, f.stake, f.odds, 'lost');
      $('#bet-preview', root).innerHTML = f.result === 'open'
        ? `If it wins: ${signed(w)} &nbsp;·&nbsp; If it loses: ${signed(l)}<br><span class="muted">Balance changes only when you set the result.</span>`
        : `P&L for this bet: ${signed(betPnl(f.side, f.stake, f.odds, f.result))}`;
    };
    form.addEventListener('input', preview); form.addEventListener('change', preview); preview();
    form.onsubmit = (e) => {
      e.preventDefault(); const f = formObj(form);
      const row = { account_id: f.account_id, event: f.event.trim() || null, market: f.market.trim() || null, selection: f.selection.trim() || null,
        side: f.side, stake: Number(f.stake), odds: Number(f.odds), result: f.result, settle_date: f.settle_date, note: f.note.trim() || null };
      busy(e.submitter, async () => {
        if (b.id) must(await sb.from('bets').update(row).eq('id', b.id));
        else must(await sb.from('bets').insert(row));
        modal.close(); toast(b.id ? 'Bet saved' : 'Bet added'); scheduleReload();
      });
    };
    $('#del-bet', root)?.addEventListener('click', (e) => {
      if (!confirm('Delete this bet? Its P&L will be reversed.')) return;
      busy(e.target, async () => { must(await sb.from('bets').delete().eq('id', b.id)); modal.close(); toast('Bet deleted'); scheduleReload(); });
    });
  });
}

// ============================================================
// COMMISSION
// ============================================================
function viewCommission(v) {
  const admin = isAdmin();
  const cur = settleDay();
  const sets = S.data.settlements;
  const due = sets.filter((s) => s.status !== 'received');
  const byDate = {};
  sets.forEach((s) => (byDate[s.settle_date] ||= []).push(s));
  const dates = Object.keys(byDate).sort().reverse();
  const preview = admin && !byDate[cur] ? commissionPreview(cur).filter((c) => c.commission > 0) : [];
  const comDate = S.f.comDate || addDays(cur, -1);

  v.innerHTML = `
    <div class="section-head"><h2>Commission</h2></div>
    <p class="muted small">${admin ? '' : '<b>Commission is paid to the owner.</b> '}Commission = each ID's net loss for the day × that ID's commission % (default 10%). Profit days give no commission. The day runs 11:00 AM → 11:00 AM and settles at 11:00 AM.${admin ? ' Collect it by <b>crediting it into the ID</b> or as a <b>withdrawal</b> (cash / bank / UPI) – the vendor accepts it like any request.' : ''}</p>
    ${commissionSummary(sets)}
    ${admin ? `<div class="card section">
      <h3 style="margin-bottom:8px">Settle a day</h3>
      <div class="row"><input type="date" id="com-date" value="${comDate}" style="flex:1 1 160px;width:auto"><button class="btn primary" id="run-settle">Run settlement</button></div>
      <p class="muted small" style="margin:8px 0 0">Runs automatically at 11:00 AM. Running again re-calculates rows that are still due.</p>
    </div>
    ${preview.length ? `<div class="section"><div class="section-head"><h2>Running today (${fmtD(cur)})</h2></div>${commTable(preview.map((c) => ({ ...c, net_pnl: c.net, commission_pct: c.pct, status: 'running' })), false)}</div>` : ''}` : ''}
    ${dates.length ? dates.map((d) => `<div class="section"><div class="section-head"><h2>${fmtD(d)}</h2>
        <span class="muted small">Total ${money(sum(byDate[d], (s) => s.commission))}</span>
        ${admin && byDate[d].some((s) => s.status === 'due') ? `<button class="btn sm" data-credit-all="${d}">Credit all due to IDs</button>` : ''}</div>${commTable(byDate[d], admin)}</div>`).join('')
      : '<div class="empty">No settled commission yet</div>'}`;
  if (admin) {
    $('#com-date').onchange = (e) => { S.f.comDate = e.target.value; };
    $('#run-settle').onclick = (e) => busy(e.target, async () => {
      const d = $('#com-date').value; if (!d) return;
      const n = must(await sb.rpc('run_settlement', { p_date: d }));
      toast(`Settled ${fmtD(d)}: ${n} ID${n === 1 ? '' : 's'} with commission`); scheduleReload();
    });
    v.querySelectorAll('[data-cact]').forEach((b) => b.onclick = () => {
      const st = S.data.settlements.find((x) => x.id === Number(b.dataset.sid)); if (!st) return;
      const act = b.dataset.cact;
      if (act === 'credit') busy(b, async () => {
        const id = must(await sb.rpc('request_commission', { p_settlement: st.id, p_mode: 'id' }));
        toast(`Request #${id} sent to vendor`); await afterRequestCreated(id);
      });
      if (act === 'withdraw') commissionWithdrawForm(st);
      if (act === 'manual' || act === 'undo') busy(b, async () => {
        const recv = act === 'manual';
        must(await sb.from('settlements').update({ status: recv ? 'received' : 'due', payout: recv ? 'other' : null, received_at: recv ? new Date().toISOString() : null }).eq('id', st.id));
        scheduleReload();
      });
    });
    v.querySelectorAll('[data-credit-all]').forEach((b) => b.onclick = () => {
      const rows = S.data.settlements.filter((x) => x.settle_date === b.dataset.creditAll && x.status === 'due' && x.commission > 0);
      if (!confirm(`Send ${rows.length} request(s) to credit ${money(sum(rows, (x) => x.commission))} commission into the IDs?`)) return;
      busy(b, async () => {
        for (const st of rows) must(await sb.rpc('request_commission', { p_settlement: st.id, p_mode: 'id' }));
        toast(`${rows.length} request(s) sent – remind vendors from the Dashboard`); scheduleReload();
      });
    });
  }
}
function commissionSummary(sets) {
  const earned = sum(sets, (s) => s.commission);
  const recv = sum(sets.filter((s) => s.status === 'received'), (s) => s.commission);
  const byId = {};
  sets.forEach((s) => {
    const r = (byId[s.account_id] ||= { account_id: s.account_id, vendor_id: s.vendor_id, days: new Set(), loss: 0, earned: 0, recv: 0 });
    r.days.add(s.settle_date); r.earned += Number(s.commission);
    if (s.status === 'received') r.recv += Number(s.commission);
  });
  // loss counted once per ID per day (top-up lines repeat the day's total)
  const dayLoss = {};
  sets.forEach((s) => { dayLoss[`${s.account_id}|${s.settle_date}`] = Math.min(dayLoss[`${s.account_id}|${s.settle_date}`] ?? 0, Number(s.net_pnl)); });
  Object.entries(dayLoss).forEach(([k, v]) => { byId[k.split('|')[0]].loss += v; });
  const rows = Object.values(byId).sort((a, b) => b.earned - a.earned);
  return `<div class="section">
    <div class="section-head"><h2>${isAdmin() ? 'Commission earned' : 'Commission you pay to the owner'}</h2></div>
    <div class="kpis section">
      ${kpi(isAdmin() ? 'Total earned' : 'Total commission', money(earned), 'All time')}
      ${kpi(isAdmin() ? 'Received' : 'Already paid', money(recv), isAdmin() ? 'Credited or paid' : 'To the owner')}
      ${kpi(isAdmin() ? 'Still to collect' : 'Still to pay', money(earned - recv), 'Due + requested')}
      ${kpi('IDs with commission', rows.length)}
    </div>
    ${rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>ID</th><th class="r">Loss days</th><th class="r">Total loss</th><th class="r">${isAdmin() ? 'Earned' : 'Commission'}</th><th class="r">${isAdmin() ? 'To collect' : 'To pay'}</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td style="white-space:normal"><b>${esc(accName(acc(r.account_id)))}</b>${isAdmin() ? `<div class="muted small">${esc(vendorName(r.vendor_id))}</div>` : ''}</td>
        <td class="r">${r.days.size}</td><td class="r">${signed(r.loss)}</td><td class="r num"><b>${money(r.earned)}</b></td><td class="r num">${money(r.earned - r.recv)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td></td><td class="r">${signed(sum(rows, (r) => r.loss))}</td><td class="r num">${money(earned)}</td><td class="r num">${money(earned - recv)}</td></tr></tfoot>
    </table></div>` : ''}
  </div>`;
}
function commPayoutLabel(s) {
  if (s.status === 'requested') return `Waiting for vendor – request #${s.request_id}`;
  if (s.status !== 'received') return '';
  return { id: 'Received – credited into the ID', withdrawal: 'Received – paid as withdrawal', other: 'Received – marked manually' }[s.payout] || 'Received';
}
function commissionWithdrawForm(st) {
  openModal(`Withdraw commission · ${money(st.commission)}`, `
    <form id="cw-form">
      <p class="small">${esc(accName(acc(st.account_id)))} · ${esc(vendorName(st.vendor_id))} · ${fmtD(st.settle_date)}. The ID balance does not change.</p>
      <div class="field"><label>Method</label><select name="method">${Object.entries(METHOD).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
      <div data-cash>
        <div class="fields two">
          <div class="field"><label>Cash to be given to (name)</label><input name="payee_name"></div>
          <div class="field"><label>Person phone</label><input name="payee_phone" type="tel" inputmode="tel"></div>
        </div>
        <div class="field"><label>Token number</label><input name="token_no"></div>
        <div class="field"><label>Token / slip photo</label><input name="photo" type="file" accept="image/*"></div>
      </div>
      <div class="field hidden" data-bank><label>Bank / UPI details</label><textarea name="payee_details" placeholder="Leave empty if the vendor should ask you."></textarea></div>
      <div class="field"><label>Note</label><input name="note"></div>
      <button class="btn primary block">Send withdrawal request</button>
    </form>`, (root) => {
    const form = $('#cw-form', root);
    const sync = () => { const cash = form.elements.method.value === 'cash'; $('[data-cash]', root).classList.toggle('hidden', !cash); $('[data-bank]', root).classList.toggle('hidden', cash); };
    form.elements.method.onchange = sync; sync();
    form.onsubmit = (e) => {
      e.preventDefault(); const f = formObj(form); const cash = f.method === 'cash';
      busy(e.submitter, async () => {
        const extra = { method: f.method, ...(cash ? { payee_name: f.payee_name, payee_phone: f.payee_phone, token_no: f.token_no } : { payee_details: f.payee_details }) };
        if (cash) extra.photo_path = await uploadPhoto(form.elements.photo.files[0], st.vendor_id);
        const id = must(await sb.rpc('request_commission', { p_settlement: st.id, p_mode: 'withdrawal', p_note: f.note || null, p_extra: extra }));
        modal.close(); toast(`Request #${id} created`); await afterRequestCreated(id);
      });
    };
  });
}
function commTable(rows, actions) {
  return `<div class="list">${rows.map((s) => {
    const full = Math.round(-Number(s.net_pnl) * Number(s.commission_pct)) / 100;
    const topUp = Number(s.net_pnl) < 0 && Number(s.commission) < full - 0.005;
    return `<div class="item">
      <div class="row between">
        <div><b>${esc(accName(acc(s.account_id)))}</b>${isAdmin() ? `<div class="muted small">${esc(vendorName(s.vendor_id))}</div>` : ''}</div>
        <span class="pill ${s.status === 'requested' || s.status === 'running' ? 'pending' : s.status}">${s.status}</span>
      </div>
      <div class="row between" style="margin-top:6px">
        <span class="small">Day loss ${signed(Number(s.net_pnl))} × ${Number(s.commission_pct)}%</span>
        <span class="big" style="font-size:1.1rem">${money(s.commission)}</span>
      </div>
      ${topUp ? `<div class="muted small">Top-up – total for the day ${money(full)}, the rest was already collected</div>` : ''}
      ${commPayoutLabel(s) ? `<div class="muted small">${commPayoutLabel(s)}</div>` : ''}
      ${actions && s.status === 'due' ? `<div class="actions">
          <button class="btn sm good" data-cact="credit" data-sid="${s.id}">Credit to ID</button>
          <button class="btn sm" data-cact="withdraw" data-sid="${s.id}">Withdraw</button>
          <button class="btn sm" data-cact="manual" data-sid="${s.id}" title="Already paid some other way">Mark received</button></div>`
        : actions && s.status === 'received' && (!s.payout || s.payout === 'other') ? `<div class="actions"><button class="btn sm" data-cact="undo" data-sid="${s.id}">Undo</button></div>` : ''}
    </div>`; }).join('')}</div>`;
}

// ============================================================
// PAYMENT LEDGER (owner only)
// ============================================================
function viewLedger(v) {
  if (!isAdmin()) return viewIds(v);
  const rows = S.data.ledger.filter((l) => !S.f.ledVendor || (S.f.ledVendor === 'none' ? !l.vendor_id : l.vendor_id === S.f.ledVendor));
  const pay = rows.filter((l) => (l.kind || 'payment') === 'payment'); const dep = rows.filter((l) => l.kind === 'deposit');
  const paid = sum(pay.filter((l) => l.direction === 'out'), (l) => l.amount);
  const recv = sum(pay.filter((l) => l.direction === 'in'), (l) => l.amount);
  const depHeld = sum(dep.filter((l) => l.direction === 'out'), (l) => l.amount) - sum(dep.filter((l) => l.direction === 'in'), (l) => l.amount);
  const vsel = S.f.ledVendor && S.f.ledVendor !== 'none' ? vendorStats(S.f.ledVendor) : null;
  v.innerHTML = `
    <div class="section-head"><h2>Payment ledger</h2><button class="btn primary" id="add-led">+ Payment / deposit</button></div>
    <div class="toolbar"><select id="led-vendor"><option value="">All vendors</option><option value="none" ${S.f.ledVendor === 'none' ? 'selected' : ''}>No vendor</option>${vendors().map((p) => `<option value="${p.id}" ${S.f.ledVendor === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    <div class="kpis section">
      ${kpi('Deposit held by vendor', money(depHeld), 'Deposit given − returned')}
      ${vsel ? kpi('Deposit short / extra', vsel.overDeposit > 0 ? `<span class="neg">Short ${money(vsel.overDeposit)}</span>` : `<span class="pos">Extra ${money(-vsel.overDeposit)}</span>`, `Should pay ${money(vsel.shouldPay)} for ${money(vsel.credited)} credited`) : ''}
      ${kpi('Paid out', money(paid), 'Payments only')}${kpi('Received', money(recv), 'Payments only')}${kpi('Net', signed(recv - paid), 'Received − paid')}
    </div>
    ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Vendor</th><th>Type</th><th>Mode</th><th class="r">Amount</th><th>Ref / note</th><th></th></tr></thead><tbody>
      ${rows.map((l) => `<tr><td>${fmtD(l.entry_date)}</td><td>${esc(l.vendor_id ? vendorName(l.vendor_id) : '—')}</td>
        <td>${l.kind === 'deposit' ? `<span class="pill kind">Deposit ${l.direction === 'out' ? 'given' : 'returned'}</span>` : l.direction === 'out' ? '<span class="neg">Paid</span>' : '<span class="pos">Received</span>'}</td><td>${esc(l.mode)}</td>
        <td class="r">${signed(l.direction === 'out' ? -l.amount : +l.amount)}</td><td>${esc([l.reference, l.note].filter(Boolean).join(' · '))}</td>
        <td><button class="icon-btn" data-del-led="${l.id}" title="Delete">🗑</button></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">No payments recorded</div>'}`;
  $('#led-vendor').onchange = (e) => { S.f.ledVendor = e.target.value; renderView(); };
  $('#add-led').onclick = ledgerForm;
  v.querySelectorAll('[data-del-led]').forEach((b) => b.onclick = () => {
    if (!confirm('Delete this payment entry?')) return;
    busy(b, async () => { must(await sb.from('ledger').delete().eq('id', b.dataset.delLed)); toast('Deleted'); scheduleReload(); });
  });
}
function ledgerForm() {
  openModal('Add payment / deposit', `
    <form id="led-form">
      <div class="field"><label>Type</label><div class="seg"><label><input type="radio" name="kind" value="payment" checked><span>Payment</span></label><label><input type="radio" name="kind" value="deposit"><span>Deposit</span></label></div></div>
      <div class="field"><div class="seg"><label><input type="radio" name="direction" value="out" checked><span data-dl="out">I paid</span></label><label><input type="radio" name="direction" value="in"><span data-dl="in">I received</span></label></div></div>
      <div class="fields two">
        <div class="field"><label>Date</label><input name="entry_date" type="date" value="${todayIST()}" required></div>
        <div class="field"><label>Amount ₹</label><input name="amount" type="number" step="0.01" min="0.01" inputmode="decimal" required></div>
        <div class="field"><label>Vendor</label><select name="vendor_id"><option value="">— None —</option>${vendors().map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Mode</label><select name="mode">${LEDGER_MODES.map((m) => `<option>${m}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Reference (UTR / token)</label><input name="reference"></div>
      <div class="field"><label>Note</label><input name="note"></div>
      <button class="btn primary block">Save</button>
    </form>`, (root) => {
    const lf = $('#led-form', root);
    const syncL = () => { const d = lf.elements.kind.value === 'deposit';
      $('[data-dl="out"]', root).textContent = d ? 'Deposit given' : 'I paid'; $('[data-dl="in"]', root).textContent = d ? 'Deposit returned' : 'I received'; };
    lf.addEventListener('change', syncL); syncL();
    $('#led-form', root).onsubmit = (e) => {
      e.preventDefault(); const f = formObj(e.target);
      busy(e.submitter, async () => {
        if (f.kind === 'deposit' && !f.vendor_id) throw new Error('Choose the vendor for a deposit');
        must(await sb.from('ledger').insert({ ...f, amount: Number(f.amount), vendor_id: f.vendor_id || null, reference: f.reference || null, note: f.note || null }));
        modal.close(); toast('Payment saved'); scheduleReload();
      });
    };
  });
}

// ============================================================
// INVESTORS — shares they sold for us; we owe the shares back
// ============================================================
const investors = () => S.data.profiles.filter((p) => p.role === 'investor').sort((a, b) => a.name.localeCompare(b.name));
const qtyFmt = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 4 });
const stockKey = (x) => `${x.symbol}|${x.exchange}`;
// latest price on or before a date
function priceOn(symbol, exchange, date = '9999-12-31') {
  let best = null;
  for (const p of S.data.prices) if (p.symbol === symbol && p.exchange === exchange && p.price_date <= date && (!best || p.price_date > best.price_date)) best = p;
  return best;
}
function investorPosition(invId, asOf = '9999-12-31') {
  const stocks = S.data.invStocks.filter((x) => x.investor_id === invId && x.sold_on <= asOf);
  const rets = S.data.invReturns.filter((x) => x.investor_id === invId && x.paid_on <= asOf);
  const by = {};
  stocks.forEach((x) => {
    const r = (by[stockKey(x)] ||= { symbol: x.symbol, exchange: x.exchange, name: x.stock_name, soldQty: 0, received: 0, retQty: 0, retValue: 0 });
    r.soldQty += Number(x.qty); r.received += Number(x.qty) * Number(x.sell_rate); r.name ||= x.stock_name;
  });
  rets.forEach((x) => { const r = by[stockKey(x)]; if (r) { r.retQty += Number(x.qty); r.retValue += Number(x.amount); } });
  S.data.invMoney.filter((x) => x.investor_id === invId && x.kind === 'shares' && x.paid_on <= asOf).forEach((x) => {
    const r = by[stockKey(x)]; if (r) { r.sentQty = (r.sentQty || 0) + Number(x.qty); r.sentValue = (r.sentValue || 0) + Number(x.amount); } });
  const rows = Object.values(by).map((r) => {
    const price = priceOn(r.symbol, r.exchange, asOf);
    const owed = Math.max(0, Math.round((r.soldQty - r.retQty) * 10000) / 10000);
    const sentQty = r.sentQty || 0;
    return { ...r, sentQty, sentValue: r.sentValue || 0, leftQty: Math.max(0, Math.round((r.soldQty - sentQty) * 10000) / 10000),
      owed, price, due: price ? owed * Number(price.close) : null, avgRate: r.received / r.soldQty };
  });
  const tot = {
    received: sum(rows, (r) => r.received), returned: sum(rows, (r) => r.retValue),
    due: sum(rows, (r) => r.due || 0), missing: rows.filter((r) => r.owed > 0 && !r.price).length,
    owedAtSellRate: sum(rows, (r) => r.owed * r.avgRate),
  };
  return { rows, tot };
}
function investorDaily(invId, days = 30) {
  const syms = new Set(S.data.invStocks.filter((x) => x.investor_id === invId).map(stockKey));
  const dates = [...new Set(S.data.prices.filter((p) => syms.has(stockKey(p))).map((p) => p.price_date))].sort().reverse().slice(0, days);
  return dates.map((d) => ({ date: d, due: investorPosition(invId, d).tot.due }));
}

function viewInvestors(v) {
  const admin = isAdmin();
  const list = admin ? investors() : [S.me];
  if (!S.f.investor || !list.some((p) => p.id === S.f.investor)) S.f.investor = list.length === 1 || !admin ? list[0]?.id : null;
  if (admin && !S.f.investor) {
    v.innerHTML = `
      <div class="section-head"><h2>Investors</h2><button class="btn primary" id="add-inv">+ Add investor</button></div>
      <p class="muted small">Shares an investor sold to fund the business. You owe the <b>shares</b> back, so the amount due moves with the market price every day.</p>
      <div class="list">${list.length ? list.map((p) => { const { tot } = investorPosition(p.id); return `<div class="item" data-inv="${p.id}" style="cursor:pointer">
        <div class="row between"><h3>${esc(p.name)}</h3><span class="big" style="font-size:1.15rem">${money(tot.due)}</span></div>
        <div class="row between small muted" style="margin-top:4px"><span>Gave you ${money(tot.received)} · returned ${money(tot.returned)}</span><span>due today</span></div>
      </div>`; }).join('') : '<div class="empty">No investors yet. Add Sanjay with <b>+ Add investor</b>.</div>'}</div>`;
    $('#add-inv').onclick = () => investorForm();
    v.querySelectorAll('[data-inv]').forEach((el) => el.onclick = () => { S.f.investor = el.dataset.inv; renderView(); });
    return;
  }
  const inv = prof(S.f.investor) || S.me;
  const { rows, tot } = investorPosition(inv.id);
  const daily = investorDaily(inv.id);
  const lastDate = daily[0]?.date;
  const change = daily.length > 1 ? daily[0].due - daily[1].due : null;
  const rets = S.data.invReturns.filter((x) => x.investor_id === inv.id);
  const moneyIn = S.data.invMoney.filter((x) => x.investor_id === inv.id);
  const cashOut = rets.filter((x) => x.mode === 'cash');
  const totIn = sum(moneyIn, (x) => x.amount); const totOut = sum(cashOut, (x) => x.amount);
  const byKind = (k) => sum(moneyIn.filter((x) => (x.kind || 'cash') === k), (x) => x.amount);
  const moneyRows = [
    ...moneyIn.map((x) => ({ kind: 'in', date: x.paid_on, amount: Number(x.amount), x })),
    ...cashOut.map((x) => ({ kind: 'out', date: x.paid_on, amount: Number(x.amount), x })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.x.id - a.x.id);
  const L = admin ? { in: `Received from ${inv.name}`, out: `Paid to ${inv.name}`, addIn: '+ Money received', addOut: '+ Paid to him' }
                  : { in: 'You sent', out: 'You received back', addIn: '+ Money I sent' };
  v.innerHTML = `
    <div class="section-head">
      ${admin && investors().length > 1 ? '<button class="btn sm" id="inv-back">← All</button>' : ''}
      <h2>${admin ? esc(inv.name) : 'My stocks'}</h2>
      ${admin ? `<button class="btn sm wa" id="inv-wa" ${inv.phone ? '' : 'disabled title="Add phone"'}>Send update</button>` : ''}
    </div>
    <div class="kpis section">
      ${kpi(admin ? 'Amount due today' : 'Due to you today', money(tot.due), lastDate ? `Prices of ${fmtD(lastDate)}${change != null ? ` · ${change >= 0 ? '+' : ''}${money(change)} vs previous day` : ''}` : 'No prices yet')}
      ${kpi(admin ? 'Shares sold value' : 'Your shares sold value', money(tot.received), 'Shares × sell rate')}
      ${kpi('Returned so far', money(tot.returned), 'Shares + cash')}
      ${kpi('Market move on shares still owed', signed(tot.due - tot.owedAtSellRate), 'Today’s value − value at sell rate')}
    </div>
    ${tot.missing ? `<p class="neg small">${tot.missing} stock(s) have no price yet – press Update prices${admin ? ', or type the price' : ''}.</p>` : ''}
    <div class="row section">
      <button class="btn primary" id="inv-add-stock">${admin ? '+ Stock sold' : '+ Add share'}</button>
      ${admin ? '<button class="btn" id="inv-return">Return / pay</button>' : ''}
      <button class="btn" id="inv-refresh">↻ Update prices</button>
      ${admin ? '<button class="btn" id="inv-price">Type a price</button>' : ''}
    </div>
    <div class="section">
      <div class="section-head"><h2>Money</h2>
        <button class="btn sm primary" id="inv-money-in">${L.addIn}</button>
        ${admin ? `<button class="btn sm" id="inv-money-out">${L.addOut}</button>` : ''}</div>
      <div class="kpis section">
        ${kpi(admin ? 'Money for shares received' : 'Money for shares sent', signed(byKind('shares')), `Shares sold value ${money(tot.received)}`)}
        ${(() => { const diff = tot.received - byKind('shares'); return diff >= 0
          ? kpi(admin ? 'Shares money still to receive' : 'Shares money still to send', `<span class="neg">${money(diff)}</span>`, 'Shares sold value − money for shares')
          : kpi(admin ? 'Received more for shares' : 'Sent more for shares', `<span class="pos">${money(-diff)}</span>`, `More than the shares' value`); })()}
        ${kpi('Cash / other settlement', signed(byKind('cash') + byKind('other')), admin ? 'Received separately – not for shares' : 'Sent separately – not for shares')}
        ${kpi(L.out, signed(-totOut), `${cashOut.length} payment${cashOut.length === 1 ? '' : 's'}`)}
      </div>
      ${moneyRows.length ? `<div class="list">${moneyRows.map((m) => `<div class="item row between">
        <div><b class="${m.kind === 'in' ? 'pos' : 'neg'}">${m.kind === 'in' ? L.in : L.out}</b>
          ${m.kind === 'in' ? `<span class="pill kind">${m.x.kind === 'shares' ? (m.x.symbol ? `Shares · ${qtyFmt(m.x.qty)} ${esc(m.x.symbol)}` : 'Shares') : 'Cash / other settlement'}</span>` : ''}
          <div class="muted small">${fmtD(m.date)}${m.x.mode && m.kind === 'in' ? ` · ${esc(m.x.mode)}` : ''}${m.x.payment_mode && m.kind === 'out' ? ` · ${esc(m.x.payment_mode)}` : ''}${m.kind === 'out' ? ` · counts as ${qtyFmt(m.x.qty)} ${esc(m.x.symbol)} @ ${money(m.x.rate)}` : ''}${m.x.reference ? ` · ${esc(m.x.reference)}` : ''}${m.x.note ? ` · ${esc(m.x.note)}` : ''}${admin && m.kind === 'in' && m.x.created_by === inv.id ? ` · <span class="pill pending">added by ${esc(inv.name)}</span>` : ''}</div></div>
        <div class="row">${signed(m.kind === 'in' ? m.amount : -m.amount)}
          ${m.kind === 'in' && (admin || m.x.created_by === S.me.id) ? `<button class="icon-btn" data-del-money="${m.x.id}" title="Delete">🗑</button>` : ''}</div></div>`).join('')}</div>` : '<div class="empty">No money entries yet</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h2>Stocks</h2></div>
      ${rows.length ? `<div class="list">${rows.map((r) => `<div class="item">
        <div class="row between"><div><b>${esc(r.symbol)}</b> <span class="muted small">${r.exchange}${r.name ? ` · ${esc(r.name)}` : ''}</span></div>
          <span class="big" style="font-size:1.1rem">${r.due != null ? money(r.due) : '—'}</span></div>
        <dl class="kv" style="margin-top:6px">
          <dt>Sold</dt><dd>${qtyFmt(r.soldQty)} @ ${money(r.avgRate)} = ${money(r.received)}</dd>
          <dt>Money sent</dt><dd>${r.sentQty ? `${qtyFmt(r.sentQty)} shares → ${money(r.sentValue)}${r.sentValue - r.sentQty * r.avgRate > 0.5 ? ` <span class="pos small">(${money(r.sentValue - r.sentQty * r.avgRate)} more than sell rate)</span>` : ''}` : '—'}</dd>
          <dt>Shares left</dt><dd><b class="${r.leftQty ? 'neg' : 'pos'}">${qtyFmt(r.leftQty)}</b> <span class="muted small">${r.leftQty ? `≈ ${money(r.leftQty * r.avgRate)} not sent yet` : 'all sent'}</span></dd>
          ${r.retQty ? `<dt>Returned</dt><dd>${qtyFmt(r.retQty)} shares (${money(r.retValue)})</dd>` : ''}
          <dt>Still owed</dt><dd><b>${qtyFmt(r.owed)} shares</b></dd>
          <dt>Price</dt><dd>${r.price ? `${money(r.price.close)} <span class="muted small">${fmtD(r.price.price_date)}${r.price.source === 'manual' ? ' · typed' : ''}</span>` : '<span class="neg">not yet</span>'}</dd>
        </dl></div>`).join('')}</div>` : '<div class="empty">No stocks yet</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h2>Daily amount due</h2></div>
      ${daily.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th class="r">Amount due</th><th class="r">Change</th></tr></thead><tbody>
        ${daily.map((d, i) => `<tr><td>${fmtD(d.date)}</td><td class="r num">${money(d.due)}</td><td class="r">${daily[i + 1] ? signed(d.due - daily[i + 1].due) : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Appears once prices are in</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h2>Returns & payments</h2></div>
      ${rets.length ? `<div class="list">${rets.map((x) => `<div class="item row between">
        <div><b>${x.mode === 'cash' ? `Cash ${money(x.amount)}` : `${qtyFmt(x.qty)} ${esc(x.symbol)} shares`}</b>
          <div class="muted small">${fmtD(x.paid_on)} · ${x.mode === 'cash' ? `= ${qtyFmt(x.qty)} ${esc(x.symbol)} @ ${money(x.rate)}` : `worth ${money(x.amount)} @ ${money(x.rate)}`}${x.payment_mode ? ` · ${esc(x.payment_mode)}` : ''}${x.reference ? ` · ${esc(x.reference)}` : ''}${x.note ? ` · ${esc(x.note)}` : ''}</div></div>
        ${admin ? `<button class="icon-btn" data-del-ret="${x.id}" title="Delete">🗑</button>` : ''}</div>`).join('')}</div>` : '<div class="empty">Nothing returned yet</div>'}
    </div>
    <div class="section"><div class="section-head"><h2>${admin ? 'Stocks he sold (entries)' : 'My share entries'}</h2></div>
      <div class="list">${S.data.invStocks.filter((x) => x.investor_id === inv.id).map((x) => {
        const mine = x.created_by === S.me.id; const byInv = x.created_by === inv.id;
        return `<div class="item row between">
        <div><b>${esc(x.symbol)}</b> <span class="muted small">${x.exchange}${x.stock_name ? ` · ${esc(x.stock_name)}` : ''} · ${qtyFmt(x.qty)} @ ${money(x.sell_rate)} · ${fmtD(x.sold_on)}${x.note ? ` · ${esc(x.note)}` : ''}</span>
          ${admin && byInv ? ` <span class="pill pending">added by ${esc(inv.name)}</span>` : ''}${!admin && !mine ? ' <span class="pill">added by owner</span>' : ''}</div>
        ${admin || mine ? `<div class="row"><button class="icon-btn" data-edit-stock="${x.id}" title="Edit">✎</button><button class="icon-btn" data-del-stock="${x.id}" title="Delete">🗑</button></div>` : ''}</div>`; }).join('') || '<div class="empty">None yet</div>'}</div></div>`;
  $('#inv-add-stock').onclick = () => stockForm(inv);
  $('#inv-money-in').onclick = () => moneyForm(inv);
  v.querySelectorAll('[data-del-money]').forEach((b) => b.onclick = () => confirm('Delete this money entry?') &&
    busy(b, async () => { must(await sb.from('investor_money').delete().eq('id', b.dataset.delMoney)); toast('Deleted'); scheduleReload(); }));
  $('#inv-refresh').onclick = (e) => busy(e.target, async () => {
    const n = must(await sb.rpc('queue_price_fetch'));
    if (!n) return toast('No stocks to price');
    await new Promise((r) => setTimeout(r, 5000));
    const got = must(await sb.rpc('collect_prices'));
    toast(`Prices updated: ${got} of ${n}${got < n ? ' – try again in a minute' : ''}`); scheduleReload();
  });
  v.querySelectorAll('[data-del-stock]').forEach((b) => b.onclick = () => confirm('Delete this share entry?') &&
    busy(b, async () => { must(await sb.from('investor_stocks').delete().eq('id', b.dataset.delStock)); toast('Deleted'); scheduleReload(); }));
  v.querySelectorAll('[data-edit-stock]').forEach((b) => b.onclick = () => stockForm(inv, S.data.invStocks.find((x) => x.id === Number(b.dataset.editStock))));
  if (!admin) return;
  $('#inv-back')?.addEventListener('click', () => { S.f.investor = null; renderView(); });
  $('#inv-wa').onclick = () => openWA(inv.phone, investorMessage(inv));
  $('#inv-return').onclick = () => returnForm(inv, rows);
  $('#inv-money-out').onclick = () => returnForm(inv, rows, 'cash');
  $('#inv-price').onclick = () => priceForm(rows);
  v.querySelectorAll('[data-del-ret]').forEach((b) => b.onclick = () => confirm('Delete this return / payment?') &&
    busy(b, async () => { must(await sb.from('investor_returns').delete().eq('id', b.dataset.delRet)); toast('Deleted'); scheduleReload(); }));
}
function investorMessage(inv) {
  const { rows, tot } = investorPosition(inv.id);
  const d = investorDaily(inv.id, 1)[0]?.date;
  return [`Hi ${inv.name}, update${d ? ` (prices of ${fmtD(d)})` : ''}:`, '',
    ...rows.filter((r) => r.owed > 0).map((r) => `${r.symbol}: ${qtyFmt(r.owed)} shares × ${r.price ? money(r.price.close) : '?'} = ${r.due != null ? money(r.due) : '—'}`),
    '', `*Total due: ${money(tot.due)}*`, `You gave: ${money(tot.received)}`, `Returned so far: ${money(tot.returned)}`, '', `Details: ${APP_URL}`].join('\n');
}
function investorForm() {
  openModal('Add investor', `
    <form id="inv-form">
      <div class="field"><label>Name</label><input name="name" required placeholder="Sanjay"></div>
      <div class="field"><label>WhatsApp number</label><input name="phone" type="tel"></div>
      <div class="fields two">
        <div class="field"><label>Login username</label><input name="username" required autocapitalize="none" pattern="[A-Za-z0-9._\-]{3,30}"></div>
        <div class="field"><label>Password</label><input name="password" required minlength="6" value="${Math.random().toString(36).slice(2, 10)}"></div>
      </div>
      <p class="muted small">He will see only his stocks, the amount due and payments.</p>
      <button class="btn primary block">Add investor</button>
    </form>`, (root) => {
    $('#inv-form', root).onsubmit = (e) => {
      e.preventDefault(); const f = formObj(e.target);
      busy(e.submitter, async () => {
        const id = must(await sb.rpc('admin_create_investor', { p_username: f.username, p_password: f.password, p_name: f.name, p_phone: f.phone || null }));
        S.f.investor = id;
        credentialsModal({ name: f.name.trim(), username: f.username.trim().toLowerCase(), phone: f.phone, role: 'investor' }, f.password, 'Investor added');
        scheduleReload();
      });
    };
  });
}
function stockForm(inv, x = null) {
  const me = !isAdmin();
  openModal(x ? 'Edit share entry' : me ? 'Add a share you sold' : `Stock sold by ${inv.name}`, `
    <form id="stk-form">
      <div class="fields two">
        <div class="field"><label>Stock symbol (as on NSE/BSE)</label><input name="symbol" value="${esc(x?.symbol)}" required autocapitalize="characters" placeholder="RELIANCE"></div>
        <div class="field"><label>Exchange</label><select name="exchange"><option>NSE</option><option ${x?.exchange === 'BSE' ? 'selected' : ''}>BSE</option></select></div>
        <div class="field"><label>Quantity</label><input name="qty" type="number" step="0.0001" min="0.0001" inputmode="decimal" value="${esc(x?.qty ?? '')}" required></div>
        <div class="field"><label>Price per share ₹ (sold at)</label><input name="sell_rate" type="number" step="0.01" min="0.01" inputmode="decimal" value="${esc(x?.sell_rate ?? '')}" required></div>
        <div class="field"><label>Date sold</label><input name="sold_on" type="date" value="${esc(x?.sold_on || todayIST())}" required></div>
        <div class="field"><label>Share / company name</label><input name="stock_name" value="${esc(x?.stock_name)}"></div>
      </div>
      <div class="card small" id="stk-total" style="margin-bottom:12px"></div>
      <div class="field"><label>Note</label><input name="note" value="${esc(x?.note)}"></div>
      <button class="btn primary block">${x ? 'Save' : 'Add stock'}</button>
    </form>`, (root) => {
    const form = $('#stk-form', root);
    const tot = () => { const f = formObj(form); $('#stk-total', root).innerHTML = `${me ? 'Money you gave' : 'Money he gave'} for this: <b>${money(Number(f.qty || 0) * Number(f.sell_rate || 0))}</b>`; };
    form.addEventListener('input', tot); tot();
    form.onsubmit = (e) => {
      e.preventDefault(); const f = formObj(form);
      const row = { investor_id: inv.id, symbol: f.symbol.trim().toUpperCase(), exchange: f.exchange, qty: Number(f.qty), sell_rate: Number(f.sell_rate),
        sold_on: f.sold_on, stock_name: f.stock_name.trim() || null, note: f.note.trim() || null };
      busy(e.submitter, async () => {
        if (x) must(await sb.from('investor_stocks').update(row).eq('id', x.id)); else must(await sb.from('investor_stocks').insert(row));
        modal.close(); toast('Saved – press Update prices to get today’s price'); scheduleReload();
      });
    };
  });
}
function moneyForm(inv) {
  const admin = isAdmin();
  const { rows } = investorPosition(inv.id);
  const left = rows.filter((r) => r.leftQty > 0);
  openModal(admin ? `Money received from ${inv.name}` : 'Money I sent', `
    <form id="money-form">
      <div class="field"><label>Type</label><div class="seg">
        <label><input type="radio" name="kind" value="shares" checked><span>Shares</span></label>
        <label><input type="radio" name="kind" value="cash"><span>Cash / other settlement</span></label></div></div>
      <div data-k="shares">
        <div class="field"><label>Share sold for this money</label><select name="stock"><option value="">All shares (not one stock)</option>${left.map((r) => `<option value="${esc(stockKey(r))}">${esc(r.symbol)} (${r.exchange}) – ${qtyFmt(r.leftQty)} left @ ${money(r.avgRate)}</option>`).join('')}</select></div>
        <div class="field" data-qty><label>Shares sold (quantity)</label><input name="qty" type="number" step="0.0001" min="0.0001" inputmode="decimal"></div>
      </div>
      <div class="fields two">
        <div class="field"><label>Amount ₹</label><input name="amount" type="number" step="0.01" min="0.01" inputmode="decimal" required></div>
        <div class="field"><label>Date</label><input name="paid_on" type="date" value="${todayIST()}" required></div>
        <div class="field"><label>Mode</label><select name="mode">${['UPI', 'Bank transfer', 'Cash', 'Other'].map((m) => `<option>${m}</option>`).join('')}</select></div>
        <div class="field"><label>Reference / UTR</label><input name="reference"></div>
      </div>
      <div class="card small" id="money-calc" style="margin-bottom:12px"></div>
      <div class="field"><label>Note</label><input name="note"></div>
      <button class="btn primary block">Save</button>
    </form>`, (root) => {
    const form = $('#money-form', root); const el = form.elements;
    const cur = () => left.find((r) => stockKey(r) === el.stock.value);
    let amountTouched = false;
    el.amount.addEventListener('input', () => { amountTouched = true; });
    const sync = (e) => {
      const shares = el.kind.value === 'shares';
      $('[data-k="shares"]', root).classList.toggle('hidden', !shares);
      const r = cur(); const q = Number(el.qty.value || 0);
      el.qty.required = shares && !!r; $('[data-qty]', root).classList.toggle('hidden', !r);
      if (shares && r && !amountTouched && e?.target !== el.amount) el.amount.value = q ? (Math.round(q * r.avgRate * 100) / 100) : '';
      $('#money-calc', root).innerHTML = shares && r
        ? `${esc(r.symbol)}: ${qtyFmt(r.leftQty)} left → after this <b>${qtyFmt(Math.max(0, Math.round((r.leftQty - q) * 10000) / 10000))}</b> left`
        : shares ? 'Money for his shares – reduces “shares money still to receive”.' : 'Cash or any other settlement – kept separate, does not count for shares.';
    };
    form.addEventListener('input', sync); form.addEventListener('change', sync); sync();
    form.onsubmit = (e) => {
      e.preventDefault(); const f = formObj(form); const r = cur();
      const row = { investor_id: inv.id, kind: f.kind, amount: Number(f.amount), paid_on: f.paid_on, mode: f.mode,
        reference: f.reference.trim() || null, note: f.note.trim() || null };
      if (f.kind === 'shares' && r) Object.assign(row, { symbol: r.symbol, exchange: r.exchange, qty: Number(f.qty) });
      busy(e.submitter, async () => {
        must(await sb.from('investor_money').insert(row));
        modal.close(); toast('Saved'); scheduleReload();
      });
    };
  });
}
function returnForm(inv, rows, startMode = 'shares') {
  const open = rows.filter((r) => r.owed > 0);
  if (!open.length) return toast('Nothing owed', 'error');
  openModal(`Return to ${inv.name}`, `
    <form id="ret-form">
      <div class="field"><div class="seg"><label><input type="radio" name="mode" value="shares" ${startMode === 'shares' ? 'checked' : ''}><span>Give shares</span></label><label><input type="radio" name="mode" value="cash" ${startMode === 'cash' ? 'checked' : ''}><span>Pay cash</span></label></div></div>
      <div class="field"><label>Stock</label><select name="stock">${open.map((r) => `<option value="${esc(stockKey(r))}">${esc(r.symbol)} (${r.exchange}) – ${qtyFmt(r.owed)} owed</option>`).join('')}</select></div>
      <div class="fields two">
        <div class="field" data-m="shares"><label>Shares returned</label><input name="qty" type="number" step="0.0001" min="0.0001" inputmode="decimal"></div>
        <div class="field hidden" data-m="cash"><label>Amount paid ₹</label><input name="amount" type="number" step="0.01" min="0.01" inputmode="decimal"></div>
        <div class="field"><label>Price per share ₹</label><input name="rate" type="number" step="0.01" min="0.01" inputmode="decimal" required></div>
        <div class="field"><label>Date</label><input name="paid_on" type="date" value="${todayIST()}" required></div>
        <div class="field" data-m="cash"><label>Paid by</label><select name="payment_mode">${['Cash', 'UPI', 'Bank transfer', 'Other'].map((m) => `<option>${m}</option>`).join('')}</select></div>
      </div>
      <div class="card small" id="ret-calc" style="margin-bottom:12px"></div>
      <div class="field"><label>Reference / note</label><input name="reference"></div>
      <button class="btn primary block">Save</button>
    </form>`, (root) => {
    const form = $('#ret-form', root); const el = form.elements;
    const cur = () => open.find((r) => stockKey(r) === el.stock.value);
    const fillRate = () => { const r = cur(); if (r?.price) el.rate.value = r.price.close; };
    const sync = () => {
      const cash = el.mode.value === 'cash';
      root.querySelectorAll('[data-m]').forEach((d) => d.classList.toggle('hidden', d.dataset.m === 'cash' ? !cash : cash));
      $('[data-m="cash"] select', root).closest('.field').classList.toggle('hidden', !cash);
      const r = cur(); const rate = Number(el.rate.value || 0);
      const q = cash ? (rate ? Number(el.amount.value || 0) / rate : 0) : Number(el.qty.value || 0);
      $('#ret-calc', root).innerHTML = cash
        ? `Counts as <b>${qtyFmt(Math.round(q * 10000) / 10000)}</b> ${esc(r.symbol)} shares returned. Left owed: ${qtyFmt(Math.max(0, Math.round((r.owed - q) * 10000) / 10000))}`
        : `Value <b>${money(q * rate)}</b>. Left owed: ${qtyFmt(Math.max(0, Math.round((r.owed - q) * 10000) / 10000))} shares`;
    };
    el.stock.onchange = () => { fillRate(); sync(); };
    form.addEventListener('input', sync); form.addEventListener('change', sync); fillRate(); sync();
    form.onsubmit = (e) => {
      e.preventDefault(); const f = formObj(form); const r = cur(); const cash = f.mode === 'cash';
      const row = { investor_id: inv.id, symbol: r.symbol, exchange: r.exchange, mode: f.mode, rate: Number(f.rate), paid_on: f.paid_on,
        qty: cash ? 0 : Number(f.qty), amount: cash ? Number(f.amount) : 0, payment_mode: cash ? f.payment_mode : 'Shares', reference: f.reference.trim() || null };
      if (!(cash ? row.amount > 0 : row.qty > 0)) return toast(cash ? 'Enter the amount' : 'Enter the shares', 'error');
      busy(e.submitter, async () => { must(await sb.from('investor_returns').insert(row)); modal.close(); toast('Saved'); scheduleReload(); });
    };
  });
}
function priceForm(rows) {
  if (!rows.length) return toast('Add a stock first', 'error');
  openModal('Type a closing price', `
    <form id="px-form">
      <div class="field"><label>Stock</label><select name="stock">${rows.map((r) => `<option value="${esc(stockKey(r))}">${esc(r.symbol)} (${r.exchange})</option>`).join('')}</select></div>
      <div class="fields two">
        <div class="field"><label>Date</label><input name="price_date" type="date" value="${todayIST()}" required></div>
        <div class="field"><label>Closing price ₹</label><input name="close" type="number" step="0.01" min="0.01" inputmode="decimal" required></div>
      </div>
      <p class="muted small">A typed price is never overwritten by the automatic update.</p>
      <button class="btn primary block">Save price</button>
    </form>`, (root) => {
    $('#px-form', root).onsubmit = (e) => {
      e.preventDefault(); const f = formObj(e.target); const [symbol, exchange] = f.stock.split('|');
      busy(e.submitter, async () => {
        must(await sb.from('stock_prices').upsert({ symbol, exchange, price_date: f.price_date, close: Number(f.close), source: 'manual', updated_at: new Date().toISOString() }));
        modal.close(); toast('Price saved'); scheduleReload();
      });
    };
  });
}

// ============================================================
// VENDORS (owner only)
// ============================================================
function viewVendors(v) {
  if (!isAdmin()) return viewIds(v);
  v.innerHTML = `
    <div class="section-head"><h2>Vendors</h2><button class="btn primary" id="add-vendor">+ Create vendor</button></div>
    <div class="list section">${vendors().length ? vendors().map((p) => { const s = vendorStats(p.id); return `<div class="item" data-vid="${p.id}">
      <div class="row between"><div><h3>${esc(p.name)}</h3><div class="muted small">Login: <span class="secret">${esc(p.username)}</span>${p.phone ? ` · ${esc(p.phone)}` : ''}</div></div>
        <span class="pill ${p.active ? 'active' : 'closed'}">${p.active ? 'active' : 'off'}</span></div>
      <div class="small" style="margin-top:6px">${s.count} IDs · Balance ${money(s.balance)} · Pending ${s.pending.length} · Comm. due ${money(s.commDue)}</div>
      <div class="small" style="margin-top:4px">Credited ${money(s.credited)} · Should pay ${money(s.shouldPay)} · Paid ${money(s.deposit)} · ${s.overDeposit > 0 ? `<b class="neg">Short ${money(s.overDeposit)}</b> (balance taken on credit)` : s.overDeposit < 0 ? `<span class="pos">Paid extra ${money(-s.overDeposit)}</span>` : '<span class="pos">Fully paid</span>'} · Upfront comm. ${money(s.upfront)}</div>
      <div class="actions">
        <button class="btn sm wa" data-vact="wa" ${p.phone ? '' : 'disabled'}>${s.pending.length ? 'Remind pending' : 'WhatsApp'}</button>
        <button class="btn sm" data-vact="edit">Edit</button>
        <button class="btn sm" data-vact="pw">Reset password</button>
        <button class="btn sm ${p.active ? 'danger' : ''}" data-vact="toggle">${p.active ? 'Deactivate' : 'Activate'}</button>
      </div></div>`; }).join('') : '<div class="empty">No vendors yet</div>'}</div>
    <div class="card">
      <h3 style="margin-bottom:8px">My details</h3>
      <form id="me-form" class="row">
        <input name="name" value="${esc(S.me.name)}" placeholder="Name" style="flex:1 1 140px;width:auto" required>
        <input name="phone" value="${esc(S.me.phone)}" placeholder="WhatsApp no. e.g. 9198…" type="tel" style="flex:1 1 160px;width:auto">
        <button class="btn">Save</button>
      </form>
      <p class="muted small" style="margin:8px 0 0">Vendors use this number for the “WhatsApp owner” button.</p>
    </div>
    <div class="card" style="margin-top:12px">
      <h3 style="margin-bottom:8px">App link (you and vendors)</h3>
      <p class="muted small" style="margin:0 0 8px">Same link for everyone – the login decides what each person sees. Opening it once connects that phone.</p>
      <button class="btn block" id="copy-link">Copy app link</button>
    </div>`;
  $('#copy-link').onclick = () => copy(shareLink(), 'App link copied');
  $('#add-vendor').onclick = () => vendorForm();
  $('#me-form').onsubmit = (e) => {
    e.preventDefault(); const f = formObj(e.target);
    busy(e.submitter, async () => { must(await sb.from('profiles').update({ name: f.name.trim(), phone: f.phone.trim() || null }).eq('id', S.me.id)); toast('Saved'); scheduleReload(); });
  };
  v.querySelectorAll('[data-vact]').forEach((b) => b.onclick = () => {
    const p = prof(b.closest('[data-vid]').dataset.vid);
    const act = b.dataset.vact;
    if (act === 'wa') openWA(p.phone, reminderMessage(p.id));
    if (act === 'edit') vendorForm(p);
    if (act === 'pw') {
      const pw = prompt(`New password for ${p.name} (min 6 characters):`);
      if (!pw) return;
      busy(b, async () => { must(await sb.rpc('admin_set_password', { p_user: p.id, p_password: pw })); credentialsModal(p, pw, 'Password changed'); });
    }
    if (act === 'toggle' && confirm(`${p.active ? 'Deactivate' : 'Activate'} ${p.name}?`))
      busy(b, async () => { must(await sb.rpc('admin_set_active', { p_user: p.id, p_active: !p.active })); toast('Updated'); scheduleReload(); });
  });
}
function vendorForm(p = null) {
  openModal(p ? 'Edit vendor' : 'Create vendor', `
    <form id="v-form">
      <div class="field"><label>Name</label><input name="name" value="${esc(p?.name)}" required></div>
      <div class="field"><label>WhatsApp number</label><input name="phone" type="tel" value="${esc(p?.phone)}" placeholder="10-digit or with country code"></div>
      ${p ? '' : `<div class="fields two">
        <div class="field"><label>Login username</label><input name="username" required autocapitalize="none" pattern="[A-Za-z0-9._\\-]{3,30}" title="3–30 letters, numbers, . _ -"></div>
        <div class="field"><label>Password</label><input name="password" required minlength="6" value="${Math.random().toString(36).slice(2, 10)}"></div></div>`}
      <button class="btn primary block">${p ? 'Save' : 'Create vendor'}</button>
    </form>`, (root) => {
    $('#v-form', root).onsubmit = (e) => {
      e.preventDefault(); const f = formObj(e.target);
      busy(e.submitter, async () => {
        if (p) {
          must(await sb.from('profiles').update({ name: f.name.trim(), phone: f.phone.trim() || null }).eq('id', p.id));
          modal.close(); toast('Saved');
        } else {
          must(await sb.rpc('admin_create_vendor', { p_username: f.username, p_password: f.password, p_name: f.name, p_phone: f.phone || null }));
          credentialsModal({ name: f.name.trim(), username: f.username.trim().toLowerCase(), phone: f.phone }, f.password, 'Vendor created');
        }
        scheduleReload();
      });
    };
  });
}
function credentialsModal(p, pw, title) {
  const role = p.role || prof(p.id)?.role || 'vendor';
  const text = `Hi ${p.name}, your login for the ID Ledger app:\n\nLink: ${shareLink()}\nUsername: ${p.username}\nPassword: ${pw}\n\n${role === 'investor'
    ? 'You can see your stocks, the amount due to you (updated daily with market prices) and every payment there.'
    : 'Add the IDs you give me there and accept my transfer / deposit / withdrawal requests once done.'}`;
  openModal(title, `
    <dl class="kv" style="margin-bottom:14px"><dt>Link</dt><dd>${esc(APP_URL)}</dd><dt>Username</dt><dd class="secret">${esc(p.username)}</dd><dt>Password</dt><dd class="secret">${esc(pw)}</dd></dl>
    <div class="stack">
      ${p.phone ? `<a class="btn wa block" href="${esc(waUrl(p.phone, text))}" target="_blank" rel="noopener">Send login on WhatsApp</a>` : ''}
      <button class="btn block" id="copy-cred">Copy login details</button>
    </div>`, (root) => { $('#copy-cred', root).onclick = () => copy(text, 'Login details copied'); });
}
