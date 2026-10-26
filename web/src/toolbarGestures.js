export const TOOLBAR_GESTURE_GROUPS = Object.freeze([
  {
    id: 'taps',
    title: 'Taps',
    gestures: Object.freeze([
      { id: 'longPress', title: 'Long press' },
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

const CORNER_SWIPE_IDS = Object.freeze([
  'swipeUpLeft',
  'swipeUpRight',
  'swipeDownLeft',
  'swipeDownRight'
]);

const GESTURE_INDICATOR_POSITIONS = Object.freeze({
  longPress: 'top-left',
  tap2: 'top-right',
  tap3: 'bottom-right',
  swipeUp: 'top',
  swipeDown: 'bottom',
  swipeLeft: 'left',
  swipeRight: 'right',
  swipeUpLeft: 'top-left',
  swipeUpRight: 'top-right',
  swipeDownLeft: 'bottom-left',
  swipeDownRight: 'bottom-right'
});

export function getToolbarGestureIndicatorEntries(style = {}) {
  const actions = { ...(style.gestureActions || {}) };
  if (!actions.swipeUp && style.gestureAction) {
    actions.swipeUp = style.gestureAction;
  }
  const hasCornerSwipe = CORNER_SWIPE_IDS.some(id => Boolean(actions[id]));
  const positions = { ...GESTURE_INDICATOR_POSITIONS };
  if (hasCornerSwipe) {
    delete positions.longPress;
    delete positions.tap2;
    delete positions.tap3;
  }
  return TOOLBAR_GESTURE_GROUPS
    .flatMap(group => group.gestures)
    .filter(gesture => Boolean(actions[gesture.id]) && positions[gesture.id])
    .map(gesture => ({
      id: gesture.id,
      actionId: actions[gesture.id],
      position: positions[gesture.id]
    }));
}

export const BUILT_IN_GESTURE_ACTION_IDS = Object.freeze([
  'historyBack',
  'historyForward',
  'toggleToolbar',
  'removeHighlight',
  'openGroup'
]);
