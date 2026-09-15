"""Author the Apex Racing Generation 3 hero cars and roadside kit in Blender; export the web mesh pack.

Run from the repository root:
  blender --background --factory-startup --python tools/blender/build-racing.py [-- options]

Options (after "--"):
  --cars a,b,c     build only these car ids (default: full roster)
  --no-env         skip the environment kit
  --skip-render    do not render the review contact sheet
  --samples N      Cycles samples for the review render (default 64)
  --per-car        also render one PNG per car
  --out DIR        write pack/blend/renders to DIR instead of the repository (pack goes to DIR/race-models.js)
  --no-blend       do not save the .blend
"""
import sys, time, importlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from racing import common, export, review  # noqa: E402
from racing.cars import ROSTER  # noqa: E402

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def option(name, default=None):
    if name in args:
        i = args.index(name)
        return args[i + 1] if i + 1 < len(args) else default
    return default


car_ids = option('--cars', ','.join(ROSTER)).split(',')
out_dir = Path(option('--out', str(ROOT / 'assets/racing')))
out_dir.mkdir(parents=True, exist_ok=True)
pack_path = (ROOT / 'js/race-models.js') if '--out' not in args else out_dir / 'race-models.js'
samples = int(option('--samples', '64'))

started = time.time()
common.reset()
cars = []
for cid in car_ids:
    module = importlib.import_module('racing.cars.' + cid)
    t = time.time()
    module.build()
    cars.append(module.CAR)
    print('BUILT', cid, 'in', round(time.time() - t, 1), 's')
environment_kits = []
if '--no-env' not in args:
    from racing import environment
    t = time.time()
    environment_kits = environment.build()
    print('BUILT environment', environment_kits, 'in', round(time.time() - t, 1), 's')

stats, size = export.write_pack(pack_path, cars, environment_kits)
for name, s in sorted(stats.items()):
    print('KIT', name, s['triangles'], 'tris', s['vertices'], 'verts', s['bytes'], 'bytes')
    if '--verbose' in args:
        for key, (t, v) in sorted(s['materials'].items(), key=lambda kv: -kv[1][0]):
            print('   ', key, t, 'tris', v, 'verts')
for car in cars:
    kits = [k for k in stats if k.startswith(car['id'] + '.')]
    print('CAR TOTAL', car['id'], sum(stats[k]['triangles'] for k in kits), 'tris', sum(stats[k]['bytes'] for k in kits), 'bytes')
print('RUNTIME BYTES', size, pack_path)

review.layout(cars)
review.studio(cars, out_dir, samples=samples, per_car='--per-car' in args, write_blend='--no-blend' not in args, render='--skip-render' not in args)
print('APEX BUILD DONE in', round(time.time() - started, 1), 's')
