export const TOOLBAR_GESTURE_GROUPS = Object.freeze([
  {
    id: 'taps',
    title: 'Taps',
    gestures: Object.freeze([
      { id: 'tap1', title: '1 tap' },
      { id: 'tap2', title: '2 taps' },
      { id: 'tap3', title: '3 taps' }
    ])
  },
  {
    id: 'side-swipes',
    title: 'Side swipes',
    gestures: Object.freeze([
      { id: 'swipeUp', title: 'Swipe up' },
      { id: 'swipeDown', title: 'Swipe down' },
      { id: 'swipeLeft', title: 'Swipe left' },
      { id: 'swipeRight', title: 'Swipe right' }
    ])
  },
  {
    id: 'corner-swipes',
    title: 'Corner swipes',
    gestures: Object.freeze([
      { id: 'swipeUpLeft', title: 'Swipe up left' },
      { id: 'swipeUpRight', title: 'Swipe up right' },
      { id: 'swipeDownLeft', title: 'Swipe down left' },
      { id: 'swipeDownRight', title: 'Swipe down right' }
    ])
  }
]);

export const TOOLBAR_GESTURE_IDS = Object.freeze(
  TOOLBAR_GESTURE_GROUPS.flatMap(group => group.gestures.map(gesture => gesture.id))
);

export const BUILT_IN_GESTURE_ACTION_IDS = Object.freeze([
  'historyBack',
  'historyForward',
  'toggleToolbar',
  'removeHighlight'
]);
