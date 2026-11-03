#!/usr/bin/env python3
"""The writer's side of Riffle: make decks, read answers, mark cards handled, answer thoughts.

Everything goes through a local clone of the private data repo, with plain git. See SKILL.md.
"""
import argparse
import getpass
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

HOME = pathlib.Path.home()
HERE = pathlib.Path(__file__).resolve().parent
REMOTE = 'https://github.com/Stippo47/riffle-data.git'
OWN_FILES = HOME / '.riffle'  # outside every repo: the push signing key, the icon library
ICON_LIBRARY = OWN_FILES / 'icons'
LAST_NOTIFY = OWN_FILES / 'last-notify'
NOTIFY_GAP = 600  # seconds. A run of new decks makes one notification, not one each
ATTRIBUTION = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

KINDS = {'question', 'report', 'design', 'options'}
RARITIES = {'common', 'uncommon', 'rare', 'epic', 'legendary'}
CARD_FIELDS = {'id', 'version', 'kind', 'rarity', 'title', 'text', 'why', 'pick', 'details', 'images', 'options', 'handled'}
DECK_FIELDS = {'title', 'topic', 'stack', 'order', 'misc', 'cards'}
OPTION_FIELDS = {'id', 'label', 'text', 'image'}
WORDS = {
    'question': {'right': 'GO', 'left': 'WORKSHOP', 'down': 'IDK', 'up': 'COMMENT'},
    'report': {'right': 'GOOD', 'left': 'PROBLEM', 'down': 'HUH?', 'up': 'COMMENT'},
    'design': {'right': 'YES', 'left': 'RETHINK', 'down': 'IDK', 'up': 'COMMENT'},
    'options': {'right': 'GO', 'left': 'REDO', 'down': 'IDK', 'up': 'COMMENT'},
}
HANDLED_WORDS = {'right': 'FINE', 'left': 'WORKSHOP', 'down': 'IDK', 'up': 'COMMENT'}
NAMED_DIRECTION = re.compile(r'\b(swip\w*|throw\w*|drag\w*|flick\w*|hold\w*|pull\w*|push\w*)\s+(it\s+|this\s+|this one\s+|the card\s+|that\s+)?(to the\s+)?(right|left|up|down)\b', re.I)
LOOKS_LIKE_CODE = re.compile(r'\b[a-z]+_[a-z_]+\b|\b[a-z]+[A-Z][a-zA-Z]+\b|\b\w+\.(java|py|js|json|ya?ml|toml|gradle|kts)\b|\w\(\)|`')
# A card's face is meant to read at a glance. Past these it gets a warning, even where it fits.
LIMITS = {'title': 26, 'text': 110, 'why': 300, 'pick': 150}
HOW_LIMIT = 300
MAX_OPTIONS = 4
# The smallest iPhone in the tightest layout, and the type sizes the app steps through to fit a card.
# See estimate(). tests/e2e.mjs checks this against real rendering: it must never be the optimist.
FACE_HEIGHT = 508
FACE_WIDTH = 315
FIT_STEPS = [
    {'pad': 28, 'width': 0, 'h2': 21, 'h2m': 18, 'h2lh': 1.13, 'why': 14.5, 'whylh': 1.36, 'pick': 14.5, 'picklh': 1.3, 'pickpad': 20, 'line': 13.5, 'linem': 8, 'optmin': 54, 'optpad': 16, 'how': 22.5},
    {'pad': 28, 'width': 0, 'h2': 20, 'h2m': 16, 'h2lh': 1.13, 'why': 14.5, 'whylh': 1.28, 'pick': 14.5, 'picklh': 1.28, 'pickpad': 14, 'line': 12.5, 'linem': 5, 'optmin': 44, 'optpad': 10, 'how': 14.5},
    {'pad': 20, 'width': 8, 'h2': 18, 'h2m': 11, 'h2lh': 1.13, 'why': 13, 'whylh': 1.28, 'pick': 13, 'picklh': 1.28, 'pickpad': 14, 'line': 12.5, 'linem': 5, 'optmin': 44, 'optpad': 10, 'how': 13},
]
FIT_WORDS = {0: 'fits', 1: 'shrinks a little on a small iPhone', 2: 'needs the smallest type on a small iPhone', 3: "won't fit a small iPhone"}
IMAGE_LONG_SIDE = 1400


def now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')


def seconds(stamp):
    """An ISO time as a number, or 0 if it can't be read."""
    try:
        return datetime.fromisoformat(str(stamp).replace('Z', '+00:00')).timestamp()
    except ValueError:
        return 0


def die(message):
    print(message)
    sys.exit(1)


def data_repo():
    found = os.environ.get('RIFFLE_DATA')
    if found:
        return pathlib.Path(found)
    target = HOME / 'Dev' / 'riffle-data'
    if (target / '.git').exists():
        return target
    print(f'No clone of the data repo yet, so making one at {target}.')
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['git', 'clone', '-q', REMOTE, str(target)], check=True)
    subprocess.run(['git', 'config', 'user.name', 'Stippo47'], cwd=target, check=True)
    subprocess.run(['git', 'config', 'user.email', '146392335+Stippo47@users.noreply.github.com'], cwd=target, check=True)
    return target


DATA = None


def git(*args, check=True):
    r = subprocess.run(['git', *args], cwd=DATA, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if check and r.returncode:
        die(f'git {" ".join(args)} failed:\n{r.stderr.strip() or r.stdout.strip()}')
    return r


def sync():
    """Brings the clone up to date. No signal only earns a warning: what's here can still be read."""
    r = git('pull', '-q', '--ff-only', check=False)
    if r.returncode:
        print(f'  warning: could not update from GitHub, so this is what the clone already has. {r.stderr.strip()[:200]}')


def publish(message, *paths):
    """Commits only these paths and pushes. Answers can land at any moment, so a rejected push pulls and tries once more."""
    names = [str(p) for p in paths]
    git('add', '--', *names)
    if not git('diff', '--cached', '--name-only', '--', *names).stdout.strip():
        print('Nothing changed, so nothing was pushed.')
        return False
    user = getpass.getuser()
    if user and user.lower() in git('diff', '--cached', '--', *names).stdout.lower():
        git('reset', '-q', '--', *names)
        die('Stopped: the change holds the name of this computer\'s user, which must not go into a repo. Nothing was committed.')
    git('commit', '-q', '-m', f'{message}\n\n{ATTRIBUTION}', '--', *names)
    if git('push', '-q', 'origin', 'HEAD', check=False).returncode:
        git('pull', '-q', '--rebase', '--autostash')
        git('push', '-q', 'origin', 'HEAD')
    print(f'Pushed: {message}')
    return True


def pack_from(args):
    """--pack, or the .riffle-pack file in this folder or a parent."""
    if getattr(args, 'pack', None):
        return args.pack
    here = pathlib.Path.cwd()
    for d in [here, *here.parents]:
        f = d / '.riffle-pack'
        if f.exists():
            return f.read_text(encoding='utf-8').strip()
    return None


def load_json(path):
    try:
        return json.loads(pathlib.Path(path).read_text(encoding='utf-8'))
    except ValueError as e:
        die(f'{path} is not valid JSON: {e}')


def save_json(path, value):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')


def packs():
    root = DATA / 'packs'
    return sorted(p.parent.name for p in root.glob('*/pack.json')) if root.exists() else []


def decks_of(pack):
    return {f.stem: load_json(f) for f in sorted((DATA / 'packs' / pack / 'decks').glob('*.json'))}


def need_pack(pack):
    if not (DATA / 'packs' / pack / 'pack.json').exists():
        die(f'No pack called {pack}. These exist: {", ".join(packs())}. Make one with: riffle pack {pack} --title "..."')


# ---------- will it fit?

def lines(text, size, width, bold=False):
    """How many lines some text wraps to. Glyph widths are a slightly generous average."""
    glyph = size * (0.58 if bold else 0.525)
    total, used = 1, 0
    for word in str(text).split():
        w = len(word) * glyph
        if used and used + glyph + w > width:
            total += 1
            used = 0
        used += (glyph if used else 0) + w
        while used > width:  # a word longer than the line
            total += 1
            used -= width
    return total


def face_height(c, st):
    """Roughly how tall a card's face comes out at one of the app's steps."""
    width = FACE_WIDTH + st['width']
    kind = c.get('kind', 'question')
    rarity = c.get('rarity', 'common')
    handled = c.get('handled')
    h = st['pad']
    h += 34 if rarity in ('rare', 'legendary') else 17  # the kind and importance line, which wraps on the long labels
    if handled:
        h += 26
        h += lines(c.get('text', ''), 15, width) * 15 * 1.25 + 14
        h += lines(handled.get('how', ''), st['how'], width, bold=True) * st['how'] * 1.22
    else:
        h += lines(c.get('text', ''), st['h2'], width, bold=True) * st['h2'] * st['h2lh'] + st['h2m']
        if c.get('why'):
            h += lines(c['why'], st['why'], width) * st['why'] * st['whylh']
    if kind == 'options' and not handled:
        for o in c.get('options') or []:
            inner = width - 52 - (56 if o.get('image') else 0)
            one = lines(o.get('label', ''), 16.5, inner, bold=True) * 16.5 * 1.22
            if o.get('text'):
                one += lines(o['text'], 13.5, inner) * 13.5 * 1.22 + 1
            h += max(st['optmin'], one + st['optpad']) + 7
        h += 3
    elif c.get('pick') and not handled:
        h += lines(c['pick'], st['pick'], width - 29) * st['pick'] * st['picklh'] + st['pickpad'] + 18 + 10
    if rarity in ('epic', 'legendary'):
        h += st['line'] * 1.3 + st['linem']
    if c.get('details') or c.get('images'):
        h += st['line'] * 1.3 + st['linem']
    return h


def estimate(c):
    """The app's step a card ends up at on the smallest iPhone: 0 to 2, or 3 if the description gets cut."""
    for step, st in enumerate(FIT_STEPS):
        if face_height(c, st) <= FACE_HEIGHT:
            return step
    return 3


# ---------- checking cards

def check_cards(cards, base=None, pack=None):
    errors, warnings = [], []
    seen = set()
    for i, c in enumerate(cards):
        name = c.get('id') or f'card {i + 1}'
        for extra in sorted(set(c) - CARD_FIELDS):
            warnings.append(f'{name}: the app ignores "{extra}". Is it a typo?')
        if not c.get('id'):
            errors.append(f'{name}: needs an id')
        elif c['id'] in seen:
            errors.append(f'{name}: this id is used twice')
        seen.add(c.get('id'))
        kind = c.get('kind', 'question')
        if kind not in KINDS:
            errors.append(f'{name}: kind must be one of {sorted(KINDS)}')
        if c.get('rarity', 'common') not in RARITIES:
            errors.append(f'{name}: rarity must be one of {sorted(RARITIES)}')
        if 'version' in c and (not isinstance(c['version'], int) or c['version'] < 1):
            errors.append(f'{name}: version must be a whole number from 1 up')
        if not c.get('title'):
            errors.append(f'{name}: needs a short title, for the overview grid')
        if not c.get('text'):
            errors.append(f'{name}: needs text')
        handled = c.get('handled')
        if handled:
            if not handled.get('how') or not handled.get('at'):
                errors.append(f'{name}: handled needs both how and at')
            elif not seconds(handled['at']):
                errors.append(f'{name}: handled.at must be an ISO time, like {now()}')
            if len(str(handled.get('how') or '')) > HOW_LIMIT:
                warnings.append(f'{name}: handled.how is {len(handled["how"])} characters, over {HOW_LIMIT}. One or two plain sentences read best')
        elif kind in ('question', 'design', 'options') and kind != 'options' and not c.get('pick'):
            errors.append(f'{name}: a {kind} card needs your pick. Cards always carry a suggestion')
        if kind == 'report' and c.get('pick'):
            warnings.append(f'{name}: a report asks for nothing, so a pick looks odd on it')
        if kind == 'options':
            opts = c.get('options') or []
            if not 2 <= len(opts) <= MAX_OPTIONS:
                errors.append(f'{name}: an option card needs 2 to {MAX_OPTIONS} options, or they won\'t fit')
            ids = [o.get('id') for o in opts]
            if len(set(ids)) != len(ids) or not all(ids):
                errors.append(f'{name}: each option needs its own id')
            if not all(o.get('label') for o in opts):
                errors.append(f'{name}: each option needs a label')
            if c.get('pick') and c['pick'] not in ids:
                errors.append(f'{name}: pick must be one of its option ids')
            if not c.get('pick') and not handled:
                warnings.append(f'{name}: no option is marked as your pick, so going with nothing tapped does nothing')
            for o in opts:
                for extra in sorted(set(o) - OPTION_FIELDS):
                    warnings.append(f'{name}: the app ignores "{extra}" on an option. Is it a typo?')
        wording = {f: c.get(f) for f in ('text', 'why', 'pick', 'details') if c.get(f)}
        if handled:
            wording['handled.how'] = handled.get('how')
        for o in c.get('options') or []:
            wording[f'option {o.get("id")}'] = ' '.join(str(o.get(f) or '') for f in ('label', 'text'))
        for field, words in wording.items():
            if NAMED_DIRECTION.search(str(words)):
                errors.append(f'{name}: {field} names a swipe direction. People can swap those, so say "add a comment" or nothing')
            if field != 'details' and LOOKS_LIKE_CODE.search(str(words)):
                warnings.append(f'{name}: {field} looks like it has code in it ("{LOOKS_LIKE_CODE.search(str(words)).group(0)}"). Say it in everyday words')
        for field, most in LIMITS.items():
            if len(str(c.get(field) or '')) > most and not (field == 'pick' and kind == 'options'):
                warnings.append(f'{name}: {field} is {len(c[field])} characters, over {most}. A card reads at a glance, and the rest can go in details')
        step = estimate(c)
        if step == 3:
            warnings.append(f"{name}: won't fit a small iPhone even in its smallest type, so the end of its description gets cut, with the whole of it on the back. Shorten it, or move some to details")
        elif step == 2:
            warnings.append(f'{name}: may only fit a small iPhone in its smallest type. Shorter would read better')
        if not (c.get('why') or handled):
            warnings.append(f'{name}: nothing says what this changes. Technical cards with no context get sent back')
        for image in [*(c.get('images') or []), *[o.get('image') for o in c.get('options') or [] if o.get('image')]]:
            found = None
            if image.startswith('img/') and pack:
                found = DATA / 'packs' / pack / image
            elif base is not None:
                found = base / image
            if found is not None and not found.exists():
                errors.append(f'{name}: can\'t find the picture {image}')
    return errors, warnings


def check_deck(d, base, pack):
    if not isinstance(d, dict):
        return ['a deck file holds one object, with a title and cards'], []
    errors, warnings = check_cards(d.get('cards', []), base, pack)
    for extra in sorted(set(d) - DECK_FIELDS):
        warnings.append(f'the app ignores "{extra}" on a deck. Is it a typo?')
    if not d.get('title'):
        errors.append('the deck needs a title')
    if not d.get('cards'):
        errors.append('the deck has no cards')
    if d.get('misc') and d.get('topic'):
        errors.append('a Misc deck sits apart from topics, so it can\'t have a topic too')
    if d.get('stack') and not d.get('topic'):
        errors.append('stacks work inside a topic, so a stacked deck needs a topic')
    if not d.get('misc') and not d.get('topic'):
        warnings.append('no topic, so this deck lands with Misc at the bottom of the pack')
    if d.get('topic') and pack and (DATA / 'packs' / pack / 'pack.json').exists():
        topics = {t['id'] for t in load_json(DATA / 'packs' / pack / 'pack.json').get('topics', [])}
        if d['topic'] not in topics:
            errors.append(f'no topic called {d["topic"]} in {pack}. These exist: {", ".join(sorted(topics)) or "none"}. Make it with: riffle topic {d["topic"]} --pack {pack} --title "..."')
    return errors, warnings


def report_check(errors, warnings):
    for w in warnings:
        print(f'  warning: {w}')
    for e in errors:
        print(f'  ERROR: {e}')
    return not errors


def shrink_image(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image
    except ImportError:
        out = target.with_suffix(pathlib.Path(source).suffix)
        shutil.copyfile(source, out)
        print('  warning: Pillow is not installed, so the picture went up full size.')
        return out
    with Image.open(source) as im:
        im = im.convert('RGB')
        im.thumbnail((IMAGE_LONG_SIDE, IMAGE_LONG_SIDE))
        im.save(target, 'JPEG', quality=82, optimize=True)
    return target


def bring_images(cards, base, pack):
    """Shrinks pictures for bus data and copies them in. Returns the files made."""
    made = []

    def bring(rel):
        if rel.startswith('img/'):
            return rel
        out = shrink_image(base / rel, DATA / 'packs' / pack / 'img' / (re.sub(r'[^\w.-]', '-', pathlib.Path(rel).stem) + '.jpg'))
        made.append(out)
        return f'img/{out.name}'
    for c in cards:
        if c.get('images'):
            c['images'] = [bring(i) for i in c['images']]
        for o in c.get('options') or []:
            if o.get('image'):
                o['image'] = bring(o['image'])
    return made


# ---------- icons

def icon_library():
    if not ICON_LIBRARY.exists():
        print('Fetching the game-icons library (about 7 MB, CC BY 3.0) the first time.')
        ICON_LIBRARY.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['git', 'clone', '-q', '--depth', '1', 'https://github.com/game-icons/icons', str(ICON_LIBRARY)], check=True)
    return ICON_LIBRARY


def find_icons(word):
    word = word.lower()
    return sorted(p for p in icon_library().glob('*/*.svg') if word in p.stem)


def icon_text(name):
    if name.startswith('<svg'):
        return name
    hits = list(icon_library().glob(f'*/{name}.svg'))
    if not hits:
        close = [p.stem for p in find_icons(name)][:12]
        die(f'No icon called {name}. Close: {", ".join(close) or "none"}')
    return hits[0].read_text(encoding='utf-8').replace('<path d="M0 0h512v512H0z"/>', '').strip()


# ---------- commands: making things

def cmd_pack(a):
    sync()
    path = DATA / 'packs' / a.id / 'pack.json'
    pack = load_json(path) if path.exists() else {'topics': []}
    pack['title'] = a.title or pack.get('title') or a.id
    if a.color: pack['color'] = a.color
    if a.icon: pack['icon'] = icon_text(a.icon)
    if a.order is not None: pack['order'] = a.order
    save_json(path, pack)
    publish(f'Pack: {pack["title"]}', path)


def cmd_topic(a):
    sync()
    pack = pack_from(a) or die('Which pack? Use --pack, or put its id in a .riffle-pack file.')
    need_pack(pack)
    path = DATA / 'packs' / pack / 'pack.json'
    p = load_json(path)
    topics = p.setdefault('topics', [])
    t = next((x for x in topics if x['id'] == a.id), None)
    if not t:
        t = {'id': a.id, 'order': len(topics) + 1}
        topics.append(t)
    t['title'] = a.title or t.get('title') or a.id
    if a.color: t['color'] = a.color
    if a.icon: t['icon'] = icon_text(a.icon)
    if a.order is not None: t['order'] = a.order
    save_json(path, p)
    publish(f'Topic in {pack}: {t["title"]}', path)


def cmd_check(a):
    """Reads files and folders, and changes nothing."""
    files = []
    for name in a.paths:
        p = pathlib.Path(name)
        files.extend(sorted(p.glob('*.json')) if p.is_dir() else [p])
    if not files:
        die('No deck files there.')
    bad = 0
    total = 0
    for file in files:
        d = load_json(file)
        inside = re.search(r'packs[\\/]([^\\/]+)[\\/]decks[\\/][^\\/]+$', str(file.resolve()))
        pack = pack_from(a) or (inside.group(1) if inside else None)
        print(file.name)
        errors, warnings = check_deck(d, file.parent, pack)
        count = len(d.get('cards', [])) if isinstance(d, dict) else 0
        total += count
        fine = report_check(errors, warnings)
        bad += 0 if fine else 1
        print(f'  {count} card{"" if count == 1 else "s"}: {"fine" if fine else "not ready"}.')
    if len(files) > 1:
        print(f'{len(files)} decks, {total} cards, {bad} not ready.')
    sys.exit(1 if bad else 0)


def cmd_fit(a):
    """How each card should fit the smallest iPhone. Reads files and changes nothing."""
    d = load_json(a.file)
    cards = d if isinstance(d, list) else d.get('cards', [d])
    if a.json:
        print(json.dumps({c.get('id'): estimate(c) for c in cards}))
        return
    for c in cards:
        print(f'{c.get("id")}: {FIT_WORDS[estimate(c)]}')


def cmd_deck(a):
    sync()
    pack = pack_from(a) or die('Which pack? Use --pack, or put its id in a .riffle-pack file.')
    need_pack(pack)
    file = pathlib.Path(a.file)
    d = load_json(file)
    deck_id = a.id or file.stem
    if not report_check(*check_deck(d, file.parent, pack)):
        die('Not sent. Fix the errors above.')
    made = bring_images(d['cards'], file.parent, pack)
    target = DATA / 'packs' / pack / 'decks' / f'{deck_id}.json'
    if made or file.resolve() != target.resolve():
        save_json(target, d)
    if publish(f'Deck in {pack}: {d["title"]} ({len(d["cards"])} cards)', target, *made) and not a.quiet:
        owed = sum(1 for c in d['cards'] if not c.get('handled'))
        notify_once(f'{d["title"]}: {owed} card{"" if owed == 1 else "s"}')


def cmd_misc(a):
    """One-offs join the pack's Misc deck instead of making a deck of one."""
    sync()
    pack = pack_from(a) or die('Which pack? Use --pack, or put its id in a .riffle-pack file.')
    need_pack(pack)
    file = pathlib.Path(a.file)
    new = load_json(file)
    new = new if isinstance(new, list) else [new]
    target = DATA / 'packs' / pack / 'decks' / 'misc.json'
    deck = load_json(target) if target.exists() else {'misc': True, 'title': 'Misc', 'order': 99, 'cards': []}
    have = {c['id'] for c in deck['cards']}
    clash = [c['id'] for c in new if c.get('id') in have]
    if clash:
        die(f'These ids are already in Misc: {", ".join(clash)}')
    if not report_check(*check_cards(new, file.parent, pack)):
        die('Not sent. Fix the errors above.')
    made = bring_images(new, file.parent, pack)
    deck['cards'].extend(new)
    save_json(target, deck)
    publish(f'Misc in {pack}: {len(new)} more', target, *made)


def cmd_icons(a):
    hits = find_icons(a.word)
    print('\n'.join(p.stem for p in hits[:60]) or 'None.')
    if len(hits) > 60:
        print(f'...and {len(hits) - 60} more.')


# ---------- reading answers

def read_events():
    events = []
    seen = set()
    for f in sorted((DATA / 'answers').glob('*.json')):
        if f.name.startswith('connect-check'):
            continue
        try:
            batch = json.loads(f.read_text(encoding='utf-8'))
        except ValueError:
            print(f'  warning: could not read {f.name}')
            continue
        for e in batch.get('events', []):
            if e.get('eid') in seen:
                continue
            seen.add(e.get('eid'))
            e['_file'] = f.name
            events.append(e)
    events.sort(key=lambda e: e.get('at', ''))
    return events


def read_state():
    """Which answer files each pack's writer has read. Per pack, so one project can't mark another's as read."""
    p = DATA / 'read.json'
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else {'v': 1, 'packs': {}}


def unread(events, state, pack=None):
    packs_read = state.get('packs', {})
    out = []
    for e in events:
        if pack and e.get('pack') != pack:
            continue
        if e['_file'] not in packs_read.get(e.get('pack'), {}).get('files', []):
            out.append(e)
    return out


def summarise(events):
    """Works out what stands, by the rules in format.md."""
    undone = {e.get('of') for e in events if e.get('type') == 'undo'}
    decks, thoughts, thought_drafts = {}, {}, {}

    def deck(e):
        return decks.setdefault((e.get('pack'), e.get('deck')), {'answers': {}, 'drafts': {}, 'notes': None, 'verdict': None, 'earlier': [], 'resets': [], 'topic': e.get('topic')})
    for e in events:
        t = e.get('type')
        if t == 'answer' and e.get('eid') not in undone:
            d = deck(e)
            d['answers'][e['card']] = e
            d['drafts'].pop(e['card'], None)
        elif t == 'draft' and e.get('thought'):
            thought_drafts[e.get('pack')] = e
        elif t == 'draft':
            d = deck(e)
            if e.get('text') or e.get('images'):
                d['drafts'][e['card']] = e
            else:
                d['drafts'].pop(e['card'], None)
        elif t == 'notes':
            deck(e)['notes'] = e
        elif t == 'deck':
            deck(e)['verdict'] = e
        elif t == 'deck-reset':
            d = deck(e)
            d['earlier'].extend(a for a in d['answers'].values() if a.get('comment'))
            d['answers'] = {}
            d['verdict'] = None
            d['resets'].append(e)
        elif t == 'thought':
            thoughts.setdefault(e.get('pack'), []).append(e)
            thought_drafts.pop(e.get('pack'), None)
    return decks, thoughts, thought_drafts


def card_in(pack, deck_id, card_id):
    f = DATA / 'packs' / pack / 'decks' / f'{deck_id}.json'
    if not f.exists():
        return None
    return next((c for c in load_json(f).get('cards', []) if c.get('id') == card_id), None)


def word_for(answer, card):
    table = HANDLED_WORDS if answer.get('handledAt') or (card and card.get('handled')) else WORDS.get(answer.get('kind', 'question'), WORDS['question'])
    return table.get(answer.get('swipe'), answer.get('swipe'))


def pictures(event):
    """Where an event's pictures are, in the clone. One still uploading isn't there yet."""
    return ', '.join(f'{p}{"" if (DATA / p).exists() else " (still uploading)"}' for p in event.get('images') or [])


def answer_line(a, card):
    title = a.get('title') or (card or {}).get('title') or a['card']
    parts = [word_for(a, card)]
    if a.get('selected') is not None:
        labels = {o['id']: o.get('label', o['id']) for o in (card or {}).get('options', [])}
        chosen = ', '.join(labels.get(i, i) for i in a['selected'])
        parts.append(f'picked: {chosen}' if chosen else 'none of them')
        if a.get('byPick'):
            parts.append('(your pick, nothing tapped)')
    if a.get('handledAt'):
        parts.append('on your handled conclusion')
    line = f'  {a["card"]} ({title}): ' + ', '.join(str(p) for p in parts)
    if a.get('comment'):
        line += f'\n      "{a["comment"]}"'
    if a.get('images'):
        line += f'\n      pictures: {pictures(a)}'
    return line


def cmd_answers(a):
    sync()
    events = read_events()
    state = read_state()
    pack_filter = None if a.every_pack else pack_from(a)
    decks, thoughts, thought_drafts = summarise(events)
    shown = [e for e in events if not pack_filter or e.get('pack') == pack_filter] if a.all else unread(events, state, pack_filter)
    if a.json:
        print(json.dumps({'events': shown}, ensure_ascii=False, indent=1))
    else:
        touched = {}
        for e in shown:
            touched.setdefault((e.get('pack'), e.get('deck')), set()).add(e.get('card'))
        if not shown:
            print('Nothing new.' if not a.all else 'No answers yet.')
        for (pack, deck_id), cards in sorted(touched.items(), key=lambda kv: (str(kv[0][0]), str(kv[0][1]))):
            d = decks.get((pack, deck_id))
            if deck_id is None or not d:
                continue
            tag = ' [Feel test: test answers, but their words]' if pack == 'feel-test' else ''
            print(f'\n{pack} / {d.get("topic") or "misc"} / {deck_id}{tag}')
            for card_id in sorted(c for c in cards if c):
                if card_id in d['answers']:
                    print(answer_line(d['answers'][card_id], card_in(pack, deck_id, card_id)))
                elif card_id in d['drafts']:
                    dr = d['drafts'][card_id]
                    print(f'  {card_id}: still writing: "{dr.get("text", "")}"')
                    if dr.get('images'):
                        print(f'      pictures: {pictures(dr)}')
            if d['notes'] and d['notes'] in shown:
                print(f'  Deck notes: "{d["notes"].get("text", "")}"')
                if d['notes'].get('images'):
                    print(f'      pictures: {pictures(d["notes"])}')
            for r in d['resets']:
                if r in shown:
                    print(f'  They started this deck over ({"kept" if r.get("keptNotes") else "cleared"} notes and comments).')
            for old in d['earlier']:
                if old in shown:
                    print(f'  Said before starting over, on {old["card"]}: "{old["comment"]}"')
            if d['verdict'] and d['verdict'] in shown:
                v = d['verdict']
                print(f'  DECK: {"done" if v.get("verdict") == "done" else "REPLAN FROM THE BASE"} ({v.get("answered")} of {v.get("total")} answered)')
        for pack, items in sorted(thoughts.items(), key=lambda kv: str(kv[0])):
            new = [t for t in items if t in shown]
            if new:
                print(f'\n{pack}: thoughts')
                for t in new:
                    print(f'  {t["id"]}: "{t["text"]}"')
                    if t.get('images'):
                        print(f'      pictures: {pictures(t)}')
        for pack, t in thought_drafts.items():
            if t in shown and t.get('text'):
                print(f'\n{pack}: a thought still being written: "{t["text"]}"')
    if a.mark_read:
        for pack in sorted({e.get('pack') for e in shown if e.get('pack')}):
            entry = state.setdefault('packs', {}).setdefault(pack, {'files': []})
            entry['files'] = sorted(set(entry['files']) | {e['_file'] for e in shown if e.get('pack') == pack})
            entry['at'] = now()
        save_json(DATA / 'read.json', state)
        publish('Answers read', DATA / 'read.json')


def cmd_redeal(a):
    """What needs a second look: handled cards answered, and cards sent back."""
    sync()
    decks, _, _ = summarise(read_events())
    pack_filter = pack_from(a)
    groups = {'Handled, and they answered': [], 'Handled, no answer yet': [], 'Sent to workshop': [], 'Need more context': [], 'Comment only, to read': [], 'Deck sent back to replan': []}
    for pack in packs():
        if pack_filter and pack != pack_filter:
            continue
        for deck_id, deck in decks_of(pack).items():
            d = decks.get((pack, deck_id), {'answers': {}, 'verdict': None})
            if d['verdict'] and d['verdict'].get('verdict') == 'replan':
                groups['Deck sent back to replan'].append(f'{pack}/{deck_id}: {deck.get("title")}')
            for c in deck.get('cards', []):
                ref = f'{pack} {deck_id} {c["id"]}'
                ans = d['answers'].get(c['id'])
                stale = ans and ans.get('cardVersion', 1) < c.get('version', 1)
                if c.get('handled'):
                    if ans and seconds(ans.get('at')) >= seconds(c['handled']['at']):
                        groups['Handled, and they answered'].append(f'{ref}: {word_for(ans, c)}' + (f', "{ans["comment"]}"' if ans.get('comment') else ''))
                    else:
                        groups['Handled, no answer yet'].append(f'{ref}: {c.get("title")}')
                elif ans and not stale:
                    line = f'{ref}: {c.get("title")}' + (f', "{ans["comment"]}"' if ans.get('comment') else '')
                    if ans.get('selected') is not None and ans.get('swipe') == 'left':
                        line += f', leaning towards {ans["selected"] or "none of them"}'
                    if ans.get('swipe') == 'left':
                        groups['Sent to workshop'].append(line)
                    elif ans.get('swipe') == 'down':
                        groups['Need more context'].append(line)
                    elif ans.get('swipe') == 'up':
                        groups['Comment only, to read'].append(line)
    any_shown = False
    for name, lines in groups.items():
        if lines:
            any_shown = True
            print(f'\n{name}:')
            for l in lines:
                print(f'  {l}')
    if not any_shown:
        print('Nothing waiting on you.')


def edit_card(pack, deck_id, card_id, change, message):
    sync()
    need_pack(pack)
    path = DATA / 'packs' / pack / 'decks' / f'{deck_id}.json'
    if not path.exists():
        die(f'No deck {deck_id} in {pack}.')
    deck = load_json(path)
    card = next((c for c in deck.get('cards', []) if c.get('id') == card_id), None)
    if not card:
        die(f'No card {card_id} in {deck_id}. Cards: {", ".join(c["id"] for c in deck.get("cards", []))}')
    change(card)
    if not report_check(*check_cards(deck['cards'], path.parent, pack)):
        die('Not changed. Fix the errors above.')
    save_json(path, deck)
    publish(message, path)


def cmd_handled(a):
    if not a.undo and not a.how:
        die('Say how it was settled, with --how, in one or two plain sentences.')

    def change(card):
        if a.undo:
            card.pop('handled', None)
        else:
            card['handled'] = {'how': a.how, 'at': now()}
    edit_card(a.pack_id, a.deck, a.card, change, f'{"Unmarked" if a.undo else "Handled"}: {a.pack_id}/{a.deck}/{a.card}')


def cmd_second_try(a):
    """Deals a card back: a new version, with whatever you changed. It counts as unanswered again."""
    def change(card):
        card['version'] = card.get('version', 1) + 1
        if a.file:
            card.update({k: v for k, v in load_json(a.file).items() if k != 'id'})
        for field in ('text', 'why', 'pick', 'details'):
            value = getattr(a, field)
            if value is not None:
                card[field] = value
    edit_card(a.pack_id, a.deck, a.card, change, f'Second try: {a.pack_id}/{a.deck}/{a.card}')


def cmd_thought(a):
    sync()
    need_pack(a.pack_id)
    path = DATA / 'packs' / a.pack_id / 'thoughts.json'
    answers = load_json(path) if path.exists() else {}
    known = {t['id'] for t in summarise(read_events())[1].get(a.pack_id, [])}
    if a.thought_id not in known:
        die(f'No thought {a.thought_id} in {a.pack_id}. These exist: {", ".join(sorted(known)) or "none"}')
    answers[a.thought_id] = {'handled': {'how': a.how, 'at': now()}}
    save_json(path, answers)
    publish(f'Answered a thought in {a.pack_id}', path)


def owed_cards(decks):
    def owed(c, d):
        ans = d['answers'].get(c['id'])
        return not c.get('handled') and not (ans and ans.get('cardVersion', 1) >= c.get('version', 1))
    return sum(sum(1 for c in deck.get('cards', []) if owed(c, decks.get((pack, deck_id), {'answers': {}})))
               for pack in packs() for deck_id, deck in decks_of(pack).items())


def cmd_status(a):
    sync()
    events = read_events()
    state = read_state()
    decks, thoughts, _ = summarise(events)
    only = pack_from(a)
    for pack in packs():
        if only and pack != only:
            continue
        p = load_json(DATA / 'packs' / pack / 'pack.json')
        waiting = len(unread(events, state, pack))
        print(f'\n{pack}: {p.get("title")}' + (f' ({waiting} new event{"" if waiting == 1 else "s"} to read)' if waiting else ''))
        for deck_id, deck in decks_of(pack).items():
            d = decks.get((pack, deck_id), {'answers': {}, 'verdict': None})
            cards = deck.get('cards', [])
            owed = [c for c in cards if not c.get('handled') and not (d['answers'].get(c['id']) and d['answers'][c['id']].get('cardVersion', 1) >= c.get('version', 1))]
            handled = sum(1 for c in cards if c.get('handled'))
            verdict = f', {d["verdict"]["verdict"]}' if d['verdict'] else ''
            print(f'  {deck.get("topic") or "misc"} / {deck_id}: {len(owed)} of {len(cards) - handled} owed' + (f', {handled} handled' if handled else '') + verdict)
        if thoughts.get(pack):
            print(f'  {len(thoughts[pack])} thoughts')


def send_notification(title, body, badge=None, tag='riffle'):
    if not shutil.which('node'):
        print('Node is not installed here, so no notification was sent.')
        return
    args = ['node', str(HERE / 'notify.mjs'), str(DATA), '--title', title, '--body', body or '', '--tag', tag]
    if badge is not None:
        args += ['--badge', str(badge)]
    subprocess.run(args)


def notify_once(body):
    """One notification for a run of new decks, however many land together."""
    OWN_FILES.mkdir(parents=True, exist_ok=True)
    last = float(LAST_NOTIFY.read_text()) if LAST_NOTIFY.exists() else 0
    if time.time() - last < NOTIFY_GAP:
        print(f'No notification: one went out {int((time.time() - last) / 60)} minutes ago. riffle notify sends one by hand.')
        return
    LAST_NOTIFY.write_text(str(time.time()))
    send_notification('New deck in Riffle', body, owed_cards(summarise(read_events())[0]), 'new-deck')


def cmd_notify(a):
    sync()
    badge = a.badge if a.badge is not None else owed_cards(summarise(read_events())[0])
    send_notification(a.title, a.body, badge, a.tag)


def main():
    global DATA
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # comments hold curly quotes and emoji
    p = argparse.ArgumentParser(description='The writer\'s side of Riffle.')
    sub = p.add_subparsers(dest='command', required=True)

    s = sub.add_parser('status', help='every pack and deck, what is owed, what is unread')
    s.add_argument('--pack')
    s.set_defaults(fn=cmd_status)

    s = sub.add_parser('pack', help='make or change a pack')
    s.add_argument('id'); s.add_argument('--title'); s.add_argument('--color'); s.add_argument('--icon'); s.add_argument('--order', type=int)
    s.set_defaults(fn=cmd_pack)

    s = sub.add_parser('topic', help='make or change a topic in a pack')
    s.add_argument('id'); s.add_argument('--pack'); s.add_argument('--title'); s.add_argument('--color'); s.add_argument('--icon'); s.add_argument('--order', type=int)
    s.set_defaults(fn=cmd_topic)

    s = sub.add_parser('check', help='check deck files or folders, changing nothing')
    s.add_argument('paths', nargs='+'); s.add_argument('--pack')
    s.set_defaults(fn=cmd_check)

    s = sub.add_parser('fit', help='how each card in a file should fit the smallest iPhone, changing nothing')
    s.add_argument('file'); s.add_argument('--json', action='store_true')
    s.set_defaults(fn=cmd_fit)

    s = sub.add_parser('deck', help='check a deck file, shrink its pictures, send it, and notify the phone')
    s.add_argument('file'); s.add_argument('--pack'); s.add_argument('--id'); s.add_argument('--quiet', action='store_true', help='no notification')
    s.set_defaults(fn=cmd_deck)

    s = sub.add_parser('misc', help='add one-off cards to the pack\'s Misc deck')
    s.add_argument('file'); s.add_argument('--pack')
    s.set_defaults(fn=cmd_misc)

    s = sub.add_parser('icons', help='search the icon library by word')
    s.add_argument('word')
    s.set_defaults(fn=cmd_icons)

    s = sub.add_parser('answers', help='what came back since you last read')
    s.add_argument('--pack'); s.add_argument('--every-pack', action='store_true'); s.add_argument('--all', action='store_true'); s.add_argument('--json', action='store_true')
    s.add_argument('--mark-read', action='store_true', help='also record them as read')
    s.set_defaults(fn=cmd_answers)

    s = sub.add_parser('redeal', help='handled cards that were answered, and cards sent back')
    s.add_argument('--pack')
    s.set_defaults(fn=cmd_redeal)

    s = sub.add_parser('handled', help='mark a card handled, with how')
    s.add_argument('pack_id'); s.add_argument('deck'); s.add_argument('card'); s.add_argument('--how'); s.add_argument('--undo', action='store_true')
    s.set_defaults(fn=cmd_handled)

    s = sub.add_parser('second-try', help='deal a card back as a new version')
    s.add_argument('pack_id'); s.add_argument('deck'); s.add_argument('card'); s.add_argument('--file')
    for field in ('text', 'why', 'pick', 'details'):
        s.add_argument(f'--{field}')
    s.set_defaults(fn=cmd_second_try)

    s = sub.add_parser('thought', help='answer one of their thoughts')
    s.add_argument('pack_id'); s.add_argument('thought_id'); s.add_argument('--how', required=True)
    s.set_defaults(fn=cmd_thought)

    s = sub.add_parser('notify', help='send a notification to the phone by hand')
    s.add_argument('--title', default='Riffle'); s.add_argument('--body', default=''); s.add_argument('--badge', type=int); s.add_argument('--tag', default='riffle')
    s.set_defaults(fn=cmd_notify)

    a = p.parse_args()
    if a.fn is not cmd_fit:  # that one needs no repo
        DATA = data_repo()
    a.fn(a)


if __name__ == '__main__':
    main()
