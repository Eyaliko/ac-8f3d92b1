#!/usr/bin/env python3
"""Assemble the self-contained dashboard from the template parts + build/data.json.

  python3 tools/render.py            -> writes build/index.html
"""
import os, json, sys
import pipeline as P

T = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(P.REPO, 'build')
os.makedirs(OUT, exist_ok=True)

data = open(os.path.join(OUT, 'data.json'), encoding='utf-8').read()
a = open(os.path.join(T, 'tpl_a.html'), encoding='utf-8').read()
b = open(os.path.join(T, 'tpl_b.js'), encoding='utf-8').read()
c = open(os.path.join(T, 'tpl_c.js'), encoding='utf-8').read()

html = (a
        + '\n<script>\nconst RAW = ' + data + ';\n</script>\n'
        + '<script>\n' + b + '\n' + c + '\n</script>\n</body>\n</html>\n')

p = os.path.join(OUT, 'index.html')
open(p, 'w', encoding='utf-8').write(html)
print(f'index.html {os.path.getsize(p)/1e6:.2f} MB -> {p}')
