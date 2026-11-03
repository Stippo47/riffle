# The data repo's format

Everything the phone reads and writes lives in a private repo, branch `main`.

```
packs/<pack-id>/pack.json
packs/<pack-id>/decks/<deck-id>.json
packs/<pack-id>/thoughts.json
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
  "images": ["img/rivers.jpg"]
}
```

- **id:** stays the same for the card's whole life.
- **version:** raise it to deal the card back as a second try. It then counts as unanswered again.
- **kind:** `question`, `report`, `design` or `options`.
- **rarity:** `common`, `uncommon`, `rare`, `epic` or `legendary`.
- **title:** short, for the overview grid.

A card's face reads at a glance, so as a guide: `title` 26 characters, `text` 110, `why` 300, `pick` 150, and a handled card's `how` 300. Anything longer goes in `details`, which has no limit. What fits depends on the whole card: `riffle check` estimates it on the smallest iPhone and warns. If a card still doesn't fit, the app cuts the end of its description, with a fade, and puts the whole of it on the back.

**Never name a direction on a card.** People can swap what each way of swiping does, so "swipe right" may be wrong for them. Say "add a comment", or say nothing.

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
| `draft` | `text`, `card`, `title` | Unfinished words on a card not answered yet. The latest wins, and an answer on that card replaces it. The card may no longer be in the deck |
| `draft` with `thought: true` | `text`, with `deck` and `card` null | A thought being typed, not filed yet. The latest wins, and filing replaces it |
| `thought` | `id`, `text`, with `deck` null | A general thought about the pack |
| `deck` | `verdict` (`done`, `replan`), `tally`, `answered`, `total` | The deck as a whole. `replan` means rethink it from the base; the answers still stand |
| `deck-reset` | `keptNotes` | They started the deck over. Answers on this deck from before this no longer stand, though anything they typed was still said. If `keptNotes`, comments came back as drafts on their cards, and the notes stayed |

**Pictures.** An `answer`, `notes`, `thought` or `draft` event can carry `images`, a list of paths like `answers/img/<id>.jpg`. Pictures upload apart from the words, so one can arrive a little after the event that names it. Only the event that stands counts: a picture named by nothing that stands was taken back.

**`swipe` is the meaning, not the direction.** `right` is go, good, yes or fine. `left` is workshop, problem, rethink or redo. `down` is idk. `up` is a comment on its own. Someone may have swapped which way of swiping does which, and that never shows here.

**On option cards,** `selected` lists option ids. With `swipe: right` it means only those. `byPick: true` means nothing was tapped, so it's the writer's pick. With `swipe: left` it means even those weren't good, redo in their direction, and an empty list means all of them are bad.

**`handledAt`** on an answer says which conclusion it was about.

## read.json

The writer's note of what's been read, per pack. The phone shows the latest time in its settings.

```json
{ "v": 1, "packs": { "a-project": { "at": "2026-11-02T12:00:00.000Z", "files": ["<answers file>"] } } }
```

## A push record

Written by the phone when notifications are turned on or off, one new file each time, under `push/`. The newest record for a `device` is the one that counts. It holds either `subscription`, which the signing machine sends to, or `off: true`.

**Reading answers:** go through events by `at`. Drop any repeated `eid`: if the app closes mid-send, a batch can go out twice. Drop answers named by an `undo`. For each card, the latest answer left stands, and a draft counts only if no answer came after it.
