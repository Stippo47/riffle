// The test pack built into the app. It needs no key, so the swipes can be felt straight away.
// Its answers stay on the phone until it's connected, then they get sent like any others.

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
          why: 'Right means good. Left means there is a problem. Down means you don\'t quite follow. Up adds a comment. Throw this one right.',
          details: 'Report cards don\'t ask for anything. They tell you where things stand, and your swipe tells me how that lands.\n\nA question card works the same way, but right means go with my pick and left means workshop it.\n\nTap the words at the bottom of this side to flip back.',
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
          text: 'Is the distance to throw a card about right?',
          why: 'Too short and a bump on the bus sends a card by accident. Too long and every card feels like work.',
          pick: 'About a quarter of the screen sideways, or a quick flick from anywhere.',
          details: 'Sideways takes 27% of the screen\'s width. Up and down take 15% of its height. A flick counts from 34 pixels if it\'s fast enough.\n\nPull the card back before letting go and it stays.',
        },
        {
          id: 'stamps', kind: 'question', rarity: 'common', title: 'Stamps',
          text: 'Do the stamps read quickly while the card moves?',
          why: 'The stamp is how you know what a throw will mean before you let go.',
          pick: 'Keep them: they fade in with distance and snap on where the throw counts.',
        },
        {
          id: 'comment', kind: 'report', rarity: 'common', title: 'Comment box',
          text: 'Swipe this one up.',
          why: 'The comment box opens under a small copy of the card. Type something, then throw the small card right, left or down to send both. Throw it up again to send the comment alone.',
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
          details: 'This side scrolls. Try it.\n\nThe front of a card has a size limit, so it can always be read at a glance. The back has no limit: the longer explanation, the numbers, and any pictures.\n\nPictures sit here too, because a phone has no room beside the card. On a wider screen the back could sit next to the front instead.\n\nThis paragraph is only here to make the side long enough to scroll. Keep going.\n\nStill here. The swipes stay off until you flip back, so your thumb can move however it likes without sending the card anywhere.\n\nThat is the idea behind it: quick on the front, as long as it needs on the back.\n\nLast line. Tap below to flip back.',
        },
        {
          id: 'notes', kind: 'report', rarity: 'common', title: 'Notes',
          text: 'Tap Notes above this card.',
          why: 'It is a scratchpad for the whole deck, for thoughts that don\'t fit the card you\'re on. Tap Notes again and you\'re back on this card. The same pad is at the deck\'s end.',
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
          why: 'You can throw the next card while the last one is still flying. Nothing should ever make you wait.',
          pick: 'Yes. If it ever feels slow, tell me on which screen.',
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
          why: 'It swipes like any other card. The colour just tells you to read this one before you throw it.',
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
          text: 'Light purple is epic. Hold right on this card.',
          why: 'A right swipe has to break through: keep your thumb there for about a second and the card cracks, glows, then bursts. Let go early and nothing is sent. Left, down and up stay free.',
          pick: 'About one second of holding on anything that can\'t be undone.',
          details: 'Epic cards are the ones that can\'t be undone, or are close to it.\n\nThe hold means a fast run of right swipes can never go over one. Your thumb has to mean it.\n\nThe bar in this box fills while you hold, so you can see how long is left.',
        },
        {
          id: 'legendary', kind: 'question', rarity: 'legendary', title: 'Legendary',
          text: 'Gold is legendary: it shapes everything after it.',
          why: 'The biggest calls of all, and the rarest. Same hold as epic, with a bigger burst.',
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
          id: 'look', kind: 'question', rarity: 'common', title: 'The look',
          text: 'Which look do you want to keep?',
          why: 'Back on the first screen, the gear switches between Quiet, Tabletop and Foil, so you can try each of them on these cards.',
          pick: 'Foil boosters. Swipe up to pick another.',
        },
      ],
    },
  ],
};
