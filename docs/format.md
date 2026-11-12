# The data repo's format

Everything the phone reads and writes lives in a private repo, branch `main`.

```
packs/<pack-id>/pack.json
packs/<pack-id>/decks/<deck-id>.json
packs/<pack-id>/thoughts.json
packs/<pack-id>/order.json
packs/<pack-id>/mine/<deck-id>.json
packs/<pack-id>/mine-replies.json
packs/<pack-id>/img/<picture>
answers/<time>-<random>.json
answers/img/<id>.jpg
push/<time>-<device>.json
read.json
```

## pack.json

```json
{
  "title": "A project",
  "order": 1,
  "color": "#2f8fe0",
  "icon": "<svg ...>...</svg>",
  "topics": [
    { "id": "first-topic", "title": "First topic", "order": 1, "color": "#2fa56f", "icon": "<svg ...>...</svg>" }
  ]
}
```

`icon` is SVG text; only its paths are used, and they take the colour around them. A name from `js/icons.js` also works.

## A deck

```json
{
  "title": "What happened this week",
  "topic": "first-topic",
  "stack": "this-week",
  "order": 1,
  "cards": [ ]
}
```

- **topic:** which topic it sits under. A deck with `"misc": true`, or with no topic, is the pack's Misc deck.
- **stack:** decks in a topic with the same stack name are dealt one after another, by `order`.
- **kind:** `report`, `questions` or `board`, shown on the pack's page. Left out, it's worked out from the cards.
- **priority:** a whole number from 1, the writer's order for answering it: 1 first, in the phone's Suggested order.
- **tags:** words shown on the deck. `first` shows as "Answer first", `waiting` as "Waiting on you", `working` as "Being worked on"; any other word shows as it is.
- **archived:** a time, if the writer archived it.
- **updated:** when its cards last changed. `riffle deck` sets it, for the phone's Newest order.

## order.json

The writer's say on decks, written by `riffle order` and `riffle archive`, so sending a deck again never undoes it. What's here wins over the same field in the deck's file.

```json
{ "decks": { "this-week": { "priority": 1, "tags": ["first", "working"], "kind": "report", "archived": "2026-11-11T20:00:00.000Z" } } }
```

## Their own decks: mine/<deck-id>.json

Written by the phone, never by the writer. One file per deck of theirs.

```json
{
  "v": 1, "id": "mwd4...", "title": "Menu ideas", "topic": "first-topic",
  "created": "2026-11-11T10:00:00.000Z", "updated": "2026-11-11T10:05:00.000Z",
  "cards": [
    { "id": "k1", "kind": "idea", "text": "The settings button is hard to reach", "created": "...", "updated": "..." },
    { "id": "k2", "kind": "picture", "text": "Like this", "images": ["answers/img/<id>.jpg"], "drawings": { "answers/img/<id>.jpg": "their picture answers/img/<id>.jpg" } },
    { "id": "k3", "kind": "link", "url": "https://example.com", "text": "For the colours" },
    { "id": "k4", "kind": "card", "address": "a-project/this-week/rivers", "label": "Rivers", "text": "This one again" },
    { "id": "k5", "kind": "idea", "text": "Never mind", "removed": "2026-11-11T10:04:00.000Z" }
  ]
}
```

`kind` is `idea`, `picture`, `link` or `card`. A card or deck with `removed` was deleted on the phone: it's kept, but not shown. Pictures upload like photos. `topic` can be null.

## mine-replies.json

The writer's replies on their own decks, written by `riffle reply`. A key is a deck id, or `deck-id/card-id`.

```json
{ "menu-ideas": { "how": "All of these are in the next round.", "at": "..." }, "menu-ideas/k1": { "how": "Moved it.", "at": "..." } }
```

## A card

```json
{
  "id": "rivers",
  "version": 1,
  "kind": "question",
  "rarity": "common",
  "title": "Rivers",
  "text": "The question, or what happened.",
  "why": "What it changes, in plain words.",
  "pick": "The writer's pick. Leave it out on a report.",
  "details": "Longer text for the back.\n\nBlank lines make paragraphs.",
  "images": ["img/rivers.jpg"],
  "videos": [{ "src": "img/rivers-flow.mp4", "poster": "img/poster/rivers-flow.jpg" }]
}
```

- **id:** stays the same for the card's whole life.
- **version:** raise it to deal the card back as a second try. It then counts as unanswered again.
- **kind:** `question`, `report`, `design`, `options` or `board`.
- **rarity:** `common`, `uncommon`, `rare`, `epic` or `legendary`.
- **title:** short, for the overview grid.

A card's face reads at a glance, so as a guide: `title` 26 characters, `text` 110, `why` 300, `pick` 150, and a handled card's `how` 300. Anything longer goes in `details`, which has no limit. What fits depends on the whole card: `riffle check` estimates it on the smallest iPhone and warns. If a card still doesn't fit, the app cuts the end of its description, with a fade, and puts the whole of it on the back.

**Never name a direction on a card.** People can swap what each way of swiping does, so "swipe right" may be wrong for them. Say "add a comment", or say nothing.

### Links

Any words, on a card or in an answer, can link to a pack, deck, card or part: `[Label](riffle:pack/deck/card/part)`, with as many of the address's parts as are wanted, each URL-encoded if it holds a slash. The phone shows the label as a tappable link, and a plain `https://` address as a link to the web. `riffle link <pack> <deck> <card> [part]` prints one to paste. The words they type can hold links the same way, made with the comment box's link button.

What they bring to a deck's notes is a link with a query on its address: `?pic=<path>` for a picture, `?film=<path>&t=<seconds>` for a moment of a film, and `?pic=<path>&drawing=answers/img/<id>.jpg` for their drawing over a picture, which is also one of the notes' `images`. Words they brought are quoted just before the link. `riffle answers` writes all of these out.

### Films

`videos` sits beside `images`, on a card or a part. Each is a path, or `{ "src": ..., "poster": ... }`. They play on the card's back muted, looping and inline, and a tap pauses or plays one. The corner button opens one full screen, where it can be scrubbed, slowed to a half or a quarter, zoomed into and drawn on.

- **src** is the film. The phone wants a small H.264 mp4. `riffle deck` keeps one that's already that and under 2 MB, and turns anything else into one, with no sound, using ffmpeg.
- **poster** is a still for before it plays, and for tiles. `riffle deck` makes one from early in the film, in `img/poster/`, or shrinks one you give like any picture. Without ffmpeg there's no poster, and the phone shows the film's first frame.
- A card's films come down ahead, like its pictures, after them. A board's come when they're looked at.

### Parts

A report, question or design can be in **parts**: sections that are each read, marked and commented on by themselves, apart from the card's own swipe.

```json
{
  "id": "walk",
  "kind": "report",
  "title": "The walk",
  "text": "The walk, in three parts.",
  "why": "Mark any part that's off.",
  "parts": [
    { "id": "feet", "title": "Feet", "text": "They stay planted now.", "images": ["img/feet.jpg"] },
    { "id": "hips", "title": "Hips", "text": "A little sway.", "videos": ["img/hips.mp4"] },
    { "id": "head", "title": "Head", "text": "It stays level." }
  ]
}
```

- Each part needs its own `id` and a `title`, and some `text`, `images` or `videos`. The face shows the first four titles, each on one line, so keep them under 40 characters. Twelve parts is a lot for one card.
- A tap turns the card over, and its back holds the parts: the card's words, details and pictures on top, then each part with Good, Problem and Huh? (the card's own words for go, workshop and idk) and a comment box of its own.
- Parts don't go on option cards or boards.

### Option cards

```json
{
  "id": "plots",
  "kind": "options",
  "title": "Plot shapes",
  "text": "Which of these would you keep?",
  "pick": "b",
  "options": [
    { "id": "a", "label": "Round", "text": "A short description.", "image": "img/round.jpg" },
    { "id": "b", "label": "Bent" }
  ]
}
```

`pick` is the id of the writer's marked option, and can be left out. Up to four options.

### Boards

Picking from many pictures, with any number of items.

```json
{
  "id": "gates",
  "kind": "board",
  "title": "Gate styles",
  "text": "Which of these gates would you keep?",
  "why": "They'd all cost about the same to build.",
  "pick": ["g3"],
  "items": [
    { "id": "g1", "label": "Plain", "image": "pictures/plain.png" },
    { "id": "g2", "label": "Arched", "image": "pictures/arched.png", "text": "A longer note, shown when it's looked at." },
    { "id": "g3", "label": "Stacked views", "image": "pictures/stacked.png", "thumb": "pictures/stacked-square.png" },
    { "id": "g4", "label": "Swinging", "video": "pictures/swing.mp4" }
  ]
}
```

- **pick** lists the writer's marked items, and can be left out. With nothing ticked, going takes these. If there are none, it just bounces.
- **image** is the picture.
- **video** makes the item a film. `riffle deck` gives it its poster as its `image`, and a thumbnail from that, so a board of films and pictures looks the same in the grid, with a play mark on the films. Looking at one plays it.
- **thumb** is the small one the grid loads first, and can be left out. Give your own when the whole picture won't read at that size, like two views stacked in one tall image: a square of the part that matters. `riffle deck` shrinks yours to 360 pixels if it's over, and keeps it. If there's none, it makes one from the whole picture. A deck file put in the repo by hand with no `thumb` loads the full pictures in the grid, slowly.
- Tiles are square and never crop. A thumbnail that isn't square shows whole, with space beside it. So a square one fills its tile.
- The phone brings down a board's thumbnails ahead of time. Its full pictures come one at a time, when they're looked at.

### Pictures

Paths are relative to the deck file. A path starting `img/` that isn't beside the deck file means a picture already in the pack, under `packs/<pack>/`. `riffle deck` keeps up to 2000 pixels on the long side, as a JPEG, so a picture can be zoomed into. That's about half a megabyte for a detailed one. It leaves a JPEG already that small untouched. A board's thumbnails are 360 pixels, a few tens of kilobytes each.

### Handled cards

Add `handled` to a card when its answer has become clear some other way. Don't remove the card.

```json
"handled": { "how": "One or two plain sentences on how it was settled.", "at": "2026-11-02T12:00:00.000Z" }
```

- It stays in its place in the deck, with a green tick in the grid.
- It isn't owed: it's left out of every count, and a deck can finish without it.
- It's still dealt, after the deck's owed cards, so the reader sees the conclusion. An answer newer than `at` means it's done.
- A new `at` means a new conclusion, so it's dealt again, showing what they said last time.
- Their answer means: `right` is fine, `left` is they don't like the conclusion, `down` is they don't follow.

## thoughts.json

Answers to a pack's thoughts, written by whoever reads them. Keys are the `id` of a `thought` event.

```json
{
  "the-thought-id": { "handled": { "how": "One or two plain sentences.", "at": "2026-11-02T12:00:00.000Z" } }
}
```

## An answers file

Written by the phone, one new file per batch. A file named `connect-check-…` is only the app testing its key, and can be ignored.

```json
{
  "v": 1,
  "device": "phone-ab12cd",
  "sentAt": "2026-11-02T12:00:00.000Z",
  "events": [ ]
}
```

Every event has `v`, `eid` (unique), `at`, `pack`, `topic` and `deck`. Words typed in the built-in Feel test are sent with `demo: true`: they're test answers, but they're someone's words, so read them.

| type | Extra fields | Meaning |
|---|---|---|
| `answer` | `card`, `cardVersion`, `title`, `kind`, `swipe`, `stamp`, `comment`, and sometimes `handledAt`, `selected`, `byPick` | A card was answered |
| `undo` | `card`, `of` (the `eid` it takes back) | That answer no longer stands |
| `notes` | `text` | The deck's scratchpad, whole. The latest one wins |
| `draft` | `text`, `card`, `title`, and on a board `selected` | Unfinished words or ticks on a card not answered yet. The latest wins, and an answer on that card replaces it. The card may no longer be in the deck |
| `draft` with `thought: true` | `text`, with `deck` and `card` null | A thought being typed, not filed yet. The latest wins, and filing replaces it |
| `thought` | `id`, `text`, with `deck` null | A general thought about the pack |
| `deck` | `verdict` (`done`, `replan`), `tally`, `answered`, `total` | The deck as a whole. `replan` means rethink it from the base; the answers still stand |
| `part` | `card`, `cardVersion`, `title`, `kind`, `part`, `partTitle`, `mark`, `stamp`, `comment` | What's said about one part of a card. `mark` is a meaning like `swipe` (`right`, `left` or `down`), or null for none. The latest for a part stands, whether or not the card is answered |
| `archive` | `archived` | They archived the deck on the phone (`true`), or brought it back (`false`). Whichever of this and the writer's `archived` in order.json is later stands |
| `deck-reset` | `keptNotes` | They started the deck over. Answers on this deck from before this no longer stand, though anything they typed was still said. If `keptNotes`, comments came back as drafts on their cards, and the notes stayed |

**Pictures.** An `answer`, `part`, `notes`, `thought` or `draft` event can carry `images`, a list of paths like `answers/img/<id>.jpg`. Pictures upload apart from the words, so one can arrive a little after the event that names it. Only the event that stands counts: a picture named by nothing that stands was taken back.

**Drawings.** A picture they drew on is one of those `images`, with the drawing over the picture. The event then also has `drawings`, which maps its path to what it was drawn over: a picture's path in the pack, or a board item's or option's label with its path.

**`swipe` is the meaning, not the direction.** `right` is go, good, yes or fine. `left` is workshop, problem, rethink or redo. `down` is idk. `up` is a comment on its own. Someone may have swapped which way of swiping does which, and that never shows here.

**On option cards and boards,** `selected` lists option or item ids. With `swipe: right` it means only those. `byPick: true` means nothing was tapped, so it's the writer's pick. With `swipe: left` it means even those weren't good, redo in their direction, and an empty list means all of them are bad.

**`handledAt`** on an answer says which conclusion it was about.

## read.json

The writer's note of what's been read, per pack. The phone shows the latest time in its settings.

```json
{ "v": 1, "packs": { "a-project": { "at": "2026-11-02T12:00:00.000Z", "files": ["<answers file>"] } } }
```

## A push record

Written by the phone when notifications are turned on or off, one new file each time, under `push/`. The newest record for a `device` is the one that counts. It holds either `subscription`, which the signing machine sends to, or `off: true`.

**Reading answers:** go through events by `at`. Drop any repeated `eid`: if the app closes mid-send, a batch can go out twice. Drop answers named by an `undo`. For each card, the latest answer left stands, and a draft counts only if no answer came after it.
