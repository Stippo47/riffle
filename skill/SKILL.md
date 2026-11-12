---
name: riffle
description: Ask the person questions, give them reports and get their answers through Riffle, the swipe app on their phone, instead of long messages. Use when a project that uses Riffle (it has a .riffle-pack file, or they've said so) has questions, reports or designs for them; when they say a deck or Riffle answers are done, or ask you to check Riffle; and when marking a card handled or answering one of their thoughts.
---

# Riffle

Riffle is a phone app for answering one card at a time by swiping. You write decks as files. They swipe on the bus, and you read what came back. It works for any project, and needs nothing running: decks and answers live in a private git repo.

**Levels:** a **pack** is a project. Inside a pack are **topics**, and each topic has **decks** of **cards**. Each pack has one **Misc** deck for one-offs. Decks in a topic can be **stacked**, so a report is read before the questions it leads to.

**Once a project uses Riffle:** questions go in decks, and chat is only for what's urgent. Reports go in decks too, with a brief summary in chat saying a new deck is up, rather than a long report.

Every command is `python "$HOME/.claude/skills/riffle/riffle.py" <command>`, written below as `riffle`. It finds the data repo's clone by itself, or set `RIFFLE_DATA`.

A project names its pack with one line in a `.riffle-pack` file at its root. Work only in your own project's pack, though `riffle status` shows them all.

## Every session

```
riffle answers              what came back since you last read
riffle answers --mark-read  the same, and records it as read, which the app's settings show
riffle redeal               handled cards they answered, and cards sent back to you
riffle status               every deck, and what's owed
```

## Making a deck

Write a deck file, and run:

```
riffle check my-deck.json   look before sending. Takes several files or a folder, and changes nothing
riffle fit my-deck.json     how each card should fit the smallest iPhone
riffle deck my-deck.json    checks, shrinks pictures, sends, and notifies the phone
riffle misc my-card.json    one-offs join the Misc deck instead of making a deck of one
riffle topic garden --title "Garden" --icon flowers --color "#2fa56f"
riffle pack my-project --title "My project" --icon chest
riffle icons potion         search the game-icons library by word
```

The file format is in `format.md`, next to this file. A deck looks like this:

```json
{
  "title": "Paths and gates",
  "topic": "garden",
  "order": 1,
  "cards": [
    {
      "id": "gates",
      "kind": "question",
      "rarity": "common",
      "title": "Gates",
      "text": "Should gates close by themselves?",
      "why": "Otherwise they get left open and the animals wander off, but a closing gate can catch someone walking through.",
      "pick": "Yes, after ten seconds, and never while someone's in the way.",
      "details": "Longer text for the back of the card.\n\nBlank lines make paragraphs.",
      "images": ["pictures/gates.png"]
    }
  ]
}
```

Add `"stack": "some-name"` to decks in a topic that should be dealt one after another, a report first. `order` sets which comes first. Picture paths are relative to the deck file, and `riffle deck` shrinks and copies them, keeping up to 2000 pixels so they can be zoomed into. A path starting `img/` that isn't beside the deck file means a picture already in the pack.

**Films.** `"videos": ["clips/walk.mp4"]` sits beside `images`, on a card or a part, and a board item can have `"video"` instead of `"image"`. They play muted and looping on the phone, and can be scrubbed, slowed down and drawn on. `riffle deck` keeps a small H.264 mp4 as it is, turns anything else into one under 2 MB with no sound, and makes a poster from it, all with ffmpeg. Give `{"src": "...", "poster": "..."}` to choose the poster. Without ffmpeg only mp4s go, with no poster. Use films for motion that a still can't show, and keep them short: a few seconds that loop.

**Parts.** A report, question or design can be in `parts`, each with its own `id`, a `title` and its own `text`, `images` or `videos`. They mark and comment on each part by itself, apart from their swipe on the whole card. Use them for a stage of work with several things in it, so they can point at the one that's off instead of writing which. The face lists the first four titles, so keep them short.

```json
{ "id": "walk", "kind": "report", "title": "The walk", "text": "The walk, in three parts.", "why": "Mark any part that's off.",
  "parts": [
    { "id": "feet", "title": "Feet", "text": "They stay planted now.", "videos": ["clips/feet.mp4"] },
    { "id": "hips", "title": "Hips", "text": "A little sway.", "images": ["pictures/hips.png"] }
  ] }
```

**Links.** Any words on a card can link to another card, deck or part, so a report can point at the question it answers: `riffle link <pack> <deck> <card> [part]` prints the text to paste, like `[Gates](riffle:proj/paths/gates)`. `check` warns about a link to something that isn't there.

### Writing cards

If a card is technical with no context, they'll send it back. So:

- **Each card stands alone.** Assume they've never seen the last one.
- **Say what it changes for them,** in `why`, in everyday words. No internal names, no jargon you haven't explained.
- **Questions and designs always carry your pick.** `check` refuses them otherwise.
- **The face is short.** Longer goes in `details`, on the card's back, with pictures. As a guide: `title` 26 characters, `text` 110, `why` 300, `pick` 150. `check` warns past those. It also estimates the whole card on the smallest iPhone, and warns if it needs the smallest type or won't fit. A card that won't fit has the end of its description cut, with the whole of it on the back.
- **Never name a swipe direction.** They can swap those. Say "add a comment", or nothing. `check` refuses "swipe right" and the like.
- **Pick the importance honestly:**

| rarity | colour | when |
|---|---|---|
| common | white | everyday |
| uncommon | yellow | worth a thought |
| rare | aqua | matters, costs a lot, can change later |
| epic | light purple | high importance, or can't be undone. Going with your pick takes a held swipe |
| legendary | gold | shapes everything after. Rarely |

**Kinds:**

- `question`: what you want to know, with your pick.
- `report`: "this is what happened", with no pick. They say good, problem, or that they don't follow. A "don't follow" mostly needs nothing back: it just tells you where they are.
- `design`: your design for something, to approve, send back, or add to.
- `options`: 2 to 4 options, each with an `id` and `label`, and `pick` naming your choice. They tap some and swipe.
- `board`: any number of pictures to pick from, 60 or more is fine. `items` is a list, each with an `id`, a short `label`, an `image`, and optionally `text`. `pick` lists your choices. They tap the card to open the grid, tap a picture to zoom into it, tick the ones they like, then swipe. Use this instead of one big picture of many things, which can't be seen well enough. `riffle deck` makes the thumbnails from the whole picture, and says what the board costs to download. Tiles are square and never crop, so where the whole picture won't read small, like two views stacked in one tall image, give the item its own `thumb`: a square of the part that matters. `riffle deck` keeps it.

## Reading what comes back

`swipe` in the data is what they meant, not which way they swiped.

- **go, good, yes, fine:** do it.
- **workshop, problem, rethink, redo:** don't go with that. Work on it, then deal it back. On option cards and boards, what they ticked is the direction to redo in.
- **idk, huh:** they need more context. Add it and deal it back, or decide it yourself if it's technical. If they say idk twice on the same card, decide it yourself and say so.
- **comment on its own:** their own suggestion. Read it.
- **Comments and notes** are often the most useful part. Read every one. Pictures are listed with their path in the clone: open them.
- **Links** in their words point at a card, like `[Gates](riffle:proj/paths/gates)`, made with the link button. `riffle answers` writes each out as where it goes: `[Gates → My project › Garden › Paths › Gates]`. "Like this one" with a link means that card.
- **Drawings** are pictures they drew on, to circle or arrow what they mean. `riffle answers` lists each with what it was drawn over. Open it: the circle is the point of the comment.
- **Parts** show under their card: `part feet (Feet): PROBLEM, "they slide"`. A part can be marked or commented on without the card being swiped. `riffle redeal` lists parts marked problem or huh.
- **Deck: replan** means the whole deck's premise is off. Rethink it from the base. **Started over** means they want to go through it again.
- **Feel test** lines are test answers, but they're still their words. See them with `riffle answers --pack feel-test`.

Log what comes back the way your project logs what they say.

## Dealing a card back, and marking it handled

```
riffle second-try <pack> <deck> <card> --why "..." --pick "..."   a new version, unanswered again
riffle handled <pack> <deck> <card> --how "One or two plain sentences."
riffle handled <pack> <deck> <card> --undo
riffle thought <pack> <thought-id> --how "One or two plain sentences."
```

**Handled** is for when a card's answer became clear some other way: they said so elsewhere, or later work settled it. The card stays in the deck and isn't owed, they see your conclusion with a green tick, and they can still answer it. Workshop means they don't like the conclusion. Marking it again with a new `--how` is a new conclusion, and it's dealt again.

**Thoughts** are general notes they file in a pack, outside any deck. They show up in `riffle answers`. Answer them with `riffle thought`, or by acting on them.

## Notifications

They turn these on in the app's settings. `riffle deck`, `misc`, `second-try` and `handled` then notify the phone. Each says where it's from (the pack and topic), the deck's title, its kind and its cards, or the card dealt back, and a tap on it opens that deck or card. At most one goes every 10 minutes. Anything sent sooner waits and is named in the next one, which a small process left behind sends when the 10 minutes are up, so nothing lands silently. The number on the icon is the cards owed. `--quiet` skips it, and `riffle notify --title "..." --body "..." [--url ./#open=pack/deck]` sends one by hand.

The signing key lives in `~/.riffle/vapid.json`, on this machine only, outside every repo. Never copy it into a repo. Without it, notifications don't send and everything else still works.
