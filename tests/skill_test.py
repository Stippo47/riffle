#!/usr/bin/env python3
"""Runs the writer's commands against a throwaway git repo. It never touches the real data repo, and
sends no real notifications, because the home folder is swapped for an empty one too."""
import getpass
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
RIFFLE = ROOT / 'skill' / 'riffle.py'
work = pathlib.Path(tempfile.mkdtemp(prefix='riffle-skill-'))
bare = work / 'data.git'
clone = work / 'clone'
other = work / 'phone'
home = work / 'home'
home.mkdir()
failed = 0


def ok(cond, what, extra=''):
    global failed
    print(f'  {"ok  " if cond else "FAIL"} {what}{"" if cond else " " + str(extra)[:600]}')
    failed += 0 if cond else 1


def git(where, *args):
    return subprocess.run(['git', *args], cwd=where, capture_output=True, text=True, check=True)


def run(*args, cwd=None):
    env = {**os.environ, 'RIFFLE_DATA': str(clone), 'HOME': str(home), 'USERPROFILE': str(home), 'PYTHONIOENCODING': 'utf-8', 'RIFFLE_NOTIFY_GAP': str(GAP)}
    r = subprocess.run([sys.executable, str(RIFFLE), *args], cwd=cwd or work, capture_output=True, text=True, encoding='utf-8', env=env)
    return r.returncode, r.stdout + r.stderr


GAP = 4  # seconds between notifications here, instead of ten minutes


def sent_notices():
    log = home / '.riffle' / 'notify-log.jsonl'
    return [json.loads(l) for l in log.read_text(encoding='utf-8').splitlines() if l.strip()] if log.exists() else []


def wait_for_notices(n, most=20):
    for _ in range(most * 4):
        if len(sent_notices()) >= n:
            return True
        time.sleep(0.25)
    return False


def write(name, value):
    p = work / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(value if isinstance(value, str) else json.dumps(value), encoding='utf-8')
    return p


def good_card(id='a', **more):
    return {'id': id, 'kind': 'question', 'title': 'A title', 'text': 'Should this happen?', 'why': 'It changes what the player sees.', 'pick': 'Yes.', **more}


def deck(*cards, **more):
    return {'title': 'A deck', 'topic': 'first', 'order': 1, 'cards': list(cards), **more}


subprocess.run(['git', 'init', '-q', '--bare', '-b', 'main', str(bare)], check=True)
subprocess.run(['git', 'clone', '-q', str(bare), str(other)], capture_output=True, check=True)
for c in (other,):
    git(c, 'config', 'user.name', 'Test')
    git(c, 'config', 'user.email', 'test@example.invalid')
(other / 'README.md').write_text('test\n')
git(other, 'add', '-A')
git(other, 'commit', '-q', '-m', 'start')
git(other, 'push', '-q', 'origin', 'HEAD:main')
subprocess.run(['git', 'clone', '-q', str(bare), str(clone)], capture_output=True, check=True)
git(clone, 'config', 'user.name', 'Test')
git(clone, 'config', 'user.email', 'test@example.invalid')

print('Checks')
code, out = run('check', str(write('d/good.json', deck(good_card()))))
ok(code == 0 and 'fine' in out, 'a good deck passes', out)
code, out = run('check', str(write('d/nopick.json', deck(good_card(pick=None)))))
ok(code == 1 and 'needs your pick' in out, 'a question with no pick is refused', out)
code, out = run('check', str(write('d/dir.json', deck(good_card(why='Swipe right if you like it.')))))
ok(code == 1 and 'names a swipe direction' in out, 'naming a direction is refused', out)
code, out = run('check', str(write('d/dir2.json', deck(good_card(details='Hold right on this card.')))))
ok(code == 1 and 'details names a swipe direction' in out, 'on the back of the card too', out)
code, out = run('check', str(write('d/fine.json', deck(good_card(why='Rivers run down to the left bank.')))))
ok(code == 0, 'ordinary uses of left and right are fine', out)
code, out = run('check', str(write('d/dup.json', deck(good_card(), good_card()))))
ok(code == 1 and 'used twice' in out, 'a repeated id is refused', out)
code, out = run('check', str(write('d/long.json', deck(good_card(why='word ' * 90)))))
ok(code == 0 and 'over 300' in out, 'a long description gets a warning', out)
code, out = run('check', str(write('d/toolong.json', deck(good_card(why='word ' * 400)))))
ok(code == 0 and "won't fit a small iPhone" in out, "one that won't fit says so, as a warning", out)
four = [{'id': i, 'label': 'A label that runs a good way', 'text': 'And some words about this option that run on a bit further than most'} for i in 'abcd']
code, out = run('check', str(write('d/optfit.json', deck({'id': 'o', 'kind': 'options', 'title': 'Options', 'text': 'Which of these would you keep, out of all four?', 'why': 'word ' * 50, 'pick': 'a', 'options': four}))))
ok(code == 0 and ('smallest type' in out or "won't fit" in out), 'a long description with four options is caught too', out)
two = [{'id': i, 'label': 'A label', 'text': 'Words about this option that run on for around eighty characters in all, like so'} for i in 'ab']
code, out = run('check', str(write('d/opttwo.json', deck({'id': 'o', 'kind': 'options', 'title': 'Options', 'text': 'Which?', 'why': 'It matters.', 'pick': 'a', 'options': two}))))
ok(code == 0 and 'warning' not in out, 'long descriptions on two options are fine', out)
code, out = run('fit', str(work / 'd/toolong.json'))
ok(code == 0 and "a: won't fit" in out, 'fit says it card by card', out)
code, out = run('check', str(write('d/typo.json', deck(good_card(rarirty='epic')))))
ok(code == 0 and 'Is it a typo' in out, 'a misspelt field gets a warning', out)
code, out = run('check', str(write('d/code.json', deck(good_card(why='This sets max_water_level higher.')))))
ok(code == 0 and 'looks like it has code' in out, 'code in the wording gets a warning', out)
code, out = run('check', str(write('d/nowhy.json', deck(good_card(why=None)))))
ok(code == 0 and 'nothing says what this changes' in out, 'a card with no context gets a warning', out)
code, out = run('check', str(write('d/rarity.json', deck(good_card(rarity='mythic')))))
ok(code == 1 and 'rarity must be' in out, 'a wrong rarity is refused', out)
opt = {'id': 'o', 'kind': 'options', 'title': 'Options', 'text': 'Which?', 'why': 'It matters.', 'pick': 'a'}
code, out = run('check', str(write('d/opt1.json', deck({**opt, 'options': [{'id': 'a', 'label': 'One'}]}))))
ok(code == 1 and '2 to 4 options' in out, 'one option is refused', out)
code, out = run('check', str(write('d/opt2.json', deck({**opt, 'pick': 'z', 'options': [{'id': 'a', 'label': 'One'}, {'id': 'b', 'label': 'Two'}]}))))
ok(code == 1 and 'pick must be one of' in out, 'a pick that is not an option is refused', out)
code, out = run('check', str(write('d/opt3.json', deck({**opt, 'options': [{'id': 'a', 'label': 'One'}, {'id': 'b', 'label': 'Two'}]}))))
ok(code == 0, 'good options pass', out)
code, out = run('check', str(write('d/badjson.json', '{"title": "x",')))
ok(code == 1 and 'not valid JSON' in out, 'broken JSON says so', out)
code, out = run('check', str(write('d/pic.json', deck(good_card(images=['nope.png'])))))
ok(code == 1 and "can't find the picture" in out, 'a missing picture is refused', out)
code, out = run('check', str(write('d/stack.json', {'title': 'S', 'stack': 'x', 'cards': [good_card()]})))
ok(code == 1 and 'needs a topic' in out, 'a stack with no topic is refused', out)
folder = work / 'folder'
folder.mkdir()
shutil.copy(work / 'd/good.json', folder / 'one.json')
shutil.copy(work / 'd/nopick.json', folder / 'two.json')
code, out = run('check', str(folder))
ok(code == 1 and '2 decks, 2 cards, 1 not ready' in out, 'a folder gets checked whole', out)

print('Making things')
code, out = run('pack', 'proj', '--title', 'A project', '--color', '#2f8fe0')
ok(code == 0 and 'Pushed' in out, 'pack', out)
code, out = run('topic', 'first', '--pack', 'proj', '--title', 'First')
ok(code == 0, 'topic', out)
(work / 'project').mkdir()
(work / 'project' / '.riffle-pack').write_text('proj\n')
code, out = run('check', str(write('d/notopic.json', {**deck(good_card()), 'topic': 'missing'})), cwd=work / 'project')
ok(code == 1 and 'no topic called missing' in out, 'the topic has to exist, using the .riffle-pack file', out)
from PIL import Image
Image.new('RGB', (3000, 2000), (200, 80, 80)).save(work / 'd' / 'big.png')
code, out = run('deck', str(write('d/first.json', deck(good_card(images=['big.png']), good_card('b'), good_card('c', rarity='epic')))), cwd=work / 'project')
ok(code == 0 and 'Pushed' in out and 'No signing key' in out, 'deck sends, and tries to notify, with no real key here', out)
sent = json.loads((clone / 'packs/proj/decks/first.json').read_text(encoding='utf-8'))
ok(sent['cards'][0]['images'] == ['img/first-big.jpg'], 'pictures get copied in')
ok(max(Image.open(clone / 'packs/proj/img/first-big.jpg').size) == 2000, 'and shrunk, keeping enough to zoom into')
first_notice = sent_notices()[-1] if sent_notices() else {}
ok(first_notice.get('title') == 'A project › First' and first_notice.get('body') == 'A deck: questions, 3 cards', 'its notification says the pack and topic, then the deck, its kind and the cards', first_notice)
ok(first_notice.get('url') == './#open=proj%2Ffirst', 'and a tap on it opens that deck', first_notice)
code, out = run('deck', str(write('d/second.json', deck(good_card(), order=2))), '--pack', 'proj')
ok('one went out' in out, 'a second deck straight after makes no second notification', out)
ok('joins the next one' in out and len(sent_notices()) == 1, 'it waits to join the next one instead of being dropped', out)
code, out = run('deck', str(write('d/third.json', {**deck(good_card(), order=3), 'title': 'Third deck'})), '--pack', 'proj')
ok(wait_for_notices(2), 'once the gap is over, the one waiting goes by itself')
batch = sent_notices()[-1] if sent_notices() else {}
ok(batch.get('body', '').startswith('2 new decks: ') and 'A deck (1)' in batch.get('body', '') and 'Third deck (1)' in batch.get('body', ''), 'naming every deck sent in the meantime', batch)
ok(batch.get('title') == 'A project › First' and batch.get('url') == './#open=proj', 'with where they are from, and a tap opens the pack', batch)
ok(not (home / '.riffle' / 'notify-pending.json').exists(), 'and nothing is left waiting', list((home / '.riffle').iterdir()))
time.sleep(GAP + 0.5)
ok(git(clone, 'log', '-1', '--format=%B').stdout.strip().endswith('<noreply@anthropic.com>'), 'commits carry the attribution')
fresh = work / 'fresh'
subprocess.run(['git', 'clone', '-q', str(bare), str(fresh)], capture_output=True, check=True)
ok((fresh / 'packs/proj/decks/first.json').exists() and (fresh / 'packs/proj/img/first-big.jpg').exists(), 'it all reached the remote')
code, out = run('deck', str(write('d/refused.json', deck(good_card(why=None, pick=None)))), '--pack', 'proj')
ok(code == 1 and 'Not sent' in out and not (clone / 'packs/proj/decks/refused.json').exists(), 'a bad deck is not sent', out)
code, out = run('deck', str(write('d/name.json', deck(good_card(why=f'Made by {getpass.getuser()} today.')))), '--pack', 'proj')
ok(code == 1 and 'Stopped' in out and 'd/name.json' not in git(clone, 'status', '--short').stdout, "the computer user's name can't go in", out)
git(clone, 'checkout', '-q', '--', '.')
for f in (clone / 'packs/proj/decks').glob('name.json'):
    f.unlink()
(work / 'd' / 'img').mkdir()
Image.new('RGB', (2600, 1300), (80, 120, 200)).save(work / 'd' / 'img' / 'beside.png')
Image.new('RGB', (900, 900), (80, 200, 120)).save(work / 'd' / 'small.jpg', 'JPEG', quality=60)
code, out = run('check', str(write('d/beside.json', deck(good_card(images=['img/beside.png'])))), '--pack', 'proj')
ok(code == 0, 'a folder named img beside the deck file counts as beside it', out)
code, out = run('deck', str(work / 'd/beside.json'), '--pack', 'proj', '--quiet')
ok(code == 0 and json.loads((clone / 'packs/proj/decks/beside.json').read_text(encoding='utf-8'))['cards'][0]['images'] == ['img/beside-beside.jpg'], 'and gets brought in', out)
code, out = run('deck', str(write('d/inpack.json', deck(good_card(images=['img/first-big.jpg'])))), '--pack', 'proj', '--quiet')
ok(code == 0 and json.loads((clone / 'packs/proj/decks/inpack.json').read_text(encoding='utf-8'))['cards'][0]['images'] == ['img/first-big.jpg'], 'an img path not beside it means one already in the pack', out)
code, out = run('check', str(write('d/nothere.json', deck(good_card(images=['img/nothing.png'])))), '--pack', 'proj')
ok(code == 1 and "can't find the picture" in out, 'and if it is in neither place, it says so', out)
code, out = run('deck', str(write('d/keep.json', deck(good_card(images=['small.jpg'])))), '--pack', 'proj', '--quiet')
ok((clone / 'packs/proj/img/keep-small.jpg').read_bytes() == (work / 'd/small.jpg').read_bytes(), 'a small JPEG is left as it is', out)

print('Boards')
for i in range(62):
    Image.new('RGB', (2400, 1800), (i * 4, 100, 200 - i * 3)).save(work / 'd' / f'tree{i}.png')
(work / 'd' / 'other').mkdir()
Image.new('RGB', (500, 500), (9, 9, 9)).save(work / 'd' / 'other' / 'tree0.png')
items = [{'id': f't{i}', 'label': f'Tree {i}', 'image': f'tree{i}.png'} for i in range(62)]
board = {'id': 'trees', 'kind': 'board', 'title': 'Trees', 'text': 'Which trees do you like?', 'why': 'They would grow in the forests.', 'pick': ['t1', 't2'], 'items': items}
code, out = run('check', str(write('d/board.json', deck(board))), '--pack', 'proj')
ok(code == 0 and 'warning' not in out, '62 pictures on a board pass the check, with nothing to warn about', out)
code, out = run('fit', str(work / 'd/board.json'))
ok('trees: fits' in out, 'and fit has no complaint', out)
code, out = run('check', str(write('d/board2.json', deck({**board, 'pick': ['nope']}))), '--pack', 'proj')
ok(code == 1 and 'pick nope is not one of' in out, 'a pick that is not an item is refused', out)
code, out = run('check', str(write('d/board3.json', deck({**board, 'items': items + [items[0]]}))), '--pack', 'proj')
ok(code == 1 and 'its own id' in out, 'a repeated item is refused', out)
code, out = run('check', str(write('d/board4.json', deck({**board, 'items': [{'id': 'a', 'image': 'tree1.png'}, {'id': 'b', 'label': 'B'}]}))), '--pack', 'proj')
ok(code == 1 and 'short label' in out and 'needs a picture' in out, 'an item with no label or picture is refused', out)
code, out = run('check', str(write('d/board5.json', deck({**board, 'items': [{'id': 'a', 'label': 'A', 'image': 'nope.png'}, {'id': 'b', 'label': 'Swipe left', 'image': 'tree1.png'}]}))), '--pack', 'proj')
ok(code == 1 and "can't find the picture nope.png" in out and 'names a swipe direction' in out, "a missing picture or a named direction is refused on an item too", out)
code, out = run('deck', str(work / 'd/board.json'), '--pack', 'proj', '--id', 'forest', '--quiet')
ok(code == 0 and '62 pictures' in out and 'MB of thumbnails' in out, 'deck sends it, and says what it costs', out)
sentb = json.loads((clone / 'packs/proj/decks/forest.json').read_text(encoding='utf-8'))['cards'][0]
ok(sentb['items'][5]['image'] == 'img/forest-tree5.jpg' and sentb['items'][5]['thumb'] == 'img/thumb/forest-tree5.jpg', 'each item gets its picture and a thumbnail', sentb['items'][5])
ok(max(Image.open(clone / 'packs/proj/img/forest-tree5.jpg').size) == 2000 and max(Image.open(clone / 'packs/proj/img/thumb/forest-tree5.jpg').size) == 360, 'at the right sizes')
Image.new('RGB', (736, 1406), (20, 200, 40)).save(work / 'd' / 'tall.png')
Image.new('RGB', (800, 800), (220, 30, 40)).save(work / 'd' / 'own.png')
Image.new('RGB', (300, 300), (30, 30, 220)).save(work / 'd' / 'small-own.jpg', 'JPEG', quality=60)
owned = {**board, 'id': 'owned', 'pick': None, 'items': [{'id': 'a', 'label': 'A', 'image': 'tall.png', 'thumb': 'own.png'}, {'id': 'b', 'label': 'B', 'image': 'tall.png'}, {'id': 'c', 'label': 'C', 'image': 'tree1.png', 'thumb': 'small-own.jpg'}]}
code, out = run('check', str(write('d/owned2.json', deck({**owned, 'items': [{'id': 'a', 'label': 'A', 'image': 'tall.png', 'thumb': 'nope.png'}, owned['items'][1]]}))), '--pack', 'proj')
ok(code == 1 and "can't find the picture nope.png" in out, 'a thumbnail of its own has to exist', out)
code, out = run('deck', str(write('d/owned.json', deck(owned))), '--pack', 'proj', '--quiet')
ownedb = json.loads((clone / 'packs/proj/decks/owned.json').read_text(encoding='utf-8'))['cards'][0]['items']
ok(code == 0 and ownedb[0]['thumb'] == 'img/thumb/owned-own.jpg' and ownedb[0]['image'] == 'img/owned-tall.jpg', 'an item can bring its own thumbnail', out)
with Image.open(clone / 'packs/proj/img/thumb/owned-own.jpg') as im:
    r, g, b_ = im.convert('RGB').getpixel((180, 180))
    ok(im.size == (360, 360) and r > 180 and g < 70, 'it is shrunk and kept, not made again from the picture', (im.size, r, g, b_))
with Image.open(clone / f'packs/proj/{ownedb[1]["thumb"]}') as im:
    ok(ownedb[1]['thumb'] == 'img/thumb/owned-tall.jpg' and im.size[1] == 360 and im.size[0] < 200, 'with none given, one is made from the whole picture', (ownedb[1], im.size))
ok((clone / 'packs/proj/img/thumb/owned-small-own.jpg').read_bytes() == (work / 'd/small-own.jpg').read_bytes(), 'one already small and JPEG is left as it is')
code, out = run('deck', str(clone / 'packs/proj/decks/owned.json'), '--pack', 'proj', '--quiet')
ok(code == 0 and 'Nothing changed' in out, 'sending it again from where it is keeps them', out)
code, out = run('deck', str(write('d/clash.json', deck({**board, 'pick': None, 'items': [{'id': 'a', 'label': 'A', 'image': 'tree0.png'}, {'id': 'b', 'label': 'B', 'image': 'other/tree0.png'}]}))), '--pack', 'proj', '--quiet')
clash = json.loads((clone / 'packs/proj/decks/clash.json').read_text(encoding='utf-8'))['cards'][0]['items']
ok(clash[0]['image'] != clash[1]['image'], 'two pictures with the same name stay two pictures', clash)
code, out = run('deck', str(clone / 'packs/proj/decks/forest.json'), '--pack', 'proj', '--quiet')
ok(code == 0 and 'Nothing changed' in out, 'sending it again from where it is changes nothing', out)

print('Films')
have_ffmpeg = bool(shutil.which('ffmpeg'))
if have_ffmpeg:
    def film(name, *extra, seconds=2, size='480x270'):
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', f'testsrc2=size={size}:rate=24', '-t', str(seconds), *extra, str(work / 'd' / name)], check=True)
    film('walk.mp4', '-pix_fmt', 'yuv420p', '-c:v', 'libx264')
    film('turn.mov', '-c:v', 'mpeg4', '-q:v', '2', size='1920x1080', seconds=3)
    film('idle.mp4', '-pix_fmt', 'yuv420p', '-c:v', 'libx264')
    Image.new('RGB', (480, 270), (250, 200, 0)).save(work / 'd' / 'my-poster.png')
    films_card = {**good_card('films'), 'kind': 'report', 'pick': None, 'videos': ['walk.mp4', {'src': 'turn.mov'}, {'src': 'idle.mp4', 'poster': 'my-poster.png'}]}
    film_board = {**board, 'id': 'clips', 'pick': ['w'], 'items': [{'id': 'w', 'label': 'Walk', 'video': 'walk.mp4'}, {'id': 'p', 'label': 'A picture', 'image': 'tree1.png'}]}
    code, out = run('check', str(write('d/films.json', deck(films_card, film_board))), '--pack', 'proj')
    ok(code == 0 and 'warning' not in out, 'a card with films, and a board mixing films and pictures, pass the check', out)
    code, out = run('deck', str(work / 'd/films.json'), '--pack', 'proj', '--quiet')
    sentf = json.loads((clone / 'packs/proj/decks/films.json').read_text(encoding='utf-8'))['cards']
    vids = sentf[0]['videos']
    ok(code == 0 and vids[0] == {'src': 'img/films-walk.mp4', 'poster': 'img/poster/films-walk.jpg'}, 'a film comes in with a poster made from it', (out, vids))
    ok((clone / 'packs/proj/img/films-walk.mp4').read_bytes() == (work / 'd/walk.mp4').read_bytes(), 'a small mp4 is left as it is')
    turned = clone / 'packs/proj/img/films-turn.mp4'
    ok(vids[1]['src'] == 'img/films-turn.mp4' and turned.exists() and turned.stat().st_size <= 2_000_000, 'another kind of film becomes a small mp4', vids[1])
    probed = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,width,height,codec_type', '-of', 'json', str(turned)], capture_output=True, text=True).stdout
    streams = json.loads(probed)['streams']
    ok(all(st['codec_type'] == 'video' for st in streams) and streams[0]['codec_name'] == 'h264' and max(streams[0]['width'], streams[0]['height']) <= 1280, 'H.264, with no sound, no bigger than a phone needs', streams)
    ok(vids[2]['poster'] == 'img/films-my-poster.jpg', 'a poster of its own is kept, like a picture', vids[2])
    with Image.open(clone / 'packs/proj/img/poster/films-walk.jpg') as im:
        ok(im.size == (480, 270), 'the poster is a full frame of the film', im.size)
    items_f = sentf[1]['items']
    ok(items_f[0]['video'] == 'img/films-walk.mp4' and items_f[0]['image'] == 'img/poster/films-walk.jpg' and items_f[0]['thumb'].startswith('img/thumb/'), 'on a board, a film gets its poster as its picture, and a thumbnail', items_f[0])
    ok('1 of them films' in out, 'and riffle deck says how many are films', out)
    code, out = run('deck', str(clone / 'packs/proj/decks/films.json'), '--pack', 'proj', '--quiet')
    ok(code == 0 and 'Nothing changed' in out, 'sending it again from where it is changes nothing', out)
    code, out = run('fit', str(work / 'd/films.json'))
    ok('films: fits' in out, 'a card with films still fits', out)
else:
    print('  (ffmpeg is not installed here, so the film tests were skipped)')
write('d/notafilm.txt', 'x')
code, out = run('check', str(write('d/badfilm.json', deck({**good_card('bf'), 'videos': ['notafilm.txt', 7]}))), '--pack', 'proj')
ok(code == 1 and 'not a film the app can play' in out and 'neither a path' in out, 'something that is not a film is refused', out)
code, out = run('check', str(write('d/nofilm.json', deck({**good_card('nf'), 'videos': ['nope.mp4']}))), '--pack', 'proj')
ok(code == 1 and "can't find the picture nope.mp4" in out, 'a missing film is refused', out)

print('Parts')
Image.new('RGB', (1200, 800), (40, 160, 90)).save(work / 'd' / 'part-pic.png')
parts_card = {**good_card('walk', kind='report', pick=None), 'text': 'The walk, in four parts.', 'parts': [
    {'id': 'feet', 'title': 'Feet', 'text': 'The feet stay planted now.', 'images': ['part-pic.png']},
    {'id': 'hips', 'title': 'Hips', 'text': 'The hips sway a little.'},
    {'id': 'arms', 'title': 'Arms', 'text': 'The arms swing opposite the legs.'},
    {'id': 'head', 'title': 'Head', 'text': 'The head stays level.'},
    {'id': 'tail', 'title': 'Tail', 'text': 'The tail follows.'},
]}
code, out = run('check', str(write('d/parts.json', deck(parts_card))), '--pack', 'proj')
ok(code == 0 and 'warning' not in out, 'a card in parts passes the check', out)
code, out = run('fit', str(work / 'd/parts.json'))
ok('walk: fits' in out or 'shrinks a little' in out, 'and fits, with its part titles on the face', out)
bad_parts = {**parts_card, 'parts': [{'id': 'a', 'text': 'No title'}, {'id': 'a', 'title': 'Twice'}, {'id': 'b', 'title': 'Empty'}, {'id': 'c', 'title': 'Swipe left on this one', 'text': 'x'}]}
code, out = run('check', str(write('d/badparts.json', deck(bad_parts))), '--pack', 'proj')
ok(code == 1 and 'each part needs its own id' in out and 'needs a short title' in out and 'needs text, pictures or films' in out and 'part c names a swipe direction' in out, 'parts need an id, a title and something in them, and name no direction', out)
code, out = run('check', str(write('d/optparts.json', deck({**opt, 'options': [{'id': 'a', 'label': 'One'}, {'id': 'b', 'label': 'Two'}], 'parts': [{'id': 'x', 'title': 'X', 'text': 'y'}]}))), '--pack', 'proj')
ok(code == 1 and 'not on options cards' in out, 'and go only on questions, reports and designs', out)
code, out = run('check', str(write('d/longpart.json', deck({**parts_card, 'parts': [{'id': 'x', 'title': 'A title for a part that runs far too long for one line', 'text': 'y'}]}))), '--pack', 'proj')
ok(code == 0 and 'over 40' in out, 'a long part title gets a warning', out)
code, out = run('deck', str(work / 'd/parts.json'), '--pack', 'proj', '--quiet')
sentp = json.loads((clone / 'packs/proj/decks/parts.json').read_text(encoding='utf-8'))['cards'][0]['parts']
ok(code == 0 and sentp[0]['images'] == ['img/parts-part-pic.jpg'] and (clone / 'packs/proj/img/parts-part-pic.jpg').exists(), "a part's pictures are brought in too", (out, sentp[0]))

print('Null fields')
nulls = {'id': 'n', 'kind': 'question', 'title': 'Nulls', 'text': 'Any?', 'why': 'To check.', 'pick': 'Yes.', 'options': None, 'images': None, 'items': None, 'details': None, 'handled': None}
code, out = run('check', str(write('d/nulls.json', deck(nulls))), '--pack', 'proj')
ok(code == 0, 'check copes with null fields', out)
code, out = run('fit', str(work / 'd/nulls.json'))
ok(code == 0, 'so does fit', out)
code, out = run('deck', str(work / 'd/nulls.json'), '--pack', 'proj', '--quiet')
ok(code == 0, 'and deck', out)
code, out = run('check', str(write('d/nullkinds.json', deck({**nulls, 'id': 'o', 'kind': 'options', 'options': None}, {**nulls, 'id': 'b', 'kind': 'board', 'items': None}))), '--pack', 'proj')
ok(code == 1 and '2 to 4 options' in out and 'at least 2 items' in out and 'Traceback' not in out, 'and says what is missing where it matters', out)

code, out = run('misc', str(write('d/one.json', good_card('m1'))), '--pack', 'proj')
ok(code == 0 and json.loads((clone / 'packs/proj/decks/misc.json').read_text(encoding='utf-8'))['misc'] is True, 'misc makes the Misc deck', out)
wait_for_notices(1)
misc_notice = next((n for n in reversed(sent_notices()) if 'Misc' in n.get('body', '')), {})
ok(misc_notice.get('title') == 'A project › Misc' and misc_notice.get('body') == '1 new card in Misc: A title' and misc_notice.get('url') == './#open=proj%2Fmisc', 'and its notification says so, and opens Misc', misc_notice)
time.sleep(GAP + 0.5)
code, out = run('misc', str(write('d/two.json', [good_card('m2')])), '--pack', 'proj')
ok(len(json.loads((clone / 'packs/proj/decks/misc.json').read_text(encoding='utf-8'))['cards']) == 2, 'and adds to it', out)
code, out = run('misc', str(write('d/three.json', good_card('m2'))), '--pack', 'proj')
ok(code == 1 and 'already in Misc' in out, 'a repeat is refused', out)

print('Reading answers')
git(other, 'pull', '-q', 'origin', 'main')


def phone_sends(name, *events):
    base = {'v': 1, 'pack': 'proj', 'topic': 'first', 'deck': 'first'}
    (other / 'answers').mkdir(exist_ok=True)
    (other / 'answers' / name).write_text(json.dumps({'v': 1, 'device': 'phone-x', 'sentAt': '2026-11-02T12:00:00.000Z', 'events': [{**base, **e} for e in events]}), encoding='utf-8')
    git(other, 'add', '-A')
    git(other, 'commit', '-q', '-m', 'answers')
    git(other, 'pull', '-q', '--rebase', 'origin', 'main')
    git(other, 'push', '-q', 'origin', 'HEAD:main')


phone_sends('2026-11-02T12-00-00-000Z-aaa.json',
            {'eid': 'e1', 'at': '2026-11-02T12:00:00.000Z', 'type': 'answer', 'card': 'a', 'cardVersion': 1, 'title': 'A title', 'kind': 'question', 'swipe': 'right', 'stamp': 'GO', 'comment': 'Yes “but” softer \U0001F600'},
            {'eid': 'e2', 'at': '2026-11-02T12:00:01.000Z', 'type': 'answer', 'card': 'b', 'cardVersion': 1, 'title': 'A title', 'kind': 'question', 'swipe': 'left', 'stamp': 'WORKSHOP', 'comment': ''},
            {'eid': 'e3', 'at': '2026-11-02T12:00:02.000Z', 'type': 'undo', 'card': 'b', 'of': 'e2'},
            {'eid': 'e4', 'at': '2026-11-02T12:00:03.000Z', 'type': 'draft', 'card': 'c', 'text': 'Still thinking'},
            {'eid': 'e5', 'at': '2026-11-02T12:00:04.000Z', 'type': 'notes', 'text': 'Some notes'},
            {'eid': 'e6', 'at': '2026-11-02T12:00:05.000Z', 'type': 'thought', 'deck': None, 'topic': None, 'id': 'th1', 'text': 'A general thought'},
            {'eid': 'e7', 'pack': 'other-pack', 'deck': 'x', 'topic': None, 'at': '2026-11-02T12:00:06.000Z', 'type': 'answer', 'card': 'z', 'title': 'Other', 'kind': 'report', 'swipe': 'right', 'stamp': 'GOOD', 'comment': ''})
git(other, 'pull', '-q', 'origin', 'main')
phone_sends('2026-11-02T12-00-30-000Z-brd.json',
            {'eid': 'b1', 'deck': 'forest', 'at': '2026-11-02T12:00:30.000Z', 'type': 'answer', 'card': 'trees', 'cardVersion': 1, 'title': 'Trees', 'kind': 'board', 'swipe': 'right', 'stamp': 'GO', 'comment': '', 'selected': ['t3', 't7']},
            {'eid': 'b2', 'deck': 'nulls', 'at': '2026-11-02T12:00:31.000Z', 'type': 'answer', 'card': 'n', 'cardVersion': 1, 'title': 'Nulls', 'kind': 'question', 'swipe': 'right', 'stamp': 'GO', 'comment': '', 'selected': ['x']},
            {'eid': 'b3', 'deck': 'clash', 'at': '2026-11-02T12:00:32.000Z', 'type': 'draft', 'card': 'trees', 'text': '', 'selected': ['a']})
phone_sends('2026-11-02T12-00-40-000Z-prt.json',
            {'eid': 'q1', 'deck': 'parts', 'at': '2026-11-02T12:00:40.000Z', 'type': 'part', 'card': 'walk', 'cardVersion': 1, 'title': 'A title', 'kind': 'report', 'part': 'feet', 'partTitle': 'Feet', 'mark': 'left', 'stamp': 'PROBLEM', 'comment': 'They slide', 'images': ['answers/img/drawn.jpg'], 'drawings': {'answers/img/drawn.jpg': 'img/parts-part-pic.jpg'}},
            {'eid': 'q2', 'deck': 'parts', 'at': '2026-11-02T12:00:41.000Z', 'type': 'part', 'card': 'walk', 'cardVersion': 1, 'title': 'A title', 'kind': 'report', 'part': 'hips', 'partTitle': 'Hips', 'mark': 'right', 'stamp': 'GOOD', 'comment': ''},
            {'eid': 'q3', 'deck': 'parts', 'at': '2026-11-02T12:00:42.000Z', 'type': 'part', 'card': 'walk', 'cardVersion': 1, 'title': 'A title', 'kind': 'report', 'part': 'hips', 'partTitle': 'Hips', 'mark': 'down', 'stamp': 'HUH?', 'comment': 'Changed my mind'},
            {'eid': 'q4', 'deck': 'inpack', 'at': '2026-11-02T12:00:43.000Z', 'type': 'answer', 'card': 'a', 'cardVersion': 1, 'title': 'A title', 'kind': 'question', 'swipe': 'left', 'stamp': 'WORKSHOP', 'comment': 'See my drawing', 'images': ['answers/img/d2.jpg'], 'drawings': {'answers/img/d2.jpg': 'img/first-big.jpg'}})
code, out = run('answers', '--pack', 'proj')
ok('walk (A title): not swiped yet. On its parts:' in out and 'part feet (Feet): PROBLEM, "They slide"' in out, 'a part answer shows under its card, with its mark and comment', out)
ok('part hips (Hips): HUH?, "Changed my mind"' in out and 'GOOD' not in out.split('part hips')[1].split('\n')[0], 'the latest on a part stands', out)
ok('answers/img/drawn.jpg (still uploading) (their drawing over img/parts-part-pic.jpg)' in out, 'a drawing is listed with its path and what it was drawn over', out)
ok('a (A title): WORKSHOP' in out and '(their drawing over img/first-big.jpg)' in out, 'on a card comment too', out)
phone_sends('2026-11-02T12-00-45-000Z-lnk.json',
            {'eid': 'k1', 'deck': 'beside', 'at': '2026-11-02T12:00:45.000Z', 'type': 'answer', 'card': 'a', 'cardVersion': 1, 'title': 'A title', 'kind': 'question', 'swipe': 'up', 'stamp': 'COMMENT', 'comment': 'Like [A title](riffle:proj/first/a), not [gone](riffle:proj/nope/x)'})
code, out = run('answers', '--pack', 'proj')
ok('[A title → A project › First › A deck › A title]' in out, 'a link in their words is written out as where it goes', out)
ok('[gone → A project › nope (no such deck)]' in out, 'and one to something gone says so', out)
phone_sends('2026-11-02T12-00-46-000Z-ref.json',
            {'eid': 'k2', 'deck': 'beside', 'at': '2026-11-02T12:00:46.000Z', 'type': 'notes', 'text': 'Look: [Film at 0:12, A title](riffle:proj/first/a?film=img%2Fwalk.mp4&t=12.4)\n[Drawing, A title](riffle:proj/first/a?pic=img%2Fx.jpg&drawing=answers%2Fimg%2Fd9.jpg)\n[Picture, A title](riffle:proj/first/a?pic=img%2Fx.jpg)'})
code, out = run('answers', '--pack', 'proj')
ok('[Film at 0:12, A title → A project › First › A deck › A title, the film img/walk.mp4 at 0:12]' in out, 'a moment of a film brought to their notes reads as which film and when', out)
ok('their drawing answers/img/d9.jpg over img/x.jpg]' in out and '[Picture, A title → A project › First › A deck › A title, the picture img/x.jpg]' in out, 'and a drawing or a picture says which', out)
code, out = run('link', 'proj', 'first', 'a')
ok(code == 0 and out.startswith('[A title](riffle:proj/first/a)') and 'goes to A project › First › A deck › A title' in out, 'riffle link prints a link to paste into a card', out)
code, out = run('link', 'proj', 'first', 'zz')
ok(code == 1 and 'no such card' in out, 'and refuses one to nothing', out)
code, out = run('check', str(write('d/links.json', deck(good_card('l1', why='See [the gate](riffle:proj/first/zz) and [this one](riffle:proj/x/l2).'), good_card('l2')))), '--pack', 'proj')
ok(code == 0 and 'links to proj/first/zz' in out and 'proj/x/l2' not in out, 'check warns about a link to nothing, but not one to a card in the same deck', out)
code, out = run('redeal', '--pack', 'proj')
ok('Parts with a problem or a question' in out and 'proj parts walk part feet: PROBLEM, "They slide"' in out and 'part hips: HUH?' in out, 'redeal lists parts with a problem or a question', out)
code, out = run('answers', '--pack', 'proj')
ok(code == 0 and 'GO' in out and '“but”' in out, 'an answer with its comment, curly quotes and all', out)
ok('picked: Tree 3, Tree 7' in out, 'a board answer gives its picks by name', out)
ok('trees: still choosing: A' in out, 'and half-finished ticks show as that', out)
ok('Traceback' not in out and 'n (Nulls)' in out, 'a card with null options reads fine', out)
ok('b (A title)' not in out, 'an undone answer is dropped', out)
ok('still writing: "Still thinking"' in out, 'a draft shows as unfinished', out)
ok('Deck notes: "Some notes"' in out and 'th1: "A general thought"' in out, 'notes and thoughts show', out)
ok('other-pack' not in out, 'only this pack', out)
code, out = run('answers', '--every-pack')
ok('other-pack' in out, 'unless asked for every pack', out)
code, out = run('answers', '--pack', 'proj', '--mark-read')
code, out = run('answers', '--pack', 'proj')
ok('Nothing new' in out, 'marking read works', out)
code, out = run('answers', '--pack', 'other-pack')
ok('z (Other)' in out, "and doesn't mark another project's as read", out)
code, out = run('answers', '--pack', 'proj', '--all')
ok('GO' in out, '--all still shows it', out)
code, out = run('answers', '--pack', 'proj', '--json')
ok(code == 0 and json.loads(out)['events'] == [], 'there is a JSON form')
phone_sends('2026-11-02T12-01-00-000Z-bbb.json',
            {'eid': 'e8', 'at': '2026-11-02T12:01:00.000Z', 'type': 'answer', 'card': 'c', 'cardVersion': 1, 'title': 'A title', 'kind': 'question', 'swipe': 'down', 'stamp': 'IDK', 'comment': ''},
            {'eid': 'e9', 'at': '2026-11-02T12:01:01.000Z', 'type': 'deck', 'verdict': 'replan', 'answered': 2, 'total': 3})
code, out = run('answers', '--pack', 'proj')
ok('REPLAN FROM THE BASE' in out and 'c (A title): IDK' in out, 'new ones show after that, and a replan stands out', out)
ok('walk' not in out, 'parts already read do not show again', out)
ok('still writing' not in out, 'an answer replaces its draft', out)
code, out = run('status', '--pack', 'proj')
ok('first / first: 1 of 3 owed' in out and 'replan' in out, 'status counts what is owed', out)
code, out = run('second-try', 'proj', 'first', 'a', '--file', str(write('d/try.json', {'why': 'New words.', 'images': None, 'options': None})))
sent2 = next(c for c in json.loads((clone / 'packs/proj/decks/first.json').read_text(encoding='utf-8'))['cards'] if c['id'] == 'a')
ok(code == 0 and 'images' not in sent2 and 'options' not in sent2 and sent2['why'] == 'New words.', 'in second-try, null takes a field off the card', out)
code, out = run('status', '--pack', 'proj')
phone_sends('2026-11-02T12-01-30-000Z-pic.json',
            {'eid': 'p1', 'at': '2026-11-02T12:01:30.000Z', 'type': 'notes', 'text': 'With a picture', 'images': ['answers/img/nope.jpg']})
code, out = run('answers', '--pack', 'proj')
ok('answers/img/nope.jpg (still uploading)' in out, 'pictures are listed, and one not arrived yet says so', out)

print('Dealing back')
code, out = run('redeal', '--pack', 'proj')
ok('Need more context' in out and 'proj first c' in out and 'Deck sent back to replan' in out, 'the re-deal list shows what came back', out)
time.sleep(GAP + 0.5)
before = len(sent_notices())
code, out = run('second-try', 'proj', 'first', 'c', '--why', 'Plainer words now.')
ok(code == 0, 'second-try', out)
wait_for_notices(before + 1)
again = sent_notices()[-1] if len(sent_notices()) > before else {}
ok(again.get('title') == 'A project › First' and again.get('body') == 'Second try on "A title", in A deck' and again.get('url') == './#open=proj%2Ffirst%2Fc', 'a second try notifies, naming the card, and opens it', again)
card = next(c for c in json.loads((clone / 'packs/proj/decks/first.json').read_text(encoding='utf-8'))['cards'] if c['id'] == 'c')
ok(card['version'] == 2 and card['why'] == 'Plainer words now.', 'bumps the version and changes the words')
code, out = run('status', '--pack', 'proj')
ok('first / first: 3 of 3 owed' in out, 'and it counts as owed again', out)
code, out = run('redeal', '--pack', 'proj')
ok('proj first c' not in out, 'and leaves the re-deal list', out)
code, out = run('second-try', 'proj', 'first', 'c', '--why', 'Swipe left on this.')
ok(code == 1 and 'Not changed' in out, 'the checks apply here too', out)
git(clone, 'checkout', '-q', '--', '.')
time.sleep(GAP + 0.5)
before = len(sent_notices())
code, out = run('handled', 'proj', 'first', 'b', '--how', 'Settled by the other work.')
ok(code == 0, 'handled', out)
wait_for_notices(before + 1)
settled = sent_notices()[-1] if len(sent_notices()) > before else {}
ok(settled.get('body') == 'My conclusion on "A title", in A deck' and settled.get('url') == './#open=proj%2Ffirst%2Fb', 'so does marking one handled', settled)
card = next(c for c in json.loads((clone / 'packs/proj/decks/first.json').read_text(encoding='utf-8'))['cards'] if c['id'] == 'b')
ok(card['handled']['how'] == 'Settled by the other work.' and card['handled']['at'].endswith('Z'), 'marks it, with the time')
code, out = run('status', '--pack', 'proj')
ok('2 of 2 owed, 1 handled' in out, 'a handled card is not owed', out)
code, out = run('redeal', '--pack', 'proj')
ok('Handled, no answer yet' in out and 'proj first b' in out, 'it shows as not answered yet', out)
later = '2099-01-01T00:00:00.000Z'
phone_sends('2026-11-02T12-02-00-000Z-ccc.json',
            {'eid': 'e10', 'at': later, 'type': 'answer', 'card': 'b', 'cardVersion': 1, 'handledAt': card['handled']['at'], 'title': 'A title', 'kind': 'question', 'swipe': 'left', 'stamp': 'WORKSHOP', 'comment': 'I disagree'})
code, out = run('redeal', '--pack', 'proj')
ok('Handled, and they answered' in out and 'WORKSHOP' in out and 'I disagree' in out, 'and then with their answer', out)
before = len(sent_notices())
code, out = run('handled', 'proj', 'first', 'b', '--undo')
time.sleep(0.5)
ok(len(sent_notices()) == before and not (home / '.riffle' / 'notify-pending.json').exists(), 'but taking it back makes no notification', sent_notices()[-1:])
ok(code == 0 and 'handled' not in next(c for c in json.loads((clone / 'packs/proj/decks/first.json').read_text(encoding='utf-8'))['cards'] if c['id'] == 'b'), 'it can be undone', out)
code, out = run('thought', 'proj', 'th1', '--how', 'Done in the next round.')
ok(code == 0 and json.loads((clone / 'packs/proj/thoughts.json').read_text(encoding='utf-8'))['th1']['handled']['how'] == 'Done in the next round.', 'answering a thought', out)
code, out = run('thought', 'proj', 'nope', '--how', 'x')
ok(code == 1 and 'No thought' in out, 'a thought that does not exist is refused', out)

print('Order, tags and archiving')
code, out = run('order', 'proj', 'first', '--priority', '1', '--tag', 'first', '--tag', 'working')
order = json.loads((clone / 'packs/proj/order.json').read_text(encoding='utf-8'))
ok(code == 0 and order['decks']['first'] == {'priority': 1, 'tags': ['first', 'working']}, 'order sets a deck\'s priority and tags, in order.json', (out, order))
ok('priority 1, answer first, being worked on, questions' in out, 'and says what stands', out)
code, out = run('order', 'proj', 'first', '--untag', 'working', '--kind', 'report')
order = json.loads((clone / 'packs/proj/order.json').read_text(encoding='utf-8'))
ok(order['decks']['first'] == {'priority': 1, 'tags': ['first'], 'kind': 'report'}, 'tags come off, and a kind can be set', order)
code, out = run('order', 'proj', 'first', '--no-priority')
ok('priority' not in json.loads((clone / 'packs/proj/order.json').read_text(encoding='utf-8'))['decks']['first'], 'and the priority can go')
code, out = run('order', 'proj', 'nope', '--priority', '2')
ok(code == 1 and 'No deck nope' in out, 'a deck that is not there is refused', out)
code, out = run('check', str(write('d/meta.json', {**deck(good_card()), 'priority': 0, 'tags': 'first', 'kind': 'chat'})), '--pack', 'proj')
ok(code == 1 and 'priority must be' in out and 'tags is a list' in out and 'kind on a deck' in out, 'a deck file\'s own priority, tags and kind are checked', out)
code, out = run('check', str(write('d/meta2.json', {**deck(good_card()), 'priority': 2, 'tags': ['waiting'], 'kind': 'board'})), '--pack', 'proj')
ok(code == 0 and 'Is it a typo' not in out, 'and good ones pass without a warning', out)
sent_first = json.loads((clone / 'packs/proj/decks/first.json').read_text(encoding='utf-8'))
ok(sent_first.get('updated', '').endswith('Z'), 'riffle deck dates a deck, for the phone\'s Newest order', sent_first.get('updated'))
code, out = run('status', '--pack', 'proj')
ok('first / first' in out and 'report' in out and 'answer first' in out, 'status shows each deck\'s kind and tags', out)
owed_before = out
code, out = run('archive', 'proj', 'first')
ok(code == 0 and json.loads((clone / 'packs/proj/order.json').read_text(encoding='utf-8'))['decks']['first'].get('archived', '').endswith('Z'), 'archive marks a deck archived, with the time', out)
code, out = run('status', '--pack', 'proj')
ok('ARCHIVED' in out, 'status says so', out)
code, out = run('archive', 'proj', 'first', '--undo')
ok('archived' not in json.loads((clone / 'packs/proj/order.json').read_text(encoding='utf-8'))['decks'].get('first', {}), 'and --undo brings it back, nothing deleted', out)
ok((clone / 'packs/proj/decks/first.json').exists(), 'the deck itself is never touched')
phone_sends('2026-11-02T12-04-00-000Z-arc.json', {'eid': 'a1', 'deck': 'second', 'at': later, 'type': 'archive', 'archived': True})
code, out = run('answers', '--pack', 'proj')
ok('They archived this deck.' in out, 'answers says when they archived one on the phone', out)
code, out = run('status', '--pack', 'proj')
ok(any('second' in l and 'ARCHIVED' in l for l in out.splitlines()), 'and status counts it archived', out)

print('Their own decks')
mine_deck = {'v': 1, 'id': 'menu-ideas', 'title': 'Menu ideas', 'topic': 'first', 'created': '2026-11-11T10:00:00.000Z', 'updated': '2026-11-11T10:05:00.000Z', 'cards': [
    {'id': 'k1', 'kind': 'idea', 'text': 'The settings button is hard to reach', 'created': '2026-11-11T10:00:00.000Z', 'updated': '2026-11-11T10:00:00.000Z'},
    {'id': 'k2', 'kind': 'picture', 'text': 'Like this', 'images': ['answers/img/pic1.jpg'], 'drawings': {'answers/img/pic1.jpg': 'their picture answers/img/pic0.jpg'}, 'created': '2026-11-11T10:01:00.000Z', 'updated': '2026-11-11T10:01:00.000Z'},
    {'id': 'k3', 'kind': 'link', 'url': 'https://example.com/colours', 'text': 'For the colours', 'created': '2026-11-11T10:02:00.000Z', 'updated': '2026-11-11T10:02:00.000Z'},
    {'id': 'k4', 'kind': 'card', 'address': 'proj/first/a', 'label': 'A title', 'text': 'This one again', 'created': '2026-11-11T10:03:00.000Z', 'updated': '2026-11-11T10:03:00.000Z'},
    {'id': 'k5', 'kind': 'idea', 'text': 'Never mind this', 'removed': '2026-11-11T10:04:00.000Z', 'created': '2026-11-11T10:04:00.000Z', 'updated': '2026-11-11T10:04:00.000Z'},
]}
(other / 'packs/proj/mine').mkdir(parents=True, exist_ok=True)
(other / 'packs/proj/mine/menu-ideas.json').write_text(json.dumps(mine_deck), encoding='utf-8')
git(other, 'add', '-A')
git(other, 'commit', '-q', '-m', 'their own deck')
git(other, 'pull', '-q', '--rebase', 'origin', 'main')
git(other, 'push', '-q', 'origin', 'HEAD:main')
code, out = run('mine', '--pack', 'proj')
ok(code == 0 and 'menu-ideas: "Menu ideas", topic First, 4 cards' in out, 'riffle mine lists their own decks', out)
ok('k1: Idea (new): "The settings button is hard to reach"' in out and 'k3: Web link (new): https://example.com/colours "For the colours"' in out, 'each card with its kind and words', out)
ok('k4: Riffle card (new): [A title → A project › First › A deck › A title] "This one again"' in out, 'a card of theirs pointing at a card says where it goes', out)
ok('answers/img/pic1.jpg (still uploading) (their drawing over their picture answers/img/pic0.jpg)' in out, 'pictures with their paths, and what a drawing is over', out)
ok('k5' not in out, 'removed cards stay out', out)
code, out = run('mine', '--pack', 'proj', '--all')
ok('k5: Idea [removed]' in out, 'unless asked for, since nothing is deleted', out)
code, out = run('answers', '--pack', 'proj')
ok('their own decks, changed since you last read them' in out and 'Menu ideas' in out, 'answers shows their own decks too', out)
code, out = run('reply', 'proj', 'menu-ideas', 'k1', '--how', 'Moved it to the bottom row.')
replies = json.loads((clone / 'packs/proj/mine-replies.json').read_text(encoding='utf-8'))
ok(code == 0 and replies['menu-ideas/k1']['how'] == 'Moved it to the bottom row.', 'reply answers one of their cards, in mine-replies.json', (out, replies))
code, out = run('reply', 'proj', 'menu-ideas', '--how', 'All of these are in the next round.')
ok(json.loads((clone / 'packs/proj/mine-replies.json').read_text(encoding='utf-8'))['menu-ideas']['how'].startswith('All of these'), 'or the whole deck')
code, out = run('reply', 'proj', 'menu-ideas', 'zz', '--how', 'x')
ok(code == 1 and 'No card zz' in out, 'and refuses a card that is not there', out)
code, out = run('mine', '--pack', 'proj', '--mark-read')
code, out = run('mine', '--pack', 'proj')
ok('Nothing new in their own decks' in out, 'marking them read works', out)
code, out = run('mine', '--pack', 'proj', '--every')
ok('your reply: "Moved it to the bottom row."' in out and 'your reply on the deck' in out, 'and --every shows them all, with your replies', out)
ok(not (clone / 'packs/proj/mine/menu-ideas.json').read_text(encoding='utf-8') != json.dumps(mine_deck), 'their deck file is never written by the writer')

print('A race with the phone')
phone_sends('2026-11-02T12-03-00-000Z-ddd.json', {'eid': 'e11', 'at': later, 'type': 'notes', 'text': 'Landed mid-write'})
# The clone is behind now, and this run mustn't lose either side.
env_clone = clone
git(env_clone, 'config', 'pull.rebase', 'false')
write('d/race.json', deck(good_card('r1')))
code, out = run('deck', str(work / 'd/race.json'), '--pack', 'proj', '--quiet')
ok(code == 0 and (clone / 'answers/2026-11-02T12-03-00-000Z-ddd.json').exists(), 'a deck sent while answers land keeps both', out)

shutil.rmtree(work, ignore_errors=True)
print(f'{failed} failed' if failed else 'all passed')
sys.exit(1 if failed else 0)
