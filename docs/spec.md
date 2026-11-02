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

Five levels, in the usual game rarity colours. Each card's background is a light tint that dark text stays readable on, in every look. Tints are in `style.css`, labels in `js/ui.js`.

| Level | Colour | Used for |
|---|---|---|
| common | white | Everyday things |
| uncommon | yellow | Worth a thought |
| rare | aqua | Matters, costs a lot, but can change later |
| epic | light purple | High importance, or can't be undone |
| legendary | orange-gold | The biggest calls, which shape everything after |

## Style

The gear opens settings, and Style sits at the top of them. **Layout** and **look** are separate choices, so any layout goes with any look. Tapping an option changes a live preview on that screen straight away: a small deck screen and a small home screen, built from the real parts. New installs start with `DEFAULT_LAYOUT` and `DEFAULT_LOOK` in `js/app.js`.

**Layouts.** Each one sets the deck screen, and the home and pack pages follow the same choice. No layout leaves empty room above the card.

| Layout | Deck screen | Home and pack pages |
|---|---|---|
| Two rows | A title line, the labelled buttons directly under it, then the card | Tiles |
| One line | Back, title, count and the buttons as icons share one row, with the card filling everything below | List rows |
| Full screen | The card is the whole screen, so its importance colour fills the phone. Thin progress at the very top, and the row floats on the card's top edge | Big banners |
| Row under the card | Title line, the card, then the labelled buttons under it. The alternative to a top row, for thumb reach | List rows |

In Full screen, a black band sits behind the phone's clock, because iPhones draw the clock in white and the card is light.

**Looks.** Tokens at the top of `style.css`, plus a few surfaces. Cards stay white or their importance tint in all of them.

| Look | What it is |
|---|---|
| Plain dark | Near-black and flat |
| Paper | Light, warm paper, with serif headings and a dark band behind the clock |
| Tabletop | Felt, a wood rail, card boxes for tiles |
| Foil | Dark and shiny, crimped foil boosters for tiles |
| Inventory | Blocky game inventory: hard corners, bevels, slots and a free pixel font |

## Swipes

Dragging moves the top card, which tilts as it goes. A stamp fades in with distance and snaps on where the throw counts. A glow shows on the side it's heading for, and the next card rises underneath. On release the card flies off at the finger's speed, and the next card can be thrown at once.

A throw counts at 27% of the screen's width sideways or 15% of its height up and down, or as a quick flick from 34 pixels. Pulling back before letting go keeps the card. Numbers are in `TUNE` in `js/gesture.js`.

**Breaking through (epic and legendary):** a right swipe has to be held for `TUNE.breakHoldMs` (one second). The card pushes against resistance with a slight tremble. A glow builds at the card's edge and behind it, the stamp grows, and the bar in the pick box fills. At the end it breaks through while the finger is still down: the card punches off to the right with a quick flash. Letting go or pulling back early springs it back and sends nothing, and the glow drains away. Left, down and up stay free. The glint on arrival stays, as a sign to read the card.

## The comment box

Swiping up opens a comment box under a small copy of the card, with the keyboard up. The title and buttons go away, and the card and box share all the height the keyboard leaves. There's no hint line and no close button. From there:

- Throw the small card right or left: sends that answer with the comment.
- Throw it up again: sends the comment alone, as the reader's own suggestion. With nothing typed, it just closes the box.
- Drag down, on the card or on the box: closes the box, drops the keyboard and keeps the text as a chip on the card. Tapping the chip reopens it. A normal down swipe after that is IDK with the comment.

Drafts survive closing the app.

The box and the notes pad are `contenteditable="plaintext-only"` rather than form fields, in the hope iPhones then leave out the autofill bar above the keyboard. Autocorrect, dictation and pasting work as usual.

## The buttons

Undo, Notes, Skip and Grid. They act as the finger lifts.

- **Undo:** brings back the last card, from the way it left, and takes back its answer. Also takes back a skip.
- **Notes:** a scratchpad for the whole deck, for thoughts that don't fit the card on screen. It opens as a full sheet. Dragging it down, or tapping its head, returns to the same card. It's sent with the deck, and the same pad is on the end screen.
- **Skip:** sends the card to the bottom of the deck.
- **Grid:** the overview, the same as a pinch, for when only one hand is free.

## The overview

Pinching a card, or Grid, lays out every card in the deck on a grid: its short title, its importance colour, and whether and how it was answered, with a mark if there's a comment. Tapping one goes to it. An answered card shows what was said, and throwing it again changes the answer. It also has a way to the deck's notes and a way to send the whole deck back at any point.

## Details

Up and down are swipes, so a card can't scroll. The face has a size limit, and tapping flips the card to its back: longer explanation, numbers and pictures, scrolling, with swipes off. If a card doesn't fit its face on a small phone, the type steps down.

## Endings and rewards

Kept quiet on purpose.

- **Deck:** a stamp, the tally counting up, the notes pad, and two choices: "Deck's done" or "Replan from the base". No confetti.
- **Next in a stack:** "Deck's done" deals the next deck in the stack straight away.
- **Topic:** clearing every deck in a topic gets a small pop, because a busy pack may rarely be empty.
- **Pack:** clearing everything gets one short modest burst, and the dashboard shows the pack as cleared until new cards arrive. Both are gone in about a second, with plain words.

## Messages

Nothing floats over the screen, so nothing can cover the buttons or a card's words. A short message sits in the title line in place of the count, and can be tapped: "Update ready", or "Not sending", which opens settings. The first screen's status line says the same at full length.

## Storage and sync

- **App code:** a public repo served by GitHub Pages. It holds no project content.
- **Content and answers:** a private repo, `riffle-data`. The format is in [format.md](format.md).
- **Connecting:** the phone reads and writes the private repo through GitHub's API, with a fine-grained key that reaches only that repo. The person makes the key and pastes it into the app, once. The app checks it can read and write, with a real test write, and refuses to keep a key that can really open any other private repo.
- **Offline:** a service worker keeps the app on the phone. A pack's decks and pictures come down when there's signal. Answers wait in a queue with a count on the dashboard.
- **Sending:** at most one batch every 15 seconds, plus when the app is hidden, comes back or signal returns. Each batch is a new file, so nothing can collide with whoever is writing decks.
- **When sending fails, it says why.** A refusal from GitHub gives the status code and what to do, on the first screen, in the title line ("Not sending") and in settings. One miss counts as no signal; three in a row while the phone says it's online counts as a problem and says so. Settings shows how many have been sent and when, and has Send now, which reports what happened. Every call gives up after 25 seconds, so a call frozen with the page can't hold up the ones after it.
- **The built-in Feel test** needs no key. Anything typed in it (comments, notes, drafts) is sent, tagged `demo: true`. Plain swipes with no words stay on the phone. Its page lists everything written there, with Send these and Copy, and each word is marked once sent, so nothing goes twice. "Start the Feel test again" takes two steps, says what it clears, queues any unsent words first and keeps them listed.

## Nothing typed gets lost

- **Every write goes into a backup list first.** It's in `localStorage`, which is synchronous, and a write leaves the list only once the database has it. Typing writes straight away, not after a pause, so a killed app keeps what was on screen. On the next start, whatever is left moves back into the database. Reads see the backup first.
- **A lost database connection** gets reopened, and the write retried once. iPhones can drop the connection while the app is in the background.
- **If saving still fails,** or there's no database at all (a private window), the title line says "Not saving on this phone", and the first screen and settings say why. The words stay in the backup, and go back as soon as it works. A deck whose saved progress can't be read won't open, rather than start fresh over it.
- **Hiding or closing the app** runs one handler: it saves the deck, queues notes and drafts, then sends.
- **Notes** go about 1.5 seconds after typing stops, and **drafts** (comments on a card not thrown yet) about 5 seconds after, each only if changed. At every start, the app goes through every deck's saved state and queues any notes or drafts that haven't gone, including drafts on cards no longer in the deck.
- **What can still go:** the phone dying in the moment between a keystroke and the backup write, or the browser clearing its own data. Settings says whether the browser has promised to keep it.

On iPhone, the app has to be added to the Home Screen: Safari and the Home Screen app keep separate data, and Safari can clear a site's data when it isn't used for a while. iPhones only send while the app is open. Web pages can't vibrate there, so the tick uses a switch-control trick that works on recent versions, and does nothing otherwise.

## For testing

On a local test server only: `?api=` points the app at a stand-in for GitHub, and `?insets=59,34` pretends to have an iPhone's top and bottom safe areas, to check the true spacing.

## Still to build

Option cards; the writer's side (commands to make decks, shrink pictures, pick icons, read answers, deal cards back as second tries, show the reader what's been read); a real pictures test.
