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
import tempfile
import time
import urllib.parse
from datetime import datetime, timezone

HOME = pathlib.Path.home()
HERE = pathlib.Path(__file__).resolve().parent
REMOTE = 'https://github.com/Stippo47/riffle-data.git'
OWN_FILES = HOME / '.riffle'  # outside every repo: the push signing key, the icon library
ICON_LIBRARY = OWN_FILES / 'icons'
LAST_NOTIFY = OWN_FILES / 'last-notify'
NOTIFY_PENDING = OWN_FILES / 'notify-pending.json'  # what the next notification will name
NOTIFY_WAITER = OWN_FILES / 'notify-waiter'  # when the one waiting to send it is due
NOTIFY_LOG = OWN_FILES / 'notify-log.jsonl'
NOTIFY_GAP = 600  # seconds. A run of new decks makes one notification, not one each
ATTRIBUTION = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

KINDS = {'question', 'report', 'design', 'options', 'board'}
RARITIES = {'common', 'uncommon', 'rare', 'epic', 'legendary'}
CARD_FIELDS = {'id', 'version', 'kind', 'rarity', 'title', 'text', 'why', 'pick', 'details', 'images', 'videos', 'parts', 'options', 'items', 'handled'}
DECK_FIELDS = {'title', 'topic', 'stack', 'order', 'misc', 'cards', 'kind', 'priority', 'tags', 'archived', 'updated'}
DECK_KINDS = {'report', 'questions', 'board'}
TAG_WORDS = {'working': 'being worked on', 'first': 'answer first', 'waiting': 'waiting on you'}
MINE_KIND_WORDS = {'idea': 'Idea', 'picture': 'Picture', 'link': 'Web link', 'card': 'Riffle card'}
OPTION_FIELDS = {'id', 'label', 'text', 'image'}
ITEM_FIELDS = {'id', 'label', 'text', 'image', 'thumb', 'video'}
PART_FIELDS = {'id', 'title', 'text', 'images', 'videos'}
VIDEO_FIELDS = {'src', 'poster'}
ITEM_LABEL_LIMIT = 36
PART_TITLE_LIMIT = 40  # one line on the card's face
PARTS_ON_FACE = 4  # the app shows this many part titles on the face, then "and N more"
PARTS_MANY = 12
WORDS = {
    'question': {'right': 'GO', 'left': 'WORKSHOP', 'down': 'IDK', 'up': 'COMMENT'},
    'report': {'right': 'GOOD', 'left': 'PROBLEM', 'down': 'HUH?', 'up': 'COMMENT'},
    'design': {'right': 'YES', 'left': 'RETHINK', 'down': 'IDK', 'up': 'COMMENT'},
    'options': {'right': 'GO', 'left': 'REDO', 'down': 'IDK', 'up': 'COMMENT'},
    'board': {'right': 'GO', 'left': 'REDO', 'down': 'IDK', 'up': 'COMMENT'},
}
HANDLED_WORDS = {'right': 'FINE', 'left': 'WORKSHOP', 'down': 'IDK', 'up': 'COMMENT'}
LINK = re.compile(r'\[([^\]\n]{1,120})\]\(riffle:([^)\s]{1,400})\)')  # a link to a pack, deck, card or part
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
# Enough to zoom into on a phone, at about half a megabyte for a detailed picture. Card pictures come
# down ahead of time. A board's come one at a time when looked at, so only its thumbnails are a cost up front.
IMAGE_LONG_SIDE = 2000
IMAGE_QUALITY = 82
THUMB_LONG_SIDE = 360
THUMB_QUALITY = 72
# Films play muted and looping on the phone, and come down like pictures, so they're kept small.
VIDEO_TYPES = {'.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi'}
VIDEO_AS_IS = {'.mp4', '.m4v'}
VIDEO_LIMIT = 2_000_000  # bytes
VIDEO_TRIES = [(1280, 26), (960, 29), (720, 32), (540, 35)]  # long side and quality, until it fits


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


def in_batches(names, limit=6000):
    """Splits paths into runs short enough for one command line: Windows stops at about 32,000 characters,
    and a deck of many films and boards can name hundreds of files."""
    batch, size = [], 0
    for n in names:
        if batch and size + len(n) + 3 > limit:
            yield batch
            batch, size = [], 0
        batch.append(n)
        size += len(n) + 3
    if batch:
        yield batch


def publish(message, *paths):
    """Commits only these paths and pushes. Answers can land at any moment, so a rejected push pulls and tries once more."""
    names = [os.path.relpath(p, DATA) for p in paths]  # relative, as a big board can list a lot of them
    for b in in_batches(names):
        git('add', '--', *b)
    if not any(git('diff', '--cached', '--name-only', '--', *b).stdout.strip() for b in in_batches(names)):
        print('Nothing changed, so nothing was pushed.')
        return False
    user = getpass.getuser()
    if user and any(user.lower() in git('diff', '--cached', '--', *b).stdout.lower() for b in in_batches(names)):
        for b in in_batches(names):
            git('reset', '-q', '--', *b)
        die('Stopped: the change holds the name of this computer\'s user, which must not go into a repo. Nothing was committed.')
    # One commit of exactly these paths, however many: the list goes to git in a file, not on the command line.
    with tempfile.NamedTemporaryFile('wb', suffix='.paths', delete=False) as f:
        f.write(b'\0'.join(n.encode('utf-8') for n in names))
    listing = pathlib.Path(f.name)
    try:
        git('commit', '-q', '-m', f'{message}\n\n{ATTRIBUTION}', f'--pathspec-from-file={listing}', '--pathspec-file-nul')
    finally:
        listing.unlink(missing_ok=True)
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
    elif kind == 'board' and not handled:
        h += 70 + st['line'] * 1.3 + st['linem']  # at least a row of small pictures, and the line under them
    elif c.get('pick') and not handled:
        h += lines(c['pick'], st['pick'], width - 29) * st['pick'] * st['picklh'] + st['pickpad'] + 18 + 10
    parts = c.get('parts') or []
    if parts and kind not in ('options', 'board'):
        h += 10 + min(len(parts), PARTS_ON_FACE) * (34 if st['pad'] == 28 and st['h2'] == 21 else 30)
        if len(parts) > PARTS_ON_FACE:
            h += 26
    if rarity in ('epic', 'legendary'):
        h += st['line'] * 1.3 + st['linem']
    if c.get('details') or c.get('images') or c.get('videos') or parts:
        h += st['line'] * 1.3 + st['linem']
    return h


def estimate(c):
    """The app's step a card ends up at on the smallest iPhone: 0 to 2, or 3 if the description gets cut."""
    for step, st in enumerate(FIT_STEPS):
        if face_height(c, st) <= FACE_HEIGHT:
            return step
    return 3


# ---------- checking cards

def film_of(v):
    """A film entry as {src, poster}, from a path or an object. None if it's neither."""
    if isinstance(v, str) and v:
        return {'src': v}
    if isinstance(v, dict) and v.get('src'):
        return v
    return None


def check_films(name, where, films, errors, warnings):
    for v in films or []:
        f = film_of(v)
        if not f:
            errors.append(f'{name}: {where}videos holds something that is neither a path nor {{"src": ..., "poster": ...}}')
            continue
        if isinstance(v, dict):
            for extra in sorted(set(v) - VIDEO_FIELDS):
                warnings.append(f'{name}: the app ignores "{extra}" on a film. Is it a typo?')
        ext = pathlib.Path(f['src']).suffix.lower()
        if ext not in VIDEO_TYPES:
            errors.append(f'{name}: {f["src"]} is not a film the app can play. Use an mp4')
        elif ext not in VIDEO_AS_IS and not shutil.which('ffmpeg'):
            errors.append(f'{name}: {f["src"]} needs ffmpeg to become an mp4, and ffmpeg is not installed here')


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
        if kind == 'board':
            items = c.get('items') or []
            if len(items) < 2:
                errors.append(f'{name}: a board needs at least 2 items')
            ids = [it.get('id') for it in items]
            if len(set(ids)) != len(ids) or not all(ids):
                errors.append(f'{name}: each item needs its own id')
            if not all(it.get('label') for it in items):
                errors.append(f'{name}: each item needs a short label')
            if not all(it.get('image') or it.get('video') for it in items):
                errors.append(f'{name}: each item needs a picture, in image, or a film, in video')
            check_films(name, 'an item\'s ', [it['video'] for it in items if it.get('video')], errors, warnings)
            picks = c.get('pick') or []
            picks = [picks] if isinstance(picks, str) else picks
            for p in picks:
                if p not in ids:
                    errors.append(f'{name}: pick {p} is not one of its item ids')
            if not picks and not handled:
                warnings.append(f'{name}: no item is marked as your pick, so going with nothing ticked does nothing')
            for it in items:
                for extra in sorted(set(it) - ITEM_FIELDS):
                    warnings.append(f'{name}: the app ignores "{extra}" on an item. Is it a typo?')
                if len(str(it.get('label') or '')) > ITEM_LABEL_LIMIT:
                    warnings.append(f'{name}: item {it.get("id")}\'s label is {len(it["label"])} characters, over {ITEM_LABEL_LIMIT}. It sits under a small tile, and the item\'s text can say more')
        check_films(name, '', c.get('videos'), errors, warnings)
        parts = c.get('parts') or []
        if parts:
            if kind in ('options', 'board'):
                errors.append(f'{name}: parts go on questions, reports and designs, not on {kind} cards')
            pids = [pt.get('id') if isinstance(pt, dict) else None for pt in parts]
            if len(set(pids)) != len(pids) or not all(pids):
                errors.append(f'{name}: each part needs its own id')
            for pt in (x for x in parts if isinstance(x, dict)):
                pname = f'{name}, part {pt.get("id")}'
                if not pt.get('title'):
                    errors.append(f'{pname}: needs a short title, shown on the card\'s face')
                elif len(str(pt['title'])) > PART_TITLE_LIMIT:
                    warnings.append(f'{pname}: its title is {len(str(pt["title"]))} characters, over {PART_TITLE_LIMIT}. It sits on one line of the card\'s face')
                if not (pt.get('text') or pt.get('images') or pt.get('videos')):
                    errors.append(f'{pname}: needs text, pictures or films')
                for extra in sorted(set(pt) - PART_FIELDS):
                    warnings.append(f'{pname}: the app ignores "{extra}" on a part. Is it a typo?')
                check_films(pname, '', pt.get('videos'), errors, warnings)
            if len(parts) > PARTS_MANY:
                warnings.append(f'{name}: {len(parts)} parts is a lot for one card. Could it be two cards, or a deck?')
        wording = {f: c.get(f) for f in ('text', 'why', 'pick', 'details') if c.get(f) and not (f == 'pick' and kind in ('options', 'board'))}
        for pt in (x for x in parts if isinstance(x, dict)):
            wording[f'part {pt.get("id")}'] = ' '.join(str(pt.get(f) or '') for f in ('title', 'text'))
        if handled:
            wording['handled.how'] = handled.get('how')
        for o in c.get('options') or []:
            wording[f'option {o.get("id")}'] = ' '.join(str(o.get(f) or '') for f in ('label', 'text'))
        for it in c.get('items') or []:
            wording[f'item {it.get("id")}'] = ' '.join(str(it.get(f) or '') for f in ('label', 'text'))
        for field, words in wording.items():
            for m in LINK.finditer(str(words)):
                bits = [urllib.parse.unquote(x) for x in m.group(2).split('/')]
                if len(bits) >= 3 and bits[2] in seen | {x.get('id') for x in cards}:
                    continue  # a card in this same deck, which may not be sent yet
                if DATA and 'no such' in resolve(m.group(2)):
                    warnings.append(f'{name}: {field} links to {m.group(2)}, which isn\'t there: {resolve(m.group(2))}')
            if NAMED_DIRECTION.search(str(words)):
                errors.append(f'{name}: {field} names a swipe direction. People can swap those, so say "add a comment" or nothing')
            if field != 'details' and not field.startswith('part ') and LOOKS_LIKE_CODE.search(str(words)):
                warnings.append(f'{name}: {field} looks like it has code in it ("{LOOKS_LIKE_CODE.search(str(words)).group(0)}"). Say it in everyday words')
        for field, most in LIMITS.items():
            if len(str(c.get(field) or '')) > most and not (field == 'pick' and kind in ('options', 'board')):
                warnings.append(f'{name}: {field} is {len(c[field])} characters, over {most}. A card reads at a glance, and the rest can go in details')
        step = estimate(c)
        if step == 3:
            warnings.append(f"{name}: won't fit a small iPhone even in its smallest type, so the end of its description gets cut, with the whole of it on the back. Shorten it, or move some to details")
        elif step == 2:
            warnings.append(f'{name}: may only fit a small iPhone in its smallest type. Shorter would read better')
        if not (c.get('why') or handled):
            warnings.append(f'{name}: nothing says what this changes. Technical cards with no context get sent back')
        items = c.get('items') or []
        films = [*(c.get('videos') or []), *[it.get('video') for it in items]]
        for pt in (x for x in parts if isinstance(x, dict)):
            films.extend(pt.get('videos') or [])
        wanted = [*(c.get('images') or []), *[o.get('image') for o in [*(c.get('options') or []), *items]], *[it.get('thumb') for it in items]]
        for pt in (x for x in parts if isinstance(x, dict)):
            wanted.extend(pt.get('images') or [])
        for f in filter(None, map(film_of, films)):
            wanted.extend([f['src'], f.get('poster')])
        for image in filter(None, wanted):
            if image.startswith('img/') and not pack and not (base is not None and (base / image).exists()):
                continue  # it may well be in the pack, but no pack was named
            if base is not None and picture_source(image, base, pack)[0] is None:
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
    if d.get('kind') is not None and d.get('kind') not in DECK_KINDS:
        errors.append(f'kind on a deck must be one of {sorted(DECK_KINDS)}')
    if d.get('priority') is not None and (not isinstance(d['priority'], int) or d['priority'] < 1):
        errors.append('priority must be a whole number from 1, where 1 is answered first')
    if d.get('tags') is not None and (not isinstance(d['tags'], list) or not all(isinstance(t, str) and t for t in d['tags'])):
        errors.append(f'tags is a list of words, like {sorted(TAG_WORDS)}')
    if d.get('topic') and pack and (DATA / 'packs' / pack / 'pack.json').exists():
        topics = {t['id'] for t in load_json(DATA / 'packs' / pack / 'pack.json').get('topics', [])}
        if d['topic'] not in topics:
            errors.append(f'no topic called {d["topic"]} in {pack}. These exist: {", ".join(sorted(topics)) or "none"}. Make it with: riffle topic {d["topic"]} --pack {pack} --title "..."')
    return errors, warnings


def resolve(address):
    """A link's address as Pack › Topic › Deck › Card › Part, from the files as they are now. What no
    longer exists says so."""
    bits = [urllib.parse.unquote(x) for x in str(address).split('/')]
    pack, deck_id, card_id, part_id = (bits + [None] * 4)[:4]
    pf = DATA / 'packs' / str(pack) / 'pack.json' if DATA and pack else None
    if not pf or not pf.exists():
        return f'{address} (no such pack)'
    p = load_json(pf)
    names = [p.get('title') or pack]
    if not deck_id:
        return ' › '.join(names)
    df = DATA / 'packs' / pack / 'decks' / f'{deck_id}.json'
    if not df.exists():
        return ' › '.join([*names, f'{deck_id} (no such deck)'])
    d = load_json(df)
    topic = next((t for t in p.get('topics', []) if t.get('id') == d.get('topic')), None)
    names += [(topic or {}).get('title') or 'Misc', d.get('title') or deck_id]
    if card_id:
        card = next((c for c in d.get('cards', []) if c.get('id') == card_id), None)
        names.append((card.get('title') or card_id) if card else f'{card_id} (no such card)')
        if part_id:
            part = next((x for x in (card or {}).get('parts') or [] if x.get('id') == part_id), None)
            names.append(part.get('title') or part_id if part else f'{part_id} (no such part)')
    return ' › '.join(names)


def readable(text):
    """Their words with each link written out as where it goes."""
    return LINK.sub(lambda m: f'[{m.group(1).strip()} → {resolve(m.group(2))}]', str(text or ''))


def report_check(errors, warnings):
    for w in warnings:
        print(f'  warning: {w}')
    for e in errors:
        print(f'  ERROR: {e}')
    return not errors


def picture_source(rel, base, pack):
    """Where a picture path in a deck file points: beside the deck file first, then already in the pack.
    Says which, and gives None if it's in neither."""
    if base is not None and (base / rel).exists():
        return base / rel, False
    if rel.startswith('img/') and pack and DATA and (DATA / 'packs' / pack / rel).exists():
        return DATA / 'packs' / pack / rel, True
    return None, False


def shrink_image(source, target, long_side=IMAGE_LONG_SIDE, quality=IMAGE_QUALITY, must=True):
    """Shrinks a picture to at most long_side, as a JPEG. Returns the file made. Without Pillow it copies
    the picture as it is, or gives None if a copy wouldn't be worth having (must=False)."""
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image
    except ImportError:
        if not must:
            return None
        out = target.with_suffix(pathlib.Path(source).suffix)
        shutil.copyfile(source, out)
        print('  warning: Pillow is not installed, so the picture went up full size.')
        return out
    with Image.open(source) as im:
        if im.format == 'JPEG' and max(im.size) <= long_side:
            im.close()
            shutil.copyfile(source, target)  # small enough already, and a second squeeze only loses detail
            return target
        im = im.convert('RGB')
        im.thumbnail((long_side, long_side))
        im.save(target, 'JPEG', quality=quality, optimize=True)
    return target


def probe(path):
    """What ffprobe says about a film: its codec, size and length. None without ffprobe, or if it can't tell."""
    ff = shutil.which('ffprobe')
    if not ff:
        return None
    r = subprocess.run([ff, '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', str(path)], capture_output=True, text=True, encoding='utf-8', errors='replace')
    try:
        info = json.loads(r.stdout)
    except ValueError:
        return None
    video = next((x for x in info.get('streams', []) if x.get('codec_type') == 'video'), None)
    if not video:
        return None
    try:
        length = float(info.get('format', {}).get('duration') or 0)
    except ValueError:
        length = 0
    return {'codec': video.get('codec_name'), 'width': video.get('width'), 'height': video.get('height'), 'duration': length}


def make_film(source, target):
    """Copies a film in, or turns it into a small muted H.264 mp4 the phone plays, under VIDEO_LIMIT. Returns the file."""
    target.parent.mkdir(parents=True, exist_ok=True)
    source = pathlib.Path(source)
    info = probe(source)
    as_is = source.suffix.lower() in VIDEO_AS_IS and source.stat().st_size <= VIDEO_LIMIT and (info is None or info['codec'] == 'h264')
    ffmpeg = shutil.which('ffmpeg')
    if as_is or not ffmpeg:
        shutil.copyfile(source, target)
        if not ffmpeg and source.stat().st_size > VIDEO_LIMIT:
            print(f'  warning: {source.name} is {source.stat().st_size / 1e6:.1f} MB, over {VIDEO_LIMIT / 1e6:.0f} MB, and ffmpeg is not here to shrink it. It went up as it is.')
        return target
    for long_side, quality in VIDEO_TRIES:
        fit = f"scale='min({long_side},iw)':'min({long_side},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2"
        r = subprocess.run([ffmpeg, '-y', '-v', 'error', '-i', str(source), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', str(quality),
                            '-pix_fmt', 'yuv420p', '-vf', fit, '-movflags', '+faststart', str(target)], capture_output=True, text=True, encoding='utf-8', errors='replace')
        if r.returncode:
            die(f'ffmpeg could not turn {source.name} into an mp4:\n{r.stderr.strip()[:600]}')
        if target.stat().st_size <= VIDEO_LIMIT:
            break
    if target.stat().st_size > VIDEO_LIMIT:
        print(f'  warning: {source.name} is still {target.stat().st_size / 1e6:.1f} MB at its smallest. A shorter film would load faster on a phone.')
    return target


def make_poster(film, target):
    """A still from early in the film, for tiles and for before it plays. None without ffmpeg."""
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        return None
    target.parent.mkdir(parents=True, exist_ok=True)
    info = probe(film) or {}
    for at in (min(0.5, (info.get('duration') or 0) / 3), 0):
        r = subprocess.run([ffmpeg, '-y', '-v', 'error', '-ss', f'{at:.2f}', '-i', str(film), '-frames:v', '1', '-q:v', '3', str(target)], capture_output=True)
        if not r.returncode and target.exists() and target.stat().st_size:
            return target
    return None


def bring_images(cards, base, pack, deck_id):
    """Shrinks pictures for bus data and copies them in, keeps or makes a board's thumbnails, and brings
    films in small with a poster frame each. Returns the files made."""
    made = []
    pictures, thumbs, films = {}, {}, {}
    folder = DATA / 'packs' / pack / 'img'

    def free_name(stem, source, taken):
        stem = re.sub(r'[^\w.-]', '-', stem)
        name, n = stem, 2
        while taken.get(name, source) != source:
            name, n = f'{stem}-{n}', n + 1
        taken[name] = source
        return name

    def bring(rel):
        source, in_pack = picture_source(rel, base, pack)
        if in_pack:
            return rel
        out = shrink_image(source, folder / f'{free_name(f"{deck_id}-{source.stem}", source, pictures)}.jpg')
        made.append(out)
        return f'img/{out.name}'

    def thumb_of(item):
        """Its own thumbnail if it was given one, shrunk and kept. Otherwise one made from the whole picture."""
        given = item.get('thumb')
        if given:
            source, in_pack = picture_source(given, base, pack)
            if in_pack:
                return given
            stem = f'{deck_id}-{source.stem}'
        else:
            source = DATA / 'packs' / pack / item['image']
            stem = source.stem
        out = shrink_image(source, folder / 'thumb' / f'{free_name(stem, source, thumbs)}.jpg', THUMB_LONG_SIDE, THUMB_QUALITY, must=bool(given))
        if out is None:
            print('  warning: Pillow is not installed, so this board has no thumbnails, and will be slow to load.')
            return None
        made.append(out)
        return f'img/thumb/{out.name}'

    def bring_film(entry):
        """A film and its poster: one given is kept like a picture, and with none, one is made from the film."""
        f = dict(film_of(entry))
        source, in_pack = picture_source(f['src'], base, pack)
        if not in_pack:
            out = make_film(source, folder / f'{free_name(f"{deck_id}-{source.stem}", source, films)}.mp4')
            made.append(out)
            f['src'] = f'img/{out.name}'
        if f.get('poster'):
            f['poster'] = bring(f['poster'])
        elif not in_pack:
            poster = make_poster(DATA / 'packs' / pack / f['src'], folder / 'poster' / f'{pathlib.Path(f["src"]).stem}.jpg')
            if poster:
                made.append(poster)
                f['poster'] = f'img/poster/{poster.name}'
            else:
                print(f'  warning: no poster for {f["src"]}, since ffmpeg is not here. The phone shows its first frame instead.')
        return f

    for c in cards:
        if c.get('images'):
            c['images'] = [bring(i) for i in c['images']]
        if c.get('videos'):
            c['videos'] = [bring_film(v) for v in c['videos']]
        for pt in c.get('parts') or []:
            if pt.get('images'):
                pt['images'] = [bring(i) for i in pt['images']]
            if pt.get('videos'):
                pt['videos'] = [bring_film(v) for v in pt['videos']]
        for o in c.get('options') or []:
            if o.get('image'):
                o['image'] = bring(o['image'])
        items = c.get('items') or []
        for it in items:
            if it.get('video'):
                f = bring_film(it['video'])
                it['video'] = f['src']
                if not it.get('image') and f.get('poster'):
                    it['image'] = f['poster']  # its poster is the picture a board shows and the pen draws on
            if it.get('image'):
                it['image'] = bring(it['image'])
                thumb = thumb_of(it)
                if thumb:
                    it['thumb'] = thumb
        if items:
            size = lambda key: sum((DATA / 'packs' / pack / it[key]).stat().st_size for it in items if it.get(key))
            n_films = sum(1 for it in items if it.get('video'))
            print(f'  {c.get("id")}: {len(items)} pictures{f", {n_films} of them films" if n_films else ""}, {size("thumb") / 1e6:.1f} MB of thumbnails up front, and {(size("image") + size("video")) / len(items) / 1e6:.2f} MB for each one looked at')
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
    made = bring_images(d['cards'], file.parent, pack, deck_id)
    target = DATA / 'packs' / pack / 'decks' / f'{deck_id}.json'
    # The deck's date, for the phone's Newest order: now if its cards changed, or as it was if not.
    before = load_json(target) if target.exists() else None
    if not d.get('updated'):
        d['updated'] = before.get('updated') if before and before.get('updated') and before.get('cards') == d['cards'] else now()
    if made or file.resolve() != target.resolve() or (before or {}).get('updated') != d['updated']:
        save_json(target, d)
    if publish(f'Deck in {pack}: {d["title"]} ({len(d["cards"])} cards)', target, *made) and not a.quiet:
        notice(pack, deck_id, 'deck')


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
    made = bring_images(new, file.parent, pack, 'misc')
    deck['cards'].extend(new)
    save_json(target, deck)
    if publish(f'Misc in {pack}: {len(new)} more', target, *made) and not a.quiet:
        notice(pack, 'misc', 'misc', cards=[c['id'] for c in new])


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
        return decks.setdefault((e.get('pack'), e.get('deck')), {'answers': {}, 'drafts': {}, 'parts': {}, 'notes': None, 'verdict': None, 'earlier': [], 'resets': [], 'topic': e.get('topic')})
    for e in events:
        t = e.get('type')
        if t == 'answer' and e.get('eid') not in undone:
            d = deck(e)
            d['answers'][e['card']] = e
            d['drafts'].pop(e['card'], None)
        elif t == 'part':
            deck(e)['parts'].setdefault(e.get('card'), {})[e.get('part')] = e
        elif t == 'draft' and e.get('thought'):
            thought_drafts[e.get('pack')] = e
        elif t == 'draft':
            d = deck(e)
            if e.get('text') or e.get('images') or e.get('selected'):
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
            d['earlier'].extend(p for parts in d['parts'].values() for p in parts.values() if p.get('comment'))
            d['answers'] = {}
            d['parts'] = {card: {pid: {**p, 'mark': None} for pid, p in parts.items() if p.get('comment') or p.get('images')} for card, parts in d['parts'].items()}
            d['verdict'] = None
            d['resets'].append(e)
        elif t == 'thought':
            thoughts.setdefault(e.get('pack'), []).append(e)
            thought_drafts.pop(e.get('pack'), None)
        elif t == 'archive':
            ARCHIVES[(e.get('pack'), e.get('deck'))] = e
            deck(e)['archive'] = e
    return decks, thoughts, thought_drafts


ARCHIVES = {}  # the latest archive or bring-back from the phone, per deck, filled in by summarise


def card_in(pack, deck_id, card_id):
    f = DATA / 'packs' / pack / 'decks' / f'{deck_id}.json'
    if not f.exists():
        return None
    return next((c for c in load_json(f).get('cards', []) if c.get('id') == card_id), None)


def word_for(answer, card):
    table = HANDLED_WORDS if answer.get('handledAt') or (card and card.get('handled')) else WORDS.get(answer.get('kind', 'question'), WORDS['question'])
    return table.get(answer.get('swipe'), answer.get('swipe'))


def pictures(event):
    """Where an event's pictures are, in the clone. One still uploading isn't there yet. A drawing says what it's over."""
    drawn = event.get('drawings') or {}
    out = []
    for p in event.get('images') or []:
        line = p + ('' if (DATA / p).exists() else ' (still uploading)')
        if p in drawn:
            line += f' (their drawing over {drawn[p] or "a picture"})'
        out.append(line)
    return ', '.join(out)


def names_of(card, ids):
    labels = {o['id']: o.get('label', o['id']) for o in [*((card or {}).get('options') or []), *((card or {}).get('items') or [])]}
    return ', '.join(labels.get(i, i) for i in ids)


def part_word(e):
    table = WORDS.get(e.get('kind', 'question'), WORDS['question'])
    return table.get(e.get('mark'), '') if e.get('mark') else ''


def part_line(e, card):
    title = e.get('partTitle') or next((p.get('title') for p in (card or {}).get('parts') or [] if p.get('id') == e.get('part')), '') or e.get('part')
    said = part_word(e) or 'no mark'
    line = f'      part {e.get("part")} ({title}): {said}'
    if e.get('comment'):
        line += f', "{readable(e["comment"])}"'
    if e.get('images'):
        line += f'\n          pictures: {pictures(e)}'
    return line


def answer_line(a, card):
    title = a.get('title') or (card or {}).get('title') or a['card']
    parts = [word_for(a, card)]
    if a.get('selected') is not None:
        chosen = names_of(card, a['selected'])
        parts.append(f'picked: {chosen}' if chosen else 'none of them')
        if a.get('byPick'):
            parts.append('(your pick, nothing tapped)')
    if a.get('handledAt'):
        parts.append('on your handled conclusion')
    line = f'  {a["card"]} ({title}): ' + ', '.join(str(p) for p in parts)
    if a.get('comment'):
        line += f'\n      "{readable(a["comment"])}"'
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
                card = card_in(pack, deck_id, card_id)
                if card_id in d['answers']:
                    print(answer_line(d['answers'][card_id], card))
                elif card_id in d['drafts']:
                    dr = d['drafts'][card_id]
                    if dr.get('text'):
                        print(f'  {card_id}: still writing: "{readable(dr["text"])}"')
                    if dr.get('selected'):
                        print(f'  {card_id}: still choosing: {names_of(card, dr["selected"])}')
                    if dr.get('images'):
                        print(f'      pictures: {pictures(dr)}')
                parts_here = [p for p in d['parts'].get(card_id, {}).values() if p in shown]
                if parts_here:
                    if card_id not in d['answers'] and card_id not in d['drafts']:
                        print(f'  {card_id} ({(card or {}).get("title") or parts_here[0].get("title") or card_id}): not swiped yet. On its parts:')
                    order = [p.get('id') for p in (card or {}).get('parts') or []]
                    for p in sorted(parts_here, key=lambda e: order.index(e.get('part')) if e.get('part') in order else 99):
                        print(part_line(p, card))
            if d['notes'] and d['notes'] in shown:
                print(f'  Deck notes: "{readable(d["notes"].get("text", ""))}"')
                if d['notes'].get('images'):
                    print(f'      pictures: {pictures(d["notes"])}')
            for r in d['resets']:
                if r in shown:
                    print(f'  They started this deck over ({"kept" if r.get("keptNotes") else "cleared"} notes and comments).')
            for old in d['earlier']:
                if old in shown:
                    on = f'{old["card"]}, part {old["part"]}' if old.get('type') == 'part' else old['card']
                    print(f'  Said before starting over, on {on}: "{readable(old["comment"])}"')
            if d['verdict'] and d['verdict'] in shown:
                v = d['verdict']
                print(f'  DECK: {"done" if v.get("verdict") == "done" else "REPLAN FROM THE BASE"} ({v.get("answered")} of {v.get("total")} answered)')
            if d.get('archive') and d['archive'] in shown:
                print(f'  They {"archived this deck" if d["archive"].get("archived") else "brought this deck back from the archive"}.')
        for pack, items in sorted(thoughts.items(), key=lambda kv: str(kv[0])):
            new = [t for t in items if t in shown]
            if new:
                print(f'\n{pack}: thoughts')
                for t in new:
                    print(f'  {t["id"]}: "{readable(t["text"])}"')
                    if t.get('images'):
                        print(f'      pictures: {pictures(t)}')
        for pack in sorted({e.get('pack') for e in shown if e.get('pack')} | ({pack_filter} if pack_filter else set(packs()))):
            if pack not in packs():
                continue
            seen = state.get('packs', {}).get(pack, {}).get('mine', {})
            changed = [m for m in mine_decks(pack) if str(m.get('updated', '')) > str(seen.get(m.get('id'), ''))]
            if changed:
                print(f'\n{pack}: their own decks, changed since you last read them')
                replies = mine_replies(pack)
                for m in changed:
                    for line in mine_lines(pack, m, replies, since=str(seen.get(m.get('id'), ''))):
                        print(line)
        for pack, t in thought_drafts.items():
            if t in shown and t.get('text'):
                print(f'\n{pack}: a thought still being written: "{readable(t["text"])}"')
    if a.mark_read:
        for pack in sorted({e.get('pack') for e in shown if e.get('pack')}):
            entry = state.setdefault('packs', {}).setdefault(pack, {'files': []})
            entry['files'] = sorted(set(entry['files']) | {e['_file'] for e in shown if e.get('pack') == pack})
            entry['at'] = now()
        for pack in ([pack_filter] if pack_filter else packs()):
            if pack in packs() and mine_decks(pack):
                entry = state.setdefault('packs', {}).setdefault(pack, {'files': []})
                entry.setdefault('mine', {}).update({m['id']: m.get('updated', '') for m in mine_decks(pack) if m.get('id')})
        save_json(DATA / 'read.json', state)
        publish('Answers read', DATA / 'read.json')


def cmd_redeal(a):
    """What needs a second look: handled cards answered, and cards sent back."""
    sync()
    decks, _, _ = summarise(read_events())
    pack_filter = pack_from(a)
    groups = {'Handled, and they answered': [], 'Handled, no answer yet': [], 'Sent to workshop': [], 'Need more context': [], 'Comment only, to read': [], 'Parts with a problem or a question': [], 'Deck sent back to replan': []}
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
                for p in d.get('parts', {}).get(c['id'], {}).values():
                    if p.get('mark') in ('left', 'down') and p.get('cardVersion', 1) >= c.get('version', 1):
                        groups['Parts with a problem or a question'].append(f'{ref} part {p.get("part")}: {part_word(p)}' + (f', "{p["comment"]}"' if p.get('comment') else ''))
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
    return publish(message, path)


def cmd_handled(a):
    if not a.undo and not a.how:
        die('Say how it was settled, with --how, in one or two plain sentences.')

    def change(card):
        if a.undo:
            card.pop('handled', None)
        else:
            card['handled'] = {'how': a.how, 'at': now()}
    if edit_card(a.pack_id, a.deck, a.card, change, f'{"Unmarked" if a.undo else "Handled"}: {a.pack_id}/{a.deck}/{a.card}') and not a.undo and not a.quiet:
        notice(a.pack_id, a.deck, 'handled', cards=[a.card])


def cmd_second_try(a):
    """Deals a card back: a new version, with whatever you changed. It counts as unanswered again."""
    def change(card):
        card['version'] = card.get('version', 1) + 1
        if a.file:
            for k, v in load_json(a.file).items():
                if k == 'id':
                    continue
                if v is None:
                    card.pop(k, None)  # null means take it off the card
                else:
                    card[k] = v
        for field in ('text', 'why', 'pick', 'details'):
            value = getattr(a, field)
            if value is not None:
                card[field] = value
    if edit_card(a.pack_id, a.deck, a.card, change, f'Second try: {a.pack_id}/{a.deck}/{a.card}') and not a.quiet:
        notice(a.pack_id, a.deck, 'second-try', cards=[a.card])


# ---------- the order decks are answered in, tags, and archiving

def order_path(pack):
    return DATA / 'packs' / pack / 'order.json'


def load_order(pack):
    p = order_path(pack)
    o = load_json(p) if p.exists() else {}
    o.setdefault('decks', {})
    return o


def deck_meta(pack, deck_id, deck=None, order=None):
    """What stands for a deck: order.json first, then the deck's own file."""
    deck = deck if deck is not None else (decks_of(pack).get(deck_id) or {})
    o = (order if order is not None else load_order(pack))['decks'].get(deck_id, {})
    pick = lambda k: o[k] if k in o else deck.get(k)
    return {'priority': pick('priority'), 'tags': pick('tags') or [], 'kind': pick('kind') or deck_kind(deck), 'archived': pick('archived')}


def archived_now(pack, deck_id, meta=None, events=None):
    """Archived by the writer or by them on the phone, whichever was said last."""
    meta = meta or deck_meta(pack, deck_id)
    theirs = (events or {}).get((pack, deck_id))
    if theirs and (not meta['archived'] or str(theirs.get('at', '')) > str(meta['archived'])):
        return bool(theirs.get('archived'))
    return bool(meta['archived'])


def need_deck(pack, deck_id):
    need_pack(pack)
    if not (DATA / 'packs' / pack / 'decks' / f'{deck_id}.json').exists():
        die(f'No deck {deck_id} in {pack}. Decks: {", ".join(decks_of(pack))}')


def cmd_order(a):
    """The writer's say on a deck: where it comes in Suggested order, its tags, its kind."""
    sync()
    need_deck(a.pack_id, a.deck)
    o = load_order(a.pack_id)
    entry = o['decks'].setdefault(a.deck, {})
    if a.no_priority:
        entry.pop('priority', None)
    elif a.priority is not None:
        if a.priority < 1:
            die('priority is a whole number from 1, where 1 is answered first')
        entry['priority'] = a.priority
    tags = list(entry.get('tags') or [])
    for t in a.tag or []:
        if t not in tags:
            tags.append(t)
    tags = [t for t in tags if t not in (a.untag or [])]
    if tags:
        entry['tags'] = tags
    else:
        entry.pop('tags', None)
    if a.kind:
        entry['kind'] = a.kind
    if not entry:
        o['decks'].pop(a.deck, None)
    save_json(order_path(a.pack_id), o)
    m = deck_meta(a.pack_id, a.deck, order=o)
    said = ', '.join(x for x in [f'priority {m["priority"]}' if m['priority'] else 'no priority', ', '.join(TAG_WORDS.get(t, t) for t in m['tags']), m['kind']] if x)
    publish(f'Order in {a.pack_id}: {a.deck} ({said})', order_path(a.pack_id))
    print(f'  {a.deck}: {said}')


def cmd_archive(a):
    """Moves a deck to Archived, at the end of the pack's page, or back. Nothing is deleted."""
    sync()
    need_deck(a.pack_id, a.deck)
    o = load_order(a.pack_id)
    entry = o['decks'].setdefault(a.deck, {})
    if a.undo:
        entry.pop('archived', None)
    else:
        entry['archived'] = now()
    if not entry:
        o['decks'].pop(a.deck, None)
    save_json(order_path(a.pack_id), o)
    publish(f'{"Unarchived" if a.undo else "Archived"} in {a.pack_id}: {a.deck}', order_path(a.pack_id))


# ---------- their own decks

def mine_decks(pack):
    folder = DATA / 'packs' / pack / 'mine'
    out = []
    for f in sorted(folder.glob('*.json')) if folder.exists() else []:
        try:
            out.append(json.loads(f.read_text(encoding='utf-8')))
        except ValueError:
            print(f'  warning: could not read {f.name}')
    return sorted(out, key=lambda d: str(d.get('updated', '')), reverse=True)


def mine_replies(pack):
    p = DATA / 'packs' / pack / 'mine-replies.json'
    return load_json(p) if p.exists() else {}


def mine_lines(pack, deck, replies, everything=False, since=None):
    """Their deck as lines to read: each card, its words, links written out, pictures with their paths."""
    topic = next((t.get('title') for t in load_json(DATA / 'packs' / pack / 'pack.json').get('topics', []) if t.get('id') == deck.get('topic')), None) if deck.get('topic') else None
    cards = [c for c in deck.get('cards', []) if everything or not c.get('removed')]
    head = f'  {deck.get("id")}: "{deck.get("title") or "Untitled"}"' + (f', topic {topic}' if topic else '') + f', {plural(len([c for c in cards if not c.get("removed")]), "card")}, changed {deck.get("updated", "")[:16].replace("T", " ")}'
    lines = [head + (' [removed]' if deck.get('removed') else '')]
    if replies.get(deck.get('id')):
        lines.append(f'      your reply on the deck: "{replies[deck["id"]]["how"]}"')
    for n, c in enumerate(cards, 1):
        new = ' (new)' if since is not None and str(c.get('updated', '')) > since else ''
        kind = MINE_KIND_WORDS.get(c.get('kind'), c.get('kind'))
        bits = []
        if c.get('url'):
            bits.append(c['url'])
        if c.get('address'):
            bits.append(f'[{c.get("label") or "a card"} → {resolve(c["address"])}]')
        if c.get('text'):
            bits.append(f'"{readable(c["text"])}"')
        lines.append(f'    {n}. {c.get("id")}: {kind}{" [removed]" if c.get("removed") else ""}{new}: ' + (' '.join(bits) or '(nothing written)'))
        if c.get('images'):
            lines.append(f'         pictures: {pictures(c)}')
        reply = replies.get(f'{deck.get("id")}/{c.get("id")}')
        if reply:
            lines.append(f'         your reply: "{reply["how"]}"')
    return lines


def cmd_mine(a):
    """Their own decks: feedback, requests and references they made themselves, in a pack."""
    sync()
    state = read_state()
    only = None if a.every_pack else pack_from(a)
    any_shown = False
    for pack in packs():
        if only and pack != only:
            continue
        seen = state.get('packs', {}).get(pack, {}).get('mine', {})
        decks = [d for d in mine_decks(pack) if a.all or not d.get('removed')]
        if not a.all:
            decks = [d for d in decks if str(d.get('updated', '')) > str(seen.get(d.get('id'), ''))] if not a.every else decks
        if not decks:
            continue
        any_shown = True
        print(f'\n{pack}: their own decks')
        replies = mine_replies(pack)
        for d in decks:
            for line in mine_lines(pack, d, replies, a.all, None if a.every or a.all else str(seen.get(d.get('id'), ''))):
                print(line)
        if a.mark_read:
            entry = state.setdefault('packs', {}).setdefault(pack, {'files': []})
            entry.setdefault('mine', {}).update({d['id']: d.get('updated', '') for d in decks if d.get('id')})
    if not any_shown:
        print('Nothing new in their own decks.' if not (a.all or a.every) else 'They have made no decks of their own.')
    if a.mark_read and any_shown:
        save_json(DATA / 'read.json', state)
        publish('Their own decks read', DATA / 'read.json')


def cmd_reply(a):
    """Answers one of their own decks, or one card in it. The phone shows it on the card, like a handled one."""
    sync()
    need_pack(a.pack_id)
    deck = next((d for d in mine_decks(a.pack_id) if d.get('id') == a.deck), None)
    if not deck:
        die(f'No deck of theirs called {a.deck} in {a.pack_id}. Theirs: {", ".join(d.get("id", "") for d in mine_decks(a.pack_id)) or "none"}')
    if a.card and not any(c.get('id') == a.card for c in deck.get('cards', [])):
        die(f'No card {a.card} in their deck {a.deck}.')
    if not a.undo and not a.how:
        die('Say what you did about it, with --how, in one or two plain sentences.')
    path = DATA / 'packs' / a.pack_id / 'mine-replies.json'
    replies = mine_replies(a.pack_id)
    key = f'{a.deck}/{a.card}' if a.card else a.deck
    if a.undo:
        replies.pop(key, None)
    else:
        replies[key] = {'how': a.how, 'at': now()}
    save_json(path, replies)
    publish(f'Reply on their deck in {a.pack_id}: {key}', path)


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
               for pack in packs() for deck_id, deck in decks_of(pack).items() if not archived_now(pack, deck_id, deck_meta(pack, deck_id, deck), ARCHIVES))


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
        order = load_order(pack)
        for deck_id, deck in decks_of(pack).items():
            d = decks.get((pack, deck_id), {'answers': {}, 'verdict': None})
            cards = deck.get('cards', [])
            owed = [c for c in cards if not c.get('handled') and not (d['answers'].get(c['id']) and d['answers'][c['id']].get('cardVersion', 1) >= c.get('version', 1))]
            handled = sum(1 for c in cards if c.get('handled'))
            verdict = f', {d["verdict"]["verdict"]}' if d['verdict'] else ''
            m = deck_meta(pack, deck_id, deck, order)
            said = [m['kind']]
            if m['priority']:
                said.append(f'priority {m["priority"]}')
            said += [TAG_WORDS.get(t, t) for t in m['tags']]
            if archived_now(pack, deck_id, m, ARCHIVES):
                said.append('ARCHIVED')
            print(f'  {deck.get("topic") or "misc"} / {deck_id}: {len(owed)} of {len(cards) - handled} owed' + (f', {handled} handled' if handled else '') + verdict + f' ({", ".join(said)})')
        if thoughts.get(pack):
            print(f'  {len(thoughts[pack])} thoughts')
        mine = [x for x in mine_decks(pack) if not x.get('removed')]
        if mine:
            print(f'  {plural(len(mine), "deck")} of their own: riffle mine --pack {pack} --every')


def send_notification(title, body, badge=None, tag='riffle', url=''):
    OWN_FILES.mkdir(parents=True, exist_ok=True)
    try:  # what was sent, newest last, so it can be checked later
        old = NOTIFY_LOG.read_text(encoding='utf-8').splitlines()[-49:] if NOTIFY_LOG.exists() else []
        NOTIFY_LOG.write_text('\n'.join([*old, json.dumps({'at': now(), 'title': title, 'body': body, 'badge': badge, 'tag': tag, 'url': url}, ensure_ascii=False)]) + '\n', encoding='utf-8')
    except OSError:
        pass
    if not shutil.which('node'):
        print('Node is not installed here, so no notification was sent.')
        return
    args = ['node', str(HERE / 'notify.mjs'), str(DATA), '--title', title, '--body', body or '', '--tag', tag]
    if badge is not None:
        args += ['--badge', str(badge)]
    if url:
        args += ['--url', url]
    subprocess.run(args)


# ---------- notifications that say where they're from

def notify_gap():
    try:
        return float(os.environ.get('RIFFLE_NOTIFY_GAP', NOTIFY_GAP))
    except ValueError:
        return NOTIFY_GAP


def last_notified():
    try:
        return float(LAST_NOTIFY.read_text())
    except (OSError, ValueError):
        return 0


def deck_kind(deck):
    """A deck is a report, questions, or a board of results, by what it says or what its cards are."""
    if deck.get('kind') in ('report', 'questions', 'board'):
        return deck['kind']
    cards = [c for c in deck.get('cards', []) if not c.get('handled')] or deck.get('cards', [])
    kinds = [c.get('kind', 'question') for c in cards]
    if kinds and all(k == 'report' for k in kinds):
        return 'report'
    if kinds and sum(k == 'board' for k in kinds) * 2 >= len(kinds):
        return 'board'
    return 'questions'


def address_url(*parts):
    """Where a tap on a notification goes: the app, at this pack, deck or card."""
    path = '/'.join(urllib.parse.quote(str(p), safe='') for p in parts if p)
    return f'./#open={urllib.parse.quote(path, safe="")}' if path else './'


def plural(n, word):
    return f'{n} {word}{"" if n == 1 else "s"}'


def about(pack, deck_id, what, cards):
    """One line's worth of what was sent, read from the files as they are now."""
    p = load_json(DATA / 'packs' / pack / 'pack.json') if (DATA / 'packs' / pack / 'pack.json').exists() else {}
    f = DATA / 'packs' / pack / 'decks' / f'{deck_id}.json'
    deck = load_json(f) if f.exists() else {'title': deck_id, 'cards': []}
    topic = next((t for t in p.get('topics', []) if t.get('id') == deck.get('topic')), None)
    where = ' › '.join(x for x in [p.get('title') or pack, (topic or {}).get('title') or ('Misc' if not deck.get('topic') else deck.get('topic'))] if x)
    titles = {c.get('id'): c.get('title') or c.get('id') for c in deck.get('cards', [])}
    owed = sum(1 for c in deck.get('cards', []) if not c.get('handled'))
    return {'pack': pack, 'deck': deck_id, 'what': what, 'cards': list(cards or []), 'where': where, 'packTitle': p.get('title') or pack,
            'title': deck.get('title') or deck_id, 'kind': deck_kind(deck), 'owed': owed, 'cardTitles': [titles.get(c, c) for c in cards or []], 'at': now()}


def item_words(i, whole=False):
    """What a notification says about one thing sent: whole for a notification of its own, short in a list."""
    first = (i.get('cardTitles') or [''])[0]
    if i['what'] == 'misc':
        n = len(i.get('cards') or [])
        return f'{plural(n, "new card")} in Misc: {first}' if whole else f'Misc: {plural(n, "new card")}'
    if i['what'] == 'second-try':
        return f'Second try on "{first}", in {i["title"]}' if whole else f'Second try: {first}'
    if i['what'] == 'handled':
        return f'My conclusion on "{first}", in {i["title"]}' if whole else f'Handled: {first}'
    return f'{i["title"]}: {i["kind"]}, {plural(i["owed"], "card")}' if whole else f'{i["title"]} ({i["owed"]})'


def notice_words(items):
    """The title, body and address of one notification naming everything in it."""
    if len(items) == 1:
        i = items[0]
        card = i['cards'][0] if i['what'] in ('second-try', 'handled') and i.get('cards') else None
        return i['where'], item_words(i, whole=True), address_url(i['pack'], i['deck'], card)
    packs_in = {i['pack'] for i in items}
    wheres = {i['where'] for i in items}
    title = wheres.pop() if len(wheres) == 1 else items[0]['packTitle'] if len(packs_in) == 1 else 'Riffle'
    decks = all(i['what'] == 'deck' for i in items)
    lead = f'{len(items)} new decks' if decks else f'{len(items)} new things'
    shown, room = [], 150
    for i in items:
        w = item_words(i)
        if shown and len(', '.join([*shown, w])) > room:
            break
        shown.append(w)
    more = len(items) - len(shown)
    body = f'{lead}: {", ".join(shown)}' + (f', +{more} more' if more else '')
    return title, body, address_url(items[0]['pack']) if len(packs_in) == 1 else './'


def read_pending():
    try:
        items = json.loads(NOTIFY_PENDING.read_text(encoding='utf-8'))
        return items if isinstance(items, list) else []
    except (OSError, ValueError):
        return []


def notice(pack, deck_id, what='deck', cards=None):
    """Tells the phone what was just sent. At most one notification every NOTIFY_GAP: anything sent sooner
    waits, and the next one names it too. A small process stays behind to send that one when the gap ends,
    and the next send flushes it if that process didn't get to, so nothing lands silently."""
    OWN_FILES.mkdir(parents=True, exist_ok=True)
    item = about(pack, deck_id, what, cards)
    items = [i for i in read_pending() if not (i.get('pack') == pack and i.get('deck') == deck_id and i.get('what') == what and (i.get('cards') == item['cards'] or what == 'deck'))]
    items.append(item)
    NOTIFY_PENDING.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding='utf-8')
    since = time.time() - last_notified()
    if since >= notify_gap():
        flush_notices()
        return
    wait = notify_gap() - since
    print(f'No notification yet: one went out {int(since / 60)} minutes ago. This joins the next one, in about {max(1, round(wait / 60))} minute{"" if round(wait / 60) <= 1 else "s"}, which names everything sent till then.')
    start_waiter(wait)


def flush_notices(only_if_due=False):
    """Sends one notification naming everything waiting, if anything is."""
    if not NOTIFY_PENDING.exists() or (only_if_due and time.time() - last_notified() < notify_gap()):
        return False
    taking = OWN_FILES / f'notify-sending-{os.getpid()}.json'
    try:  # only one of the waiting process and a later command gets the list, so nothing goes twice
        os.replace(NOTIFY_PENDING, taking)
    except OSError:
        return False
    try:
        items = json.loads(taking.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        items = []
    taking.unlink(missing_ok=True)
    if not isinstance(items, list) or not items:
        return False
    LAST_NOTIFY.write_text(str(time.time()))
    title, body, url = notice_words(items)
    send_notification(title, body, owed_cards(summarise(read_events())[0]), 'new-deck', url)
    return True


def start_waiter(wait):
    """A small process that sends the waiting notification once the gap is over. One at a time."""
    try:
        if NOTIFY_WAITER.exists() and float(NOTIFY_WAITER.read_text()) > time.time() - 120:
            return
    except (OSError, ValueError):
        pass
    if os.environ.get('RIFFLE_NO_WAITER'):
        return
    NOTIFY_WAITER.write_text(str(time.time() + wait))
    args = [sys.executable, str(pathlib.Path(__file__).resolve()), 'notify-flush', '--wait', str(int(wait) + 2)]
    env = {**os.environ, 'RIFFLE_DATA': str(DATA)}
    quiet = {'stdin': subprocess.DEVNULL, 'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL, 'close_fds': True, 'env': env, 'cwd': str(OWN_FILES)}
    try:
        if os.name == 'nt':
            detached, group, no_window, breakaway = 0x00000008, 0x00000200, 0x08000000, 0x01000000
            try:
                subprocess.Popen(args, creationflags=detached | group | no_window | breakaway, **quiet)
            except OSError:
                subprocess.Popen(args, creationflags=detached | group | no_window, **quiet)
        else:
            subprocess.Popen(args, start_new_session=True, **quiet)
    except OSError as e:
        NOTIFY_WAITER.unlink(missing_ok=True)
        print(f'  warning: could not leave a process to send it later ({e}). The next send will.')


def cmd_notify_flush(a):
    """The process start_waiter leaves behind: waits out the gap, then sends what's waiting."""
    try:
        time.sleep(max(0, a.wait))
        while True:
            left = notify_gap() - (time.time() - last_notified())
            if left <= 1:
                break
            time.sleep(left)
        sync()
        flush_notices()
    finally:
        try:
            if float(NOTIFY_WAITER.read_text()) <= time.time() + 5:
                NOTIFY_WAITER.unlink()
        except (OSError, ValueError):
            pass


def cmd_link(a):
    """The text of a link to a pack, deck, card or part, to put in a card's words."""
    sync()
    address = '/'.join(x for x in (a.pack_id, a.deck, a.card, a.part) if x)
    where = resolve(address)
    if 'no such' in where:
        die(f'Nothing there: {where}')
    label = a.label or where.split(' › ')[-1]
    print(f'[{label}](riffle:{address})')
    print(f'  goes to {where}')


def cmd_notify(a):
    sync()
    badge = a.badge if a.badge is not None else owed_cards(summarise(read_events())[0])
    send_notification(a.title, a.body, badge, a.tag, a.url or '')


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
    s.add_argument('file'); s.add_argument('--pack'); s.add_argument('--quiet', action='store_true', help='no notification')
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
    s.add_argument('--quiet', action='store_true', help='no notification')
    s.set_defaults(fn=cmd_handled)

    s = sub.add_parser('second-try', help='deal a card back as a new version')
    s.add_argument('pack_id'); s.add_argument('deck'); s.add_argument('card'); s.add_argument('--file')
    s.add_argument('--quiet', action='store_true', help='no notification')
    for field in ('text', 'why', 'pick', 'details'):
        s.add_argument(f'--{field}')
    s.set_defaults(fn=cmd_second_try)

    s = sub.add_parser('thought', help='answer one of their thoughts')
    s.add_argument('pack_id'); s.add_argument('thought_id'); s.add_argument('--how', required=True)
    s.set_defaults(fn=cmd_thought)

    s = sub.add_parser('link', help='the text of a link to a deck, card or part, to put in a card')
    s.add_argument('pack_id'); s.add_argument('deck', nargs='?'); s.add_argument('card', nargs='?'); s.add_argument('part', nargs='?'); s.add_argument('--label')
    s.set_defaults(fn=cmd_link)

    s = sub.add_parser('order', help='the writer\'s say on a deck: its place in Suggested order, tags, kind')
    s.add_argument('pack_id'); s.add_argument('deck'); s.add_argument('--priority', type=int, help='1 is answered first')
    s.add_argument('--no-priority', action='store_true'); s.add_argument('--tag', action='append', help=f'like {", ".join(TAG_WORDS)}'); s.add_argument('--untag', action='append')
    s.add_argument('--kind', choices=sorted(DECK_KINDS))
    s.set_defaults(fn=cmd_order)

    s = sub.add_parser('archive', help='move a deck to Archived at the end of the pack, or back with --undo')
    s.add_argument('pack_id'); s.add_argument('deck'); s.add_argument('--undo', action='store_true')
    s.set_defaults(fn=cmd_archive)

    s = sub.add_parser('mine', help='their own decks: ideas, pictures and links they made for you')
    s.add_argument('--pack'); s.add_argument('--every-pack', action='store_true'); s.add_argument('--every', action='store_true', help='every deck, not only changed ones')
    s.add_argument('--all', action='store_true', help='removed ones too'); s.add_argument('--mark-read', action='store_true')
    s.set_defaults(fn=cmd_mine)

    s = sub.add_parser('reply', help='reply on one of their own decks, or a card in it')
    s.add_argument('pack_id'); s.add_argument('deck'); s.add_argument('card', nargs='?'); s.add_argument('--how'); s.add_argument('--undo', action='store_true')
    s.set_defaults(fn=cmd_reply)

    s = sub.add_parser('notify', help='send a notification to the phone by hand')
    s.add_argument('--title', default='Riffle'); s.add_argument('--body', default=''); s.add_argument('--badge', type=int); s.add_argument('--tag', default='riffle')
    s.add_argument('--url', help='where a tap goes, like ./#open=pack/deck/card')
    s.set_defaults(fn=cmd_notify)

    s = sub.add_parser('notify-flush', help=argparse.SUPPRESS)
    s.add_argument('--wait', type=float, default=0)
    s.set_defaults(fn=cmd_notify_flush)

    a = p.parse_args()
    if a.fn is not cmd_fit:  # that one needs no repo
        DATA = data_repo()
    a.fn(a)
    if a.fn not in (cmd_fit, cmd_notify_flush, cmd_check):
        flush_notices(only_if_due=True)  # one left waiting, if the process meant to send it didn't


if __name__ == '__main__':
    main()
