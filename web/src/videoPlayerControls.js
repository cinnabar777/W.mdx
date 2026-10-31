import { calculateViewportClampedPopupPosition } from './mediaPopupPosition.js';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function formatRate(rate) {
  const value = Number(rate);
  return `${Number.isInteger(value) ? value : String(value).replace(/0+$/, '').replace(/\.$/, '')}×`;
}

function styleButton(button) {
  button.style.cssText = [
    'appearance:none',
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'box-sizing:border-box',
    'min-width:64px',
    'min-height:38px',
    'padding:8px 12px',
    'border:1px solid var(--media-controls-accent, #00d6c9)',
    'border-radius:8px',
    'background:transparent',
    'color:var(--media-controls-text, #fff)',
    'font:inherit',
    'font-size:14px',
    'line-height:1',
    'white-space:nowrap',
    'cursor:pointer',
    'touch-action:manipulation'
  ].join(';');
}

function stylePopup(popup) {
  popup.style.cssText = [
    'position:fixed',
    'z-index:100000',
    'display:none',
    'min-width:160px',
    'max-width:calc(100vw - 16px)',
    'box-sizing:border-box',
    'padding:5px',
    'border:1px solid var(--border-color, #444)',
    'border-radius:var(--media-controls-radius, 10px)',
    'background:var(--media-controls-bg, #242424)',
    'color:var(--media-controls-text, #fff)',
    'box-shadow:0 5px 22px rgba(0,0,0,.48)',
    'overflow-y:auto'
  ].join(';');
}

function stylePopupButton(button) {
  button.style.cssText = [
    'appearance:none',
    'display:block',
    'width:100%',
    'min-height:42px',
    'box-sizing:border-box',
    'padding:10px 12px',
    'border:0',
    'border-radius:7px',
    'background:transparent',
    'color:var(--media-controls-text, #fff)',
    'font:inherit',
    'font-size:14px',
    'text-align:left',
    'cursor:pointer',
    'touch-action:manipulation'
  ].join(';');
}

function getViewportBounds() {
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  return {
    left,
    top,
    right: left + (viewport?.width ?? window.innerWidth),
    bottom: top + (viewport?.height ?? window.innerHeight)
  };
}

export function createVideoPlayerControls(video, wrapper) {
  const controls = document.createElement('div');
  controls.className = 'cm-mdzip-video-controls';
  controls.style.cssText = [
    'display:flex',
    'justify-content:flex-end',
    'box-sizing:border-box',
    'width:100%',
    'max-width:100%',
    'margin-top:8px',
    'padding:6px 8px',
    'border-radius:var(--media-controls-radius, 24px)',
    'background:var(--media-controls-bg, #242424)',
    'color:var(--media-controls-text, #fff)'
  ].join(';');
  wrapper.appendChild(controls);

  const speedButton = document.createElement('button');
  speedButton.type = 'button';
  speedButton.textContent = formatRate(video.playbackRate);
  speedButton.setAttribute('aria-label', `Playback speed ${formatRate(video.playbackRate)}`);
  speedButton.setAttribute('aria-haspopup', 'menu');
  styleButton(speedButton);
  controls.appendChild(speedButton);

  const speedMenu = document.createElement('div');
  speedMenu.setAttribute('role', 'menu');
  speedMenu.setAttribute('aria-label', 'Playback speed');
  stylePopup(speedMenu);
  const rateOptions = PLAYBACK_RATES.map(rate => {
    const option = document.createElement('button');
    option.type = 'button';
    option.setAttribute('role', 'menuitemradio');
    option.setAttribute('aria-checked', String(rate === video.playbackRate));
    option.textContent = rate === 1 ? 'Normal (1×)' : formatRate(rate);
    stylePopupButton(option);
    speedMenu.appendChild(option);
    return { rate, option };
  });

  let speedMenuOpen = false;
  let disposed = false;
  const syncRateLabel = () => {
    const rate = video.playbackRate;
    speedButton.textContent = formatRate(rate);
    speedButton.setAttribute('aria-label', `Playback speed ${formatRate(rate)}`);
    for (const item of rateOptions) {
      item.option.setAttribute('aria-checked', String(item.rate === rate));
    }
  };
  const positionSpeedMenu = () => {
    if (!speedMenuOpen || !speedMenu.isConnected) return;
    const bounds = getViewportBounds();
    speedMenu.style.maxHeight = `${Math.max(80, bounds.bottom - bounds.top - 16)}px`;
    const position = calculateViewportClampedPopupPosition({
      bounds,
      anchorRect: speedButton.getBoundingClientRect(),
      width: speedMenu.offsetWidth || 190,
      height: speedMenu.offsetHeight || 100
    });
    speedMenu.style.left = `${position.left}px`;
    speedMenu.style.top = `${position.top}px`;
  };
  const hideSpeedMenu = () => {
    speedMenu.remove();
    speedMenuOpen = false;
  };
  const showSpeedMenu = () => {
    if (speedMenuOpen) {
      hideSpeedMenu();
      return;
    }
    speedMenuOpen = true;
    document.body.appendChild(speedMenu);
    speedMenu.style.display = 'block';
    positionSpeedMenu();
  };
  const dismissSpeedMenu = event => {
    if (
      speedMenuOpen &&
      !controls.contains(event.target) &&
      !speedMenu.contains(event.target)
    ) {
      hideSpeedMenu();
    }
  };

  for (const item of rateOptions) {
    item.option.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      video.playbackRate = item.rate;
      syncRateLabel();
      hideSpeedMenu();
    });
  }
  speedButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    showSpeedMenu();
  });
  video.addEventListener('ratechange', syncRateLabel);
  document.addEventListener('pointerdown', dismissSpeedMenu, true);
  window.addEventListener('resize', positionSpeedMenu);
  window.addEventListener('scroll', positionSpeedMenu, true);
  window.visualViewport?.addEventListener('resize', positionSpeedMenu);
  window.visualViewport?.addEventListener('scroll', positionSpeedMenu);

  return () => {
    if (disposed) return;
    disposed = true;
    hideSpeedMenu();
    video.removeEventListener('ratechange', syncRateLabel);
    document.removeEventListener('pointerdown', dismissSpeedMenu, true);
    window.removeEventListener('resize', positionSpeedMenu);
    window.removeEventListener('scroll', positionSpeedMenu, true);
    window.visualViewport?.removeEventListener('resize', positionSpeedMenu);
    window.visualViewport?.removeEventListener('scroll', positionSpeedMenu);
  };
}
