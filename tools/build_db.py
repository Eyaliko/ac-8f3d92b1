#!/usr/bin/env python3
"""Turn the three JSONL stores into the compact data.json the dashboard reads,
then render index.html.

  python3 tools/build_db.py
"""
import json, datetime as dt, collections, os, sys
import pipeline as P

OUT = os.path.join(P.REPO, 'build')
os.makedirs(OUT, exist_ok=True)

D = [P.load('daily')[k] for k in sorted(P.load('daily'))]
_pace = P.load('pace')
B = [_pace[k] for k in sorted(_pace)]
_res = P.load('res')
R = [_res[k] for k in sorted(_res, key=lambda x: (x.split('|')[0], x))]
byrd = {r['report_date']: r for r in D}

# ---------- 1. daily fact table ----------
M = {"ooo": "rooms_out_of_order", "avail": "rooms_available", "occ": "rooms_occupied",
     "dayuse": "rooms_day_use", "arr": "rooms_arrivals", "dep": "rooms_departures",
     "noshow": "rooms_no_show", "adults": "guests_adults", "children": "guests_children",
     "beds": "guests_total_beds", "garr": "guests_arrivals", "gdep": "guests_departures",
     "rev": "income_total", "rrooms": "income_pre_booked", "rfb": "income_food_beverage",
     "roth": "income_other_income"}
daily, filled = {}, []

for r in D:                                    # a) own reports (day column)
    rec = {k: r.get(M[k] + "_day") for k in M}
    rec["ast"] = r.get("rooms_average_stay_day"); rec["src"] = 0
    daily[r["report_date"]] = rec

for r in D:                                    # b) prior-year columns of later reports
    if not r.get("prior_year"): continue
    rd = dt.date.fromisoformat(r["report_date"])
    d = rd.replace(year=rd.year - 1).isoformat()
    if d in daily: continue
    rec = {k: r.get(M[k] + "_ly_day") for k in M}
    if rec["occ"] is None: continue
    rec["ast"] = r.get("rooms_average_stay_ly_day"); rec["src"] = 1
    daily[d] = rec

ds = sorted(daily)
d0, d1 = dt.date.fromisoformat(ds[0]), dt.date.fromisoformat(ds[-1])
span = [(d0 + dt.timedelta(i)) for i in range((d1 - d0).days + 1)]

def _mtd(d, stem, ly=False):
    r = byrd.get(d)
    return r.get(stem + ("_ly_mtd" if ly else "_mtd")) if r else None

for day in span:                               # c) gap-fill from MTD movements
    s = day.isoformat()
    if s in daily: continue
    prev, nxt = (day - dt.timedelta(1)).isoformat(), (day + dt.timedelta(1)).isoformat()
    if day.day == 1 or prev not in byrd or nxt not in byrd: continue
    rec, ok = {}, True
    for k, stem in M.items():
        a, b, c = _mtd(nxt, stem), byrd[nxt].get(stem + "_day"), _mtd(prev, stem)
        if a is None or b is None or c is None: ok = False; break
        rec[k] = round(a - b - c, 2)
    if not ok or rec.get("occ") is None or rec["occ"] < 0: continue
    rec["ast"] = None; rec["src"] = 2
    daily[s] = rec; filled.append(s)

for day in span:                               # c2) same trick on the prior-year columns
    s = day.isoformat()
    if s in daily: continue
    ny = day.replace(year=day.year + 1)
    prev, nxt = (ny - dt.timedelta(1)).isoformat(), (ny + dt.timedelta(1)).isoformat()
    if ny.day == 1 or prev not in byrd or nxt not in byrd: continue
    rec, ok = {}, True
    for k, stem in M.items():
        a, b, c = _mtd(nxt, stem, True), byrd[nxt].get(stem + "_ly_day"), _mtd(prev, stem, True)
        if a is None or b is None or c is None: ok = False; break
        rec[k] = round(a - b - c, 2)
    if not ok or rec.get("occ") is None or rec["occ"] < 0: continue
    rec["ast"] = None; rec["src"] = 2
    daily[s] = rec; filled.append(s)

aug31 = "2025-08-31"                           # d) the pre-history block, from the month total
if aug31 in byrd and byrd[aug31].get("income_total_mtd"):
    known = [d for d in daily if d.startswith("2025-08")]
    resid, ok = {}, True
    for k, stem in M.items():
        tot = byrd[aug31].get(stem + "_mtd")
        if tot is None: ok = False; break
        resid[k] = tot - sum(daily[d][k] or 0 for d in known)
    miss = [x for x in ((dt.date(2025, 8, 20) + dt.timedelta(i)).isoformat() for i in range(11)) if x not in daily]
    if ok and miss and resid.get("occ", 0) > 0:
        for m in miss:
            daily[m] = {k: round(resid[k] / len(miss), 2) for k in M}
            daily[m]["ast"] = None; daily[m]["src"] = 2; filled.append(m)

for day in span:                               # e) interpolate any residual single-day hole
    s = day.isoformat()
    if s in daily: continue
    p_, n_ = (day - dt.timedelta(1)).isoformat(), (day + dt.timedelta(1)).isoformat()
    if p_ in daily and n_ in daily:
        rec = {}
        for k in M:
            a, b = daily[p_].get(k), daily[n_].get(k)
            rec[k] = round((a + b) / 2, 2) if (a is not None and b is not None) else None
        rec["ast"] = None; rec["src"] = 2
        daily[s] = rec; filled.append(s)

ds = sorted(daily)
DFIELDS = ["ooo", "avail", "occ", "dayuse", "arr", "dep", "noshow", "ast", "adults",
           "children", "beds", "garr", "gdep", "rev", "rrooms", "rfb", "roth", "src"]
daily_rows = [[d] + [daily[d].get(f) for f in DFIELDS] for d in ds]

# ---------- 2. forward pace ----------
snaps = collections.defaultdict(dict)
for r in B:
    snaps[r["snapshot_date"]][r["stay_date"]] = r
pace = {}
for sd, stays in snaps.items():
    keys = sorted(stays)
    if not keys: continue
    base = keys[0]; bd = dt.date.fromisoformat(base)
    n = (dt.date.fromisoformat(keys[-1]) - bd).days + 1
    sold, avail = [None] * n, [None] * n
    for k in keys:
        i = (dt.date.fromisoformat(k) - bd).days
        rec = stays[k]; s_ = rec.get("rooms_sold"); pa = rec.get("physically_available")
        sold[i] = int(s_) if s_ is not None else None
        avail[i] = int((s_ or 0) + (pa or 0)) if pa is not None else None
    pace[sd] = {"from": base, "sold": sold, "avail": avail}
latest = max(pace)
latest_rt = {k: rec.get("by_room_type", {}) for k, rec in snaps[latest].items()}

LEADS = [0, 1, 3, 7, 14, 21, 30, 45, 60, 90]
curve = collections.defaultdict(dict)
for r in B:
    ld = r["lead_days"]
    if ld in LEADS and ld >= 0:
        curve[r["stay_date"]][ld] = r.get("rooms_sold")
curve_rows = [[k] + [curve[k].get(L) for L in LEADS] for k in sorted(curve)]

# ---------- 3. production ----------
PA = [r for r in R if r.get("variant") == "a"]
byS = collections.defaultdict(list)
for r in PA: byS[r["snapshot_date"]].append(r)
prod_days = set()
for s, rows in byS.items():
    sd = dt.date.fromisoformat(s); n = len(rows)
    by = sum(1 for r in rows if r.get("book_date") and (sd - dt.date.fromisoformat(r["book_date"])).days == 1)
    if n and by / n >= 0.6: prod_days.add(s)
PFIELDS = ["book_date", "check_in", "check_out", "nights", "room_type", "source", "country",
           "status", "rate_plan", "board", "total", "room_total", "commission", "adults", "children"]
seen, prod = set(), []
for s in sorted(prod_days):
    for r in byS[s]:
        key = (str(r.get("reservation_id")), r.get("room", ""), r.get("check_in", ""), r.get("book_date", ""))
        if key in seen: continue
        seen.add(key); prod.append([r.get(f) for f in PFIELDS])

meta = {
    "hotel": "Athens City Hotel", "currency": "EUR", "rooms": 40,
    "built": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
    "daily_fields": ["date"] + DFIELDS,
    "daily_from": ds[0], "daily_to": ds[-1], "daily_n": len(ds),
    "estimated_days": sorted(set(filled)), "leads": LEADS,
    "prod_fields": PFIELDS, "prod_n": len(prod), "prod_days": sorted(prod_days),
    "latest_snapshot": latest, "snapshot_dates": sorted(pace),
}
out = {"meta": meta, "daily": daily_rows, "pace": pace, "latest_rt": latest_rt,
       "curve": curve_rows, "prod": prod}
p = os.path.join(OUT, "data.json")
json.dump(out, open(p, "w"), separators=(",", ":"))
print(f"daily rows      {len(daily_rows):6d}  {ds[0]} -> {ds[-1]}  (reconstructed {len(set(filled))})")
print(f"pace snapshots  {len(pace):6d}  latest {latest}")
print(f"curve rows      {len(curve_rows):6d}")
print(f"production rows {len(prod):6d} over {len(prod_days)} days")
print(f"data.json       {os.path.getsize(p)/1e6:.2f} MB -> {p}")
