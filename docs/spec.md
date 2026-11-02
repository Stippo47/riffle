# Riffle: how it behaves

Riffle is a phone web app for answering questions and reading reports one card at a time, by swiping. Whoever writes the cards (usually an AI working on a project) adds them as files; whoever answers them does it from a phone, with or without signal.

## The levels

- **Dashboard:** lists every **pack**. A pack is a project.
- **Pack:** its page groups decks under **topics**. Topics don't depend on each other. Each pack has one **Misc deck** for one-offs, which sits apart at the end.
- **Topic:** several decks. Decks in a topic can be **stacked**: a discussion sits on the questions it leads to, and finishing one deals the next.
- **Deck:** a run of cards.
- **Card:** one question, report or design, seen one at a time.

## Card kinds

| Kind | What it is | Right | Left | Down |
|---|---|---|---|---|
| question | A question with the writer's pick | GO: go with the pick | WORKSHOP: not that, work on it | IDK: need more context |
| report | What happened, with nothing asked | GOOD | PROBLEM: something's wrong with where this is going | HUH?: not following. Mostly so the writer knows; it doesn't need much back |
| design | The writer's design for something, to approve, deny or add to | YES | RETHINK | IDK |

Up always opens the comment box (stamp NOTE). Stamp words live in `js/ui.js`.

Option cards (several options plus a question; tap the ones wanted, then swipe them all) come in a later stage. Right means only those; left means even those weren't good, redo in their direction. With nothing tapped, right takes the writer's marked pick and left means all of them are bad.

## Importance

Five levels, in the usual game rarity colours. Each card's background is a light tint that dark text stays readable on. Tints are in `style.css`, labels in `js/ui.js`.

| Level | Colour | Used for |
|---|---|---|
| common | white | Everyday things |
| uncommon | yellow | Worth a thought |
| rare | aqua | Matters, costs a lot, but can change later |
| epic | light purple | High importance, or can't be undone |
| legendary | orange-gold | The biggest calls, which shape everything after |

## Swipes

Dragging moves the top card, which tilts as it goes. A stamp fades in with distance and snaps on where the throw counts. A glow shows on the side it's heading for, and the next card rises underneath. On release the card flies off at the finger's speed, and the next card can be thrown at once.

A throw counts at 27% of the screen's width sideways or 15% of its height up and down, or as a quick flick from 34 pixels. Pulling back before letting go keeps the card. Numbers are in `TUNE` in `js/gesture.js`.

**Breaking through (epic and legendary):** a right swipe has to be held for `TUNE.breakHoldMs` (one second). The card pushes against resistance and trembles more and more. Cracks spread from a point right of the middle, a glow builds around the edge and behind the card, the stamp grows, and the bar in the pick box fills. At the end it breaks through while the finger is still down: the card comes apart along its cracks, with a flash, a burst of bits and a knock to the table. Letting go or pulling back early springs it back and sends nothing, and the cracks heal. Left, down and up stay free. The glint on arrival stays, as a sign to read the card.

## The comment box

Swiping up opens a comment box under a small copy of the card, with the keyboard up. From there:

- Throw the small card right, left or down: sends that answer with the comment.
- Throw it up again: sends the comment alone, as the reader's own suggestion. With nothing typed, it just closes the box.
- The X closes the box and keeps the text. The card then shows the text as a chip, and tapping that reopens it.

Drafts survive closing the app.

## The row above the card

Undo, Notes, Skip and Grid sit directly above the card, which stands low on the screen so a thumb can reach. They act as the finger lifts.

- **Undo:** brings back the last card, from the way it left, and takes back its answer. Also takes back a skip.
- **Notes:** a scratchpad for the whole deck, for thoughts that don't fit the card on screen. One tap there and one tap back, in the same place. It's sent with the deck, and the same pad is on the end screen.
- **Skip:** sends the card to the bottom of the deck.
- **Grid:** the overview, the same as a pinch, for when only one hand is free.

## The overview

Pinching a card, or Grid, lays out every card in the deck on a grid: its short title, its importance colour, and whether and how it was answered, with a mark if there's a comment. Tapping one goes to it. An answered card shows what was said, and throwing it again changes the answer. It also has a way to the deck's notes and a way to send the whole deck back at any point.

## Details

Up and down are swipes, so a card can't scroll. The face has a size limit, and tapping flips the card to its back: longer explanation, numbers and pictures, scrolling, with swipes off. If a card doesn't fit its face on a small phone, the type steps down.

## Endings and rewards

- **Deck:** a stamp, the tally counting up, a burst of confetti, the notes pad, and two choices: "Deck's done" or "Replan from the base".
- **Next in a stack:** "Deck's done" deals the next deck in the stack straight away.
- **Topic:** clearing every deck in a topic gets its own moment, because a busy pack may rarely be empty.
- **Pack:** clearing everything gets the biggest one, and the dashboard shows the pack as cleared until new cards arrive.

## Looks

Three, as swappable tokens at the top of `style.css`: foil boosters, tabletop and quiet. Settings switches between them. `DEFAULT_LOOK` in `js/app.js` sets the one a new install starts with.

## Storage and sync

- **App code:** a public repo served by GitHub Pages. It holds no project content.
- **Content and answers:** a private repo, `riffle-data`. The format is in [format.md](format.md).
- **Connecting:** the phone reads and writes the private repo through GitHub's API, with a fine-grained key that reaches only that repo. The person makes the key and pastes it into the app, once. The app checks it can read and write, and refuses to keep a key that can see any other private repo.
- **Offline:** a service worker keeps the app on the phone. A pack's decks and pictures come down when there's signal. Answers wait in a queue with a count on the dashboard.
- **Sending:** at most one batch every 15 seconds, plus when the app is hidden and when signal returns. Each batch is a new file, so nothing can collide with whoever is writing decks.
- **The built-in Feel test** needs no key. Its answers wait on the phone until it's connected, then they're sent marked as demo.

On iPhone, the app has to be added to the Home Screen: Safari and the Home Screen app keep separate data, and Safari can clear a site's data when it isn't used for a while. iPhones only send while the app is open. Web pages can't vibrate there, so the tick uses a switch-control trick that works on recent versions, and does nothing otherwise.

## Still to build

Option cards; the writer's side (commands to make decks, shrink pictures, pick icons, read answers, deal cards back as second tries, show the reader what's been read); a real pictures test.
