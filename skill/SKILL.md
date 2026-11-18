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
riffle answers                       what came back since you last read, their own decks included
riffle answers --deck <d> --deck <e> only your decks, in the deck's own order, with what's still owed
riffle answers --deck <d> --mark-read  and records those as read: only yours, so the pack's other sessions still see theirs
riffle redeal                        handled cards they answered, and cards sent back to you
riffle status                        every deck, what's owed, its kind, priority, tags, whether it's archived, and any wait that fired unheard
riffle mine                          their own decks, changed since you last read them (--every for all)
riffle tidy                          what's left lying around: finished decks not archived, decks never touched, thoughts with no answer. Changes nothing
```

Mark read what you've read, with `--deck` for your own decks, so `answers` stays short for everyone and their phone's "Last read by the writer" is true.

**Addresses.** A card, deck or part can be named by its address, `pack/deck/card`, as links on the phone are: `riffle handled proj/paths/gates --how "…"`. `handled`, `second-try`, `reply`, `archive`, `order` and `link` all take it; the older form with separate words still works.

## What to answer first, and archiving

Their pack's page sorts decks for them. Tell them what to answer first:

```
riffle order <pack> <deck> --priority 1         answered first; 2 next, and so on
riffle order <pack> <deck> --tag first          also: waiting (on them), working (on it yourself)
riffle order <pack> <deck> --untag working --no-priority --kind report
riffle archive <pack> <deck>                    out of the way, at the end of the page. --undo brings it back
```

- Give the deck that unblocks your work priority 1, and tag what you're waiting on them for `waiting`. Tag a deck you're still adding to `working`.
- `kind` (report, questions, board) is worked out from the cards; set it when that's wrong.
- **Archive** decks that are fully answered or handled, once a session is over and they've left the app for a while. They have said they don't mind. Nothing is deleted, an archived deck's cards stop counting as owed, and they can bring it back. They can archive one themselves too, which `riffle answers` reports.
- **Clear up after yourself.** At the end of a session, run `riffle tidy --pack <pack>` and archive your own decks it lists as finished. Leave other sessions' decks to them. A deck it lists as done with a card owed again had an answer taken back on the phone: look before archiving it.
- These live in `packs/<pack>/order.json`, so sending a deck again doesn't undo them. A deck file can also carry `priority`, `tags` and `kind`.

## Their own decks

They can make decks of their own in a pack, for feedback and requests: ideas in words, pictures (with drawing), web links, and links to Riffle cards. They're written to `packs/<pack>/mine/`, which only the phone writes: never edit those files.

```
riffle mine [--pack p] [--every] [--all]        read them. --all includes cards they removed
riffle mine --mark-read                         and record them as read
riffle reply <pack> <deck> [card] --how "..."   answer the deck, or one card. --undo takes it back
```

Read them like comments: they're requests. Reply on a card when you've acted on it, so they see it's done, the way a handled card shows a conclusion.

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

**Films.** `"videos": ["clips/walk.mp4"]` sits beside `images`, on a card or a part, and a board item can have `"video"` instead of `"image"`. They play muted and looping on the phone, and can be scrubbed, stepped frame by frame, slowed down, drawn on and pinned. For a film of several views side by side, name them from left to right, `{"src": "clips/walk.mp4", "sides": ["Before", "After"]}`, so a pin on it can be read as which view. `riffle deck` keeps a small H.264 mp4 as it is, turns anything else into one under 2 MB with no sound, and makes a poster from it, all with ffmpeg. Give `{"src": "...", "poster": "..."}` to choose the poster. Without ffmpeg only mp4s go, with no poster. Use films for motion that a still can't show, and keep them short: a few seconds that loop.

**Sound.** `"audio": ["clips/voice.wav"]` sits beside `images` and `videos`, on a card or a part, and a board item can have `"audio"` in place of a picture. Nothing plays by itself: they tap a clip to hear it, one at a time, and films stay silent. `riffle deck` keeps a small AAC `.m4a` or MP3 as it is, turns anything else into mono AAC at about 64 kbps with ffmpeg, and says what the clips weigh. Give `{"src": "...", "label": "..."}` to name a clip on a card. Without ffmpeg only m4a and mp3 go. Use sound for what has to be heard, like picking a voice, and keep clips to a few seconds.

**Parts.** A report, question or design can be in `parts`, each with its own `id`, a `title` and its own `text`, `images`, `videos` or `audio`. They mark and comment on each part by itself, apart from their swipe on the whole card. They read the parts on the card's back. Use them for a stage of work with several things in it, so they can point at the one that's off instead of writing which. The face lists the first four titles, so keep them short. Don't explain how to mark parts: the buttons are under every part, in the card's own words.

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
- **Show what you ask about.** A card that asks how something looks, moves or sounds carries the picture, film or sound. Otherwise they spend an answer saying they can't judge it. `check` warns when one seems to have nothing to look at.
- **On a card with films or pictures to judge,** invite pins in the `why`: "Pin anything that looks wrong." A pin gives you the frame and the spot.
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
- `report`: "this is what happened", with no pick. They say GOOD, PROBLEM, or DECENT: fine, but they're not happy with it yet, or don't quite follow. Ask which if it matters. Answers from before 0.11.0 say HUH? instead, meaning they didn't follow.
- `design`: your design for something, to approve, send back, or add to.
- `options`: 2 to 4 options, each with an `id` and `label`, and `pick` naming your choice. They tap some and swipe.
- `board`: any number of pictures to pick from, 60 or more is fine. Their phone calls it a **Spread**: say that to them. `items` is a list, each with an `id`, a short `label`, an `image`, and optionally `text`. `pick` lists your choices. They tap the card to open the grid, tap a picture to zoom into it, tick the ones they like, then swipe. Use this instead of one big picture of many things, which can't be seen well enough. `riffle deck` makes the thumbnails from the whole picture, and says what the board costs to download. Tiles are square and never crop, so where the whole picture won't read small, like two views stacked in one tall image, give the item its own `thumb`: a square of the part that matters. `riffle deck` keeps it. An item can be a sound instead, with `audio` in place of `image`, for picking a voice or a sound by ear: a tap on its tile plays it there in the grid, and they tick it and comment on it like any other item. Its `text` shows when it's played.

## Reading what comes back

`swipe` in the data is what they meant, not which way they swiped.

**Words win.** A mark with words means what the words say; a mark alone means what the mark says. Many answers carry words, so read every one before acting on the mark.

- **go, good, yes, fine:** do it. With words, often "yes, but": a change or a question. Do it with that change, and answer the question.
- **workshop, problem, rethink, redo:** don't go with that. Work on it, then deal it back. On option cards and boards, what they ticked is the direction to redo in.
- **idk, decent** (and **huh** from before 0.11.0): "not quite". With words, it's whatever the words say: most often a different answer, a question back, or "I can't judge this as shown" (then show them: a picture, a film, more context). Alone: on a report, not happy yet; on anything else, they need more context, or decide it yourself if it's technical. If they say idk twice on the same card, decide it yourself and say so.
- **comment on its own:** their own suggestion. Read it.
- **A card in parts:** the parts are the answer. Read them first. The swipe on the card mostly means they're done with it: a GOOD there with one part a problem means "going the right way, but fix that part". `riffle answers` sums the parts on the card's line.
- **Comments and notes** are often the most useful part. Read every one. Pictures are listed with their path in the clone: open them.
- **Links** in their words point at a card, like `[Gates](riffle:proj/paths/gates)`, made with the link button. `riffle answers` writes each out as where it goes: `[Gates → My project › Garden › Paths › Gates]`. "Like this one" with a link means that card.
- **Things brought in**: a comment (or their notes) can hold references to a picture, a film at a moment, a drawing, or quoted words from a card, like `[Film at 0:12](riffle:...)`. They see each as a small blue chip. `riffle answers` writes out which picture or film and when: look at it there.
- **Drawings** are pictures they drew on, to circle or arrow what they mean. `riffle answers` lists each with what it was drawn over. Open it: the circle is the point of the comment.
- **Pins** are spots they pointed at, on a picture or on one frame of a film, each with a few words: `pin 2 on part feet (Feet), film img/feet.mp4 at 0:01.10, frame 27 of 48, 62% across, 71% down: "the foot slides here"`. They show under their card. A pin means "this, exactly here", so never guess at it from the words: look at it. See Pins below.
- **Parts** show under their card: `part feet (Feet): PROBLEM, "they slide"`. A part can be marked or commented on without the card being swiped. `riffle redeal` lists parts marked problem, decent or huh.
- **Board items** can have comments of their own, from the full-screen look at one, or for a sound from the strip under the grid: `item f1 (Spinning): "the spin wobbles"`, under their board.
- **Still owed** under a deck lists the cards in it not answered yet, so you know whether to wait.
- **Deck: replan** means the whole deck's premise is off. Rethink it from the base. **Started over** means they want to go through it again.
- **Feel test** lines are test answers, but they're still their words. See them with `riffle answers --pack feel-test`.

Log what comes back the way your project logs what they say.

### Pins: look at the spot they pointed at

On any picture or film they can drop a pin: a tap on the spot, on the very frame, with a few words. It's how they say what "it's just wrong" can't.

```
riffle pins --deck <deck>                 every pin on the deck, in words
riffle pins --deck <deck> --out <folder>  and each as two pictures, with pins.txt listing them
riffle pins --deck <deck> --card <card>   one card's
riffle pins --all                         ones made on an earlier version of a card too
```

- For each pin, `--out` writes the whole picture, or the exact frame of the film that was on their screen, with a red ring on the spot (`…-frame.jpg`), and a close-up around it (`…-close.jpg`). **Open both** before you change anything: the ring is the point, and the words are only a hint at it.
- The list says the frame ("frame 27 of 48"), the spot in pixels, and which half of the picture it's in. On a side-by-side film that tells you which view. Give such a film `"sides": ["Before", "After"]` in its deck, and the list names the view instead.
- If you've replaced a film since they pinned it, the pictures still come from the one they saw, and the list says so.
- A second try of a card leaves its old pins behind: they were about the version before. `--all` shows them.
- When you deal a fix back, say which pins it answers, by number: "Pin 2: the foot stays planted now."
- Needs ffmpeg for the pictures. Without `--out` it only lists.

## Waiting for them, then carrying on

When your work is held up until they answer, don't stop and wait to be told. Send the deck, then run `riffle wait` **in the background** (the Bash tool's `run_in_background`), and end your turn. The command polls GitHub about once a minute and costs no tokens while it waits. When it exits, you're woken.

```
riffle wait --deck <a> --deck <b>         the decks you need: every one must be finished
riffle wait --topic <topic-id>            any deck in your topic being finished
riffle wait                               the whole pack: decks, thoughts and their own decks
riffle wait --deck <a> --on deck,thought  thoughts too
riffle started --deck <a> --note "..."    once you've read what woke you and you're starting
riffle started --deck <a> --stop          when you've finished that work
```

**When it wakes you.** They decide when you start, not you:
- **Deck's done** (or **Replan this deck**) on every deck you named, then 15 minutes with nothing from their phone, in any pack, so they've put it down. `--quiet-minutes <minutes>` changes the 15 (`--quiet <minutes>` still works here, but everywhere else `--quiet` means no notification). A deck counts as finished only if they finished it after its cards last changed.
- **Deal in now**, at a deck's end or in its grid, wakes you at once, past the quiet minutes and past any deck you still need. They use it to let you start on part of a deck.
- With more than one `--deck`, their phone shows each of those decks' ends saying what else you need, so they know why you haven't started.
- Thoughts and their own decks belong to the whole pack. A wait narrowed with `--deck` or `--topic` leaves them to the pack's other writers, unless you name them with `--on`.
- A plain swipe never wakes you. Neither does the Feel test. Only what reaches GitHub after the wait starts counts as new; `--since <time>` counts earlier things too.

**When you wake, you're not obliged to work.** Read what came back with `riffle answers`. If it settles your direction, run `riffle started` with the decks and a few words: their phone gets "Started on …", and the decks show Being worked on. That notification is how they know you picked up, so always send it. If a card that decides the direction is still open, don't guess: deal it back or ask, wait again, and say why with `riffle notify`. When the work is done, `riffle started --stop` takes Being worked on off.

**If your session restarted while waiting**, the wait may have fired with nobody listening. It leaves a note until a writer runs `riffle started`: `riffle status` shows it as A WAIT FIRED, and `riffle wait` on that pack returns at once with what fired. Check `riffle status` at the start of every session.

- **Exit 0** prints what woke it. **Exit 2** means nothing came within `--hours` (12 by default): run it again if you still need it.
- The wait only reads from GitHub, and never touches the clone's working folder, so you can send other decks while it runs. It writes once at the start, to mark decks needed together.
- This needs the session left open and the PC awake.

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
