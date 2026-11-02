// The test pack built into the app. It needs no key, so the swipes can be felt straight away.
// Anything typed in it gets sent, tagged as a test. Plain swipes stay on the phone.
// Words in braces become the way the finger goes for that meaning: see fillDirs in ui.js.

export const DEMO_PACK = {
  id: 'feel-test',
  title: 'Feel test',
  icon: 'poker-hand',
  color: '#9a5be0',
  demo: true,
  topics: [
    { id: 'basics', title: 'The basics', icon: 'card-pickup', color: '#2f8fe0', order: 1 },
    { id: 'big-calls', title: 'Big calls', icon: 'card-random', color: '#d98a1c', order: 2 },
  ],
  decks: [
    {
      id: 'what-this-is',
      topic: 'basics',
      stack: 'first-run',
      order: 1,
      title: 'What this is',
      cards: [
        {
          id: 'start', kind: 'report', rarity: 'common', title: 'Start here',
          text: 'This is a report card. It says what happened.',
          why: 'Swipe {go} for good, {workshop} if there is a problem, {idk} if you don\'t quite follow. Swipe {comment} to add a comment. Swipe this one {go}.',
          details: 'Report cards don\'t ask for anything. They tell you where things stand, and your swipe tells me how that lands.\n\nA question card works the same way, but {go} means go with my pick and {workshop} means work on it.\n\nThe directions can be changed: gear, then Swipe directions.\n\nTap the words at the bottom of this side to flip back.',
        },
        {
          id: 'stacked', kind: 'report', rarity: 'common', title: 'Stacked decks',
          text: 'This deck is stacked on the next one.',
          why: 'A report can sit on top of the questions it leads to. Finish this deck and the next one comes up by itself.',
        },
      ],
    },
    {
      id: 'swipes',
      topic: 'basics',
      stack: 'first-run',
      order: 2,
      title: 'Swipes',
      cards: [
        {
          id: 'distance', kind: 'question', rarity: 'common', title: 'Swipe distance',
          text: 'Is the distance to swipe a card away about right?',
          why: 'Too short and a bump on the bus sends a card by accident. Too long and every card feels like work.',
          pick: 'About a quarter of the screen sideways, or a quick flick from anywhere.',
          details: 'Sideways takes 27% of the screen\'s width. Up and down take 15% of its height. A flick counts from 34 pixels if it\'s fast enough.\n\nPull the card back before letting go and it stays.',
        },
        {
          id: 'stamps', kind: 'question', rarity: 'common', title: 'Swipe marks',
          text: 'Can you tell what a swipe will do before you let go?',
          why: 'A word shows at the edge the card is heading for, and it snaps on where the swipe counts. Gear, then Style, has other choices under While swiping.',
          pick: 'Keep the plain word at the edge.',
        },
        {
          id: 'comment', kind: 'report', rarity: 'common', title: 'Adding a comment',
          text: 'Add a comment to this card.',
          why: 'Swipe {comment} and a box opens under the card. Type something. Then swipe the card {go} or {workshop} to send your words with that answer, or {comment} again to send just the words. To close the box and keep what you typed, drag it down.',
        },
        {
          id: 'skip', kind: 'question', rarity: 'common', title: 'Skip',
          text: 'Should Skip send a card to the bottom of the deck?',
          why: 'Tap Skip above this card and you will see it again at the end.',
          pick: 'Yes, and Undo brings it straight back.',
        },
        {
          id: 'flip', kind: 'report', rarity: 'common', title: 'Details',
          text: 'Tap this card to flip it.',
          why: 'Up and down are swipes, so a card can\'t scroll. Anything long lives on the back, where swipes switch off and scrolling works.',
          details: 'This side scrolls. Try it.\n\nThe front of a card has a size limit, so it can always be read at a glance. The back has no limit: the longer explanation, the numbers, and any pictures.\n\nPictures sit here too, because a phone has no room beside the card. On a wider screen the back could sit next to the front instead.\n\nThis paragraph is only here to make the side long enough to scroll. Keep going.\n\nStill here. The swipes stay off until you flip back, so your thumb can move however it likes without sending the card anywhere.\n\nThat is the idea behind it: quick on the front, as long as it needs on the back.\n\nA report on a big stage of work might run to several paragraphs here, with a table of numbers and a few pictures, and none of that would slow down the people who only want the front.\n\nThe same goes for a question. The front says what is being asked, what it changes and what I would pick. The back says why, what else was tried, and what could go wrong.\n\nThis is still only here to make the side long enough to scroll on a big phone.\n\nLast line. Tap below to flip back.',
        },
        {
          id: 'notes', kind: 'report', rarity: 'common', title: 'Notes',
          text: 'Tap Notes above this card.',
          why: 'It is a scratchpad for the whole deck, for thoughts that don\'t fit the card you\'re on. Drag it down and you\'re back on this card. The same pad is at the deck\'s end.',
        },
        {
          id: 'pinch', kind: 'question', rarity: 'common', title: 'Overview',
          text: 'Pinch this card to see the whole deck.',
          why: 'Every card is laid out with its short title and how you answered it. Tap one to go to it. The Grid button does the same, for when you only have one hand free.',
          pick: 'Keep both the pinch and the button.',
        },
        {
          id: 'speed', kind: 'question', rarity: 'common', title: 'Speed',
          text: 'Does the next card come up fast enough?',
          why: 'You can swipe the next card while the last one is still moving. Nothing should ever make you wait.',
          pick: 'Yes. If it ever feels slow, tell me on which screen.',
        },
      ],
    },
    {
      id: 'more-kinds',
      topic: 'basics',
      order: 3,
      title: 'Other kinds of card',
      cards: [
        {
          id: 'options', kind: 'options', rarity: 'common', title: 'Options',
          text: 'Which of these would you keep? Tap any, then swipe.',
          why: 'Swipe {go} for only the ones you tapped. Swipe {workshop} if even those weren\'t good, and I redo in their direction.',
          pick: 'b',
          options: [
            { id: 'a', label: 'The plain one', text: 'Quick to read, nothing extra.' },
            { id: 'b', label: 'The middle one', text: 'A little more on each card.' },
            { id: 'c', label: 'The loud one', text: 'Colour and motion everywhere.' },
          ],
        },
        {
          id: 'handled', kind: 'question', rarity: 'common', title: 'Handled',
          text: 'What should a card look like once I\'ve answered it myself?',
          handled: { how: 'A green band and a tick, with my conclusion as the main text, so you can tell at a glance. It stays in the deck and isn\'t owed.', at: '2026-11-02T00:00:00.000Z' },
        },
        {
          id: 'design', kind: 'design', rarity: 'common', title: 'Designs',
          text: 'A design card shows you something to approve, deny or add to.',
          why: 'Swipe {go} to approve it, {workshop} to have it rethought, {comment} to add your own.',
          pick: 'One card for each thing being designed.',
        },
      ],
    },
    {
      id: 'breaking-through',
      topic: 'big-calls',
      order: 1,
      title: 'Breaking through',
      cards: [
        {
          id: 'uncommon', kind: 'question', rarity: 'uncommon', title: 'Uncommon',
          text: 'Yellow means uncommon: worth a thought.',
          why: 'It swipes like any other card. The colour just tells you to read this one before you swipe it.',
          pick: 'Use it for choices the player would notice.',
        },
        {
          id: 'rare', kind: 'question', rarity: 'rare', title: 'Rare',
          text: 'Aqua means rare: it matters, but can change later.',
          why: 'Like a big stage of work. It costs a lot, but nothing is lost for good.',
          pick: 'Use it for big calls that can still be undone.',
        },
        {
          id: 'epic', kind: 'question', rarity: 'epic', title: 'Epic',
          text: 'Light purple is epic. Hold {go} on this card.',
          why: 'Going with my pick has to break through: keep your thumb there for about a second. The edge glows and the bar fills, then the card punches off. Let go early and nothing is sent. The other directions stay free.',
          pick: 'About one second of holding on anything that can\'t be undone.',
          details: 'Epic cards are the ones that can\'t be undone, or are close to it.\n\nThe hold means a fast run of swipes can never go over one. Your thumb has to mean it.\n\nThe bar in this box fills while you hold, so you can see how long is left.',
        },
        {
          id: 'legendary', kind: 'question', rarity: 'legendary', title: 'Legendary',
          text: 'Gold is legendary: it shapes everything after it.',
          why: 'The biggest calls of all, and the rarest. Same hold as epic.',
          pick: 'Only for calls the whole project rests on.',
        },
      ],
    },
    {
      id: 'misc',
      misc: true,
      order: 99,
      title: 'Misc',
      cards: [
        {
          id: 'look', kind: 'question', rarity: 'common', title: 'Style',
          text: 'Which layout and look do you want to keep?',
          why: 'On the first screen, the gear opens Style. Layout, look and what shows while swiping are separate choices, so mix them, and the preview changes as you tap.',
          pick: 'Two rows with Plain dark. Add a comment to say what you settled on.',
        },
      ],
    },
  ],
};
