#!/usr/bin/env python3
"""Decode Gmail RAW spill files and extract the 5 report attachments per day.

The Gmail MCP `get_message` tool with messageFormat=RAW returns a payload too
large for the model context, so the harness writes it to a file under
  /root/.claude/projects/<project>/<session>/tool-results/mcp-Gmail-get_message-*.txt
This script reads those files directly, so the attachments never pass through
the conversation. Run it after a batch of get_message calls.

  python3 tools/harvest.py [--purge] [--spill-dir DIR]
"""
import json, base64, email, email.header, os, re, glob, sys, argparse

import pipeline as P

RAW = os.path.join(P.REPO, 'raw')
STATE = os.path.join(P.DB, 'harvested.json')
MANIFEST = os.path.join(P.DB, 'manifest.tsv')
SPILL_GLOB = '/root/.claude/projects/*/*/tool-results/mcp-Gmail-get_message-*.txt'


def load_manifest():
    m = {}
    if not os.path.exists(MANIFEST):
        return m
    for line in open(MANIFEST, encoding='utf-8'):
        line = line.strip()
        if not line or '\t' not in line:
            continue
        mid, dtstr = line.split('\t', 1)
        m[mid] = dtstr[:10]
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--purge', action='store_true', help='delete spill files once extracted')
    ap.add_argument('--spill-dir', default=None)
    a = ap.parse_args()

    man = load_manifest()
    done = set(json.load(open(STATE))) if os.path.exists(STATE) else set()
    pattern = os.path.join(a.spill_dir, 'mcp-Gmail-get_message-*.txt') if a.spill_dir else SPILL_GLOB
    files = sorted(glob.glob(pattern))

    new_days, skipped, unknown, errs = set(), 0, [], []
    for fp in files:
        try:
            d = json.load(open(fp))
        except Exception as e:
            errs.append((os.path.basename(fp), 'json:' + str(e)[:60])); continue
        mid = d.get('id')
        if not mid or 'raw' not in d:
            errs.append((os.path.basename(fp), 'no raw')); continue
        if mid in done:
            skipped += 1
            if a.purge: os.remove(fp)
            continue
        day = man.get(mid)
        if not day:
            unknown.append(mid); continue
        try:
            r = d['raw']
            mime = base64.urlsafe_b64decode(r + '=' * (-len(r) % 4))
            msg = email.message_from_bytes(mime)
            outdir = os.path.join(RAW, day)
            os.makedirs(outdir, exist_ok=True)
            n = 0
            for part in msg.walk():
                fn = part.get_filename()
                if not fn: continue
                try:
                    fn = str(email.header.make_header(email.header.decode_header(fn)))
                except Exception:
                    pass
                if not fn.lower().endswith(('.xlsx', '.xls')): continue
                data = part.get_payload(decode=True)
                if not data: continue
                safe = re.sub(r'[^A-Za-z0-9._-]', '_', fn)
                p = os.path.join(outdir, safe)
                if os.path.exists(p):
                    stem, ext = os.path.splitext(safe); k = 2
                    while os.path.exists(p):
                        p = os.path.join(outdir, f'{stem}__dup{k}{ext}'); k += 1
                open(p, 'wb').write(data); n += 1
            if n == 0:
                errs.append((mid, 'no xlsx parts'))
            else:
                done.add(mid); new_days.add(day)
                if a.purge: os.remove(fp)
        except Exception as e:
            errs.append((mid, type(e).__name__ + ':' + str(e)[:60]))

    os.makedirs(P.DB, exist_ok=True)
    json.dump(sorted(done), open(STATE, 'w'))
    print(f'spill files seen : {len(files)}')
    print(f'days extracted   : {len(new_days)} {sorted(new_days)[:10]}')
    print(f'already done     : {skipped}')
    print(f'unknown msg ids  : {len(unknown)} (not in manifest.tsv)')
    print(f'errors           : {len(errs)} {errs[:5]}')
    missing = [m for m in man if m not in done]
    print(f'harvested        : {len(done)} / {len(man)}   still missing: {len(missing)}')
    open(os.path.join(P.DB, 'missing_ids.txt'), 'w').write(
        '\n'.join(f'{m}\t{man[m]}' for m in sorted(missing, key=lambda x: man[x])))
    # machine-readable for the next step
    print('NEW_DAYS=' + ','.join(sorted(new_days)))


if __name__ == '__main__':
    main()
