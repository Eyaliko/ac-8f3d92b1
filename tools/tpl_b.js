/* ============================ core ============================ */
const META = RAW.meta;
const F = META.daily_fields;
const DAILY = RAW.daily.map(r => { const o = {}; F.forEach((k, i) => o[k] = r[i]); o.guests = (o.adults || 0) + (o.children || 0); return o; });
DAILY.forEach(d => { const p = d.date.split('-'); d.dow = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); });
const BYDATE = new Map(DAILY.map(d => [d.date, d]));
const DMIN = DAILY[0].date, DMAX = DAILY[DAILY.length - 1].date;

const PF = META.prod_fields;
const PROD = RAW.prod.map(r => { const o = {}; PF.forEach((k, i) => o[k] = r[i]); return o; });
PROD.forEach(p => {
  p.lead = (p.check_in && p.book_date) ? dayDiff(p.book_date, p.check_in) : null;
  p.nights = p.nights || 0;
  p.total = p.total || 0; p.room_total = p.room_total || 0;
  p.country = (p.country || '').toUpperCase() || '—';
  p.source = p.source || '—'; p.room_type = p.room_type || '—'; p.status = p.status || '—';
});
const PRODMIN = META.prod_days[0], PRODMAX = META.prod_days[META.prod_days.length - 1];

/* -------- date helpers (all UTC, ISO strings) -------- */
function iso(d) { return d.toISOString().slice(0, 10); }
function parse(s) { const p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
function addDays(s, n) { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function addYears(s, n) { const d = parse(s); d.setUTCFullYear(d.getUTCFullYear() + n); return iso(d); }
function dayDiff(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
function clampDate(s) { return s < DMIN ? DMIN : (s > DMAX ? DMAX : s); }
function monthStart(s) { return s.slice(0, 8) + '01'; }
function weekStart(s) { const d = parse(s); const w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return iso(d); }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOWN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function fmtDay(s) { const p = s.split('-'); return +p[2] + ' ' + MON[+p[1] - 1]; }
function fmtDayY(s) { const p = s.split('-'); return +p[2] + ' ' + MON[+p[1] - 1] + ' ' + p[0]; }
function fmtMon(s) { const p = s.split('-'); return MON[+p[1] - 1] + ' ' + p[0].slice(2); }

/* -------- number formats -------- */
const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function num(v) { return v == null ? '—' : nf0.format(v); }
function num1(v) { return v == null ? '—' : nf1.format(v); }
function eur0(v) { return v == null ? '—' : '€' + nf0.format(v); }
function eur2(v) { return v == null ? '—' : '€' + nf2.format(v); }
function eurC(v) {
  if (v == null) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return '€' + nf2.format(v / 1e6) + 'M';
  if (a >= 10000) return '€' + nf0.format(v / 1000) + 'k';
  return '€' + nf0.format(v);
}
function pct(v) { return v == null ? '—' : nf1.format(v * 100) + '%'; }
function pct0(v) { return v == null ? '—' : nf0.format(v * 100) + '%'; }

/* ============================ aggregation ============================ */
const SUMK = ['avail', 'occ', 'rev', 'rrooms', 'rfb', 'roth', 'arr', 'dep', 'noshow', 'adults', 'children', 'guests', 'beds', 'dayuse', 'ooo'];
function agg(from, to) {
  const s = { n: 0, derived: 0, est: 0, from, to };
  SUMK.forEach(k => s[k] = 0);
  for (const d of DAILY) {
    if (d.date < from || d.date > to) continue;
    s.n++; if (d.src === 1) s.derived++; if (d.src === 2) s.est++;
    SUMK.forEach(k => s[k] += (d[k] || 0));
  }
  return s;
}
const MET = {
  occPct: { label: 'Occupancy', short: 'Occ.', fmt: pct, get: s => s.avail ? s.occ / s.avail : null, goodUp: true, axis: pct0 },
  adr: { label: 'ADR', short: 'ADR', fmt: eur2, get: s => s.occ ? s.rrooms / s.occ : null, goodUp: true, axis: eur0 },
  revpar: { label: 'RevPAR', short: 'RevPAR', fmt: eur2, get: s => s.avail ? s.rrooms / s.avail : null, goodUp: true, axis: eur0 },
  rev: { label: 'Total revenue', short: 'Revenue', fmt: eurC, get: s => s.rev, goodUp: true, axis: eurC },
  rrooms: { label: 'Room revenue', short: 'Rooms', fmt: eurC, get: s => s.rrooms, goodUp: true, axis: eurC },
  rfb: { label: 'F&B revenue', short: 'F&B', fmt: eurC, get: s => s.rfb, goodUp: true, axis: eurC },
  occ: { label: 'Rooms sold', short: 'Rooms', fmt: num, get: s => s.occ, goodUp: true, axis: num },
  guests: { label: 'Guests', short: 'Guests', fmt: num, get: s => s.guests, goodUp: true, axis: num },
  trevpar: { label: 'Total RevPAR', short: 'TRevPAR', fmt: eur2, get: s => s.avail ? s.rev / s.avail : null, goodUp: true, axis: eur0 },
  revocc: { label: 'Revenue per occupied room', short: '€/room', fmt: eur2, get: s => s.occ ? s.rev / s.occ : null, goodUp: true, axis: eur0 },
  alos: { label: 'Average stay', short: 'ALOS', fmt: v => v == null ? '—' : nf2.format(v) + ' n', get: s => s.arr ? s.occ / s.arr : null, goodUp: true, axis: num1 },
  noshow: { label: 'No-shows', short: 'No-show', fmt: num, get: s => s.noshow, goodUp: false, axis: num },
};

function bucketize(from, to, gran) {
  const keyf = gran === 'month' ? monthStart : (gran === 'week' ? weekStart : (x => x));
  const map = new Map();
  for (const d of DAILY) {
    if (d.date < from || d.date > to) continue;
    const k = keyf(d.date);
    let b = map.get(k);
    if (!b) { b = { key: k, n: 0, derived: 0, est: 0 }; SUMK.forEach(x => b[x] = 0); map.set(k, b); }
    b.n++; if (d.src === 1) b.derived++; if (d.src === 2) b.est++;
    SUMK.forEach(x => b[x] += (d[x] || 0));
  }
  return [...map.values()].sort((a, b) => a.key < b.key ? -1 : 1);
}
function autoGran(from, to) { const n = dayDiff(from, to) + 1; return n <= 62 ? 'day' : (n <= 400 ? 'week' : 'month'); }

/* ============================ svg helpers ============================ */
const NS = 'http://www.w3.org/2000/svg';
function el(tag, at) { const e = document.createElementNS(NS, tag); for (const k in at) if (at[k] != null) e.setAttribute(k, at[k]); return e; }
function txt(s) { return document.createTextNode(s); }
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
function cssv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
const SERIES = i => cssv('--s' + (((i % 8) + 8) % 8 + 1));

function niceTicks(min, max, count) {
  if (!isFinite(min) || !isFinite(max)) return [0, 1];
  if (min === max) { if (min === 0) return [0, 1]; min = Math.min(0, min); max = max * 1.2; }
  const span = max - min, raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = []; for (let v = lo; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
function frame(svg, h) {
  clear(svg);
  const w = Math.max(320, svg.clientWidth || svg.parentNode.clientWidth || 640);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('height', h);
  return { w, h, g: svg };
}
function yAxis(g, ticks, y, x0, x1, fmt) {
  ticks.forEach(t => {
    g.appendChild(el('line', { class: 'gridline', x1: x0, x2: x1, y1: y(t), y2: y(t) }));
    const tx = el('text', { class: 'tick', x: x0 - 7, y: y(t) + 3.5, 'text-anchor': 'end' });
    tx.appendChild(txt(fmt(t))); g.appendChild(tx);
  });
}
function xLabels(g, items, xf, yy, every) {
  items.forEach((it, i) => {
    if (every && i % every !== 0) return;
    const tx = el('text', { class: 'tick', x: xf(i), y: yy, 'text-anchor': 'middle' });
    tx.appendChild(txt(it)); g.appendChild(tx);
  });
}
/* rounded-top rect path: square at baseline, 4px round at data end */
function barPath(x, y, w, h, r, up) {
  r = Math.max(0, Math.min(r, w / 2, Math.abs(h)));
  if (h <= 0.5) return `M${x} ${y}h${w}`;
  if (up) return `M${x} ${y + h}V${y + r}a${r} ${r} 0 0 1 ${r} ${-r}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${y + h}Z`;
  return `M${x} ${y}V${y + h - r}a${r} ${r} 0 0 0 ${r} ${r}h${w - 2 * r}a${r} ${r} 0 0 0 ${r} ${-r}V${y}Z`;
}
function linePath(pts) {
  let d = '', pen = false;
  pts.forEach(p => {
    if (p == null || p.y == null || !isFinite(p.y)) { pen = false; return; }
    d += (pen ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' '; pen = true;
  });
  return d.trim();
}

/* ---------- tooltip ---------- */
function showTip(tip, box, mx, my, html) {
  tip.innerHTML = '';
  tip.appendChild(html);
  tip.classList.add('on');
  const bw = box.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
  let L = mx + 14; if (L + tw > bw - 4) L = mx - tw - 14; if (L < 2) L = 2;
  let T = my - th - 12; if (T < 2) T = my + 18;
  tip.style.left = L + 'px'; tip.style.top = T + 'px';
}
function hideTip(tip) { tip.classList.remove('on'); tip.style.left = '-9999px'; tip.style.top = '-9999px'; }
function tipNode(title, rows) {
  const f = document.createDocumentFragment();
  const h = document.createElement('div'); h.className = 'tt'; h.textContent = title; f.appendChild(h);
  const t = document.createElement('table');
  rows.forEach(r => {
    const tr = document.createElement('tr');
    const c0 = document.createElement('td'); c0.className = 'k';
    if (r.color) { const k = document.createElement('span'); k.className = 'lk'; k.style.background = r.color; c0.appendChild(k); }
    const c1 = document.createElement('td'); c1.className = 'n'; c1.textContent = r.value;
    const c2 = document.createElement('td'); c2.className = 's'; c2.textContent = r.label;
    tr.appendChild(c0); tr.appendChild(c1); tr.appendChild(c2); t.appendChild(tr);
  });
  f.appendChild(t); return f;
}

/* ---------- legend ---------- */
function legend(node, items, keyType) {
  clear(node);
  items.forEach(it => {
    const s = document.createElement('span'); s.className = 'lg';
    const k = document.createElement('span');
    k.className = (keyType === 'line') ? 'linekey' : 'swatch';
    k.style.background = it.color; s.appendChild(k);
    s.appendChild(document.createTextNode(it.label));
    node.appendChild(s);
  });
}

/* ---------- table view ---------- */
function table(node, cols, rows) {
  clear(node);
  const t = document.createElement('table'); t.className = 'data';
  const th = document.createElement('tr');
  cols.forEach(c => { const e = document.createElement('th'); e.textContent = c; th.appendChild(e); });
  t.appendChild(th);
  rows.forEach(r => {
    const tr = document.createElement('tr');
    r.forEach(v => { const e = document.createElement('td'); e.textContent = v; tr.appendChild(e); });
    t.appendChild(tr);
  });
  node.appendChild(t);
}
document.addEventListener('click', e => {
  const b = e.target.closest('.tbtn'); if (!b) return;
  const t = document.getElementById(b.dataset.table);
  const on = t.classList.toggle('on');
  b.textContent = on ? 'Hide table' : 'Show table';
});
