# The data repo's format

Everything the phone reads and writes lives in a private repo, branch `main`.

```
packs/<pack-id>/pack.json
packs/<pack-id>/decks/<deck-id>.json
packs/<pack-id>/img/<picture>
answers/<time>-<random>.json
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
- **kind:** `question`, `report` or `design`.
- **rarity:** `common`, `uncommon`, `rare`, `epic` or `legendary`.
- **title:** short, for the overview grid.

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

Every event has `v`, `eid` (unique), `at`, `pack`, `topic` and `deck`. The built-in Feel test's answers are never sent.

| type | Extra fields | Meaning |
|---|---|---|
| `answer` | `card`, `cardVersion`, `title`, `kind`, `swipe` (`right`, `left`, `down`, `up`), `stamp`, `comment` | A card was thrown. `up` is a comment on its own |
| `undo` | `card`, `of` (the `eid` it takes back) | That answer no longer stands |
| `notes` | `text` | The deck's scratchpad, whole. The latest one wins |
| `deck` | `verdict` (`done`, `replan`), `tally`, `answered`, `total` | The deck as a whole |

**Reading them:** go through events by `at`. Drop any repeated `eid`: if the app closes mid-send, a batch can go out twice. Drop answers named by an `undo`. For each card, the latest answer left stands.
