# Riffle: how it behaves

Riffle is a phone web app for answering questions and reading reports one card at a time, by swiping. Whoever writes the cards (usually an AI working on a project) adds them as files; whoever answers them does it from a phone, with or without signal.

## The levels

- **Dashboard:** lists every **pack**. A pack is a project.
- **Pack:** its page has a **Thoughts** row at the top, then their **own decks**, then the writer's decks in the order chosen: Suggested, Importance, Newest, or grouped under **topics**. Topics don't depend on each other. Each pack has one **Misc deck** for one-offs, which sits apart at the end of Topics. **Archived** decks sit in a closed section at the very end.
- **Topic:** several decks. Decks in a topic can be **stacked**: a discussion sits on the questions it leads to, and finishing one deals the next.
- **Deck:** a run of cards.
- **Card:** one question, report or design, seen one at a time.

## The first screen

Every pack is a row with its icon, its name and what's left. The order is theirs: a pack held still for a moment lifts, follows the finger, and the others make room; let go, it stays there. A quick drag still scrolls the list, and a plain tap still opens the pack. The order is kept on the phone. A pack with no place yet, a new project, goes first.

**Icons.** A pack's icon is the writer's (`riffle pack --icon`, or one picked by its name when the pack is made). Tapping the icon on the pack's page offers every icon the packs and topics already use, and the one picked stays on this phone. "Use the writer's icon" puts theirs back.

**Reload.** The round arrows beside Search check every pack for new and changed decks now, as opening the app does. The arrows turn while it checks, the line under the title says so, and afterwards it says when the packs were last checked.

**Send, Working and Done.** Once everything in a pack is answered, its row has a **Send** button, and so do its page and the "cleared" screen. Send wakes the pack's writers at once, as Deal in now does for one deck, and the row says **Sent**. When a writer picks it up (`riffle started`), the row says **Working**, since when, and the pack's page says on what. When the writer has done what it can and is waiting on them again (`riffle wait`, or `riffle started --stop`), it says **Done**. A writer that says Working and isn't heard from for three hours, from any send to the pack, shows **Last heard** and when, so a writer that stopped never leaves a pack saying Working. Working shows with what's left too, while they answer. The writers' side of this is in format.md, under order.json.

**Done decks tidy away.** A deck finished with Deck's done three days ago moves to Archived by itself, as if Archive had been pressed, and the writer hears so. Bring back undoes it, and a deck that was ever archived or brought back is never tidied away again. Decks never opened are never archived.

## A pack's page

**The order.** A row of four: Suggested, Importance, Newest and Topics. The choice is kept.

| Order | What comes first |
|---|---|
| Suggested (to start with) | The writer's priority (1 first), then decks tagged answer first, then waiting on you, then the rest by topic. Finished decks go last |
| Importance | The deck with the most important card still owed (legendary, then epic and so on), then the most epic and legendary cards, then the most owed |
| Newest | The deck's date, newest first, with how long ago. A deck sent before 0.8.0 has no date of its own, so it counts from when it first came to this phone |
| Topics | The page as it was before: grouped under topics, in the layout's own style |

Suggested, Importance and Newest are lists of full-width rows in every layout, each saying the deck's **kind** (Report, Questions or Board), its topic, the writer's priority as a small number, and its **tags**: "Answer first", "Waiting on you", "Being worked on", or any other word the writer uses. In Topics, rows show the kind and tags under the title where there's room, and tiles leave them out.

**Done and left.** A deck is done once "Deck's done" was pressed and nothing in it is owed; its row says Done. If a card becomes owed again after that (an Undo, or a writer's second try), the row says "1 left" again, and the deck counts as not finished until it's answered: in Suggested order, in a stack, and for the topic and pack. "Sent back" (Replan) stands whatever is owed. Cards not answered are "left" everywhere ("46 cards left" on the first screen, "Not answered" on the deck's grid); "waiting" only ever means something not sent yet, apart from the writer's tag "Waiting on you".

A deck's kind is what the writer says, or else what its cards are: all reports is a report, mostly boards is a board, anything else is questions.

**Archived.** A deck the writer archives, or they archive from its overview ("Archive this deck"), leaves the list for a closed Archived section at the end of the page, with a count. Opening the section lists them, each with Bring back. An archived deck can still be opened and answered. What it owes leaves every count: the pack, the first screen and the number on the icon. Whichever said it last, the writer or the phone, stands. Nothing is ever deleted.

**Their own decks** are listed under Thoughts, with a row to make a new one, in every pack and the Feel test. The screen for a cleared pack or topic has "New deck of your own" too. See Your own decks below.

## Card kinds

| Kind | What it is | Right | Left | Down |
|---|---|---|---|---|
| question | A question with the writer's pick | GO: go with the pick | WORKSHOP: not that, work on it | IDK: need more context |
| report | What happened, with nothing asked | GOOD | PROBLEM: something's wrong with where this is going | DECENT: fine, but not happy yet, or not quite following. Before 0.11.0 this read HUH?, and answers given then still read so |
| design | The writer's design for something, to approve, deny or add to | YES | RETHINK | IDK |
| options | Several options and a question: tap the ones wanted, then swipe | GO: only those. With nothing tapped, the writer's marked pick. With no pick either, it just bounces | REDO: even those weren't good, redo in their direction. With nothing tapped, all of them are bad | IDK |
| board | Any number of pictures, films or sounds to pick from, 60 or more. See Boards below | As for options | As for options | IDK |

Comment always opens the comment box. These words live in `js/ui.js`. The table names the default directions; see Swipe directions below.

**Cards in parts.** A report, question or design can be in parts: a few sections, each read, marked and commented on by itself. See Parts below.

**Handled cards.** A card can be marked as settled, with one or two sentences on how, by whoever writes the deck. It stays in the deck. It has a green band and tick, with the conclusion as the main text and the question smaller above it, so it can be recognised without reading it. Right is FINE, left is WORKSHOP (they don't like the conclusion), down is IDK, and comments work as usual. It isn't owed: counts leave it out, the pack's page shows a quiet "2 handled", and a deck can finish without it. It's still dealt, after everything owed. Skipping it with nothing else owed ends the deck. A new conclusion deals it again, showing what they said last time. Epic and legendary ones still need the hold.

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

The gear opens settings, and Style sits at the top of them. **Layout**, **look** and **while swiping** are separate choices, so any goes with any. Tapping an option changes a live preview on that screen straight away: a small deck screen and a small home screen, built from the real parts. New installs start with `DEFAULT_LAYOUT`, `DEFAULT_LOOK` and `DEFAULT_MARK` in `js/app.js`.

**While swiping.** What shows you what a swipe will do, along with the swipe's colour on the card itself: a border glow and a tint that grow as it's dragged. The colours: go green, workshop orange, down (IDK, DECENT) yellow, comment blue.

| Choice | What shows |
|---|---|
| Edge word (the default) | A small plain word at that edge, with nothing on the card |
| Icon | A round icon at that edge |
| Colour only | Just the glow |
| Stamp | A big stamp on the card |

The word and icon sit at the edge of the card's area rather than the true edge of the screen, so they never cover the title or the buttons in any layout.

**Layouts.** Each one sets the deck screen, the packs page and the page listing a pack's decks. No layout leaves empty room above the card.

| Layout | Deck screen | Packs | Decks in a pack |
|---|---|---|---|
| Two rows | A title line, the labelled buttons directly under it, then the card | Rows with a coloured edge | Big icon tiles, three across, under plain topic headings |
| One line | Back, title, count and the buttons as icons share one row, with the card filling everything below | List rows | One row per deck, under topic headings with icons |
| Full screen | The card is the whole screen, so its importance colour fills the phone. Thin progress at the very top, and the row floats on the card's top edge | Big banners | Tall rows with a coloured edge |
| Row under the card | Title line, the card, then the labelled buttons under it. The alternative to a top row, for thumb reach | List rows | One row per deck, under topic headings with icons |

The Thoughts row sits at the top of a pack's page in all of them. A deck tile shows its topic's icon, and a Misc deck its pack's. The first deck of a stack has a small "Read first" label, until it's done.

In Full screen, a black band sits behind the phone's clock, because iPhones draw the clock in white and the card is light.

**Looks.** Tokens at the top of `style.css`, plus a few surfaces. Cards stay white or their importance tint in all of them.

| Look | What it is |
|---|---|
| Plain dark | Near-black and flat |
| Paper | Light, warm paper, with serif headings and a dark band behind the clock |
| Tabletop | Felt, a wood rail, card boxes for deck tiles |
| Foil | Dark and shiny, crimped foil boosters for deck tiles |
| Inventory | Blocky game inventory: hard corners, bevels, slots and a free pixel font |

## Swipes

Dragging moves the top card, which tilts as it goes. The chosen mark fades in with distance and snaps on where the swipe counts. The card takes on the swipe's colour, a glowing border and a tint that grow with the drag, so it's seen wherever the card goes, even half off the screen. The next card rises underneath. On release the card flies off at the finger's speed, and the next card can be thrown at once.

A throw counts at 27% of the screen's width sideways or 15% of its height up and down, or as a quick flick from 34 pixels. Pulling back before letting go keeps the card. Numbers are in `TUNE` in `js/gesture.js`.

**Breaking through (epic and legendary):** going with the pick has to be held for `TUNE.breakHoldMs` (one second), along whichever direction go is set to. The card pushes against resistance with a slight tremble. A glow builds at the card's edge and over it, the word, icon or stamp grows, and the bar in the pick box fills. At the end it breaks through while the finger is still down: the card punches off with a quick flash. Letting go or pulling back early springs it back and sends nothing, and the glow drains away. The other directions stay free. The glint on arrival stays, as a sign to read the card. The line on the card names the current direction.

**Swipe directions.** Settings has a plus-shaped picture of what each way of swiping does. Tap two to swap them, and Reset puts them back. Answers record what was meant, not which way the finger went, so swapped directions can't be misread. The card, glow and mark follow the way the finger goes. Wording in the Feel test is filled in from the map, and writers never name a direction on a card.

## The comment box

The comment swipe opens a comment box under a small copy of the card, with the keyboard up. The title and buttons go away, and the card and box share all the height the keyboard leaves, with more of it going to the card. The small card keeps its title, description and pick. There's no hint line and no close button. From there, in terms of what each swipe means:

- Go or workshop: sends that answer with the comment.
- Comment again: sends the comment alone, as the reader's own suggestion. With nothing typed, it just closes the box.
- IDK: closes the box, drops the keyboard and keeps the text as a chip on the card. Tapping the chip reopens it. An IDK swipe after that sends IDK with the comment.
- Dragging down on the box itself always closes it, whatever the directions are.

A long description scrolls in its own small box. A vertical drag that starts on it scrolls it, and sideways is still a swipe. If it has nowhere left to scroll that way, the drag is a swipe too, and the title and pick always swipe.

Drafts survive closing the app.

In every box to type in, the link and photo buttons sit in a strip of their own along the box's bottom, and the words scroll above it, never under them. A tap on that strip types in the box.

Opening a box raises the keyboard during the finger's lift that asked for it, and only that one: no later tap anywhere opens a box again.

The box and the notes pad are `contenteditable="plaintext-only"` rather than form fields, in the hope iPhones then leave out the autofill bar above the keyboard. Autocorrect, dictation and pasting work as usual.

## Photos

The comment box, the notes pad and the Thoughts pad each have a photo button in the corner of the box. It's a plain file input, so iPhones offer Take Photo and Photo Library. The picture is shrunk on the phone to about 1600 pixels on its long side, as a JPEG, which also leaves behind where it was taken. It's saved to the phone before its thumbnail shows, and the thumbnail has a way to remove it.

Pictures go when what they're attached to goes: the answer, the thought, or the notes when the pad closes. So until then one can still be taken back, and it's only on the phone. They upload one at a time, apart from the words, so a large file never holds words back, and the first screen and settings count any still waiting. Sent ones stay on the phone for 30 days, then go.

## Notifications

From the Home Screen icon, on iOS 16.4 or newer. Settings has one button, which is the only thing that ever asks for permission, and is also the off switch. The phone writes its subscription to the data repo, and each start checks it's still the one on file. The writer's machine signs and sends, with a signing key that lives only there, in `~/.riffle/vapid.json`, outside every repo. The public half is in `js/push.js`. If that key is ever replaced, change the public half and turn notifications off and on again on the phone.

**What one says.** Its title is where it's from, the pack and topic, like "Golem Forest › Body and motion". Its body is the deck's title, its kind (report, questions or board) and the cards in it. A second try names the card and its deck, and so does a newly handled card. Tapping one opens the app at that deck, or that card.

**Calm, but nothing silent.** At most one every 10 minutes. Anything sent sooner waits, and the next one names it too: "13 new decks: Faces and camera (6), Calls from your words (16), +11 more". A small process on the writer's machine sends that one when the 10 minutes are up, and the next send flushes it if that process didn't get to. A tap on one that names several opens their pack. iPhones don't reliably replace a notification that has the same tag ([WebKit bug 258922](https://bugs.webkit.org/show_bug.cgi?id=258922)), so this never relies on it.

The number on the icon is the cards owed, leaving out the Feel test. The app checks for new decks each time it's opened.

## Typing

A box being typed in is brought into view above the keyboard, in whatever scrolls around it, as it's focused and again once the keyboard is up. A box that's hidden, turned away or scrolled out of sight lets go of its focus, because iPhones otherwise keep drawing its caret over whatever is there. While the keyboard is up, nothing keeps room for the home bar under it.

## Addresses and links

Any pack, deck, card or part has an address, `pack/deck/card/part`. Opening the app with `#open=` and an address goes straight there: a notification's tap does this. Anything no longer there stops at the level above, so a deck that's gone opens its pack.

**Links** are plain text in any words: `[Label](riffle:pack/deck/card/part)`. Wherever words show, on a card's face and back, in its parts, in a comment, a thought or the Feel test's list, a link shows as a small tappable label, and a web address as a link that opens in the browser. A one-line chip shows each link by its label only. In a box being typed in, a link is a short blue chip with its label, the full link hidden in it; a tap on it follows it. Deleting it takes the whole link.

**Following one** goes to that card, its parts open if it names a part. The back button turns into a curved arrow, says where it goes ("Back to Has a link"), and returns to the card the link was on, as it was: its parts open, its comment box open with the words in it. Several links in a row come back one at a time. Going anywhere by any other way, the pack's page or a deck's tile, starts the trail again.

**The link button** sits beside the photo button in every place to type: a comment, a part's comment, notes and Thoughts. It offers, in this order: the card in the mini player, if there is one; this card, part or deck; or "Pick one from a list", every deck in every pack, this pack first, opening to its cards and their parts, with a search box over all of them: packs, decks, cards and parts, by their words. Each card or part in the list has an Open button beside it, to go there instead of linking it, the way a link is followed, so Back comes back to the words being written. The link goes in where the caret was, as if typed, so it's saved like anything typed.

**Search** sits at the top of the first screen and of every pack's page: the same list and search box, over every pack's decks, cards and parts and their own decks and cards too. A result opens that card (or their deck), and Back comes back to where the search began.

## Your own decks

For feedback or requests that don't fit a card the writer made. "New deck of your own" on a pack's page opens an empty deck with its name ready to type, and a row of topics to put it under, or none. Four buttons at the bottom add a card:

| Card | What it holds |
|---|---|
| Idea | Words: an idea, a note or a request |
| Picture | A photo or a picture from the library, straight from the camera button, with words. Tapping a picture opens it full screen with the pen, and a drawing joins the card as a picture of its own |
| Link | A web address, and words on what it's for |
| Card | A card or part from Riffle, picked from the list, shown as a link to it, with words |

Tapping a card opens it to change it: its words, its pictures, the link button, Move up and Move down, Delete (which asks once more), and Done. Everything is kept as it's typed, through the same backup list as a comment, so a closed app or no signal loses nothing. A deleted card leaves the list but stays in the file, marked removed. A deck left with no name and no cards was never made, and goes.

They're written to `packs/<pack>/mine/<deck>.json` in the data repo, a few seconds after a change, when the app is hidden, and when signal comes back. Pictures upload like photos and stay on the phone. If another phone has written the same deck since, the two are merged card by card, newest first, before it goes up, so neither loses anything. The writer reads them with `riffle mine`, and a reply from the writer shows in green on the deck or the card, like a handled card's conclusion.

## Breadcrumbs

The deck's title line reads Pack › Topic › Deck › Card, and each is a way there. Pack goes to the pack's page; Topic goes there at that topic; Deck (with a small grid beside its name) opens the overview, and is the only way there; Card brings the card itself back into view, from its back. The card's crumb follows the card on top. Every crumb shows in full, in one row that scrolls sideways, kept scrolled to its end, where this is; a fade at its left says there's more. That's the same in all four layouts.

## The mini player

A pinch on a card puts the deck into a small floating card in a corner and goes to the pack's page. A pinch on a picture or a film, open full screen, still zooms. At the end of a deck, a pinch anywhere on the end does it too. The small card shows the deck's name, the card's title and what's on it, and its kind; a deck finished when it was shrunk shows dark, like the end of a deck, with "Deck done" and how many were answered. It stays over every screen. Any other deck can be opened and used as usual, comment box and all.

- **Tapping it** brings its deck back full size, at the same card, with its parts or comment box open if they were. If another deck was open, that one goes into the corner in its place, so they swap. Drafts in both are kept, because each deck saves its own as ever.
- **Dragging it** anywhere and letting go, it glides to the nearest of the four corners and stays there. A drag the phone cancels for its own reasons counts where it got to. Dragging it never reaches the card underneath.
- **While the keyboard is up**, it takes the bottom, so the mini player waits at the top of its side. That follows the keyboard itself, not which box has focus, so a box gone with its screen can't keep it up there.
- **Shrinking and growing** are animated: the card shrinks into the corner, and grows from the mini player back to its place. Swapping, one does each.
- It's kept on the phone, so it's still there after the app is closed.

## The buttons

Undo, Notes and Skip. They act as the finger lifts.

- **Undo:** brings back the last card, from the way it left, and takes back its answer. Also takes back a skip. In a deck reached by following a link, it only takes back what was done there since, never an answer from an earlier visit, which may be days old and on a card not on screen. The same can be had everywhere, switched off for now: `localStorage['riffle-undo-reach'] = 'visit'`.
- **Notes:** a scratchpad for the whole deck, for thoughts that don't fit the card on screen. It opens as a full sheet. Dragging it down, or tapping its head, returns to the same card. It's sent with the deck, and the same pad is on the end screen.
- **Skip:** sends the card to the bottom of the deck.
- A pinch on the card puts the deck in the mini player. See The mini player.

## The overview

The deck's name, in the crumbs at the top, lays out every card in the deck on a grid: its short title, its importance colour, and whether and how it was answered, with a mark if there's a comment. Handled cards have a green tick. Tapping one goes to it. An answered card shows what was said, and swiping it again changes the answer. It also has a way to the deck's notes, and two actions on the whole deck, each with a clear second step:

- **Replan this deck:** asks for it to be rethought from the base. The answers stay.
- **Start this deck over:** clears the swipes, and every card is dealt again. The second step offers keeping notes and comments (comments come back as drafts on their cards) or clearing those too. Anything unsent goes first, and anything already sent stays with the writer.

And **Archive this deck**, at once, since it's undone as easily: Bring back on the pack's page, or "Bring this deck back" here on an archived one. See A pack's page.

## Thoughts

A row at the top of every pack's page, always there, needing no deck file. It isn't a deck, because decks end and this doesn't. It opens a screen with a pad on top and earlier thoughts below, newest first, each with its time. Filing one sends it. What's being typed has the same protection as a comment. The writer can answer a thought through a file, and the answer shows on it with the handled look.

## Films

A card or a part can carry films beside its pictures, and a board can mix films and pictures. On a card's back they play by themselves, muted, looping and inline, once the card is flipped, and stop when it's flipped back. A tap pauses or plays one. In parts, a film plays while it's on screen. Each has a poster for before it plays and for tiles, and a board marks its films with a small play sign.

The corner button opens a film full screen, like a picture: pinch to zoom, double tap, drag down to go back. It can be drawn on and pinned there: see Pins below. Under it is a bar: play or pause, a slider to scrub through it, and a speed button that goes 1×, ½×, ¼×. The slider takes a finger anywhere along it, a full finger tall: a touch jumps the film there and pauses it, and the film follows the finger from then on. A tap on the film plays or pauses it, just after a double tap would have counted.

**Frame by frame.** Under that bar is a second row: a button at each end that steps one frame back or on, and repeats while it's held, and between them a strip to slide a thumb along. The strip moves one frame for every few pixels, however long the film is, so it's slow and exact where the bar above is quick. It says which frame of how many, and the time to the hundredth of a second: "Frame 27 of 48 · 0:01.10". A film that's paused, by any of these or by a tap, always rests on the middle of a frame, so the frame on screen is never in doubt. The frame rate comes with the film if `riffle deck` wrote it, and is otherwise measured as the film plays, from the gaps between its frames; until it's known, a step is a thirtieth of a second and the row says only the time. Numbers are at the top of `js/viewer.js`.

A film remembers where it was left, its moment, speed and whether it was playing, while the app is open. Going to the next one on a board and back, or closing it and opening it again, carries on from there.

A card's films come down ahead, after its pictures. A board's come when they're looked at, like its full pictures.

## Sound

A card or a part can carry sound clips beside its pictures and films, and a board's items can be sounds, to pick one by ear. It's kept quiet on purpose. Nothing ever plays by itself, a clip plays at whatever volume the phone is set to, with nothing before or after it, and only one plays at a time. Films stay silent.

**On a card's back, and in a part,** each clip is a row: a round play button, its name, a bar that fills as it plays, and the time beside it. A tap plays it, another pauses it, and one more carries on from there. Tapping a different clip stops the first. Flipping the card back, going to another card, opening the overview or putting the app away stops it. A card's face says how many sounds are on its back, as it does for pictures and videos.

**On a board,** a sound is a tile like any other, with a play button where a picture would be, or over its picture if it has one. A tap plays it there, without leaving the grid: the button turns to pause, and a bar along the tile's foot fills. Its tick and its label pick it, as on any tile. A strip above "Back to the card" names the one last tapped, with its text if it has any, and has a speech bubble for a comment on that item alone, kept and sent like any item's comment. Looking at a picture, or leaving the board, stops the sound. Sounds aren't part of the full-screen look, so next and previous there go between the pictures and films.

**When no sound comes.** An iPhone can leave a Home Screen app silent after it's been reopened ([WebKit bug 291892](https://bugs.webkit.org/show_bug.cgi?id=291892)). A page can't hear itself, so two signs are watched for: the phone refusing to play, and a clip that's meant to be playing while its clock stands still. Either puts "No sound played" on its row or its tile. A refusal says so at once. A still clock says so after a second and a half, and keeps trying for a few seconds more, because sound can be slow to start, through headphones that were asleep for one: if the clock then moves, the words go and the clip plays on, and if it never does, the clip stops. A tap on one that says so tries again with a fresh player. Nothing else about the card is touched. A clip that's silent while its clock runs can't be told from one that's heard.

Clips are small AAC or MP3 files. They come down ahead with a card's pictures, a board's too, and are kept on the phone, so they play with no signal. One that hasn't come down yet is fetched by the tap, and says it needs signal if it can't be. An iPhone only starts sound during a tap, so after a fetch it may say "Tap again to play". Each clip is a plain `<audio>` element made by the tap: see `js/sound.js`.

## Drawing on pictures

Any picture or film opened full screen can be drawn on: on a card's back, a part, an option or a board, and a paused frame of a film. Draw turns the pen on, which brings out four colours (red, yellow, blue, white), undo, clear, and Done.

- With the pen on, one finger draws and two still pinch and move. A second finger landing just after a line starts takes that line back, since a pinch was meant.
- Lines are as wide on screen at any zoom, and drawn in the picture's own pixels, so zooming never moves them.
- Every line is kept on the phone as it ends, so closing the app keeps the drawing, and it's there when the picture opens again.
- Leaving the picture any way at all (Done, the X, next, or dragging down) turns the drawing into a photo: the picture at full size with the lines on it. It goes on the comment it belongs to: the card's, or the part's. Done also opens that comment, so the words can go with it. It's an ordinary photo from then on, so its little cross takes it off.
- The answer says what it was drawn over.

## Pins

A pin is "this spot here": a point on a picture, with a few words. It's the same on a still picture and on a film, where it also belongs to one frame. It's for a fault that's easier to point at than to describe. The pen is still there for circling and arrows.

Any picture or film opened full screen has a **Pin** button beside Draw: on a card's back, a part, an option or a board. On a card's back and in each part, every picture and film also has a small pin button in its corner, which opens it full screen with Pin already on.

- **Dropping one.** Pin turns pinning on, which pauses a film. A tap on the picture drops a numbered ring on that spot, and a box opens under the picture with the keyboard up, for a few words. On a film it's dropped on the frame showing, so the way is to step to the frame first and then tap. Tapping a film that's playing stops it on that frame and pins it.
- **Its words** are kept as they're typed, like a comment's. Done, or a drag down on the box, closes it. Words aren't needed: a pin alone says "here".
- **Seeing them.** The ring leaves the spot itself in view, with its number beside it, and is the same size on screen at any zoom. On a film a pin shows only on its own frame. Every pin on the picture is listed in a row under it, by its number and its words; a tap there goes to that pin's frame and shows its words. The film's bar has a mark at each pin, and a finger near one lands on that pin's moment. The Pin button says how many there are.
- **Moving one.** With its words open, a tap anywhere else on the picture moves it there. With pinning on, it can also be dragged.
- **Removing one.** Its box has Remove. One with words takes a second tap, so a slip can't lose them.
- **Zooming first.** With pinning on, two fingers still pinch and one still moves around a zoomed picture, so a small spot can be zoomed into before it's tapped. A drag never leaves the picture or turns to the next one while pinning is on. Done turns it off.
- **On the card.** A card's back, and each of its parts, says how many pins are on its pictures ("2 pins"); tapping that opens the first, a film at its frame. A part with a pin counts as answered and has its dot on the card's face. A board's tile is marked like one with a comment. The overview marks a card that has pins. None of this is on the card's face where swipes start, so a pin can't get in the way of one.
- **Numbers** run across the whole card, in the order pins were dropped, so "pin 3" means one spot whichever picture it's on.
- **They go** like what's said about a part: on their own, a few seconds after the last change and when a pin's box closes, whether or not the card is swiped. With no signal they wait in the queue with the answers. Starting a deck over keeps them with the notes and comments, or clears them with those.
- In the Feel test a pin with words is sent like anything typed, and one with none stays on the phone.

The writer gets the card, the part, the picture or film, the time and frame, the spot as a share of the width and height, and the words. `riffle pins` turns each into the exact frame with a ring on the spot and a close-up around it.

## A comment on one picture, film or sound

Anywhere a picture or film is opened full screen (from a card's back, a part, an option, a board, or a chip in a comment), a speech bubble sits beside Pin, as it does on a board's item. It opens the same small box under the picture, with the keyboard up. The words are kept with that picture or film, not put in the card's comment: they're kept as they're typed, and go a few seconds after typing stops and when the box closes. A sound on a card's back or a part has the same bubble beside its play button, which opens the box under it; a sound on a board has it in the strip under the grid, as before.

A picture or film with a comment has a blue edge on the card's back, and a sound's bubble a blue dot. The card's back, and each part, counts them beside its pins ("2 pins · 1 comment"), and tapping that opens the first. A part with one counts as answered. The writer gets the card, the part, which picture, film or sound, and the words, as a `media` event. Pins are spots on the same picture, so each picture or film carries one comment and any number of pins. Bring to comment still puts a link in the card's comment, for when the words belong there.

## Parts

A card in parts shows the titles of its first four parts on its face, each with its mark once it has one, and a dot if it has words. "Tap to read the 3 parts, with 4 pictures and 2 videos" says how many, and what pictures, films and sounds the card and its parts hold, so none are missed. A tap turns it over, like any card with more on its back, even mid-comment, and its back holds everything: the card's own words, details, pictures, films and sounds on top, then how many parts have been answered, then each part as a section with its title, words, pictures, films and sounds. While a card in parts is turned over, its back takes the room the buttons had. A tap on a part's title on the face turns it over at that part.

Under each part are three marks in the card's own words (Good, Problem, Decent on a report), and a speech bubble. A mark goes as soon as it's tapped, and tapping it again takes it back. The bubble opens a comment box under that part only, with its own photo button. Its words go a few seconds after typing stops, and its new pictures when it closes, with Done or a drag down. A part's words keep the same protection as a comment. The card's own swipe and comment are separate from all of this. A second try of the card clears its parts' marks, and keeps their words.

## Looking at pictures

Tapping a picture opens it full screen: on a card's back, on an option, or on a board. Pinching zooms in and out around the fingers, dragging moves around a zoomed picture, and a double tap zooms in at that spot or back out. The X, or dragging down when it isn't zoomed, goes back. Where there are several pictures, next and previous buttons or a sideways drag move between them. This screen sits over everything, so a pinch here never reaches the card underneath. A pinch on a card's back does nothing, and a pinch on its front still opens the overview.

A tap on an option's picture opens it, and a tap anywhere else on the option ticks it, as before. The picture is drawn at its true size and scaled down to fit, so zooming shows real detail. If a board's full picture hasn't come down, its thumbnail shows until it does, and without signal it says so.

## Boards

For picking from many pictures, where one big picture of them all can't be seen well enough. Up and down are swipes, so a long grid can't scroll on the card itself. So the card shows a few small pictures, with the ticked ones first, and a tap opens the board's own screen: a scrolling grid, three across, with each tile's picture, label and tick. How many are picked shows at the top ("2 picked"), and the full-screen look says Pick or Picked, the same word as "Picked:" on the card.

- A tile shows its thumbnail whole and never crops it, on the card too. An item can bring its own thumbnail, for pictures that don't read when shrunk whole. Looking at it still opens the whole picture.
- Tapping a tile's picture looks at it, with next, previous and a tick there too, and a speech bubble beside Draw for a comment on that item alone. The bubble opens a box under the picture with the keyboard up; its words are kept as they're typed and go when it closes (Done, a drag down, the next item, or leaving). The bubble has a dot once the item has words, and so does its tile on the grid. It's sent like a part's comment, apart from the card's own comment and swipe.
- Tapping its tick or label picks it. Any number can be picked.
- A swipe on the card means done with these picks. It works as on an option card, and the answer carries `selected`.
- Ticks are saved as they're made, so a half-finished selection survives the app being closed. They also go out as a draft a few seconds later, like comments. Plain ticks in the Feel test stay on the phone.
- Opening the board from the comment box keeps what's typed, so they can look while writing.
- An item can be a sound instead of a picture. Its tile plays on a tap, there in the grid. See Sound above.

The phone brings words down first, then thumbnails, then card pictures. A board's full pictures come one at a time as they're looked at, with the next and previous ones fetched ahead, because all of them could be a lot of data on a phone connection. So thumbnails work offline, and full pictures only once seen. Sound clips are small, so a board's come down ahead with the card pictures.

## Bring to comment

Holding still on a picture or a film on a card's back (or its parts) for about half a second, or selecting words there, brings up a small "Bring to comment" button low on the screen, clear of the menu iPhones put over selected words (pages can't add to that menu). Holding still on a picture or film open full screen does the same, with the pen on or off. The system's own picture menu doesn't take these long presses.

Tapping it puts a reference where the caret was in the box being written in, and says where it went:

- **A comment box open** (the card's, or a part's): there.
- **Nothing open**: the card's comment box opens for it, or the part's for something from a part, without bringing the keyboard up.

Each reference shows in the box as a short blue chip, its label only; the link itself is kept out of sight in the chip, and goes in full with the words. A tap on a chip reopens what it points at:

- **A picture** opens full screen.
- **A film** opens full screen at the moment it was stopped at, paused there.
- **Words** are quoted, with a link to their card or part, as a chip.
- **A drawing**: brought from full screen with lines drawn on the picture, the drawing comes along as a picture on the same comment, with its reference.

A reference is a link with a little more on it, so the writer reads it like any link: `[Film at 0:12](riffle:pack/deck/card?film=img/walk.mp4&t=12.4)`.

## Details

Up and down are swipes, so a card can't scroll. The face has a size limit, and tapping flips the card to its back: longer explanation, numbers and pictures, and a card's parts, scrolling, with swipes off. A turn is two halves: the side showing turns away to edge-on, and only when that half has finished (its own end, not a clock, which an iPhone starting the animation late would outrun) do the sides swap and the other side turns in. So the back's words never show before the card is edge-on. At rest nothing about either side is 3D, so typing and scrolling on the back behave as anywhere else. The back has its own Comment button, which opens the comment box with the back still showing above it. So they can read, scroll and open pictures while they write, and flip back to swipe. Going to a picture and back keeps what's typed. If a card doesn't fit its face on a small phone, the type steps down. If it still doesn't fit, the end of its description is cut with a fade and "Tap to read the rest", and the whole of it is on the back, so no words are lost.

## Endings and rewards

Kept quiet on purpose.

- **Deck:** a plain heading, the tally counting up, the notes pad, and two choices: "Deck's done" or "Replan this deck". No confetti.
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
- **Read:** settings says when the writer last read the answers, from a note they leave in the repo.
- **Sending:** at most one batch every 15 seconds, plus when the app is hidden, comes back or signal returns. Each batch is a new file, so nothing can collide with whoever is writing decks.
- **When sending fails, it says why.** A refusal from GitHub gives the status code and what to do, on the first screen, in the title line ("Not sending") and in settings. One miss counts as no signal; three in a row while the phone says it's online counts as a problem and says so. Settings shows how many have been sent and when, and has Send now, which reports what happened. Every call gives up after 25 seconds, so a call frozen with the page can't hold up the ones after it.
- **The built-in Feel test** needs no key. Anything typed in it (comments, notes, drafts) is sent by itself, tagged `demo: true`, like anything typed anywhere. Plain swipes with no words stay on the phone. Its page says nothing about it unless something is waiting to send, and then one plain line says how many and when they go. "Start the Feel test again" takes two steps, says what it clears, and sends anything not sent yet first. Their own decks can be tried there too, and stay on the phone.
- **Writes wait their turn.** Every write the phone makes waits in one of two lines, one at a time in each: words (answers, records, their own decks) and pictures. Two at once each made a commit on the same branch, and GitHub refused the second (409). Words keep their own line so a big picture on a slow connection never holds them back; a rare clash between the two lines is tried again quietly a few times before anything is said, and then in plain words, never with GitHub's codes.

## Nothing typed gets lost

- **Every write goes into a backup list first.** It's in `localStorage`, which is synchronous, and a write leaves the list only once the database has it. Typing writes straight away, not after a pause, so a killed app keeps what was on screen. On the next start, whatever is left moves back into the database. Reads see the backup first.
- **A lost database connection** gets reopened, and the write retried once. iPhones can drop the connection while the app is in the background.
- **If saving still fails,** or there's no database at all (a private window), the title line says "Not saving on this phone", and the first screen and settings say why. The words stay in the backup, and go back as soon as it works. A deck whose saved progress can't be read won't open, rather than start fresh over it.
- **Hiding or closing the app** runs one handler: it saves the deck, queues notes, drafts and pins, then sends.
- **Notes** go about 1.5 seconds after typing stops, and **drafts** (comments on a card not thrown yet) about 5 seconds after, each only if changed. Words on a part, and pins, go about 3 seconds after. At every start, the app goes through every deck's saved state and queues any notes, drafts, words on parts or pins that haven't gone, including drafts on cards no longer in the deck.
- **What can still go:** the phone dying in the moment between a keystroke and the backup write, or the browser clearing its own data. Settings says whether the browser has promised to keep it.

On iPhone, the app has to be added to the Home Screen: Safari and the Home Screen app keep separate data, and Safari can clear a site's data when it isn't used for a while. iPhones only send while the app is open, or just as it's hidden. Web pages can't vibrate there, so the tick uses a switch-control trick that works on recent versions, and does nothing otherwise.

## For testing

On a local test server only: `?api=` points the app at a stand-in for GitHub, and `?insets=59,34` pretends to have an iPhone's top and bottom safe areas, to check the true spacing.

## The writer's side

`skill/` holds a Claude Code skill, installed with `python skill/install.py`. It makes decks from files, with checks first; shrinks pictures, films and sound clips, and makes posters; finds icons; reads answers, parts, drawings and pins, and turns each pin into a picture of the spot; deals cards back; marks cards handled; answers thoughts; lists what needs a second look; and sends notifications that say where they're from. `skill/SKILL.md` has the commands. Its estimate of what fits the smallest iPhone is checked against real rendering in the app's tests, and must never be the optimist.
