#!/usr/bin/env python3
"""Makes a made-up board through the real `riffle deck`, in a throwaway repo, and prints the clone's
path. It never touches the real data repo. Run by tests/e2e.mjs: make_board.py <folder> <count> [media|sound]
With `media` it makes a pack of films, parts and a board mixing films and pictures instead. With `sound` it
makes a pack with sound on a card, a part and a board. Both need ffmpeg."""
import json
import os
import pathlib
import random
import subprocess
import sys

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
work = pathlib.Path(sys.argv[1])
count = int(sys.argv[2])
media = len(sys.argv) > 3 and sys.argv[3] == 'media'
sound = len(sys.argv) > 3 and sys.argv[3] == 'sound'
source = work / 'source'
source.mkdir(parents=True)
bare, clone, home = work / 'data.git', work / 'clone', work / 'home'
home.mkdir()


def git(where, *args):
    subprocess.run(['git', *args], cwd=where, capture_output=True, check=True)


subprocess.run(['git', 'init', '-q', '--bare', '-b', 'main', str(bare)], check=True)
starter = work / 'starter'
subprocess.run(['git', 'clone', '-q', str(bare), str(starter)], capture_output=True, check=True)
git(starter, 'config', 'user.name', 'Test')
git(starter, 'config', 'user.email', 'test@example.invalid')
(starter / 'README.md').write_text('test\n')
git(starter, 'add', '-A')
git(starter, 'commit', '-q', '-m', 'start')
git(starter, 'push', '-q', 'origin', 'HEAD:main')
subprocess.run(['git', 'clone', '-q', str(bare), str(clone)], capture_output=True, check=True)
git(clone, 'config', 'user.name', 'Test')
git(clone, 'config', 'user.email', 'test@example.invalid')


def picture(path, seed, size=(2400, 2400)):
    """Lots of small strokes on a gradient, so its file size is something like a detailed render's."""
    r = random.Random(seed)
    im = Image.new('RGB', size)
    d = ImageDraw.Draw(im)
    top, bottom = [r.randint(40, 160) for _ in range(3)], [r.randint(40, 160) for _ in range(3)]
    for y in range(size[1]):
        t = y / size[1]
        d.line([(0, y), (size[0], y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)))
    for _ in range(4000):
        x, y = r.randint(0, size[0]), r.randint(0, size[1])
        d.line([(x, y), (x + r.randint(-30, 30), y + r.randint(-30, 30))], fill=tuple(r.randint(0, 255) for _ in range(3)), width=r.randint(1, 3))
    im.save(path, 'PNG', compress_level=1)


# The last three show the shapes a board has to cope with: tall, tall with a thumbnail of its own, and wide.
for i in range(count):
    size = {count - 3: (736, 1406), count - 2: (736, 1406), count - 1: (1406, 736)}.get(i, (2400, 2400))
    picture(source / f'item-{i + 1:02d}.png', i, size)
picture(source / 'wide.png', 999, (3000, 1500))
Image.new('RGB', (600, 600), (220, 30, 40)).save(source / 'own-thumb.png')

deck = {
    'title': 'Boards',
    'topic': 'looking',
    'order': 1,
    'cards': [
        {'id': 'pic', 'kind': 'report', 'title': 'A picture', 'text': 'This card has a picture on its back.', 'why': 'Flip it to look closer.',
         'details': 'Some words to read while typing.\n\n' + ' '.join(['More words to scroll past.'] * 40), 'images': ['source/wide.png', 'source/item-01.png']},
        {'id': 'board', 'kind': 'board', 'title': 'Pick some', 'text': 'Which of these would you keep?', 'why': 'Tap a picture to look closer. Tick the ones you like.',
         'items': [{'id': f'i{n + 1}', 'label': f'Item {n + 1}', 'image': f'source/item-{n + 1:02d}.png', **({'text': 'A few words about this one.'} if n == 0 else {}), **({'thumb': 'source/own-thumb.png'} if n == count - 2 else {})} for n in range(count)]},
        {'id': 'withpick', 'kind': 'board', 'title': 'With my picks', 'text': 'And these two?', 'why': 'Two of them are my picks.', 'pick': ['i2', 'i3'], 'details': 'A longer note about these, for the back of the card.',
         'items': [{'id': f'i{n + 1}', 'label': f'Item {n + 1}', 'image': f'source/item-{n + 1:02d}.png'} for n in range(4)]},
        {'id': 'after', 'kind': 'question', 'title': 'After', 'text': 'A plain card after the boards.', 'why': 'To show nothing else changed.', 'pick': 'Yes.'},
        {'id': 'optpics', 'kind': 'options', 'title': 'Options with pictures', 'text': 'Which of these two?', 'why': 'An option can have a picture.', 'pick': 'a',
         'options': [{'id': 'a', 'label': 'First', 'image': 'source/item-02.png'}, {'id': 'b', 'label': 'Second', 'image': 'source/item-03.png'}]},
    ],
}
deck_file = work / 'boards.json'
deck_file.write_text(json.dumps(deck), encoding='utf-8')
steps = (['pack', 'bp', '--title', 'Picture pack', '--color', '#2f8fe0'],
         ['topic', 'looking', '--pack', 'bp', '--title', 'Looking closely'],
         ['deck', str(deck_file), '--pack', 'bp', '--quiet'])

if media:
    # A made-up film: moving test bars, two seconds, the size of a small render.
    def film(name, seconds=2, size='640x360', pattern='testsrc2'):
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', f'{pattern}=size={size}:rate=24', '-t', str(seconds), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', str(source / name)], check=True)
    film('walk.mp4')
    film('turn.mp4', pattern='smptebars', size='480x480')
    film('spin.mp4', pattern='testsrc', size='400x400')
    film('bars.mp4', pattern='rgbtestsrc', size='320x240')
    films = {
        'title': 'Films and parts',
        'topic': 'films',
        'order': 1,
        'cards': [
            {'id': 'clip', 'kind': 'report', 'title': 'A film', 'text': 'This card has a film on its back.', 'why': 'Flip it to watch.',
             'videos': ['source/walk.mp4'], 'images': ['source/wide.png'], 'details': 'A few words under the film.'},
            {'id': 'parts', 'kind': 'report', 'title': 'In parts', 'text': 'This report has three parts.', 'why': 'Each can be marked and commented on.',
             'parts': [
                 {'id': 'p1', 'title': 'First part', 'text': 'Words only.'},
                 {'id': 'p2', 'title': 'With a picture', 'text': 'A picture to draw on.', 'images': ['source/item-01.png']},
                 {'id': 'p3', 'title': 'With a film', 'text': 'A film to watch.', 'videos': ['source/turn.mp4']},
             ]},
            {'id': 'filmboard', 'kind': 'board', 'title': 'Films and pictures', 'text': 'Which of these do you like?', 'why': 'A board can mix films and pictures.', 'pick': ['f2'],
             'items': [{'id': 'f1', 'label': 'Spinning', 'video': 'source/spin.mp4'}, {'id': 'f2', 'label': 'A picture', 'image': 'source/item-02.png'}, {'id': 'f3', 'label': 'Bars', 'video': 'source/bars.mp4'}]},
            {'id': 'after', 'kind': 'question', 'title': 'After', 'text': 'A plain card after the films.', 'why': 'To show nothing else changed.', 'pick': 'Yes.'},
        ],
    }
    films_file = work / 'media.json'
    films_file.write_text(json.dumps(films), encoding='utf-8')
    steps = (['pack', 'mp', '--title', 'Film pack', '--color', '#d9622b'],
             ['topic', 'films', '--pack', 'mp', '--title', 'Films'],
             ['deck', str(films_file), '--pack', 'mp', '--quiet'])

if sound:
    # Made-up clips: plain tones four seconds long, in the kinds of file a writer might have.
    def tone(name, hz, *extra):
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', f'sine=frequency={hz}:sample_rate=44100', '-t', '4', *extra, str(source / name)], check=True)
    tone('hello.wav', 440, '-ac', '2')
    tone('take-two.m4a', 330, '-c:a', 'aac', '-b:a', '64k')
    tone('part.wav', 550)
    tone('low.wav', 220)
    tone('high.m4a', 880, '-c:a', 'aac', '-b:a', '64k')
    tone('face.wav', 660)
    sounds = {
        'title': 'Sound',
        'topic': 'voices',
        'order': 1,
        'cards': [
            {'id': 'heard', 'kind': 'report', 'title': 'A sound', 'text': 'This card has two sounds on its back.', 'why': 'Flip it to listen.',
             'audio': ['source/hello.wav', {'src': 'source/take-two.m4a', 'label': 'The second take'}], 'details': 'A few words under the sounds.'},
            {'id': 'sparts', 'kind': 'report', 'title': 'In parts', 'text': 'This report has two parts.', 'why': 'One of them has a sound.',
             'parts': [
                 {'id': 'p1', 'title': 'Words', 'text': 'Words only.'},
                 {'id': 'p2', 'title': 'With a sound', 'text': 'A sound to hear.', 'audio': ['source/part.wav']},
             ]},
            {'id': 'voices', 'kind': 'board', 'title': 'Pick a voice', 'text': 'Which of these voices do you like?', 'why': 'Tap one to hear it.', 'pick': ['v2'],
             'items': [{'id': 'v1', 'label': 'Low', 'audio': 'source/low.wav', 'text': 'A few words about this voice.'}, {'id': 'v2', 'label': 'High', 'audio': 'source/high.m4a'},
                       {'id': 'v3', 'label': 'With a face', 'audio': 'source/face.wav', 'image': 'source/item-01.png'}, {'id': 'v4', 'label': 'A picture', 'image': 'source/item-02.png'}]},
            {'id': 'after', 'kind': 'question', 'title': 'After', 'text': 'A plain card after the sounds.', 'why': 'To show nothing else changed.', 'pick': 'Yes.'},
        ],
    }
    sound_file = work / 'sound.json'
    sound_file.write_text(json.dumps(sounds), encoding='utf-8')
    steps = (['pack', 'sp', '--title', 'Sound pack', '--color', '#7a5be0'],
             ['topic', 'voices', '--pack', 'sp', '--title', 'Voices'],
             ['deck', str(sound_file), '--pack', 'sp', '--quiet'])

env = {**os.environ, 'RIFFLE_DATA': str(clone), 'HOME': str(home), 'USERPROFILE': str(home), 'PYTHONIOENCODING': 'utf-8'}
riffle = ROOT / 'skill' / 'riffle.py'
for args in steps:
    r = subprocess.run([sys.executable, str(riffle), *args], cwd=work, capture_output=True, text=True, encoding='utf-8', env=env)
    if r.returncode:
        sys.exit(r.stdout + r.stderr)
    last = r.stdout
print(json.dumps({'clone': str(clone), 'said': last}))
