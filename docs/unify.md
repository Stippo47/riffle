# One way for each thing

A proposal, from 0.15.0, with what was decided since. Riffle grew one feature at a time, and some things now work two ways, or mean different things in different places. Each item below says what that is, the one plain rule that would replace it, and what changes for whoever answers on the phone and for writers. They're ranked by how much they'd save the person answering, judged from how the app is really used.

**Built** means it's in 0.15.0. **Question** means it would change what a swipe means, remove or hide something, or change a rule the person answering set, so it's theirs to decide; each has a suggested answer.

## 1. A card in parts: the parts are the answer

Parts are the most used way of answering, more than swipes. On a card in parts, the swipe on the card says little: a card is often swiped GOOD with one of its parts marked a problem.

- **Rule.** On a card in parts, what's said on the parts is the answer. The swipe says "done with this card", plus anything about the whole.
- **Phone.** Nothing changes.
- **Writers.** Built: `riffle answers` puts the parts' sum on the card's own line ("GOOD on the card. Its parts: 3 good, 1 problem"). SKILL.md says to read the parts first, and not to explain on a card how to mark them: the buttons are under every part.
- **Question.** Should the swipe on a card in parts just mean "next"? Suggested: no. "Overall it's going the right way" is still worth saying, and a swipe should mean the same on every card.

## 2. The words are the answer, the mark is the mood

Many answers carry words. Right swipes with words often hold a "but" or a question, and most downs with words are a different answer, a counter-question, or "I can't judge this as shown", not "I don't know".

- **Rule.** Words win. A mark with words means what the words say.
- **Phone.** Nothing changes.
- **Writers.** Built: SKILL.md's "Reading what comes back" says so for each mark.
- **Question.** One word for down on every card (IDK on four kinds, DECENT on reports)? Suggested: keep both. DECENT was their own choice for reports, and IDK still fits "I can't judge this".

## 3. Show what's being asked about

Some answers are spent saying a card can't be judged without a picture or film.

- **Rule.** A card that asks how something looks, moves or sounds carries the picture, film or sound.
- **Phone.** Nothing changes.
- **Writers.** Built: `riffle check` warns when a card's words ask how something looks or moves and it has nothing to look at.
- **Question.** A "Show me" button in the comment box? Suggested: not yet; the warning removes the cause.

## 4. Point at faults: pins where faults are written

Comments on films describe a moment and a place in words, and almost never give a time, so the moment gets lost.

- **Rule.** A fault in a picture or film is pinned, not described.
- **Phone.** Pins on every picture and film opened full screen (built in 0.15.0).
- **Writers.** Built: SKILL.md says to invite pins in a film card's `why`, and to answer them by number.
- **Question.** Offer pins where comments are written: a small pin button on each film and picture on a card's back and in each part, opening it full screen with pinning on. Suggested: yes. **Answered yes; built in 0.16.0.**

## 5. A deck's life: one rule for done, and writers clear up

Many decks are never touched, and many finished ones stay on the page. "Done" could show on a deck that had a card owed again, and "waiting" meant three things: cards not answered, answers not sent, and the writer's "Waiting on you" tag.

- **Rule.** A deck is done when Deck's done was pressed and nothing is owed. "Left" is what's owed; "waiting" is only what hasn't been sent. A writer archives its own finished decks at the end of its session.
- **Phone.** Built: a deck with a card owed again shows "1 left", not Done, and doesn't count as finished. The first screen says "cards left", and the grid's unanswered tile says "Not answered". "Waiting on you" stays, as the writer's tag.
- **Writers.** Built: `riffle tidy` lists, changing nothing, decks finished and not archived, decks done with cards owed again, decks untouched for a week, thoughts with no answer, and how long since answers were marked read. `riffle status` names a deck done with cards owed again.
- **Questions.** Should a deck done for 3 days archive itself? Suggested: yes, as if Archive had been pressed, so it can be brought back. Should writers archive decks untouched for two weeks, after asking once? Suggested: yes. **Answered:** the first yes, built in 0.16.0 (the phone tidies a deck away three days after Deck's done); the second no: an untouched deck is one not got to yet, and is never archived.

## 6. Read marks per deck

Read is kept per pack while writers work per deck, so marking a pack read could hide answers from its other sessions, and in practice nothing gets marked.

- **Rule.** A writer marks read what it read: its own decks.
- **Phone.** Nothing changes; "Last read by the writer" becomes true again.
- **Writers.** Built: `riffle answers --deck <d>` shows only those decks, and with `--mark-read` marks only their answers read. `read.json` keeps a per-deck list beside the per-pack one.

## 7. Saying something about one picture

There are four ways: draw on it, bring it to the comment with a long press, the speech bubble on a board's item, and now a pin.

- **Rule.** To say something about one picture or film, pin it.
- **Phone.** Nothing removed.
- **Question.** Should a board item's bubble become a pin? Suggested: no, a whole-item comment isn't a spot. Keep the pen and Bring to comment, but stop teaching them.
- **0.16.0.** The other way round: the bubble is now on every picture and film opened full screen, and beside every sound, for a comment kept with that one picture. Each picture carries one comment and any number of pins.

## 8. Same words for the same thing

- **Rule.** One word per thing: Comment, Pick and Picked, Spread, Decent.
- **Phone.** Built: the up swipe reads COMMENT (it read NOTE, while every button says Comment and Notes is the deck's pad). A spread's screen says Pick, Picked and "2 picked" (it said Select, while the card said Picked).
- **Writers.** Built: notifications say "spread", as the phone does. The file format keeps `"kind": "board"`.

## 9. Every box to type in looks the same

Six boxes (card, part, item, pin, notes, thoughts) differ: some take photos and links, some don't, and the strip of buttons takes room.

- **Rule.** Every box: the words, one small corner button for photo and link, then Done.
- **Question.** Suggested: yes; the card's box keeps the swipe as its Done. **Answered:** not sure yet; left as it is.

## 10. Undo: what you just did

Undo took back a deck's last answer however long ago it was, which once took back an answer given days before, on a card that wasn't on screen, in a deck reached by a link.

- **Rule.** Undo takes back what you did in this visit to the deck.
- **Phone.** Built: in a deck opened by following a link, Undo reaches only what was done since. Built switched off: the same everywhere.
- **Question.** Switch it on everywhere? Suggested: yes. **Answered:** Undo is used to take back a verdict, like a "previous" beside Skip, so it stays as it is.

## 11. Writers' commands: one way to name things

- **Rule.** Anything can be named by its address, `pack/deck/card`, as links do. `--quiet` always means no notification.
- **Writers.** Built: `handled`, `second-try`, `reply`, `archive`, `order` and `link` take one address; the old separate words still work. `wait --quiet-minutes` is the new name for the quiet minutes, and `--quiet N` still works.

## 12. Close to unused

| Thing | Why | Suggested |
|---|---|---|
| The pen | Awkward (the drawing becomes a photo), and pins now say "here" | Keep, stop teaching it |
| Links typed into words | Writers link; the strip takes room | One corner button (item 9) |
| Bring to comment | Behind a long press, and pins do the film moment better | Keep, stop teaching it |
| Your own decks | Comments and Thoughts cover it | Keep |
| Thoughts | Out of reach from inside a deck, where notes about the app get written | Question: an "About the app" line in the Notes sheet. Suggested: yes. Not clear as asked; left |
| Replan, Start over | Not needed | Keep |
| A comment alone as an answer | Up is only the way into the box | Leave |
| Archive from the phone | Not needed if writers tidy | Keep |

## Rules this leaves alone

Writers start after 15 quiet minutes or on Deal in now; down on a report is DECENT; swipe directions can be swapped and writers never name one; going with the pick on epic and legendary cards takes a held swipe.
