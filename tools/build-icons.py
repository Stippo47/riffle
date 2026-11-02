# Turns the SVG files in vendor/ into js/icons.js, so the app holds them inline and works offline.
# Game icons lose their black square background and take the colour around them.
import json, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
out = {}
for f in sorted((root / 'vendor/lucide').glob('*.svg')):
    s = re.sub(r'\s+', ' ', f.read_text()).strip()
    s = s.replace(' width="24"', '').replace(' height="24"', '').replace('> <', '><')
    out[f.stem] = s
for f in sorted((root / 'vendor/game-icons').glob('*.svg')):
    s = f.read_text().replace('<path d="M0 0h512v512H0z"/>', '').replace('fill="#fff"', 'fill="currentColor"')
    out[f.stem] = s.strip()

lines = ['// Made by tools/build-icons.py from vendor/. See CREDITS.md.', 'export const ICON = {']
for k, v in out.items():
    lines.append(f'  {json.dumps(k)}: {json.dumps(v)},')
lines.append('};')
(root / 'js/icons.js').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(len(out), 'icons')
