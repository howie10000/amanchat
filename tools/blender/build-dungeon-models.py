"""Build the dungeon cutscene characters in Blender, bake the runtime pack, save the .blend, render
review sheets.

The runtime loads one file per character (js/dungeon-models/<id>.js + index.js, see the LOADER API in
js/dungeon-skin.js and docs/sundered-crown/CUTSCENE-PERF.md). Writing into the repository, this script bakes
the monolithic pack to a temp file and hands it to tools/split-dungeon-models.cjs, which (re)writes only the
characters built here (--chars) and keeps every other file. With --out DIR it writes DIR/dungeon-models.js
(monolithic, for inspection) and DIR/dungeon-models/ (split).

  blender --background --factory-startup --python tools/blender/build-dungeon-models.py -- [options]

Options (after --):
  --chars a,b,c     subset (default: all)          --skip-render    no review sheets
  --out DIR         write pack + sheets to DIR      --no-blend       do not save the .blend
  --poses           per-character key-pose sheets only (no turnaround)
"""
import sys, os, time, json, importlib, subprocess, tempfile, shutil
from pathlib import Path
import bpy

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
for m in [k for k in list(sys.modules) if k == 'dungeon' or k.startswith('dungeon.')]:
    del sys.modules[m]
from dungeon import core, rig as R, weapons as W, export as X, review, build as Bld

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default=None):
    if name in argv:
        i = argv.index(name)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else True
    return default


chars = opt('--chars')
chars = chars.split(',') if isinstance(chars, str) else None
out_dir = Path(opt('--out', str(ROOT))) if opt('--out') else ROOT
t0 = time.time()
core.reset()
result = Bld.build_all(chars)
print('built in %.1fs' % (time.time() - t0))
pack_path = Path(tempfile.gettempdir()) / 'dungeon-models.pack.js' if out_dir == ROOT else (out_dir / 'dungeon-models.js')
pack_path.parent.mkdir(parents=True, exist_ok=True)
stats = Bld.export_pack(result, pack_path)
print('PACK', pack_path, stats['bytes'], 'bytes')
split_dir = (ROOT / 'js' / 'dungeon-models') if out_dir == ROOT else (out_dir / 'dungeon-models')
node = shutil.which('node')
if node:
    r = subprocess.run([node, str(ROOT / 'tools' / 'split-dungeon-models.cjs'), str(pack_path), '--dir', str(split_dir)], capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip())
else:
    print('node not found: run  node tools/split-dungeon-models.cjs', pack_path, '--dir', split_dir)
for k, v in stats['chars'].items():
    print('  %-18s tris %6d verts %6d bones %d clips %d attach %d' % (k, v['tris'], v['verts'], v['bones'], v['clips'], v['attach']))
print('  weapons', stats['weapons'])
print('  clips stored', stats['clips'], 'unique of', stats['clip_refs'])
if not opt('--skip-render'):
    sheets = Bld.render_sheets(result, (ROOT / 'assets' / 'dungeon') if out_dir == ROOT else out_dir)
    for s in sheets:
        print('SHEET', s)
if not opt('--no-blend'):
    blend = ROOT / 'assets' / 'dungeon' / 'dungeon-models.blend' if out_dir == ROOT else out_dir / 'dungeon-models.blend'
    blend.parent.mkdir(parents=True, exist_ok=True)
    Bld.layout_for_blend(result)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)
    print('BLEND', blend)
print('done in %.1fs' % (time.time() - t0))
