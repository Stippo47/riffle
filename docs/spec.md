# Riffle: how it behaves

Riffle is a phone web app for answering questions and reading reports one card at a time, by swiping. Whoever writes the cards (usually an AI working on a project) adds them as files; whoever answers them does it from a phone, with or without signal.

## The levels

- **Dashboard:** lists every **pack**. A pack is a project.
- **Pack:** its page has a **Thoughts** row at the top, then their **own decks**, then the writer's decks in the order chosen: Suggested, Importance, Newest, or grouped under **topics**. Topics don't depend on each other. Each pack has one **Misc deck** for one-offs, which sits apart at the end of Topics. **Archived** decks sit in a closed section at the very end.
- **Topic:** several decks. Decks in a topic can be **stacked**: a discussion sits on the questions it leads to, and finishing one deals the next.
- **Deck:** a run of cards.
- **Card:** one question, report or design, seen one at a time.

## A pack's page

**The order.** A row of four: Suggested, Importance, Newest and Topics. The choice is kept.

| Order | What comes first |
|---|---|
| Suggested (to start with) | The writer's priority (1 first), then decks tagged answer first, then waiting on you, then the rest by topic. Finished decks go last |
| Importance | The deck with the most important card still owed (legendary, then epic and so on), then the most epic and legendary cards, then the most owed |
| Newest | The deck's date, newest first, with how long ago. A deck sent before 0.8.0 has no date of its own, so it counts from when it first came to this phone |
| Topics | The page as it was before: grouped under topics, in the layout's own style |

Suggested, Importance and Newest are lists of full-width rows in every layout, each saying the deck's **kind** (Report, Questions or Board), its topic, the writer's priority as a small number, and its **tags**: "Answer first", "Waiting on you", "Being worked on", or any other word the writer uses. In Topics, rows show the kind and tags under the title where there's room, and tiles leave them out.

A deck's kind is what the writer says, or else what its cards are: all reports is a report, mostly boards is a board, anything else is questions.

**Archived.** A deck the writer archives, or they archive from its overview ("Archive this deck"), leaves the list for a closed Archived section at the end of the page, with a count. Opening the section lists them, each with Bring back. An archived deck can still be opened and answered. What it owes leaves every count: the pack, the first screen and the number on the icon. Whichever said it last, the writer or the phone, stands. Nothing is ever deleted.

**Their own decks** are listed under Thoughts, with a row to make a new one, in every pack and the Feel test. The screen for a cleared pack or topic has "New deck of your own" too. See Your own decks below.

## Card kinds

| Kind | What it is | Right | Left | Down |
|---|---|---|---|---|
| question | A question with the writer's pick | GO: go with the pick | WORKSHOP: not that, work on it | IDK: need more context |
| report | What happened, with nothing asked | GOOD | PROBLEM: something's wrong with where this is going | HUH?: not following. Mostly so the writer knows; it doesn't need much back |
| design | The writer's design for something, to approve, deny or add to | YES | RETHINK | IDK |
| options | Several options and a question: tap the ones wanted, then swipe | GO: only those. With nothing tapped, the writer's marked pick. With no pick either, it just bounces | REDO: even those weren't good, redo in their direction. With nothing tapped, all of them are bad | IDK |
| board | Any number of pictures to pick from, 60 or more. See Boards below | As for options | As for options | IDK |

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

**While swiping.** What shows you what a swipe will do, along with a glow on the edge the card is heading for.

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

Dragging moves the top card, which tilts as it goes. The chosen mark fades in with distance and snaps on where the swipe counts. A glow shows on the side it's heading for, and the next card rises underneath. On release the card flies off at the finger's speed, and the next card can be thrown at once.

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

**Links** are plain text in any words: `[Label](riffle:pack/deck/card/part)`. Wherever words show, on a card's face and back, in its parts, in a comment, a thought or the Feel test's list, a link shows as a small tappable label, and a web address as a link that opens in the browser. A one-line chip shows each link by its label only.

**Following one** goes to that card, its parts open if it names a part. The back button turns into a curved arrow, says where it goes ("Back to Has a link"), and returns to the card the link was on, as it was: its parts open, its comment box open with the words in it. Several links in a row come back one at a time. Going anywhere by any other way, the pack's page or a deck's tile, starts the trail again.

**The link button** sits beside the photo button in every place to type: a comment, a part's comment, notes and Thoughts. It offers, in this order: the card in the mini player, if there is one; this card, part or deck; or "Pick one from a list", every deck in every pack, this pack first, opening to its cards and their parts, with a search box over all of them: packs, decks, cards and parts, by their words. The link goes in where the caret was, as if typed, so it's saved like anything typed.

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

The deck's title line reads Pack › Topic › Deck › Card, and each is a way there. Pack goes to the pack's page; Topic goes there at that topic; Deck opens the overview; Card brings the card itself back into view, from its back. The card's crumb follows the card on top. Every crumb shows in full, in one row that scrolls sideways, kept scrolled to its end, where this is; a fade at its left says there's more. That's the same in all four layouts.

## The mini player

A pinch on a card puts the deck into a small floating card in a corner and goes to the pack's page. A pinch on a picture or a film, open full screen, still zooms. At the end of a deck, a pinch anywhere on the end does it too. The small card shows the deck's name, the card's title and what's on it, and its kind; a deck finished when it was shrunk shows dark, like the end of a deck, with "Deck done" and how many were answered. It stays over every screen. Any other deck can be opened and used as usual, comment box and all.

- **Tapping it** brings its deck back full size, at the same card, with its parts or comment box open if they were. If another deck was open, that one goes into the corner in its place, so they swap. Drafts in both are kept, because each deck saves its own as ever.
- **Dragging it** to any corner moves it there, and it stays there. Dragging it never reaches the card underneath.
- **While typing**, the keyboard takes the bottom, so it waits at the top of its side.
- It's kept on the phone, so it's still there after the app is closed.

## The buttons

Undo, Notes, Skip and Grid. They act as the finger lifts.

- **Undo:** brings back the last card, from the way it left, and takes back its answer. Also takes back a skip.
- **Notes:** a scratchpad for the whole deck, for thoughts that don't fit the card on screen. It opens as a full sheet. Dragging it down, or tapping its head, returns to the same card. It's sent with the deck, and the same pad is on the end screen.
- **Skip:** sends the card to the bottom of the deck.
- **Grid:** the overview, the same as a pinch, for when only one hand is free.
- A pinch on the card puts the deck in the mini player. See The mini player.

## The overview

Grid lays out every card in the deck on a grid: its short title, its importance colour, and whether and how it was answered, with a mark if there's a comment. Handled cards have a green tick. Tapping one goes to it. An answered card shows what was said, and swiping it again changes the answer. It also has a way to the deck's notes, and two actions on the whole deck, each with a clear second step:

- **Replan this deck:** asks for it to be rethought from the base. The answers stay.
- **Start this deck over:** clears the swipes, and every card is dealt again. The second step offers keeping notes and comments (comments come back as drafts on their cards) or clearing those too. Anything unsent goes first, and anything already sent stays with the writer.

And **Archive this deck**, at once, since it's undone as easily: Bring back on the pack's page, or "Bring this deck back" here on an archived one. See A pack's page.

## Thoughts

A row at the top of every pack's page, always there, needing no deck file. It isn't a deck, because decks end and this doesn't. It opens a screen with a pad on top and earlier thoughts below, newest first, each with its time. Filing one sends it. What's being typed has the same protection as a comment. The writer can answer a thought through a file, and the answer shows on it with the handled look.

## Films

A card or a part can carry films beside its pictures, and a board can mix films and pictures. On a card's back they play by themselves, muted, looping and inline, once the card is flipped, and stop when it's flipped back. A tap pauses or plays one. In parts, a film plays while it's on screen. Each has a poster for before it plays and for tiles, and a board marks its films with a small play sign.

The corner button opens a film full screen, like a picture: pinch to zoom, double tap, drag down to go back. Under it is a bar: play or pause, a slider to scrub through it, and a speed button that goes 1×, ½×, ¼×. A tap on the film plays or pauses it, just after a double tap would have counted.

A card's films come down ahead, after its pictures. A board's come when they're looked at, like its full pictures.

## Drawing on pictures

Any picture or film opened full screen can be drawn on: on a card's back, a part, an option or a board, and a paused frame of a film. Draw turns the pen on, which brings out four colours (red, yellow, blue, white), undo, clear, and Done.

- With the pen on, one finger draws and two still pinch and move. A second finger landing just after a line starts takes that line back, since a pinch was meant.
- Lines are as wide on screen at any zoom, and drawn in the picture's own pixels, so zooming never moves them.
- Every line is kept on the phone as it ends, so closing the app keeps the drawing, and it's there when the picture opens again.
- Leaving the picture any way at all (Done, the X, next, or dragging down) turns the drawing into a photo: the picture at full size with the lines on it. It goes on the comment it belongs to: the card's, or the part's. Done also opens that comment, so the words can go with it. It's an ordinary photo from then on, so its little cross takes it off.
- The answer says what it was drawn over.

## Parts

A card in parts shows the titles of its first four parts on its face, each with its mark once it has one, and a dot if it has words. "Tap to read the 3 parts" says how many. A tap turns it over, like any card with more on its back, even mid-comment, and its back holds everything: the card's own words, details, pictures and films on top, then how many parts have been answered, then each part as a section with its title, words, pictures and films. While a card in parts is turned over, its back takes the room the buttons had. A tap on a part's title on the face turns it over at that part.

Under each part are three marks in the card's own words (Good, Problem, Huh? on a report), and a speech bubble. A mark goes as soon as it's tapped, and tapping it again takes it back. The bubble opens a comment box under that part only, with its own photo button. Its words go a few seconds after typing stops, and its new pictures when it closes, with Done or a drag down. A part's words keep the same protection as a comment. The card's own swipe and comment are separate from all of this. A second try of the card clears its parts' marks, and keeps their words.

## Looking at pictures

Tapping a picture opens it full screen: on a card's back, on an option, or on a board. Pinching zooms in and out around the fingers, dragging moves around a zoomed picture, and a double tap zooms in at that spot or back out. The X, or dragging down when it isn't zoomed, goes back. Where there are several pictures, next and previous buttons or a sideways drag move between them. This screen sits over everything, so a pinch here never reaches the card underneath. A pinch on a card's back does nothing, and a pinch on its front still opens the overview.

A tap on an option's picture opens it, and a tap anywhere else on the option ticks it, as before. The picture is drawn at its true size and scaled down to fit, so zooming shows real detail. If a board's full picture hasn't come down, its thumbnail shows until it does, and without signal it says so.

## Boards

For picking from many pictures, where one big picture of them all can't be seen well enough. Up and down are swipes, so a long grid can't scroll on the card itself. So the card shows a few small pictures, with the ticked ones first, and a tap opens the board's own screen: a scrolling grid, three across, with each tile's picture, label and tick. The count of selected ones shows at the top.

- A tile shows its thumbnail whole and never crops it, on the card too. An item can bring its own thumbnail, for pictures that don't read when shrunk whole. Looking at it still opens the whole picture.
- Tapping a tile's picture looks at it, with next, previous and a tick there too.
- Tapping its tick or label selects it. Any number can be selected.
- A swipe on the card means done with these picks. It works as on an option card, and the answer carries `selected`.
- Ticks are saved as they're made, so a half-finished selection survives the app being closed. They also go out as a draft a few seconds later, like comments. Plain ticks in the Feel test stay on the phone.
- Opening the board from the comment box keeps what's typed, so they can look while writing.

The phone brings words down first, then thumbnails, then card pictures. A board's full pictures come one at a time as they're looked at, with the next and previous ones fetched ahead, because all of them could be a lot of data on a phone connection. So thumbnails work offline, and full pictures only once seen.

## Bring to notes

Holding still on a picture or a film on a card's back (or its parts) for about half a second, or selecting words there, brings up a small "Bring to notes" button low on the screen, clear of the menu iPhones put over selected words (pages can't add to that menu). Holding still on a picture or film open full screen does the same, with the pen on or off. The system's own picture menu doesn't take these long presses.

Tapping it puts a reference into the deck's notes where the caret last was in them, on a line of its own, and says "In your notes". The notes show every reference as a chip above the pad, and a tap on one reopens it:

- **A picture** opens full screen.
- **A film** opens full screen at the moment it was stopped at, paused there.
- **Words** are quoted, with a link to their card; the chip goes to that card.
- **A drawing**: brought from full screen with lines drawn on the picture, the drawing comes along as a picture on the notes, instead of going onto the comment.

A reference is a link with a little more on it, so the writer reads it like any link: `[Film at 0:12, The walk](riffle:pack/deck/card?film=img/walk.mp4&t=12.4)`.

## Details

Up and down are swipes, so a card can't scroll. The face has a size limit, and tapping flips the card to its back: longer explanation, numbers and pictures, and a card's parts, scrolling, with swipes off. The turn eases in to edge-on at exactly halfway and out from there, and the hidden side swaps at that moment, so one side always shows. Once turned, the back is drawn flat, with nothing 3D about it, so typing and scrolling on it behave as anywhere else. The back has its own Comment button, which opens the comment box with the back still showing above it. So they can read, scroll and open pictures while they write, and flip back to swipe. Going to a picture and back keeps what's typed. If a card doesn't fit its face on a small phone, the type steps down. If it still doesn't fit, the end of its description is cut with a fade and "Tap to read the rest", and the whole of it is on the back, so no words are lost.

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
- **Hiding or closing the app** runs one handler: it saves the deck, queues notes and drafts, then sends.
- **Notes** go about 1.5 seconds after typing stops, and **drafts** (comments on a card not thrown yet) about 5 seconds after, each only if changed. At every start, the app goes through every deck's saved state and queues any notes or drafts that haven't gone, including drafts on cards no longer in the deck.
- **What can still go:** the phone dying in the moment between a keystroke and the backup write, or the browser clearing its own data. Settings says whether the browser has promised to keep it.

On iPhone, the app has to be added to the Home Screen: Safari and the Home Screen app keep separate data, and Safari can clear a site's data when it isn't used for a while. iPhones only send while the app is open, or just as it's hidden. Web pages can't vibrate there, so the tick uses a switch-control trick that works on recent versions, and does nothing otherwise.

## For testing

On a local test server only: `?api=` points the app at a stand-in for GitHub, and `?insets=59,34` pretends to have an iPhone's top and bottom safe areas, to check the true spacing.

## The writer's side

`skill/` holds a Claude Code skill, installed with `python skill/install.py`. It makes decks from files, with checks first; shrinks pictures and films and makes posters; finds icons; reads answers, parts and drawings; deals cards back; marks cards handled; answers thoughts; lists what needs a second look; and sends notifications that say where they're from. `skill/SKILL.md` has the commands. Its estimate of what fits the smallest iPhone is checked against real rendering in the app's tests, and must never be the optimist.
