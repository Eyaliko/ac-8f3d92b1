/* ============================ state & controls ============================ */
const S = {
  preset: 'last90', from: '', to: '', cmp: 'ly', gran: 'auto', metric: 'occPct',
  heatMetric: 'occPct', pickupWin: 7, prodMetric: 'bookings',
  fSource: '', fRoom: '', fCountry: '', fStatus: 'active'
};
const PRESETS = [
  ['last7', 'Last 7 days'], ['last30', 'Last 30 days'], ['last90', 'Last 90 days'],
  ['mtd', 'Month to date'], ['lastmonth', 'Last month'], ['ytd', 'Year to date'],
  ['last12m', 'Last 12 months'], ['all', 'All time'], ['custom', 'Custom']
];
function presetRange(p) {
  const T = DMAX;
  switch (p) {
    case 'last7': return [addDays(T, -6), T];
    case 'last30': return [addDays(T, -29), T];
    case 'last90': return [addDays(T, -89), T];
    case 'mtd': return [monthStart(T), T];
    case 'lastmonth': { const ms = monthStart(T); const pe = addDays(ms, -1); return [monthStart(pe), pe]; }
    case 'ytd': return [T.slice(0, 4) + '-01-01', T];
    case 'last12m': return [addDays(T, -364), T];
    case 'all': return [DMIN, DMAX];
    default: return [S.from, S.to];
  }
}
const CMPS = [['ly', 'Last year'], ['ly364', 'Last year (weekday-aligned)'], ['prev', 'Previous period'], ['none', 'No comparison']];
function cmpRange() {
  if (S.cmp === 'none') return null;
  const n = dayDiff(S.from, S.to);
  let a, b;
  if (S.cmp === 'prev') { b = addDays(S.from, -1); a = addDays(b, -n); }
  else if (S.cmp === 'ly364') { a = addDays(S.from, -364); b = addDays(S.to, -364); }
  else { a = addYears(S.from, -1); b = addYears(S.to, -1); }
  if (b < DMIN) return null;
  return [a < DMIN ? DMIN : a, b];
}
function cmpLabel() { const c = CMPS.find(x => x[0] === S.cmp); return c ? c[1] : ''; }

function chipset(node, items, get, set) {
  clear(node);
  items.forEach(([v, l]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = l;
    b.setAttribute('aria-pressed', get() === v ? 'true' : 'false');
    b.onclick = () => { set(v); renderAll(); };
    node.appendChild(b);
  });
}
function syncChips(node, get) {
  [...node.children].forEach(b => b.setAttribute('aria-pressed', b.textContent === (get()) ? 'true' : 'false'));
}

/* ============================ KPI tiles ============================ */
const KPI_LIST = ['occPct', 'adr', 'revpar', 'rev', 'occ', 'guests', 'alos', 'revocc'];
function sparkline(vals, w, h) {
  const svg = el('svg', { class: 'spark', width: w, height: h, viewBox: `0 0 ${w} ${h}` });
  const ok = vals.filter(v => v != null && isFinite(v));
  if (ok.length < 2) return svg;
  const mn = Math.min(...ok), mx = Math.max(...ok), sp = (mx - mn) || 1;
  const pts = vals.map((v, i) => v == null ? null : { x: i / (vals.length - 1) * w, y: h - ((v - mn) / sp) * (h - 3) - 1.5 });
  svg.appendChild(el('path', { d: linePath(pts), fill: 'none', stroke: cssv('--seq5'), 'stroke-width': 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const last = pts.filter(p => p).pop();
  if (last) svg.appendChild(el('circle', { cx: last.x, cy: last.y, r: 2.6, fill: cssv('--s1') }));
  return svg;
}
function renderKpis(cur, cmp, curBuckets) {
  const host = document.getElementById('kpis'); clear(host);
  KPI_LIST.forEach(k => {
    const m = MET[k];
    const v = m.get(cur), pv = cmp ? m.get(cmp) : null;
    const card = document.createElement('div'); card.className = 'kpi';
    const lab = document.createElement('div'); lab.className = 'lab'; lab.textContent = m.label; card.appendChild(lab);
    const val = document.createElement('div'); val.className = 'val'; val.textContent = m.fmt(v); card.appendChild(val);
    const sub = document.createElement('div'); sub.className = 'sub';
    if (pv != null && v != null && pv !== 0) {
      const d = (v - pv) / Math.abs(pv);
      const dir = Math.abs(d) < 0.0005 ? 'flat' : (d > 0 ? 'up' : 'down');
      const good = m.goodUp ? d > 0 : d < 0;
      const sp = document.createElement('span');
      sp.className = 'delta ' + (dir === 'flat' ? 'flat' : (good ? 'up' : 'down'));
      sp.textContent = (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '— ') + nf1.format(Math.abs(d) * 100) + '%';
      sub.appendChild(sp);
      sub.appendChild(document.createTextNode('  vs ' + m.fmt(pv)));
    } else { sub.textContent = cmp ? 'no comparison data' : 'comparison off'; }
    card.appendChild(sub);
    card.appendChild(sparkline(curBuckets.map(b => m.get(b)), 66, 24));
    host.appendChild(card);
  });
}

/* ============================ trend (line) ============================ */
function renderTrend(cur, cmp, gran) {
  const m = MET[S.metric];
  const A = bucketize(cur.from, cur.to, gran);
  const B = cmp ? bucketize(cmp.from, cmp.to, gran) : [];
  document.getElementById('trendSub').textContent =
    m.label + ' · ' + fmtDayY(cur.from) + ' – ' + fmtDayY(cur.to) + (cmp ? '  ·  compared with ' + fmtDayY(cmp.from) + ' – ' + fmtDayY(cmp.to) : '');
  const items = [{ label: 'Selected period', color: cssv('--s1') }];
  if (cmp) items.push({ label: cmpLabel(), color: cssv('--s2') });
  legend(document.getElementById('trendLegend'), items, 'line');

  const svg = document.getElementById('trendChart'), tip = document.getElementById('trendTip'), box = svg.parentNode;
  const H = 300, { w, g } = frame(svg, H);
  const P = { l: 56, r: 16, t: 12, b: 30 };
  const n = A.length; if (!n) return;
  const vA = A.map(b => m.get(b)), vB = B.map(b => m.get(b));
  const all = [...vA, ...(cmp ? vB : [])].filter(v => v != null && isFinite(v));
  const ticks = niceTicks(Math.min(0, ...all), Math.max(...all, 0.0001), 5);
  const y = v => P.t + (H - P.t - P.b) * (1 - (v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0]));
  const x = i => n === 1 ? (P.l + (w - P.l - P.r) / 2) : P.l + (w - P.l - P.r) * i / (n - 1);
  yAxis(g, ticks, y, P.l, w - P.r, m.axis);
  g.appendChild(el('line', { class: 'axisline', x1: P.l, x2: w - P.r, y1: y(ticks[0]), y2: y(ticks[0]) }));
  const lbl = A.map(b => gran === 'month' ? fmtMon(b.key) : fmtDay(b.key));
  xLabels(g, lbl, x, H - P.b + 16, Math.max(1, Math.ceil(n / 12)));

  if (cmp) g.appendChild(el('path', { d: linePath(vB.map((v, i) => i < n ? { x: x(i), y: v == null ? null : y(v) } : null).filter(Boolean)), fill: 'none', stroke: cssv('--s2'), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  g.appendChild(el('path', { d: linePath(vA.map((v, i) => ({ x: x(i), y: v == null ? null : y(v) }))), fill: 'none', stroke: cssv('--s1'), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const li = vA.map((v, i) => v == null ? -1 : i).filter(i => i >= 0).pop();
  if (li != null && li >= 0) {
    g.appendChild(el('circle', { cx: x(li), cy: y(vA[li]), r: 4.5, fill: cssv('--s1'), stroke: cssv('--surface'), 'stroke-width': 2 }));
    const t = el('text', { class: 'dlabel', x: Math.min(x(li) + 9, w - P.r), y: y(vA[li]) - 9, 'text-anchor': x(li) > w - 90 ? 'end' : 'start' });
    t.appendChild(txt(m.fmt(vA[li]))); g.appendChild(t);
  }
  const ch = el('line', { class: 'crosshair', y1: P.t, y2: H - P.b, x1: 0, x2: 0, opacity: 0 }); g.appendChild(ch);
  const hit = el('rect', { class: 'hit', x: P.l, y: P.t, width: w - P.l - P.r, height: H - P.t - P.b }); g.appendChild(hit);
  hit.addEventListener('pointermove', ev => {
    const r = svg.getBoundingClientRect(), sc = w / r.width;
    const px = (ev.clientX - r.left) * sc;
    let i = n === 1 ? 0 : Math.round((px - P.l) / ((w - P.l - P.r) / (n - 1)));
    i = Math.max(0, Math.min(n - 1, i));
    ch.setAttribute('x1', x(i)); ch.setAttribute('x2', x(i)); ch.setAttribute('opacity', 1);
    const rows = [{ color: cssv('--s1'), value: m.fmt(vA[i]), label: labelOf(A[i], gran) }];
    if (cmp && B[i]) rows.push({ color: cssv('--s2'), value: m.fmt(vB[i]), label: labelOf(B[i], gran) });
    const bb = box.getBoundingClientRect();
    showTip(tip, box, ev.clientX - bb.left, ev.clientY - bb.top, tipNode(m.label, rows));
  });
  hit.addEventListener('pointerleave', () => { hideTip(tip); ch.setAttribute('opacity', 0); });

  table(document.getElementById('trendTable'),
    ['Period', m.label, ...(cmp ? [cmpLabel(), 'Change'] : [])],
    A.map((b, i) => {
      const row = [labelOf(b, gran), m.fmt(vA[i])];
      if (cmp) { const p = vB[i]; row.push(p == null ? '—' : m.fmt(p)); row.push((p && vA[i] != null) ? nf1.format((vA[i] - p) / Math.abs(p) * 100) + '%' : '—'); }
      return row;
    }));
}
function labelOf(b, gran) {
  if (!b) return '—';
  if (gran === 'month') return fmtMon(b.key);
  if (gran === 'week') return 'week of ' + fmtDayY(b.key);
  return fmtDayY(b.key);
}

/* ============================ revenue composition (stacked) ============================ */
function renderRev(cur, gran) {
  const A = bucketize(cur.from, cur.to, gran);
  const keys = [['rrooms', 'Accommodation', cssv('--s1')], ['rfb', 'Food & beverage', cssv('--s2')], ['roth', 'Other', cssv('--s3')]];
  legend(document.getElementById('revLegend'), keys.map(k => ({ label: k[1], color: k[2] })));
  const svg = document.getElementById('revChart'), tip = document.getElementById('revTip'), box = svg.parentNode;
  const H = 240, { w, g } = frame(svg, H);
  const P = { l: 56, r: 12, t: 12, b: 28 };
  const n = A.length; if (!n) return;
  const tot = A.map(b => b.rrooms + b.rfb + b.roth);
  const ticks = niceTicks(0, Math.max(...tot, 1), 4);
  const y = v => P.t + (H - P.t - P.b) * (1 - v / ticks[ticks.length - 1]);
  const bw = Math.min(24, (w - P.l - P.r) / n * 0.72);
  const xc = i => P.l + (w - P.l - P.r) * (i + 0.5) / n;
  yAxis(g, ticks, y, P.l, w - P.r, eurC);
  g.appendChild(el('line', { class: 'axisline', x1: P.l, x2: w - P.r, y1: y(0), y2: y(0) }));
  xLabels(g, A.map(b => gran === 'month' ? fmtMon(b.key) : fmtDay(b.key)), xc, H - P.b + 16, Math.max(1, Math.ceil(n / 10)));
  A.forEach((b, i) => {
    let acc = 0;
    keys.forEach(([k, lab, col], si) => {
      const v = b[k] || 0; if (v <= 0) { acc += v; return; }
      const y0 = y(acc), y1 = y(acc + v);
      const gap = (si === 0 || (y0 - y1) < 5) ? 0 : 2;
      const hh = Math.max(0, y0 - y1 - gap);
      const p = el('path', { class: 'mark', d: barPath(xc(i) - bw / 2, y1, bw, hh, si === keys.length - 1 ? 4 : 0, true), fill: col });
      g.appendChild(p); acc += v;
    });
    const hit = el('rect', { class: 'hit', x: xc(i) - Math.max(bw / 2, 12), y: P.t, width: Math.max(bw, 24), height: H - P.t - P.b });
    g.appendChild(hit);
    hit.addEventListener('pointermove', ev => {
      const bb = box.getBoundingClientRect();
      showTip(tip, box, ev.clientX - bb.left, ev.clientY - bb.top, tipNode(labelOf(b, gran),
        keys.map(([k, lab, col]) => ({ color: col, value: eur0(b[k]), label: lab })).concat([{ value: eur0(tot[i]), label: 'Total' }])));
    });
    hit.addEventListener('pointerleave', () => hideTip(tip));
  });
  table(document.getElementById('revTable'), ['Period', 'Accommodation', 'Food & beverage', 'Other', 'Total'],
    A.map((b, i) => [labelOf(b, gran), eur0(b.rrooms), eur0(b.rfb), eur0(b.roth), eur0(tot[i])]));
}

/* ============================ day of week (grouped columns) ============================ */
function dowAgg(from, to) {
  const out = Array.from({ length: 7 }, () => { const o = { n: 0 }; SUMK.forEach(k => o[k] = 0); return o; });
  for (const d of DAILY) {
    if (d.date < from || d.date > to) continue;
    const i = (d.dow + 6) % 7; out[i].n++; SUMK.forEach(k => out[i][k] += (d[k] || 0));
  }
  return out;
}
function renderDow(cur, cmp) {
  const m = MET[S.metric];
  const A = dowAgg(cur.from, cur.to), B = cmp ? dowAgg(cmp.from, cmp.to) : null;
  const items = [{ label: 'Selected period', color: cssv('--s1') }];
  if (B) items.push({ label: cmpLabel(), color: cssv('--s2') });
  legend(document.getElementById('dowLegend'), items);
  document.getElementById('dowSub').textContent = m.label + ' by weekday over the selected period';
  const svg = document.getElementById('dowChart'), tip = document.getElementById('dowTip'), box = svg.parentNode;
  const H = 240, { w, g } = frame(svg, H);
  const P = { l: 56, r: 12, t: 12, b: 28 };
  const vA = A.map(b => m.get(b)), vB = B ? B.map(b => m.get(b)) : [];
  const all = [...vA, ...vB].filter(v => v != null && isFinite(v));
  const ticks = niceTicks(0, Math.max(...all, 0.0001), 4);
  const y = v => P.t + (H - P.t - P.b) * (1 - v / ticks[ticks.length - 1]);
  const slot = (w - P.l - P.r) / 7;
  const bw = Math.min(24, (slot * 0.66) / (B ? 2 : 1));
  yAxis(g, ticks, y, P.l, w - P.r, m.axis);
  g.appendChild(el('line', { class: 'axisline', x1: P.l, x2: w - P.r, y1: y(0), y2: y(0) }));
  DOWN.forEach((d, i) => {
    const cx = P.l + slot * (i + 0.5);
    const t = el('text', { class: 'tick', x: cx, y: H - P.b + 16, 'text-anchor': 'middle' }); t.appendChild(txt(d)); g.appendChild(t);
    const xs = B ? [cx - bw - 1, cx + 1] : [cx - bw / 2];
    const vs = B ? [vA[i], vB[i]] : [vA[i]];
    const cs = B ? [cssv('--s1'), cssv('--s2')] : [cssv('--s1')];
    vs.forEach((v, j) => { if (v == null || !isFinite(v)) return; g.appendChild(el('path', { class: 'mark', d: barPath(xs[j], y(v), bw, y(0) - y(v), 4, true), fill: cs[j] })); });
    const hit = el('rect', { class: 'hit', x: cx - slot / 2, y: P.t, width: slot, height: H - P.t - P.b }); g.appendChild(hit);
    hit.addEventListener('pointermove', ev => {
      const bb = box.getBoundingClientRect();
      const rows = [{ color: cssv('--s1'), value: m.fmt(vA[i]), label: 'Selected' }];
      if (B) rows.push({ color: cssv('--s2'), value: m.fmt(vB[i]), label: cmpLabel() });
      showTip(tip, box, ev.clientX - bb.left, ev.clientY - bb.top, tipNode(DOWN[i] + ' · ' + m.label, rows));
    });
    hit.addEventListener('pointerleave', () => hideTip(tip));
  });
  table(document.getElementById('dowTable'), ['Weekday', m.label, ...(B ? [cmpLabel()] : []), 'Nights'],
    DOWN.map((d, i) => [d, m.fmt(vA[i]), ...(B ? [m.fmt(vB[i])] : []), num(A[i].n)]));
}

/* ============================ month heatmap ============================ */
function renderHeat() {
  const m = MET[S.heatMetric];
  const map = new Map();
  for (const d of DAILY) {
    const k = d.date.slice(0, 7); let b = map.get(k);
    if (!b) { b = { n: 0 }; SUMK.forEach(x => b[x] = 0); map.set(k, b); }
    b.n++; SUMK.forEach(x => b[x] += (d[x] || 0));
  }
  const years = [...new Set([...map.keys()].map(k => k.slice(0, 4)))].sort();
  const cells = [];
  years.forEach(yy => MON.forEach((_, mi) => {
    const k = yy + '-' + String(mi + 1).padStart(2, '0');
    const b = map.get(k); cells.push({ y: yy, m: mi, k, b, v: b ? m.get(b) : null });
  }));
  const vals = cells.map(c => c.v).filter(v => v != null && isFinite(v) && v > 0);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const svg = document.getElementById('heatChart'), tip = document.getElementById('heatTip'), box = svg.parentNode;
  const rows = years.length, H = 44 + rows * 46, { w, g } = frame(svg, H);
  const P = { l: 46, r: 8, t: 22, b: 6 };
  const cw = (w - P.l - P.r) / 12, chh = 40;
  MON.forEach((mo, i) => { const t = el('text', { class: 'tick', x: P.l + cw * (i + .5), y: 12, 'text-anchor': 'middle' }); t.appendChild(txt(mo)); g.appendChild(t); });
  years.forEach((yy, ri) => {
    const t = el('text', { class: 'tick', x: P.l - 8, y: P.t + ri * 46 + chh / 2 + 4, 'text-anchor': 'end' }); t.appendChild(txt(yy)); g.appendChild(t);
    MON.forEach((_, mi) => {
      const c = cells.find(x => x.y === yy && x.m === mi);
      const X = P.l + cw * mi + 1, Y = P.t + ri * 46;
      if (!c || c.v == null || !isFinite(c.v) || !c.b || c.b.avail === 0) {
        g.appendChild(el('rect', { x: X, y: Y, width: cw - 2, height: chh, rx: 5, fill: cssv('--grid'), opacity: .45 }));
        return;
      }
      const t01 = mx === mn ? .6 : (c.v - mn) / (mx - mn);
      const step = Math.max(1, Math.min(11, Math.round(1 + t01 * 10)));
      const fill = cssv('--seq' + step);
      g.appendChild(el('rect', { class: 'mark', x: X, y: Y, width: cw - 2, height: chh, rx: 5, fill }));
      const dark = document.documentElement.dataset.theme === 'dark';
      const ink = dark ? (step <= 5 ? '#ffffff' : '#0b0b0b') : (step >= 7 ? '#ffffff' : '#0b0b0b');
      const lt = el('text', { x: X + (cw - 2) / 2, y: Y + chh / 2 + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600, fill: ink });
      lt.appendChild(txt(m.fmt(c.v).replace('€', ''))); g.appendChild(lt);
      const hit = el('rect', { class: 'hit', x: X, y: Y, width: cw - 2, height: chh });
      g.appendChild(hit);
      hit.addEventListener('pointermove', ev => {
        const bb = box.getBoundingClientRect();
        showTip(tip, box, ev.clientX - bb.left, ev.clientY - bb.top, tipNode(MON[mi] + ' ' + yy, [
          { value: pct(MET.occPct.get(c.b)), label: 'Occupancy' },
          { value: eur2(MET.adr.get(c.b)), label: 'ADR' },
          { value: eur2(MET.revpar.get(c.b)), label: 'RevPAR' },
          { value: eur0(c.b.rev), label: 'Total revenue' },
          { value: num(c.b.occ), label: 'Rooms sold' }]));
      });
      hit.addEventListener('pointerleave', () => hideTip(tip));
    });
  });
  table(document.getElementById('heatTable'), ['Month', 'Occupancy', 'ADR', 'RevPAR', 'Room revenue', 'F&B', 'Other', 'Total revenue', 'Rooms sold'],
    [...map.entries()].sort().map(([k, b]) => [fmtMon(k + '-01'), pct(MET.occPct.get(b)), eur2(MET.adr.get(b)), eur2(MET.revpar.get(b)), eur0(b.rrooms), eur0(b.rfb), eur0(b.roth), eur0(b.rev), num(b.occ)]));
}

/* ============================ forward pace ============================ */
function paceSeries(snapKey) {
  const p = RAW.pace[snapKey]; if (!p) return [];
  return p.sold.map((s, i) => ({ date: addDays(p.from, i), sold: s, avail: p.avail[i] }));
}
function renderPace() {
  const latest = META.latest_snapshot;
  document.getElementById('paceDate').textContent = fmtDayY(latest);
  const rowsAll = paceSeries(latest).filter(r => r.sold != null && r.date >= latest);
  const rows = rowsAll.slice(0, 92);
  const items = [{ label: 'On the books', color: cssv('--s1') }, { label: 'Actual last year', color: cssv('--s2') }];
  legend(document.getElementById('paceLegend'), items, 'line');
  const svg = document.getElementById('paceChart'), tip = document.getElementById('paceTip'), box = svg.parentNode;
  const H = 280, { w, g } = frame(svg, H);
  const P = { l: 50, r: 16, t: 12, b: 30 };
  const n = rows.length; if (!n) return;
  const occ = rows.map(r => r.avail ? r.sold / r.avail : null);
  const ly = rows.map(r => { const d = BYDATE.get(addYears(r.date, -1)); return d && d.avail ? d.occ / d.avail : null; });
  const ticks = niceTicks(0, Math.max(1, ...occ.filter(v => v != null), ...ly.filter(v => v != null)), 5);
  const y = v => P.t + (H - P.t - P.b) * (1 - v / ticks[ticks.length - 1]);
  const x = i => P.l + (w - P.l - P.r) * i / Math.max(1, n - 1);
  yAxis(g, ticks, y, P.l, w - P.r, pct0);
  g.appendChild(el('line', { class: 'axisline', x1: P.l, x2: w - P.r, y1: y(0), y2: y(0) }));
  xLabels(g, rows.map(r => fmtDay(r.date)), x, H - P.b + 16, Math.max(1, Math.ceil(n / 12)));
  g.appendChild(el('path', { d: linePath(ly.map((v, i) => ({ x: x(i), y: v == null ? null : y(v) }))), fill: 'none', stroke: cssv('--s2'), 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  g.appendChild(el('path', { d: linePath(occ.map((v, i) => ({ x: x(i), y: v == null ? null : y(v) }))), fill: 'none', stroke: cssv('--s1'), 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  const ch = el('line', { class: 'crosshair', y1: P.t, y2: H - P.b, x1: 0, x2: 0, opacity: 0 }); g.appendChild(ch);
  const hit = el('rect', { class: 'hit', x: P.l, y: P.t, width: w - P.l - P.r, height: H - P.t - P.b }); g.appendChild(hit);
  hit.addEventListener('pointermove', ev => {
    const r = svg.getBoundingClientRect(), sc = w / r.width;
    let i = Math.round(((ev.clientX - r.left) * sc - P.l) / ((w - P.l - P.r) / Math.max(1, n - 1)));
    i = Math.max(0, Math.min(n - 1, i));
    ch.setAttribute('x1', x(i)); ch.setAttribute('x2', x(i)); ch.setAttribute('opacity', 1);
    const bb = box.getBoundingClientRect();
    showTip(tip, box, ev.clientX - bb.left, ev.clientY - bb.top, tipNode(fmtDayY(rows[i].date), [
      { color: cssv('--s1'), value: pct(occ[i]), label: 'On the books' },
      { color: cssv('--s1'), value: num(rows[i].sold) + ' / ' + num(rows[i].avail), label: 'rooms sold / sellable' },
      { color: cssv('--s2'), value: pct(ly[i]), label: 'actual ' + addYears(rows[i].date, -1).slice(0, 4) }]));
  });
  hit.addEventListener('pointerleave', () => { hideTip(tip); ch.setAttribute('opacity', 0); });
  table(document.getElementById('paceTable'), ['Stay date', 'Rooms on the books', 'Sellable', 'Occupancy', 'Occupancy last year'],
    rows.map((r, i) => [fmtDayY(r.date), num(r.sold), num(r.avail), pct(occ[i]), pct(ly[i])]));
}

/* ============================ pickup ============================ */
function renderPickup() {
  const latest = META.latest_snapshot;
  const back = META.snapshot_dates.filter(s => s <= addDays(latest, -S.pickupWin)).pop();
  const now = new Map(paceSeries(latest).map(r => [r.date, r.sold]));
  const then = back ? new Map(paceSeries(back).map(r => [r.date, r.sold])) : new Map();
  const buckets = new Map();
  [...now.keys()].filter(d => d >= latest).sort().slice(0, 92).forEach(d => {
    const a = now.get(d), b = then.get(d);
    if (a == null || b == null) return;
    const k = weekStart(d);
    const cur = buckets.get(k) || { k, v: 0, n: 0, otb: 0 };
    cur.v += a - b; cur.n++; cur.otb += a; buckets.set(k, cur);
  });
  const rows = [...buckets.values()].sort((a, b) => a.k < b.k ? -1 : 1);
  const svg = document.getElementById('pickupChart'), tip = document.getElementById('pickupTip'), box = svg.parentNode;
  const H = 240, { w, g } = frame(svg, H);
  const P = { l: 44, r: 12, t: 12, b: 34 };
  if (!rows.length || !back) { const t = el('text', { class: 'axlab', x: w / 2, y: H / 2, 'text-anchor': 'middle' }); t.appendChild(txt('Not enough snapshot history yet')); g.appendChild(t); return; }
  const ticks = niceTicks(Math.min(0, ...rows.map(r => r.v)), Math.max(0, ...rows.map(r => r.v)), 4);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const y = v => P.t + (H - P.t - P.b) * (1 - (v - lo) / (hi - lo));
  const slot = (w - P.l - P.r) / rows.length, bw = Math.min(24, slot * .68);
  yAxis(g, ticks, y, P.l, w - P.r, num);
  g.appendChild(el('line', { class: 'axisline', x1: P.l, x2: w - P.r, y1: y(0), y2: y(0) }));
  rows.forEach((r, i) => {
    const cx = P.l + slot * (i + .5);
    const up = r.v >= 0;
    const h = Math.abs(y(r.v) - y(0));
    g.appendChild(el('path', { class: 'mark', d: barPath(cx - bw / 2, up ? y(r.v) : y(0), bw, h, 4, up), fill: up ? cssv('--s1') : cssv('--bad') }));
    if (i % Math.max(1, Math.ceil(rows.length / 7)) === 0) {
      const t = el('text', { class: 'tick', x: cx, y: H - P.b + 16, 'text-anchor': 'middle' }); t.appendChild(txt(fmtDay(r.k))); g.appendChild(t);
    }
    const hit = el('rect', { class: 'hit', x: cx - slot / 2, y: P.t, width: slot, height: H - P.t - P.b }); g.appendChild(hit);
    hit.addEventListener('pointermove', ev => {
      const bb = box.getBoundingClientRect();
      showTip(tip, box, ev.clientX - bb.left, ev.clientY - bb.top, tipNode('Arrivals week of ' + fmtDayY(r.k), [
        { color: up ? cssv('--s1') : cssv('--bad'), value: (r.v > 0 ? '+' : '') + num(r.v), label: 'rooms picked up' },
        { value: num(r.otb), label: 'rooms on the books' }]));
    });
    hit.addEventListener('pointerleave', () => hideTip(tip));
  });
  const lab = el('text', { class: 'axlab', x: P.l, y: H - 4 }); lab.appendChild(txt('since ' + fmtDayY(back))); g.appendChild(lab);
  table(document.getElementById('pickupTable'), ['Arrivals week', 'Rooms picked up', 'Rooms on the books', 'Nights covered'],
    rows.map(r => [fmtDayY(r.k), (r.v > 0 ? '+' : '') + num(r.v), num(r.otb), num(r.n)]));
}

/* ============================ booking curve ============================ */
function qEnd(q) { const y = +q.slice(0, 4), n = +q.slice(-1); const m = n * 3; return y + '-' + String(m).padStart(2, '0') + '-28'; }
function renderCurve() {
  const LE = META.leads;
  const cohorts = new Map();
  RAW.curve.forEach(row => {
    const stay = row[0];
    const q = stay.slice(0, 4) + ' Q' + (Math.floor(+stay.slice(5, 7) / 3.001) + 1);
    if (!cohorts.has(q)) cohorts.set(q, LE.map(() => []));
    const c = cohorts.get(q);
    LE.forEach((L, i) => { const v = row[i + 1]; if (v != null) c[i].push(v); });
  });
  const keys = [...cohorts.keys()].sort().slice(-4);
  const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const lastStay = RAW.curve[RAW.curve.length - 1][0];
  const series = keys.map((k, i) => {
    const n0 = cohorts.get(k)[0].length;
    const open = qEnd(k) > DMAX;
    return { label: k + (open ? ' (in progress)' : ''), color: SERIES(i), vals: cohorts.get(k).map(med), n: n0 };
  });
  legend(document.getElementById('curveLegend'), series.map(s => ({ label: s.label, color: s.color })), 'line');
  const svg = document.getElementById('curveChart'), tip = document.getElementById('curveTip'), box = svg.parentNode;
  const H = 240, { w, g } = frame(svg, H);
  const P = { l: 44, r: 34, t: 12, b: 34 };
  const all = series.flatMap(s => s.vals).filter(v => v != null);
  if (!all.length) return;
  const ticks = niceTicks(0, Math.max(...all), 4);
  const y = v => P.t + (H - P.t - P.b) * (1 - v / ticks[ticks.length - 1]);
  const x = i => P.l + (w - P.l - P.r) * (LE.length - 1 - i) / (LE.length - 1);
  yAxis(g, ticks, y, P.l, w - P.r, num);
  g.appendChild(el('line', { class: 'axisline', x1: P.l, x2: w - P.r, y1: y(0), y2: y(0) }));
  LE.forEach((L, i) => { const t = el('text', { class: 'tick', x: x(i), y: H - P.b + 16, 'text-anchor': 'middle' }); t.appendChild(txt(L === 0 ? '0' : String(L))); g.appendChild(t); });
  const ax = el('text', { class: 'axlab', x: (P.l + w - P.r) / 2, y: H - 4, 'text-anchor': 'middle' }); ax.appendChild(txt('days before arrival')); g.appendChild(ax);
  series.forEach(s => {
    g.appendChild(el('path', { d: linePath(s.vals.map((v, i) => ({ x: x(i), y: v == null ? null : y(v) }))), fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    const last = s.vals[0];
    if (last != null) g.appendChild(el('circle', { cx: x(0), cy: y(last), r: 4, fill: s.color, stroke: cssv('--surface'), 'stroke-width': 2 }));
  });
  const ch = el('line', { class: 'crosshair', y1: P.t, y2: H - P.b, x1: 0, x2: 0, opacity: 0 }); g.appendChild(ch);
  const hit = el('rect', { class: 'hit', x: P.l, y: P.t, width: w - P.l - P.r, height: H - P.t - P.b }); g.appendChild(hit);
  hit.addEventListener('pointermove', ev => {
    const r = svg.getBoundingClientRect(), sc = w / r.width;
    const px = (ev.clientX - r.left) * sc;
    let j = Math.round((px - P.l) / ((w - P.l - P.r) / (LE.length - 1)));
    j = Math.max(0, Math.min(LE.length - 1, j)); const i = LE.length - 1 - j;
    ch.setAttribute('x1', x(i)); ch.setAttribute('x2', x(i)); ch.setAttribute('opacity', 1);
    const bb = box.getBoundingClientRect();
    showTip(tip, box, ev.clientX - bb.left, ev.clientY - bb.top,
      tipNode(LE[i] + ' days before arrival', series.map(s => ({ color: s.color, value: s.vals[i] == null ? '—' : num(s.vals[i]), label: s.label }))));
  });
  hit.addEventListener('pointerleave', () => { hideTip(tip); ch.setAttribute('opacity', 0); });
  table(document.getElementById('curveTable'), ['Days before arrival', ...series.map(s => s.label)],
    LE.map((L, i) => [String(L), ...series.map(s => s.vals[i] == null ? '—' : num(s.vals[i]))]).reverse());
}

/* ============================ production (bookings) ============================ */
const CN = {GR:'Greece',AL:'Albania',TR:'Turkey',IT:'Italy',PL:'Poland',DE:'Germany',GB:'United Kingdom',ET:'Ethiopia',
US:'United States',FR:'France',ES:'Spain',CY:'Cyprus',BR:'Brazil',RO:'Romania',BG:'Bulgaria',NL:'Netherlands',
RS:'Serbia',IL:'Israel',IN:'India',CN:'China',RU:'Russia',UA:'Ukraine',EG:'Egypt',MA:'Morocco',SA:'Saudi Arabia',
AE:'United Arab Emirates',CA:'Canada',AU:'Australia',BE:'Belgium',AT:'Austria',CH:'Switzerland',SE:'Sweden',
NO:'Norway',DK:'Denmark',FI:'Finland',PT:'Portugal',IE:'Ireland',CZ:'Czechia',HU:'Hungary',SK:'Slovakia',
HR:'Croatia',SI:'Slovenia',MK:'North Macedonia',ME:'Montenegro',BA:'Bosnia & Herzegovina',XK:'Kosovo',
GE:'Georgia',AM:'Armenia',IR:'Iran',IQ:'Iraq',JO:'Jordan',LB:'Lebanon',PS:'Palestine',PK:'Pakistan',
BD:'Bangladesh',NP:'Nepal',PH:'Philippines',ID:'Indonesia',MY:'Malaysia',SG:'Singapore',TH:'Thailand',
JP:'Japan',KR:'South Korea',NG:'Nigeria',KE:'Kenya',ZA:'South Africa',CD:'DR Congo',SY:'Syria',YE:'Yemen',
MX:'Mexico',AR:'Argentina',CL:'Chile',CO:'Colombia',PE:'Peru',NZ:'New Zealand',LT:'Lithuania',LV:'Latvia',
EE:'Estonia',BY:'Belarus',MD:'Moldova',KZ:'Kazakhstan',UZ:'Uzbekistan',AZ:'Azerbaijan',TN:'Tunisia',DZ:'Algeria',
LY:'Libya',SD:'Sudan',GH:'Ghana',CI:"Cote d'Ivoire",SN:'Senegal',CM:'Cameroon',AO:'Angola',MZ:'Mozambique',
TZ:'Tanzania',UG:'Uganda',ZW:'Zimbabwe',LU:'Luxembourg',MT:'Malta',IS:'Iceland',VN:'Vietnam',TW:'Taiwan',
HK:'Hong Kong',QA:'Qatar',KW:'Kuwait',BH:'Bahrain',OM:'Oman'};
function cname(code) { return CN[code] || code; }
const PMET = {
  bookings: { label: 'Bookings', fmt: num, val: rs => rs.length, axis: num },
  nights: { label: 'Room nights', fmt: num, val: rs => rs.reduce((a, r) => a + r.nights, 0), axis: num },
  revenue: { label: 'Revenue', fmt: eurC, val: rs => rs.reduce((a, r) => a + r.total, 0), axis: eurC },
  adr: { label: 'ADR', fmt: eur2, val: rs => { const n = rs.reduce((a, r) => a + r.nights, 0); return n ? rs.reduce((a, r) => a + r.room_total, 0) / n : null; }, axis: eur0 },
};
function prodRows(f, t) {
  const lo = (f || S.from) > PRODMIN ? (f || S.from) : PRODMIN, hi = (t || S.to) < PRODMAX ? (t || S.to) : PRODMAX;
  return PROD.filter(p => {
    if (!p.book_date || p.book_date < lo || p.book_date > hi) return false;
    if (S.fSource && p.source !== S.fSource) return false;
    if (S.fRoom && p.room_type !== S.fRoom) return false;
    if (S.fCountry && p.country !== S.fCountry) return false;
    if (S.fStatus === 'active') { if (p.status === 'Cancelled' || p.status === 'No Show') return false; }
    else if (S.fStatus && S.fStatus !== 'all' && p.status !== S.fStatus) return false;
    return true;
  });
}
function topGroups(rows, key, n) {
  const m = new Map();
  rows.forEach(r => { const k = r[key] || '—'; m.set(k, (m.get(k) || []).concat([r])); });
  const arr = [...m.entries()].map(([k, v]) => ({ k, rows: v, v: PMET[S.prodMetric].val(v) }));
  arr.sort((a, b) => (b.v || 0) - (a.v || 0));
  if (n && arr.length > n) {
    const head = arr.slice(0, n), tailRows = arr.slice(n).flatMap(x => x.rows);
    head.push({ k: 'Other', rows: tailRows, v: PMET[S.prodMetric].val(tailRows) });
    return head;
  }
  return arr;
}
function prodStats(rows, all) {
  const nights = rows.reduce((a, r) => a + r.nights, 0);
  const leads = rows.map(r => r.lead).filter(v => v != null && v >= 0).sort((a, b) => a - b);
  const canc = all.filter(r => r.status === 'Cancelled').length;
  return {
    bookings: rows.length,
    nights: nights,
    revenue: rows.reduce((a, r) => a + r.total, 0),
    adr: PMET.adr.val(rows),
    lead: leads.length ? leads[leads.length >> 1] : null,
    cancel: all.length ? canc / all.length : null,
    direct: directShare(rows),
    avgn: rows.length ? nights / rows.length : null,
    canc: canc, alln: all.length,
  };
}
function renderProdKpis(rows, cr) {
  const host = document.getElementById('prodKpis'); clear(host);
  const cu = prodStats(rows, prodRowsIgnoringStatus());
  const cp = cr ? prodStats(prodRows(cr[0], cr[1]), prodRowsIgnoringStatus(cr[0], cr[1])) : null;
  const tiles = [
    ['Bookings', 'bookings', num, true, ''],
    ['Room nights', 'nights', num, true, ''],
    ['Booked revenue', 'revenue', eurC, true, 'total value of these bookings'],
    ['ADR of new bookings', 'adr', eur2, true, 'accommodation only'],
    ['Median lead time', 'lead', v => v == null ? '—' : num(v) + ' days', true, 'booking to arrival'],
    ['Cancellation rate', 'cancel', pct, false, num(cu.canc) + ' of ' + num(cu.alln) + ' bookings'],
    ['Direct share', 'direct', pct, true, 'phone, walk-in, front desk, website'],
    ['Average nights', 'avgn', v => v == null ? '—' : nf2.format(v), true, 'per booking'],
  ];
  tiles.forEach(([l, k, fmt, goodUp, s]) => {
    const card = document.createElement('div'); card.className = 'kpi';
    const a = document.createElement('div'); a.className = 'lab'; a.textContent = l; card.appendChild(a);
    const b = document.createElement('div'); b.className = 'val'; b.textContent = fmt(cu[k]); card.appendChild(b);
    const d = document.createElement('div'); d.className = 'sub';
    const pv = cp ? cp[k] : null, v = cu[k];
    if (pv != null && v != null && pv !== 0) {
      const ch = (v - pv) / Math.abs(pv);
      const good = goodUp ? ch > 0 : ch < 0;
      const sp = document.createElement('span');
      sp.className = 'delta ' + (Math.abs(ch) < 0.0005 ? 'flat' : (good ? 'up' : 'down'));
      sp.textContent = (ch > 0 ? '▲ ' : ch < 0 ? '▼ ' : '— ') + nf1.format(Math.abs(ch) * 100) + '%';
      d.appendChild(sp); d.appendChild(document.createTextNode('  vs ' + fmt(pv)));
    } else d.textContent = (cp && s === '') ? 'no comparison data' : s;
    card.appendChild(d);
    host.appendChild(card);
  });
}
const DIRECT = new Set(['Telephone', 'Walk-in', 'Front Desk', 'Website', 'Direct', 'Email']);
function directShare(rows) { if (!rows.length) return null; return rows.filter(r => DIRECT.has(r.source)).length / rows.length; }
function prodRowsIgnoringStatus(f, t) {
  const lo = (f || S.from) > PRODMIN ? (f || S.from) : PRODMIN, hi = (t || S.to) < PRODMAX ? (t || S.to) : PRODMAX;
  return PROD.filter(p => p.book_date && p.book_date >= lo && p.book_date <= hi
    && (!S.fSource || p.source === S.fSource) && (!S.fRoom || p.room_type === S.fRoom) && (!S.fCountry || p.country === S.fCountry));
}
function hbars(svgId, tipId, tableId, groups, mfmt, subId, subText) {
  const svg = document.getElementById(svgId), tip = document.getElementById(tipId), box = svg.parentNode;
  if (subId) document.getElementById(subId).textContent = subText;
  const rows = groups.slice(0, 12);
  const H = Math.max(120, 18 + rows.length * 26), { w, g } = frame(svg, H);
  const P = { l: 152, r: 66, t: 6, b: 6 };
  const mx = Math.max(...rows.map(r => r.v || 0), 1);
  const bw = w - P.l - P.r;
  rows.forEach((r, i) => {
    const yy = P.t + i * 26, bh = 16;
    const t = el('text', { class: 'tick', x: P.l - 8, y: yy + bh - 3, 'text-anchor': 'end' }); t.appendChild(txt(r.k.length > 22 ? r.k.slice(0, 21) + '…' : r.k)); g.appendChild(t);
    const len = Math.max(0, (r.v || 0) / mx * bw);
    g.appendChild(el('path', { class: 'mark', d: barPathH(P.l, yy, len, bh, 4), fill: cssv('--s1') }));
    const v = el('text', { class: 'dlabel', x: P.l + len + 8, y: yy + bh - 3 }); v.appendChild(txt(mfmt(r.v))); g.appendChild(v);
    const hit = el('rect', { class: 'hit', x: 0, y: yy - 4, width: w, height: 26 }); g.appendChild(hit);
    hit.addEventListener('pointermove', ev => {
      const bb = box.getBoundingClientRect();
      showTip(tip, box, ev.clientX - bb.left, ev.clientY - bb.top, tipNode(r.k, [
        { value: num(r.rows.length), label: 'bookings' },
        { value: num(r.rows.reduce((a, x) => a + x.nights, 0)), label: 'room nights' },
        { value: eur0(r.rows.reduce((a, x) => a + x.total, 0)), label: 'revenue' },
        { value: eur2(PMET.adr.val(r.rows)), label: 'ADR' }]));
    });
    hit.addEventListener('pointerleave', () => hideTip(tip));
  });
  table(document.getElementById(tableId), ['', 'Bookings', 'Room nights', 'Revenue', 'ADR'],
    groups.map(r => [r.k, num(r.rows.length), num(r.rows.reduce((a, x) => a + x.nights, 0)), eur0(r.rows.reduce((a, x) => a + x.total, 0)), eur2(PMET.adr.val(r.rows))]));
}
function barPathH(x, y, len, h, r) {
  r = Math.max(0, Math.min(r, h / 2, len));
  if (len <= 0.5) return `M${x} ${y}v${h}`;
  return `M${x} ${y}h${len - r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(len - r)}Z`;
}
function renderProdTrend(rows, gran) {
  const m = PMET[S.prodMetric];
  const chans = topGroups(rows, 'source', 7).map(x => x.k);
  const keyf = gran === 'month' ? monthStart : (gran === 'week' ? weekStart : (x => x));
  const bmap = new Map();
  rows.forEach(r => {
    const k = keyf(r.book_date);
    if (!bmap.has(k)) bmap.set(k, new Map());
    const ck = chans.includes(r.source) ? r.source : 'Other';
    bmap.get(k).set(ck, (bmap.get(k).get(ck) || []).concat([r]));
  });
  const keys = [...bmap.keys()].sort();
  const series = chans.map((c, i) => ({ label: c, color: SERIES(i) }));
  legend(document.getElementById('prodTrendLegend'), series);
  document.getElementById('prodTrendSub').textContent = m.label + ' by channel, by the date the booking was made · ' + fmtDayY(S.from > PRODMIN ? S.from : PRODMIN) + ' – ' + fmtDayY(S.to < PRODMAX ? S.to : PRODMAX);
  const svg = document.getElementById('prodTrendChart'), tip = document.getElementById('prodTrendTip'), box = svg.parentNode;
  const H = 260, { w, g } = frame(svg, H);
  const P = { l: 56, r: 12, t: 12, b: 28 };
  if (!keys.length) { const t = el('text', { class: 'axlab', x: w / 2, y: H / 2, 'text-anchor': 'middle' }); t.appendChild(txt('No bookings in this period')); g.appendChild(t); return; }
  const vals = keys.map(k => chans.map(c => m.val(bmap.get(k).get(c) || [])));
  const tot = vals.map(v => v.reduce((a, b) => a + (b || 0), 0));
  const ticks = niceTicks(0, Math.max(...tot, 1), 4);
  const y = v => P.t + (H - P.t - P.b) * (1 - v / ticks[ticks.length - 1]);
  const slot = (w - P.l - P.r) / keys.length, bw = Math.min(24, slot * .7);
  yAxis(g, ticks, y, P.l, w - P.r, m.axis);
  g.appendChild(el('line', { class: 'axisline', x1: P.l, x2: w - P.r, y1: y(0), y2: y(0) }));
  keys.forEach((k, i) => {
    const cx = P.l + slot * (i + .5);
    if (i % Math.max(1, Math.ceil(keys.length / 10)) === 0) {
      const t = el('text', { class: 'tick', x: cx, y: H - P.b + 16, 'text-anchor': 'middle' }); t.appendChild(txt(gran === 'month' ? fmtMon(k) : fmtDay(k))); g.appendChild(t);
    }
    let acc = 0;
    chans.forEach((c, si) => {
      const v = vals[i][si] || 0; if (v <= 0) return;
      const y0 = y(acc), y1 = y(acc + v), gap = (acc === 0 || (y0 - y1) < 5) ? 0 : 2;
      g.appendChild(el('path', { class: 'mark', d: barPath(cx - bw / 2, y1, bw, Math.max(0, y0 - y1 - gap), 4, true), fill: SERIES(si) }));
      acc += v;
    });
    const hit = el('rect', { class: 'hit', x: cx - slot / 2, y: P.t, width: slot, height: H - P.t - P.b }); g.appendChild(hit);
    hit.addEventListener('pointermove', ev => {
      const bb = box.getBoundingClientRect();
      const rws = chans.map((c, si) => ({ color: SERIES(si), value: m.fmt(vals[i][si]), label: c })).filter((_, si) => (vals[i][si] || 0) > 0);
      rws.push({ value: m.fmt(tot[i]), label: 'Total' });
      showTip(tip, box, ev.clientX - bb.left, ev.clientY - bb.top, tipNode(gran === 'month' ? fmtMon(k) : fmtDayY(k), rws));
    });
    hit.addEventListener('pointerleave', () => hideTip(tip));
  });
  table(document.getElementById('prodTrendTable'), ['Period', ...chans, 'Total'],
    keys.map((k, i) => [gran === 'month' ? fmtMon(k) : fmtDayY(k), ...chans.map((c, si) => m.fmt(vals[i][si])), m.fmt(tot[i])]));
}
function renderLead(rows) {
  const bins = [[0, 0, 'Same day'], [1, 1, '1 day'], [2, 3, '2–3'], [4, 7, '4–7'], [8, 14, '8–14'], [15, 30, '15–30'], [31, 60, '31–60'], [61, 90, '61–90'], [91, 180, '91–180'], [181, 99999, '180+']];
  const counts = bins.map(b => rows.filter(r => r.lead != null && r.lead >= b[0] && r.lead <= b[1]).length);
  const svg = document.getElementById('leadChart'), tip = document.getElementById('leadTip'), box = svg.parentNode;
  const H = 230, { w, g } = frame(svg, H);
  const P = { l: 44, r: 12, t: 12, b: 32 };
  const ticks = niceTicks(0, Math.max(...counts, 1), 4);
  const y = v => P.t + (H - P.t - P.b) * (1 - v / ticks[ticks.length - 1]);
  const slot = (w - P.l - P.r) / bins.length, bw = Math.min(24, slot * .68);
  yAxis(g, ticks, y, P.l, w - P.r, num);
  g.appendChild(el('line', { class: 'axisline', x1: P.l, x2: w - P.r, y1: y(0), y2: y(0) }));
  const tot = counts.reduce((a, b) => a + b, 0) || 1;
  bins.forEach((b, i) => {
    const cx = P.l + slot * (i + .5);
    g.appendChild(el('path', { class: 'mark', d: barPath(cx - bw / 2, y(counts[i]), bw, y(0) - y(counts[i]), 4, true), fill: cssv('--s1') }));
    const t = el('text', { class: 'tick', x: cx, y: H - P.b + 16, 'text-anchor': 'middle' }); t.appendChild(txt(b[2])); g.appendChild(t);
    const hit = el('rect', { class: 'hit', x: cx - slot / 2, y: P.t, width: slot, height: H - P.t - P.b }); g.appendChild(hit);
    hit.addEventListener('pointermove', ev => {
      const bb = box.getBoundingClientRect();
      showTip(tip, box, ev.clientX - bb.left, ev.clientY - bb.top, tipNode(b[2] + ' before arrival', [
        { value: num(counts[i]), label: 'bookings' }, { value: pct(counts[i] / tot), label: 'of total' }]));
    });
    hit.addEventListener('pointerleave', () => hideTip(tip));
  });
  const ax = el('text', { class: 'axlab', x: (P.l + w - P.r) / 2, y: H - 3, 'text-anchor': 'middle' }); ax.appendChild(txt('days between booking and arrival')); g.appendChild(ax);
  table(document.getElementById('leadTable'), ['Lead time', 'Bookings', 'Share'], bins.map((b, i) => [b[2], num(counts[i]), pct(counts[i] / tot)]));
}

/* ============================ orchestration ============================ */
function renderAll() {
  if (S.preset !== 'custom') { const r = presetRange(S.preset); S.from = r[0]; S.to = r[1]; }
  S.from = clampDate(S.from); S.to = clampDate(S.to);
  if (S.from > S.to) { const t = S.from; S.from = S.to; S.to = t; }
  document.getElementById('dFrom').value = S.from;
  document.getElementById('dTo').value = S.to;
  [['presetChips', () => S.preset, PRESETS], ['cmpChips', () => S.cmp, CMPS]].forEach(() => { });
  syncPressed('presetChips', PRESETS, S.preset);
  syncPressed('cmpChips', CMPS, S.cmp);
  syncPressed('granChips', GRANS, S.gran);
  syncPressed('metricChips', TRENDMETS, S.metric);
  syncPressed('heatChips', HEATMETS, S.heatMetric);
  syncPressed('pickupChips', PICKWINS, String(S.pickupWin));
  syncPressed('prodMetricChips', PRODMETS, S.prodMetric);

  const cr = cmpRange();
  const cur = agg(S.from, S.to);
  const cmp = cr ? agg(cr[0], cr[1]) : null;
  const gran = S.gran === 'auto' ? autoGran(S.from, S.to) : S.gran;

  const note = document.getElementById('dataNote');
  const bits = [];
  if (cur.derived) bits.push(`<b>${cur.derived}</b> day${cur.derived > 1 ? 's' : ''} in this period come from the prior-year columns of later reports rather than a report of their own`);
  if (cur.est) bits.push(`<b>${cur.est}</b> day${cur.est > 1 ? 's' : ''} are reconstructed from month-to-date movements because no report arrived`);
  if (bits.length) { note.innerHTML = '<span>⚠︎</span><span>' + bits.join('; ') + '.</span>'; note.classList.remove('hide'); }
  else note.classList.add('hide');

  renderKpis(cur, cmp, bucketize(S.from, S.to, gran));
  renderTrend(cur, cmp, gran);
  renderRev(cur, gran);
  renderDow(cur, cmp);
  renderHeat();
  renderPace();
  renderPickup();
  renderCurve();

  const rows = prodRows();
  renderProdKpis(rows, cr);
  renderProdTrend(rows, gran);
  const pm = PMET[S.prodMetric];
  hbars('chanChart', 'chanTip', 'chanTable', topGroups(rows, 'source', 9), pm.fmt, 'chanSub', pm.label + ' by booking channel');
  const known = rows.filter(r => r.country && r.country !== '—');
  const cg = topGroups(known, 'country', 11).map(x => ({ ...x, k: x.k === 'Other' ? 'Other' : cname(x.k) }));
  hbars('cntryChart', 'cntryTip', 'cntryTable', cg, pm.fmt, 'cntrySub',
    pm.label + ' by guest country · ' + num(rows.length - known.length) + ' of ' + num(rows.length) + ' bookings have no country recorded');
  hbars('rtChart', 'rtTip', 'rtTable', topGroups(rows, 'room_type', 8), pm.fmt, 'rtSub', pm.label + ' by room type');
  renderLead(rows);
}
const GRANS = [['auto', 'Auto'], ['day', 'Day'], ['week', 'Week'], ['month', 'Month']];
const TRENDMETS = [['occPct', 'Occupancy'], ['adr', 'ADR'], ['revpar', 'RevPAR'], ['rev', 'Revenue'], ['occ', 'Rooms sold'], ['guests', 'Guests'], ['alos', 'Avg stay']];
const HEATMETS = [['occPct', 'Occupancy'], ['adr', 'ADR'], ['revpar', 'RevPAR'], ['rev', 'Revenue']];
const PICKWINS = [['7', 'vs 7 days ago'], ['14', 'vs 14 days ago'], ['30', 'vs 30 days ago']];
const PRODMETS = [['bookings', 'Bookings'], ['nights', 'Room nights'], ['revenue', 'Revenue'], ['adr', 'ADR']];
function syncPressed(id, items, val) {
  const n = document.getElementById(id); if (!n) return;
  [...n.children].forEach((b, i) => b.setAttribute('aria-pressed', items[i][0] === String(val) ? 'true' : 'false'));
}
function buildControls() {
  chipset(document.getElementById('presetChips'), PRESETS, () => S.preset, v => S.preset = v);
  chipset(document.getElementById('cmpChips'), CMPS, () => S.cmp, v => S.cmp = v);
  chipset(document.getElementById('granChips'), GRANS, () => S.gran, v => S.gran = v);
  chipset(document.getElementById('metricChips'), TRENDMETS, () => S.metric, v => S.metric = v);
  chipset(document.getElementById('heatChips'), HEATMETS, () => S.heatMetric, v => S.heatMetric = v);
  chipset(document.getElementById('pickupChips'), PICKWINS, () => String(S.pickupWin), v => S.pickupWin = +v);
  chipset(document.getElementById('prodMetricChips'), PRODMETS, () => S.prodMetric, v => S.prodMetric = v);
  const df = document.getElementById('dFrom'), dt = document.getElementById('dTo');
  df.min = dt.min = DMIN; df.max = dt.max = DMAX;
  df.onchange = () => { S.preset = 'custom'; S.from = df.value; renderAll(); };
  dt.onchange = () => { S.preset = 'custom'; S.to = dt.value; renderAll(); };
  const opts = (id, key, extra) => {
    const sel = document.getElementById(id); clear(sel);
    const vals = [...new Set(PROD.map(p => p[key]))].filter(Boolean).sort();
    const add = (v, l) => { const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o); };
    (extra || [['', 'All']]).forEach(e => add(e[0], e[1]));
    vals.forEach(v => add(v, v));
    sel.onchange = () => { S[id === 'fSource' ? 'fSource' : id === 'fRoom' ? 'fRoom' : id === 'fCountry' ? 'fCountry' : 'fStatus'] = sel.value; renderAll(); };
  };
  opts('fSource', 'source'); opts('fRoom', 'room_type'); opts('fCountry', 'country');
  opts('fStatus', 'status', [['active', 'Excluding cancelled'], ['all', 'All statuses']]);
  document.getElementById('fStatus').value = 'active';
  document.getElementById('prodReset').onclick = () => {
    S.fSource = S.fRoom = S.fCountry = ''; S.fStatus = 'active';
    ['fSource', 'fRoom', 'fCountry'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('fStatus').value = 'active'; renderAll();
  };
  const tb = document.getElementById('themeBtn');
  const setTheme = t => { document.documentElement.dataset.theme = t; tb.textContent = t === 'dark' ? 'Light mode' : 'Dark mode'; try { localStorage.setItem('ac-theme', t); } catch (e) { } renderAll(); };
  let init = 'light';
  try { init = localStorage.getItem('ac-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) { }
  document.documentElement.dataset.theme = init; tb.textContent = init === 'dark' ? 'Light mode' : 'Dark mode';
  tb.onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}
document.getElementById('subtitle').textContent =
  'Performance through ' + fmtDayY(DMAX) + ' · forward book as at ' + fmtDayY(META.latest_snapshot) + ' · all figures in euro';
document.getElementById('foot').innerHTML =
  'Built from ' + META.daily_n + ' days of results (' + fmtDayY(META.daily_from) + ' – ' + fmtDayY(META.daily_to) + '), '
  + META.snapshot_dates.length + ' booking-plan snapshots and ' + nf0.format(META.prod_n) + ' individual reservations. '
  + 'Occupancy is rooms sold over rooms available after out-of-order. ADR is accommodation revenue per room sold; RevPAR is accommodation revenue per available room. '
  + 'Guest names and contact details are deliberately not included. Last refreshed ' + META.built.replace('T', ' ').replace('Z', ' UTC') + '.';
buildControls();
renderAll();
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(renderAll, 160); });
