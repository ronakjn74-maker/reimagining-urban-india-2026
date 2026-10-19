import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ---------- config / client ----------
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
const shareLink = () => `${location.origin}${location.pathname}#s=${encodeURIComponent(CFG.SUPABASE_URL)}&k=${encodeURIComponent(CFG.SUPABASE_ANON_KEY)}`;
const APP_URL = location.origin + location.pathname;

// ---------- state ----------
const S = {
  me: null, owner: null, view: 'overview', live: false, investor: null, cashMonth: 'all',
  data: { profiles: [], stocks: [], money: [], returns: [], prices: [], cashPay: [] },
};
const isAdmin = () => S.me?.role === 'admin';
const isInvestor = () => S.me?.role === 'investor';

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => inr.format(Number(n || 0));
const money2 = (n) => inr2.format(Number(n || 0));
const signed = (n, cls = true) => `<span class="num ${cls ? (n > 0 ? 'pos' : n < 0 ? 'neg' : '') : ''}">${n > 0 ? '+' : ''}${money(n)}</span>`;
const pct = (n) => `${n > 0 ? '+' : ''}${(Number(n) || 0).toFixed(2)}%`;
const sum = (arr, fn) => arr.reduce((t, x) => t + Number(fn(x) || 0), 0);
const fmtD = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const fmtDshort = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '';
const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const qtyFmt = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 4 });
const prof = (id) => S.data.profiles.find((p) => p.id === id);
const investors = () => S.data.profiles.filter((p) => p.role === 'investor').sort((a, b) => a.name.localeCompare(b.name));
const stockKey = (x) => `${x.symbol}|${x.exchange}`;

function toast(msg, type = '') {
  const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = msg;
  $('#toasts').append(el); setTimeout(() => el.remove(), type === 'error' ? 5000 : 2600);
}
const fail = (e) => toast(e?.message || String(e), 'error');
const modal = $('#modal');
modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) modal.close(); });
function openModal(title, html, mount) {
  $('#modal-title').textContent = title; $('#modal-body').innerHTML = html;
  if (!modal.open) modal.showModal(); mount?.($('#modal-body'));
}
async function copy(text, what = 'Copied') { try { await navigator.clipboard.writeText(text); toast(what); } catch { prompt('Copy:', text); } }
function waUrl(phone, text) { let d = String(phone || '').replace(/\D/g, ''); if (d.length === 10) d = '91' + d; return `https://wa.me/${d}?text=${encodeURIComponent(text)}`; }
const openWA = (phone, text) => window.open(waUrl(phone, text), '_blank', 'noopener');
const formObj = (form) => Object.fromEntries(new FormData(form).entries());
const busy = async (btn, fn) => {
  const label = btn?.innerHTML; if (btn) { btn.disabled = true; btn.innerHTML = 'Please wait…'; }
  try { return await fn(); } catch (e) { fail(e); } finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
};
const must = ({ data, error }) => { if (error) throw error; return data; };

// ---------- data ----------
async function fetchAll(table, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await sb.from(table).select('*').order(order, { ascending: false }).range(from, from + 999));
    out.push(...rows); if (rows.length < 1000) return out;
  }
}
async function loadData() {
  const [profiles, stocks, money, returns, prices, cashPay] = await Promise.all([
    fetchAll('profiles', 'created_at'), fetchAll('investor_stocks', 'created_at'), fetchAll('investor_money', 'paid_on'),
    fetchAll('investor_returns', 'paid_on'), fetchAll('stock_prices', 'price_date'), fetchAll('investor_cash_payments', 'paid_on'),
  ]);
  S.data = { profiles, stocks, money, returns, prices, cashPay };
  const me = profiles.find((p) => p.id === S.me.id); if (me) S.me = me;
}
let reloadTimer;
function scheduleReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(async () => { try { await loadData(); renderView(); } catch (e) { console.error(e); } }, 350); }
let channel;
function subscribeLive() {
  channel?.unsubscribe();
  channel = sb.channel('db-changes').on('postgres_changes', { event: '*', schema: 'public' }, scheduleReload)
    .subscribe((status) => { S.live = status === 'SUBSCRIBED'; $('.live-dot')?.classList.toggle('on', S.live); });
}

// ---------- auth ----------
function renderSetup() {
  $('#app').innerHTML = `<div class="login"><div class="card"><h1>Connect Investor Ledger</h1>
    <p class="muted small" style="margin:0 0 16px">One-time setup. In Supabase open <b>Project Settings → API</b> and paste the two values.</p>
    <form id="setup-form"><div class="field"><label>Project URL</label><input name="url" required></div>
    <div class="field"><label>anon public key</label><textarea name="key" required></textarea></div>
    <button class="btn primary block">Connect</button></form></div></div>`;
  $('#setup-form').onsubmit = (e) => { e.preventDefault(); const f = formObj(e.target); location.hash = `s=${encodeURIComponent(f.url.trim().replace(/\/$/, ''))}&k=${encodeURIComponent(f.key.trim())}`; location.reload(); };
}
function renderLogin(msg = '') {
  if (!CONFIGURED) return renderSetup();
  $('#app').innerHTML = `<div class="login"><div class="card"><h1>Investor Ledger</h1>
    <p class="muted small" style="margin:0 0 16px">Sign in with the username and password you were given.</p>
    <form id="login-form">
      <div class="field"><label for="lu">Username</label><input id="lu" name="username" autocomplete="username" autocapitalize="none" required></div>
      <div class="field"><label for="lp">Password</label><input id="lp" name="password" type="password" autocomplete="current-password" required></div>
      ${msg ? `<p class="neg small">${esc(msg)}</p>` : ''}
      <button class="btn primary block" type="submit">Sign in</button></form></div></div>`;
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const { username, password } = formObj(e.target);
    const u = username.trim().toLowerCase(); const email = u.includes('@') ? u : `${u}@${CFG.LOGIN_DOMAIN || 'ledger.local'}`;
    await busy(e.submitter, async () => {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return renderLogin(error.message === 'Invalid login credentials' ? 'Wrong username or password' : error.message);
    });
  });
}
async function startSession(user) {
  const { data: me } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!me || !me.active || me.role === 'vendor') { await sb.auth.signOut(); return renderLogin('This login is not active here. Contact the owner.'); }
  S.me = me;
  try { await loadData(); } catch (e) { fail(e); }
  if (!isAdmin()) { const { data } = await sb.rpc('owner_contact'); S.owner = data?.[0] || null; }
  S.investor = isInvestor() ? S.me.id : (investors()[0]?.id || null);
  renderShell(); subscribeLive();
}
let sessionUser;
sb.auth.onAuthStateChange((event, session) => {
  const uid = session?.user?.id || null; if (uid === sessionUser) return; sessionUser = uid;
  if (uid) setTimeout(() => startSession(session.user), 0);
  else { channel?.unsubscribe(); S.me = null; renderLogin(); }
});

// ---------- shell ----------
const NAV = [['overview', 'Overview', '◎'], ['portfolio', 'Stocks', '📈'], ['cash', 'Cash', '₹'], ['settings', 'More', '☰']];
function renderShell() {
  $('#app').innerHTML = `
    <header class="topbar">
      <div class="topbar-row">
        <span class="brand">Investor Ledger</span><span class="live-dot ${S.live ? 'on' : ''}" title="Live updates"></span><span class="spacer"></span>
        ${!isAdmin() && S.owner?.phone ? `<button class="btn sm wa" id="ask-owner">WhatsApp Ronak</button>` : ''}
        <span class="muted small who">${esc(S.me.name)}</span>
        <button class="btn sm" id="logout">Sign out</button>
      </div>
      <div class="pick" id="pick"></div>
    </header>
    <main id="view"></main>
    <nav class="bottomnav"><div class="inner" id="bnav"></div></nav>`;
  $('#logout').onclick = () => sb.auth.signOut();
  $('#ask-owner')?.addEventListener('click', () => openWA(S.owner.phone, `Hi ${S.owner.name}, `));
  $('#bnav').addEventListener('click', (e) => { const t = e.target.closest('[data-view]'); if (!t) return; S.view = t.dataset.view; renderView(); window.scrollTo(0, 0); });
  $('#pick').addEventListener('click', (e) => { const t = e.target.closest('[data-inv]'); if (!t) return; S.investor = t.dataset.inv; renderView(); });
  renderView();
}
function renderView() {
  if (!S.me || !$('#view')) return;
  $('#bnav').innerHTML = NAV.map(([k, label, ico]) => `<button class="${S.view === k ? 'active' : ''}" data-view="${k}"><span class="ico">${ico}</span>${label}</button>`).join('');
  const list = investors();
  $('#pick').innerHTML = isAdmin() && list.length > 1 && S.view !== 'settings'
    ? list.map((p) => `<button class="chip ${S.investor === p.id ? 'active' : ''}" data-inv="${p.id}">${esc(p.name)}</button>`).join('') : '';
  $('#pick').classList.toggle('hidden', !$('#pick').innerHTML);
  const v = $('#view');
  ({ overview: viewOverview, portfolio: viewPortfolio, cash: viewCash, settings: viewSettings })[S.view](v);
}
const kpi = (label, value, sub = '') => `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const curInv = () => prof(S.investor) || (isInvestor() ? S.me : null);

// ---------- numbers ----------
function priceOn(symbol, exchange, date = '9999-12-31') {
  let best = null;
  for (const p of S.data.prices) if (p.symbol === symbol && p.exchange === exchange && p.price_date <= date && (!best || p.price_date > best.price_date)) best = p;
  return best;
}
function prevPrice(symbol, exchange, beforeDate) {
  let best = null;
  for (const p of S.data.prices) if (p.symbol === symbol && p.exchange === exchange && p.price_date < beforeDate && (!best || p.price_date > best.price_date)) best = p;
  return best;
}
// Shares account: shares he sold for us; we owe the shares back (valued at market)
function portfolio(invId, asOf = '9999-12-31') {
  const stocks = S.data.stocks.filter((x) => x.investor_id === invId && x.sold_on <= asOf);
  const rets = S.data.returns.filter((x) => x.investor_id === invId && x.paid_on <= asOf);
  const by = {};
  stocks.forEach((x) => { const r = (by[stockKey(x)] ||= { symbol: x.symbol, exchange: x.exchange, name: x.stock_name, soldQty: 0, invested: 0, retQty: 0, retValue: 0 });
    r.soldQty += Number(x.qty); r.invested += Number(x.qty) * Number(x.sell_rate); r.name ||= x.stock_name; });
  rets.forEach((x) => { const r = by[stockKey(x)]; if (r) { r.retQty += Number(x.qty); r.retValue += Number(x.amount); } });
  const rows = Object.values(by).map((r) => {
    const price = priceOn(r.symbol, r.exchange, asOf);
    const prev = price ? prevPrice(r.symbol, r.exchange, price.price_date) : null;
    const owed = Math.max(0, Math.round((r.soldQty - r.retQty) * 10000) / 10000);
    const avg = r.invested / r.soldQty;
    const ltp = price ? Number(price.close) : null;
    const cur = ltp != null ? owed * ltp : null;
    const costOwed = owed * avg;
    const dayChg = price && prev ? (Number(price.close) - Number(prev.close)) : null;
    return { ...r, owed, avg, ltp, price, cur, costOwed, pnl: cur != null ? cur - costOwed : null, pnlPct: cur != null && costOwed ? (cur - costOwed) / costOwed * 100 : null,
      dayChg, dayPct: dayChg != null && prev ? dayChg / Number(prev.close) * 100 : null, dayPnl: dayChg != null ? dayChg * owed : null };
  }).sort((a, b) => (b.cur || 0) - (a.cur || 0));
  const tot = { invested: sum(rows, (r) => r.costOwed), cur: sum(rows, (r) => r.cur || 0), returned: sum(rows, (r) => r.retValue),
    soldValue: sum(rows, (r) => r.invested), dayPnl: sum(rows.filter((r) => r.dayPnl != null), (r) => r.dayPnl), missing: rows.filter((r) => r.owed > 0 && !r.price).length };
  tot.pnl = tot.cur - tot.invested; tot.pnlPct = tot.invested ? tot.pnl / tot.invested * 100 : 0;
  tot.lastDate = rows.reduce((d, r) => r.price && r.price.price_date > d ? r.price.price_date : d, '');
  // The deal: the shares were leveraged, so only the money actually received (base) is owed,
  // moved up or down by the whole basket's change since the sell value.
  tot.base = sum(S.data.money.filter((x) => x.investor_id === invId && x.kind === 'shares' && x.paid_on <= asOf), (x) => x.amount);
  tot.move = tot.pnl;
  tot.due = Math.max(0, tot.base + tot.move);
  return { rows, tot };
}
// money received against the shares (what we actually got from the sale)
const sharesMoney = (invId) => S.data.money.filter((x) => x.investor_id === invId && x.kind === 'shares');
// Cash account: loans in rupees, repaid in rupees; "cash" and "other" are both cash
const cashIn = (invId) => S.data.money.filter((x) => x.investor_id === invId && x.kind !== 'shares');
const cashOut = (invId) => S.data.cashPay.filter((x) => x.investor_id === invId);
function cashLedger(invId) {
  const rows = [
    ...cashIn(invId).map((x) => ({ dir: 'in', date: x.paid_on, amount: Number(x.amount), title: x.note || x.reference || 'Cash received', desc: [x.mode, x.reference && x.note ? x.reference : null].filter(Boolean).join(' · '), x, table: 'investor_money' })),
    ...cashOut(invId).map((x) => ({ dir: 'out', date: x.paid_on, amount: Number(x.amount), title: x.note || x.reference || 'Paid back', desc: [x.mode, x.reference && x.note ? x.reference : null].filter(Boolean).join(' · '), x, table: 'investor_cash_payments' })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.x.id - b.x.id);
  let bal = 0; rows.forEach((r) => { bal += r.dir === 'in' ? r.amount : -r.amount; r.bal = bal; });
  return { rows: rows.reverse(), totIn: sum(rows.filter((r) => r.dir === 'in'), (r) => r.amount), totOut: sum(rows.filter((r) => r.dir === 'out'), (r) => r.amount), balance: bal };
}

// ============================================================
// OVERVIEW
// ============================================================
function viewOverview(v) {
  const inv = curInv();
  if (!inv) { v.innerHTML = `<div class="empty">No investors yet. Add one under <b>More</b>.</div>`; return; }
  const { rows, tot } = portfolio(inv.id); const cash = cashLedger(inv.id);
  const totalDue = tot.due + cash.balance;
  const you = isInvestor();
  v.innerHTML = `
    <div class="hero">
      <div class="label">${you ? 'Total due to you' : `Total due to ${esc(inv.name)}`}</div>
      <div class="value">${money(totalDue)}</div>
      <div class="sub">Shares ${money(tot.due)} + cash ${money(cash.balance)}${tot.lastDate ? ` · prices of ${fmtD(tot.lastDate)}` : ''}</div>
      <div class="grid2">
        <div><div class="k">Basket move today</div><div class="v">${tot.dayPnl ? signed(tot.dayPnl, false) : '—'}</div></div>
        <div><div class="k">Basket vs sell value</div><div class="v">${signed(tot.pnl, false)} (${pct(tot.pnlPct)})</div></div>
      </div>
    </div>
    <div class="section" style="margin-top:14px"><div class="section-head"><h2>Shares account</h2><button class="btn sm" data-go="portfolio">Open →</button></div>
      <div class="kpis">
        ${kpi(you ? 'Shares due to you' : 'Shares due', money(tot.due), `Base ${money(tot.base)} ${tot.move >= 0 ? '+' : '−'} ${money(Math.abs(tot.move))} basket move`)}
        ${kpi(you ? 'Money you received (base)' : 'Money received (base)', money(tot.base), 'Received when shares were sold')}
        ${kpi('Basket today', money(tot.cur), `${rows.filter((r) => r.owed > 0).length} stocks at market`)}
        ${kpi('Basket at sell value', money(tot.invested), 'Avg × qty owed')}
      </div>
      <p class="muted small" style="margin:8px 0 0">The shares were leveraged, so the amount due is the money received when they were sold, moved up or down by the whole basket's change since then.</p></div>
    <div class="section"><div class="section-head"><h2>Cash account</h2><button class="btn sm" data-go="cash">Open →</button></div>
      <div class="kpis">
        ${kpi(you ? 'Cash owed to you' : 'Cash owed', money(cash.balance), 'Received − paid back')}
        ${kpi(you ? 'You gave' : 'Received', money(cash.totIn), `${cashIn(inv.id).length} entries`)}
        ${kpi(you ? 'Paid back to you' : 'Paid back', money(cash.totOut), `${cashOut(inv.id).length} payments`)}
        ${kpi('Last entry', cash.rows[0] ? fmtD(cash.rows[0].date) : '—', cash.rows[0] ? esc(cash.rows[0].title) : '')}
      </div></div>
    ${tot.missing ? `<p class="neg small">${tot.missing} stock(s) have no price yet. Press <b>Update prices</b> on the Stocks tab.</p>` : ''}
    ${isAdmin() ? `<div class="row"><button class="btn wa" id="ov-wa" ${inv.phone ? '' : 'disabled title="Add phone"'}>Send update on WhatsApp</button><button class="btn" id="ov-copy">Copy statement</button></div>` : ''}`;
  v.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => { S.view = b.dataset.go; renderView(); });
  if (isAdmin()) { $('#ov-wa').onclick = () => openWA(inv.phone, statementText(inv)); $('#ov-copy').onclick = () => copy(statementText(inv), 'Statement copied'); }
}
function statementText(inv) {
  const { rows, tot } = portfolio(inv.id); const cash = cashLedger(inv.id);
  return [`Hi ${inv.name}, your statement${tot.lastDate ? ` (prices of ${fmtD(tot.lastDate)})` : ''}:`, '',
    '*Shares account*', ...rows.filter((r) => r.owed > 0).map((r) => `${r.symbol}: ${qtyFmt(r.owed)} × ${r.ltp != null ? money2(r.ltp) : '?'} = ${r.cur != null ? money(r.cur) : '—'}`),
    `Basket today ${money(tot.cur)} vs sell value ${money(tot.invested)} (${signed(tot.pnl).replace(/<[^>]+>/g, '')})`,
    `Base received ${money(tot.base)} ${tot.move >= 0 ? '+' : '−'} ${money(Math.abs(tot.move))} basket move = *${money(tot.due)}*`, '',
    '*Cash account*', `Received ${money(cash.totIn)} − paid back ${money(cash.totOut)} = *${money(cash.balance)}*`, '',
    `*Total due: ${money(tot.due + cash.balance)}*`, '', `Details: ${APP_URL}`].join('\n');
}

// ============================================================
// PORTFOLIO (Kite-style holdings)
// ============================================================
function viewPortfolio(v) {
  const inv = curInv(); if (!inv) { v.innerHTML = '<div class="empty">No investor selected</div>'; return; }
  const { rows, tot } = portfolio(inv.id);
  const held = rows.filter((r) => r.owed > 0); const closed = rows.filter((r) => r.owed === 0);
  const cls = (n) => n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  v.innerHTML = `
    <div class="hero ${tot.pnl >= 0 ? 'green' : 'red'}">
      <div class="label">Holdings (${held.length}) · basket value</div>
      <div class="value">${money(tot.cur)}</div>
      <div class="sub">${tot.lastDate ? `Prices of ${fmtD(tot.lastDate)} · ` : ''}sell value ${money(tot.invested)}</div>
      <div class="grid2">
        <div><div class="k">Total P&L</div><div class="v">${signed(tot.pnl, false)} <span style="font-size:.85rem;opacity:.9">${pct(tot.pnlPct)}</span></div></div>
        <div><div class="k">Day's P&L</div><div class="v">${tot.dayPnl ? signed(tot.dayPnl, false) : '—'}</div></div>
        <div><div class="k">Base received</div><div class="v">${money(tot.base)}</div></div>
        <div><div class="k">${isInvestor() ? 'Due to you' : 'Due'}</div><div class="v">${money(tot.due)} <span style="font-size:.8rem;opacity:.9">(${tot.move >= 0 ? '+' : '−'}${money(Math.abs(tot.move))})</span></div></div>
      </div>
    </div>
    <div class="row" style="margin:12px 0">
      <button class="btn" id="pf-refresh">↻ Update prices</button>
      ${isAdmin() ? `<button class="btn primary" id="pf-add">+ Stock sold</button><button class="btn" id="pf-return">Return shares</button><button class="btn" id="pf-price">Type a price</button>` : `<button class="btn primary" id="pf-add">+ Add a share I sold</button>`}
    </div>
    ${tot.missing ? `<p class="neg small">${tot.missing} stock(s) have no price yet.</p>` : ''}
    <div class="holdings-head"><span>Stock · Qty · Avg · LTP</span><span>P&L</span></div>
    ${held.length ? held.map((r) => `<div class="holding" data-sym="${esc(stockKey(r))}">
      <div><div class="sym">${esc(r.symbol)} <span class="muted tiny">${r.exchange}</span></div><div class="meta">${qtyFmt(r.owed)} shares · Avg ${money2(r.avg)}</div></div>
      <div><div class="pnl ${cls(r.pnl)}">${r.pnl != null ? signed(r.pnl, false) : '—'}</div><div class="pct ${cls(r.pnl)}">${r.pnlPct != null ? pct(r.pnlPct) : ''}</div></div>
      <div class="line2">
        <span>Invested <b>${money(r.costOwed)}</b></span>
        <span>Cur. val <b>${r.cur != null ? money(r.cur) : '—'}</b></span>
        <span>LTP <b>${r.ltp != null ? money2(r.ltp) : '—'}</b> ${r.dayPct != null ? `<span class="${cls(r.dayChg)}">${pct(r.dayPct)}</span>` : ''}</span>
      </div>
      ${!r.price ? '<div class="nopx">No price yet</div>' : r.price.source === 'manual' ? `<div class="line2"><span class="muted">Price typed by owner on ${fmtD(r.price.price_date)}</span></div>` : ''}
    </div>`).join('') : '<div class="empty">No shares owed</div>'}
    ${closed.length ? `<h3 class="muted" style="margin:16px 0 8px">Fully returned</h3>${closed.map((r) => `<div class="holding"><div><div class="sym">${esc(r.symbol)}</div><div class="meta">${qtyFmt(r.soldQty)} shares returned · ${money(r.retValue)}</div></div><div class="pill good">closed</div></div>`).join('')}` : ''}
    <div class="section" style="margin-top:18px"><div class="section-head"><h2>Daily value</h2></div>
      ${(() => { const d = daily(inv.id); return d.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th class="r">Basket</th><th class="r">Change</th><th class="r">Due</th></tr></thead><tbody>
        ${d.map((x, i) => `<tr><td>${fmtD(x.date)}</td><td class="r num">${money(x.value)}</td><td class="r">${d[i + 1] ? signed(x.value - d[i + 1].value) : ''}</td><td class="r num">${money(x.due)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Appears once prices are in</div>'; })()}
    </div>
    <div class="section"><div class="section-head"><h2>${isAdmin() ? 'Sale entries' : 'My sale entries'}</h2></div>
      <div class="list">${S.data.stocks.filter((x) => x.investor_id === inv.id).sort((a, b) => b.sold_on.localeCompare(a.sold_on) || b.id - a.id).map((x) => {
        const mine = x.created_by === S.me.id;
        return `<div class="item row between"><div><b>${esc(x.symbol)}</b> <span class="muted small">${x.exchange} · ${qtyFmt(x.qty)} @ ${money2(x.sell_rate)} = ${money(Number(x.qty) * Number(x.sell_rate))} · ${fmtD(x.sold_on)}${x.note ? ` · ${esc(x.note)}` : ''}</span></div>
          ${isAdmin() || mine ? `<div class="row"><button class="icon-btn" data-edit-stock="${x.id}" title="Edit">✎</button><button class="icon-btn" data-del-stock="${x.id}" title="Delete">🗑</button></div>` : ''}</div>`; }).join('') || '<div class="empty">None yet</div>'}</div></div>`;
  $('#pf-add').onclick = () => stockForm(inv);
  $('#pf-refresh').onclick = (e) => busy(e.target, async () => {
    const n = must(await sb.rpc('queue_price_fetch')); if (!n) return toast('No stocks to price');
    await new Promise((r) => setTimeout(r, 5000)); const got = must(await sb.rpc('collect_prices'));
    toast(`Prices updated: ${got} of ${n}${got < n ? ' – try again in a minute' : ''}`); scheduleReload();
  });
  v.querySelectorAll('[data-del-stock]').forEach((b) => b.onclick = () => confirm('Delete this sale entry?') && busy(b, async () => { must(await sb.from('investor_stocks').delete().eq('id', b.dataset.delStock)); toast('Deleted'); scheduleReload(); }));
  v.querySelectorAll('[data-edit-stock]').forEach((b) => b.onclick = () => stockForm(inv, S.data.stocks.find((x) => x.id === Number(b.dataset.editStock))));
  if (isAdmin()) { $('#pf-return').onclick = () => returnSharesForm(inv, rows); $('#pf-price').onclick = () => priceForm(rows); }
}
function daily(invId, days = 30) {
  const syms = new Set(S.data.stocks.filter((x) => x.investor_id === invId).map(stockKey));
  const dates = [...new Set(S.data.prices.filter((p) => syms.has(stockKey(p))).map((p) => p.price_date))].sort().reverse().slice(0, days);
  return dates.map((d) => { const t = portfolio(invId, d).tot; return { date: d, value: t.cur, due: t.due }; });
}

// ============================================================
// CASH (UPI-style transactions)
// ============================================================
function viewCash(v) {
  const inv = curInv(); if (!inv) { v.innerHTML = '<div class="empty">No investor selected</div>'; return; }
  const led = cashLedger(inv.id); const you = isInvestor();
  const months = [...new Set(led.rows.map((r) => r.date.slice(0, 7)))];
  const rows = S.cashMonth === 'all' ? led.rows : led.rows.filter((r) => r.date.startsWith(S.cashMonth));
  const groups = []; rows.forEach((r) => { const g = groups[groups.length - 1]; if (g && g.date === r.date) g.rows.push(r); else groups.push({ date: r.date, rows: [r] }); });
  const monthName = (m) => new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  v.innerHTML = `
    <div class="hero">
      <div class="label">${you ? 'Cash owed to you' : `Cash owed to ${esc(inv.name)}`}</div>
      <div class="value">${money(led.balance)}</div>
      <div class="sub">Plain cash, nothing to do with shares</div>
      <div class="grid2"><div><div class="k">${you ? 'You gave' : 'Received'}</div><div class="v">${money(led.totIn)}</div></div><div><div class="k">${you ? 'Paid back to you' : 'Paid back'}</div><div class="v">${money(led.totOut)}</div></div></div>
    </div>
    <div class="row" style="margin:12px 0;flex-wrap:nowrap">
      <select id="cash-month" style="width:auto;min-width:0;flex:1 1 120px"><option value="all">All months</option>${months.map((m) => `<option value="${m}" ${S.cashMonth === m ? 'selected' : ''}>${monthName(m)}</option>`).join('')}</select>
      ${isAdmin() ? `<button class="btn" id="cash-out" style="flex:none">− Paid</button>` : ''}
      <button class="btn primary" id="cash-in" style="flex:none">${you ? '+ Gave' : '+ Received'}</button>
    </div>
    ${groups.length ? groups.map((g) => `<div class="daysep">${fmtD(g.date)}</div>${g.rows.map((r) => `<div class="txn">
      <div class="avatar ${r.dir}">${r.dir === 'in' ? '↓' : '↑'}</div>
      <div class="body"><div class="title">${esc(r.title)}</div><div class="desc">${r.dir === 'in' ? (you ? 'You gave' : `Received from ${esc(inv.name)}`) : (you ? 'Paid back to you' : `Paid to ${esc(inv.name)}`)}${r.desc ? ` · ${esc(r.desc)}` : ''}</div></div>
      <div class="amt"><div class="v ${r.dir === 'in' ? 'pos' : 'neg'}">${r.dir === 'in' ? '+' : '−'}${money(r.amount)}</div><div class="bal">bal ${money(r.bal)}</div></div>
      ${isAdmin() || (r.dir === 'in' && r.x.created_by === S.me.id) ? `<button class="icon-btn" data-del="${r.table}:${r.x.id}" title="Delete">🗑</button>` : ''}
    </div>`).join('')}`).join('') : '<div class="empty">No cash entries</div>'}`;
  $('#cash-month').onchange = (e) => { S.cashMonth = e.target.value; renderView(); };
  $('#cash-in').onclick = () => cashForm(inv, 'in');
  $('#cash-out')?.addEventListener('click', () => cashForm(inv, 'out'));
  v.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => confirm('Delete this entry?') && busy(b, async () => {
    const [t, id] = b.dataset.del.split(':'); must(await sb.from(t).delete().eq('id', id)); toast('Deleted'); scheduleReload(); }));
}
function cashForm(inv, dir) {
  const admin = isAdmin();
  openModal(dir === 'in' ? (admin ? `Cash received from ${inv.name}` : 'Money I gave') : `Paid back to ${inv.name}`, `
    <form id="cash-form">
      <div class="fields two">
        <div class="field"><label>Amount ₹</label><input name="amount" type="number" step="0.01" min="0.01" inputmode="decimal" required autofocus></div>
        <div class="field"><label>Date</label><input name="paid_on" type="date" value="${todayIST()}" required></div>
        <div class="field"><label>Mode</label><select name="mode">${['UPI', 'Bank transfer', 'Cash', 'Other'].map((m) => `<option>${m}</option>`).join('')}</select></div>
        <div class="field"><label>Reference / UTR</label><input name="reference"></div>
      </div>
      <div class="field"><label>Description (shown on the entry)</label><input name="note" placeholder="e.g. Yash, Avi, MCX" required></div>
      <button class="btn primary block">Save</button>
    </form>`, (root) => {
    $('#cash-form', root).onsubmit = (e) => {
      e.preventDefault(); const f = formObj(e.target);
      busy(e.submitter, async () => {
        if (dir === 'in') must(await sb.from('investor_money').insert({ investor_id: inv.id, kind: 'cash', amount: Number(f.amount), paid_on: f.paid_on, mode: f.mode, reference: f.reference.trim() || null, note: f.note.trim() || null }));
        else must(await sb.from('investor_cash_payments').insert({ investor_id: inv.id, amount: Number(f.amount), paid_on: f.paid_on, mode: f.mode, reference: f.reference.trim() || null, note: f.note.trim() || null }));
        modal.close(); toast('Saved'); scheduleReload();
      });
    };
  });
}

// ============================================================
// FORMS: stock sold, return shares, price, money for shares
// ============================================================
function stockForm(inv, x = null) {
  const me = !isAdmin();
  openModal(x ? 'Edit sale entry' : me ? 'Add a share you sold' : `Stock sold by ${inv.name}`, `
    <form id="stk-form"><div class="fields two">
      <div class="field"><label>Stock symbol (NSE/BSE)</label><input name="symbol" value="${esc(x?.symbol)}" required autocapitalize="characters" placeholder="RELIANCE"></div>
      <div class="field"><label>Exchange</label><select name="exchange"><option>NSE</option><option ${x?.exchange === 'BSE' ? 'selected' : ''}>BSE</option></select></div>
      <div class="field"><label>Quantity</label><input name="qty" type="number" step="0.0001" min="0.0001" inputmode="decimal" value="${esc(x?.qty ?? '')}" required></div>
      <div class="field"><label>Sold at ₹ per share</label><input name="sell_rate" type="number" step="0.01" min="0.01" inputmode="decimal" value="${esc(x?.sell_rate ?? '')}" required></div>
      <div class="field"><label>Date sold</label><input name="sold_on" type="date" value="${esc(x?.sold_on || todayIST())}" required></div>
      <div class="field"><label>Company name</label><input name="stock_name" value="${esc(x?.stock_name)}"></div></div>
      <div class="card small" id="stk-total" style="margin-bottom:12px"></div>
      <div class="field"><label>Note</label><input name="note" value="${esc(x?.note)}"></div>
      <button class="btn primary block">${x ? 'Save' : 'Add stock'}</button></form>`, (root) => {
    const form = $('#stk-form', root);
    const tot = () => { const f = formObj(form); $('#stk-total', root).innerHTML = `Sale value: <b>${money(Number(f.qty || 0) * Number(f.sell_rate || 0))}</b>`; };
    form.addEventListener('input', tot); tot();
    form.onsubmit = (e) => { e.preventDefault(); const f = formObj(form);
      const row = { investor_id: inv.id, symbol: f.symbol.trim().toUpperCase(), exchange: f.exchange, qty: Number(f.qty), sell_rate: Number(f.sell_rate), sold_on: f.sold_on, stock_name: f.stock_name.trim() || null, note: f.note.trim() || null };
      busy(e.submitter, async () => { if (x) must(await sb.from('investor_stocks').update(row).eq('id', x.id)); else must(await sb.from('investor_stocks').insert(row)); modal.close(); toast('Saved – press Update prices'); scheduleReload(); }); };
  });
}
function returnSharesForm(inv, rows) {
  const open = rows.filter((r) => r.owed > 0); if (!open.length) return toast('Nothing owed', 'error');
  openModal(`Return shares to ${inv.name}`, `
    <form id="ret-form">
      <div class="field"><label>Stock</label><select name="stock">${open.map((r) => `<option value="${esc(stockKey(r))}">${esc(r.symbol)} (${r.exchange}) – ${qtyFmt(r.owed)} owed</option>`).join('')}</select></div>
      <div class="fields two">
        <div class="field"><label>Shares returned</label><input name="qty" type="number" step="0.0001" min="0.0001" inputmode="decimal" required></div>
        <div class="field"><label>Price per share ₹ (for the record)</label><input name="rate" type="number" step="0.01" min="0.01" inputmode="decimal" required></div>
        <div class="field"><label>Date</label><input name="paid_on" type="date" value="${todayIST()}" required></div>
        <div class="field"><label>Reference / note</label><input name="reference"></div></div>
      <div class="card small" id="ret-calc" style="margin-bottom:12px"></div>
      <button class="btn primary block">Save</button></form>`, (root) => {
    const form = $('#ret-form', root); const el = form.elements;
    const cur = () => open.find((r) => stockKey(r) === el.stock.value);
    const fillRate = () => { const r = cur(); if (r?.ltp != null) el.rate.value = r.ltp; };
    const sync = () => { const r = cur(); const q = Number(el.qty.value || 0); $('#ret-calc', root).innerHTML = `Value <b>${money(q * Number(el.rate.value || 0))}</b>. Left owed: ${qtyFmt(Math.max(0, Math.round((r.owed - q) * 10000) / 10000))} shares`; };
    el.stock.onchange = () => { fillRate(); sync(); }; form.addEventListener('input', sync); fillRate(); sync();
    form.onsubmit = (e) => { e.preventDefault(); const f = formObj(form); const r = cur();
      busy(e.submitter, async () => { must(await sb.from('investor_returns').insert({ investor_id: inv.id, symbol: r.symbol, exchange: r.exchange, mode: 'shares', rate: Number(f.rate), paid_on: f.paid_on, qty: Number(f.qty), amount: Number(f.qty) * Number(f.rate), payment_mode: 'Shares', reference: f.reference.trim() || null })); modal.close(); toast('Saved'); scheduleReload(); }); };
  });
}
function priceForm(rows) {
  if (!rows.length) return toast('Add a stock first', 'error');
  openModal('Type a closing price', `<form id="px-form">
      <div class="field"><label>Stock</label><select name="stock">${rows.map((r) => `<option value="${esc(stockKey(r))}">${esc(r.symbol)} (${r.exchange})</option>`).join('')}</select></div>
      <div class="fields two"><div class="field"><label>Date</label><input name="price_date" type="date" value="${todayIST()}" required></div>
      <div class="field"><label>Closing price ₹</label><input name="close" type="number" step="0.01" min="0.01" inputmode="decimal" required></div></div>
      <p class="muted small">A typed price is never overwritten by the automatic update.</p>
      <button class="btn primary block">Save price</button></form>`, (root) => {
    $('#px-form', root).onsubmit = (e) => { e.preventDefault(); const f = formObj(e.target); const [symbol, exchange] = f.stock.split('|');
      busy(e.submitter, async () => { must(await sb.from('stock_prices').upsert({ symbol, exchange, price_date: f.price_date, close: Number(f.close), source: 'manual', updated_at: new Date().toISOString() })); modal.close(); toast('Price saved'); scheduleReload(); }); };
  });
}
function sharesMoneyForm(inv) {
  openModal(isAdmin() ? `Money received for ${inv.name}'s shares` : 'Money I received for shares', `<form id="sm-form">
      <div class="fields two"><div class="field"><label>Amount ₹</label><input name="amount" type="number" step="0.01" min="0.01" inputmode="decimal" required></div>
      <div class="field"><label>Date</label><input name="paid_on" type="date" value="${todayIST()}" required></div>
      <div class="field"><label>Mode</label><select name="mode">${['Bank transfer', 'UPI', 'Cash', 'Other'].map((m) => `<option>${m}</option>`).join('')}</select></div>
      <div class="field"><label>Reference</label><input name="reference"></div></div>
      <div class="field"><label>Note</label><input name="note"></div>
      <button class="btn primary block">Save</button></form>`, (root) => {
    $('#sm-form', root).onsubmit = (e) => { e.preventDefault(); const f = formObj(e.target);
      busy(e.submitter, async () => { must(await sb.from('investor_money').insert({ investor_id: inv.id, kind: 'shares', amount: Number(f.amount), paid_on: f.paid_on, mode: f.mode, reference: f.reference.trim() || null, note: f.note.trim() || null })); modal.close(); toast('Saved'); scheduleReload(); }); };
  });
}

// ============================================================
// MORE / SETTINGS
// ============================================================
function viewSettings(v) {
  const inv = curInv();
  if (!isAdmin()) {
    v.innerHTML = `<div class="card"><h2>About</h2><p class="muted small" style="margin:6px 0 0">This app shows your shares account and your cash account. Shares: the basket you sold is tracked at today's market price; the amount due is the money received when it was sold, moved up or down by the basket's change since then. Cash: money you gave and got back, nothing to do with shares. Prices update on weekday afternoons; press Update prices on the Stocks tab for a fresh one.</p></div>
      ${inv ? `<div class="card" style="margin-top:12px"><h2>Money received for shares</h2><div class="list" style="margin-top:8px">${sharesMoney(inv.id).map((x) => `<div class="item row between"><div><b>${money(x.amount)}</b><div class="muted small">${fmtD(x.paid_on)}${x.mode ? ` · ${esc(x.mode)}` : ''}${x.reference ? ` · ${esc(x.reference)}` : ''}${x.note ? ` · ${esc(x.note)}` : ''}</div></div></div>`).join('') || '<div class="empty">None</div>'}</div></div>` : ''}`;
    return;
  }
  v.innerHTML = `
    <div class="section-head"><h2>Investors</h2><button class="btn primary" id="add-inv">+ Add investor</button></div>
    <div class="list section">${investors().map((p) => { const { tot } = portfolio(p.id); const c = cashLedger(p.id); return `<div class="item" data-pid="${p.id}">
      <div class="row between"><div><h3>${esc(p.name)}</h3><div class="muted small">Login: <span class="secret">${esc(p.username)}</span>${p.phone ? ` · ${esc(p.phone)}` : ''}</div></div><span class="pill ${p.active ? 'good' : 'bad'}">${p.active ? 'active' : 'off'}</span></div>
      <div class="small" style="margin-top:6px">Shares ${money(tot.due)} · Cash ${money(c.balance)} · <b>Total ${money(tot.due + c.balance)}</b></div>
      <div class="actions"><button class="btn sm" data-act="edit">Edit</button><button class="btn sm" data-act="pw">Reset password</button><button class="btn sm" data-act="money">+ Money for shares</button><button class="btn sm ${p.active ? 'danger' : ''}" data-act="toggle">${p.active ? 'Deactivate' : 'Activate'}</button></div></div>`; }).join('') || '<div class="empty">No investors yet</div>'}</div>
    ${inv ? `<div class="card section"><h3>Money received for ${esc(inv.name)}'s shares</h3><div class="list" style="margin-top:8px">${sharesMoney(inv.id).map((x) => `<div class="item row between"><div><b>${money(x.amount)}</b><div class="muted small">${fmtD(x.paid_on)}${x.mode ? ` · ${esc(x.mode)}` : ''}${x.reference ? ` · ${esc(x.reference)}` : ''}${x.note ? ` · ${esc(x.note)}` : ''}</div></div><button class="icon-btn" data-del-sm="${x.id}" title="Delete">🗑</button></div>`).join('') || '<div class="empty">None</div>'}</div></div>` : ''}
    <div class="card section"><h3 style="margin-bottom:8px">My details</h3>
      <form id="me-form" class="row"><input name="name" value="${esc(S.me.name)}" placeholder="Name" style="flex:1 1 140px;width:auto" required><input name="phone" value="${esc(S.me.phone)}" placeholder="WhatsApp no." type="tel" style="flex:1 1 160px;width:auto"><button class="btn">Save</button></form>
      <p class="muted small" style="margin:8px 0 0">Investors use this number for the WhatsApp button.</p></div>
    <div class="card"><h3 style="margin-bottom:8px">App link</h3><p class="muted small" style="margin:0 0 8px">Same link for everyone; the login decides what each person sees.</p><button class="btn block" id="copy-link">Copy app link</button></div>`;
  $('#add-inv').onclick = () => investorForm();
  $('#copy-link').onclick = () => copy(shareLink(), 'App link copied');
  $('#me-form').onsubmit = (e) => { e.preventDefault(); const f = formObj(e.target); busy(e.submitter, async () => { must(await sb.from('profiles').update({ name: f.name.trim(), phone: f.phone.trim() || null }).eq('id', S.me.id)); toast('Saved'); scheduleReload(); }); };
  v.querySelectorAll('[data-del-sm]').forEach((b) => b.onclick = () => confirm('Delete this entry?') && busy(b, async () => { must(await sb.from('investor_money').delete().eq('id', b.dataset.delSm)); toast('Deleted'); scheduleReload(); }));
  v.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => {
    const p = prof(b.closest('[data-pid]').dataset.pid); const act = b.dataset.act;
    if (act === 'edit') investorForm(p);
    if (act === 'money') sharesMoneyForm(p);
    if (act === 'pw') { const pw = prompt(`New password for ${p.name} (min 6 characters):`); if (!pw) return; busy(b, async () => { must(await sb.rpc('admin_set_password', { p_user: p.id, p_password: pw })); credentialsModal(p, pw, 'Password changed'); }); }
    if (act === 'toggle' && confirm(`${p.active ? 'Deactivate' : 'Activate'} ${p.name}?`)) busy(b, async () => { must(await sb.rpc('admin_set_active', { p_user: p.id, p_active: !p.active })); toast('Updated'); scheduleReload(); });
  });
}
function investorForm(p = null) {
  openModal(p ? 'Edit investor' : 'Add investor', `<form id="inv-form">
      <div class="field"><label>Name</label><input name="name" value="${esc(p?.name)}" required></div>
      <div class="field"><label>WhatsApp number</label><input name="phone" type="tel" value="${esc(p?.phone)}"></div>
      ${p ? '' : `<div class="fields two"><div class="field"><label>Login username</label><input name="username" required autocapitalize="none" pattern="[A-Za-z0-9._\\-]{3,30}"></div>
      <div class="field"><label>Password</label><input name="password" required minlength="6" value="${Math.random().toString(36).slice(2, 10)}"></div></div>`}
      <button class="btn primary block">${p ? 'Save' : 'Add investor'}</button></form>`, (root) => {
    $('#inv-form', root).onsubmit = (e) => { e.preventDefault(); const f = formObj(e.target);
      busy(e.submitter, async () => {
        if (p) { must(await sb.from('profiles').update({ name: f.name.trim(), phone: f.phone.trim() || null }).eq('id', p.id)); modal.close(); toast('Saved'); }
        else { const id = must(await sb.rpc('admin_create_investor', { p_username: f.username, p_password: f.password, p_name: f.name, p_phone: f.phone || null })); S.investor = id; credentialsModal({ name: f.name.trim(), username: f.username.trim().toLowerCase(), phone: f.phone }, f.password, 'Investor added'); }
        scheduleReload();
      }); };
  });
}
function credentialsModal(p, pw, title) {
  const text = `Hi ${p.name}, your login for the Investor Ledger:\n\nLink: ${shareLink()}\nUsername: ${p.username}\nPassword: ${pw}\n\nYou can see your shares (valued daily at market price), your cash account and every payment there.`;
  openModal(title, `<dl class="kv" style="margin-bottom:14px"><dt>Link</dt><dd>${esc(APP_URL)}</dd><dt>Username</dt><dd class="secret">${esc(p.username)}</dd><dt>Password</dt><dd class="secret">${esc(pw)}</dd></dl>
    <div class="stack">${p.phone ? `<a class="btn wa block" href="${esc(waUrl(p.phone, text))}" target="_blank" rel="noopener">Send login on WhatsApp</a>` : ''}<button class="btn block" id="copy-cred">Copy login details</button></div>`,
    (root) => { $('#copy-cred', root).onclick = () => copy(text, 'Login details copied'); });
}
