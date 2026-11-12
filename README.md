# Riffle

Answer questions and read reports one card at a time, by swiping, on a phone. Right, left, down, and up for a comment.

This repo is only the app. Packs, decks and answers live in a separate private repo.

- [docs/spec.md](docs/spec.md): how it behaves
- [docs/format.md](docs/format.md): the file format for decks and answers
- [CREDITS.md](CREDITS.md): icons
- [skill/SKILL.md](skill/SKILL.md): the writer's side, as a Claude Code skill. Install it with `python skill/install.py`

## Running it locally

No build step. Start the test server, which also runs a small stand-in for GitHub:

```
node tests/serve.mjs
```

The app is then at `http://localhost:8787/?api=http://localhost:8788`. With that running, this drives it in headless Edge with real touch input:

```
node tests/e2e.mjs
```

These need nothing running: `python tests/skill_test.py` tries the writer's commands on a throwaway git repo, and `node tests/push.mjs` checks the notification sending.

Films need [ffmpeg](https://ffmpeg.org) on the PATH, for `riffle deck` to make small mp4s and posters, and for the tests that make made-up films. The skill's tests skip theirs without it.

## Changing it

- Tuning numbers for swipes and the break-through hold: `TUNE` in `js/gesture.js`
- Swipe words, the default directions and importance labels: `js/ui.js`
- Colours and looks: the top of `style.css`; layouts: further down it, under each layout's name
- The layouts and looks on offer, and the defaults: the top of `js/app.js`
- Icons: add the SVG to `vendor/`, then run `python tools/build-icons.py`
- Before releasing, change `VERSION` in `sw.js` and `js/app.js`, or phones keep the old copy
