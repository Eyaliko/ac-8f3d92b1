#!/usr/bin/env python3
"""Athens City Hotel dashboard pipeline — incremental, repo-backed.

Stores are JSON Lines so git deltas stay small.
  db/daily_actuals.jsonl     key: report_date
  db/booking_snapshots.jsonl key: snapshot_date|stay_date
  db/reservations.jsonl      key: snapshot_date|reservation_id|room|check_in
  db/manifest.tsv            all known report emails: messageId<TAB>iso datetime
  db/harvested.json          message ids already extracted
"""
import json, os, sys, glob

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(BASE) if os.path.basename(BASE) == 'tools' else BASE
DB = os.path.join(REPO, 'db')

STORES = {
    'daily':  ('daily_actuals.jsonl',     lambda r: r['report_date']),
    'pace':   ('booking_snapshots.jsonl', lambda r: r['snapshot_date'] + '|' + r['stay_date']),
    'res':    ('reservations.jsonl',      lambda r: '|'.join([r.get('snapshot_date',''), str(r.get('reservation_id','')), str(r.get('room','')), str(r.get('check_in',''))])),
}

def load(store):
    fn, keyf = STORES[store]
    p = os.path.join(DB, fn)
    out = {}
    if os.path.exists(p):
        for line in open(p, encoding='utf-8'):
            line = line.strip()
            if not line: continue
            r = json.loads(line)
            out[keyf(r)] = r
    return out

def save(store, recs):
    fn, keyf = STORES[store]
    os.makedirs(DB, exist_ok=True)
    p = os.path.join(DB, fn)
    with open(p, 'w', encoding='utf-8') as f:
        for k in sorted(recs):
            f.write(json.dumps(recs[k], separators=(',', ':'), sort_keys=True, ensure_ascii=False) + '\n')
    return p

def merge(store, new_records):
    cur = load(store)
    added = 0
    fn, keyf = STORES[store]
    for r in new_records:
        k = keyf(r)
        if k not in cur: added += 1
        cur[k] = r
    save(store, cur)
    return added, len(cur)
