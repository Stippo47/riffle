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
    env = {**os.environ, 'RIFFLE_DATA': str(clone), 'HOME': str(home), 'USERPROFILE': str(home), 'PYTHONIOENCODING': 'utf-8'}
    r = subprocess.run([sys.executable, str(RIFFLE), *args], cwd=cwd or work, capture_output=True, text=True, encoding='utf-8', env=env)
    return r.returncode, r.stdout + r.stderr


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
ok(sent['cards'][0]['images'] == ['img/big.jpg'], 'pictures get copied in')
ok(max(Image.open(clone / 'packs/proj/img/big.jpg').size) == 1400, 'and shrunk')
code, out = run('deck', str(write('d/second.json', deck(good_card(), order=2))), '--pack', 'proj')
ok('one went out' in out, 'a second deck straight after makes no second notification', out)
ok(git(clone, 'log', '-1', '--format=%B').stdout.strip().endswith('<noreply@anthropic.com>'), 'commits carry the attribution')
fresh = work / 'fresh'
subprocess.run(['git', 'clone', '-q', str(bare), str(fresh)], capture_output=True, check=True)
ok((fresh / 'packs/proj/decks/first.json').exists() and (fresh / 'packs/proj/img/big.jpg').exists(), 'it all reached the remote')
code, out = run('deck', str(write('d/refused.json', deck(good_card(why=None, pick=None)))), '--pack', 'proj')
ok(code == 1 and 'Not sent' in out and not (clone / 'packs/proj/decks/refused.json').exists(), 'a bad deck is not sent', out)
code, out = run('deck', str(write('d/name.json', deck(good_card(why=f'Made by {getpass.getuser()} today.')))), '--pack', 'proj')
ok(code == 1 and 'Stopped' in out and 'd/name.json' not in git(clone, 'status', '--short').stdout, "the computer user's name can't go in", out)
git(clone, 'checkout', '-q', '--', '.')
for f in (clone / 'packs/proj/decks').glob('name.json'):
    f.unlink()
code, out = run('misc', str(write('d/one.json', good_card('m1'))), '--pack', 'proj')
ok(code == 0 and json.loads((clone / 'packs/proj/decks/misc.json').read_text(encoding='utf-8'))['misc'] is True, 'misc makes the Misc deck', out)
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
code, out = run('answers', '--pack', 'proj')
ok(code == 0 and 'GO' in out and '“but”' in out, 'an answer with its comment, curly quotes and all', out)
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
ok('still writing' not in out, 'an answer replaces its draft', out)
code, out = run('status', '--pack', 'proj')
ok('first / first: 1 of 3 owed' in out and 'replan' in out, 'status counts what is owed', out)
phone_sends('2026-11-02T12-01-30-000Z-pic.json',
            {'eid': 'p1', 'at': '2026-11-02T12:01:30.000Z', 'type': 'notes', 'text': 'With a picture', 'images': ['answers/img/nope.jpg']})
code, out = run('answers', '--pack', 'proj')
ok('answers/img/nope.jpg (still uploading)' in out, 'pictures are listed, and one not arrived yet says so', out)

print('Dealing back')
code, out = run('redeal', '--pack', 'proj')
ok('Need more context' in out and 'proj first c' in out and 'Deck sent back to replan' in out, 'the re-deal list shows what came back', out)
code, out = run('second-try', 'proj', 'first', 'c', '--why', 'Plainer words now.')
ok(code == 0, 'second-try', out)
card = next(c for c in json.loads((clone / 'packs/proj/decks/first.json').read_text(encoding='utf-8'))['cards'] if c['id'] == 'c')
ok(card['version'] == 2 and card['why'] == 'Plainer words now.', 'bumps the version and changes the words')
code, out = run('status', '--pack', 'proj')
ok('first / first: 2 of 3 owed' in out, 'and it counts as owed again', out)
code, out = run('redeal', '--pack', 'proj')
ok('proj first c' not in out, 'and leaves the re-deal list', out)
code, out = run('second-try', 'proj', 'first', 'c', '--why', 'Swipe left on this.')
ok(code == 1 and 'Not changed' in out, 'the checks apply here too', out)
git(clone, 'checkout', '-q', '--', '.')
code, out = run('handled', 'proj', 'first', 'b', '--how', 'Settled by the other work.')
ok(code == 0, 'handled', out)
card = next(c for c in json.loads((clone / 'packs/proj/decks/first.json').read_text(encoding='utf-8'))['cards'] if c['id'] == 'b')
ok(card['handled']['how'] == 'Settled by the other work.' and card['handled']['at'].endswith('Z'), 'marks it, with the time')
code, out = run('status', '--pack', 'proj')
ok('1 of 2 owed, 1 handled' in out, 'a handled card is not owed', out)
code, out = run('redeal', '--pack', 'proj')
ok('Handled, no answer yet' in out and 'proj first b' in out, 'it shows as not answered yet', out)
later = '2099-01-01T00:00:00.000Z'
phone_sends('2026-11-02T12-02-00-000Z-ccc.json',
            {'eid': 'e10', 'at': later, 'type': 'answer', 'card': 'b', 'cardVersion': 1, 'handledAt': card['handled']['at'], 'title': 'A title', 'kind': 'question', 'swipe': 'left', 'stamp': 'WORKSHOP', 'comment': 'I disagree'})
code, out = run('redeal', '--pack', 'proj')
ok('Handled, and they answered' in out and 'WORKSHOP' in out and 'I disagree' in out, 'and then with their answer', out)
code, out = run('handled', 'proj', 'first', 'b', '--undo')
ok(code == 0 and 'handled' not in next(c for c in json.loads((clone / 'packs/proj/decks/first.json').read_text(encoding='utf-8'))['cards'] if c['id'] == 'b'), 'it can be undone', out)
code, out = run('thought', 'proj', 'th1', '--how', 'Done in the next round.')
ok(code == 0 and json.loads((clone / 'packs/proj/thoughts.json').read_text(encoding='utf-8'))['th1']['handled']['how'] == 'Done in the next round.', 'answering a thought', out)
code, out = run('thought', 'proj', 'nope', '--how', 'x')
ok(code == 1 and 'No thought' in out, 'a thought that does not exist is refused', out)

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
