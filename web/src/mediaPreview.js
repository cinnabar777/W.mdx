const PLAYBACK_RATE_STORAGE_KEY = 'wmdx.media.playback-rate.v1';
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

function readPlaybackRate(view) {
  try {
    const stored = Number(view.localStorage.getItem(PLAYBACK_RATE_STORAGE_KEY));
    if (PLAYBACK_RATES.includes(stored)) return stored;
  } catch {
    // Some embedded browser contexts can disable local storage.
  }
  const configured = Number(view.__wmdxMediaSettings?.playbackRate);
  return PLAYBACK_RATES.includes(configured) ? configured : 1;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}`
    : `${minutes}:${remainder}`;
}

function svgButton(document, className, label, path) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `wmdx-media-control ${className}`;
  button.setAttribute('aria-label', label);
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
  return button;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(value, maximum));
}

export function createMediaPreviewElement(document, type, src, label, reference = src) {
  const view = document.defaultView || globalThis.window;
  const root = document.createElement('div');
  root.className = `wmdx-media-player wmdx-media-player--${type}`;
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', label || (type === 'audio' ? 'Audio player' : 'Video player'));

  const title = document.createElement('div');
  title.className = 'wmdx-media-title';
  title.textContent = label || (type === 'audio' ? 'Audio' : 'Video');
  root.appendChild(title);

  const media = document.createElement(type);
  media.className = 'wmdx-media-element';
  media.controls = false;
  media.preload = 'metadata';
  media.setAttribute('aria-label', label || (type === 'audio' ? 'Audio' : 'Video'));
  root.appendChild(media);
  root.mediaElement = media;

  const controls = document.createElement('div');
  controls.className = 'wmdx-media-controls';
  controls.setAttribute('role', 'toolbar');
  controls.setAttribute('aria-label', 'Media controls');

  const playButton = svgButton(
    document,
    'wmdx-media-play',
    'Play',
    '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>'
  );
  const time = document.createElement('span');
  time.className = 'wmdx-media-time';
  time.textContent = '0:00 / 0:00';
  const seek = document.createElement('input');
  seek.className = 'wmdx-media-seek';
  seek.type = 'range';
  seek.min = '0';
  seek.max = '1000';
  seek.value = '0';
  seek.setAttribute('aria-label', 'Playback position');

  const speedButton = document.createElement('button');
  speedButton.type = 'button';
  speedButton.className = 'wmdx-media-control wmdx-media-speed';
  speedButton.setAttribute('aria-label', 'Playback speed');

  const muteButton = svgButton(
    document,
    'wmdx-media-mute',
    'Mute',
    '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9l5 6m0-6-5 6"/>'
  );
  const volume = document.createElement('input');
  volume.className = 'wmdx-media-volume';
  volume.type = 'range';
  volume.min = '0';
  volume.max = '1';
  volume.step = '0.05';
  volume.value = String(media.volume);
  volume.setAttribute('aria-label', 'Volume');

  controls.append(playButton, time, seek, speedButton, muteButton, volume);

  let fullscreenButton = null;
  if (type === 'video') {
    fullscreenButton = svgButton(
      document,
      'wmdx-media-fullscreen',
      'Enter full screen',
      '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/>'
    );
    controls.appendChild(fullscreenButton);
  }
  root.appendChild(controls);

  const error = document.createElement('div');
  error.className = 'wmdx-media-error';
  error.setAttribute('role', 'alert');
  error.setAttribute('aria-live', 'assertive');
  error.hidden = true;
  root.appendChild(error);

  let speedMenu = null;
  const closeSpeedMenu = () => {
    if (!speedMenu) return;
    speedMenu.remove();
    speedMenu = null;
    document.removeEventListener('pointerdown', onOutsideSpeedMenu, true);
    view?.removeEventListener('resize', positionSpeedMenu);
    view?.removeEventListener('scroll', positionSpeedMenu, true);
    view?.visualViewport?.removeEventListener('resize', positionSpeedMenu);
    view?.visualViewport?.removeEventListener('scroll', positionSpeedMenu);
    speedButton.setAttribute('aria-expanded', 'false');
  };
  const positionSpeedMenu = () => {
    if (!speedMenu?.isConnected) return;
    const buttonRect = speedButton.getBoundingClientRect();
    const viewport = view?.visualViewport;
    const leftBound = viewport?.offsetLeft ?? 0;
    const topBound = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? view?.innerWidth ?? 360;
    const viewportHeight = viewport?.height ?? view?.innerHeight ?? 640;
    const width = speedMenu.offsetWidth || 112;
    const height = speedMenu.offsetHeight || 250;
    const gap = 6;
    const spaceAbove = buttonRect.top - topBound;
    const spaceBelow = topBound + viewportHeight - buttonRect.bottom;
    const showAbove = spaceAbove >= height + gap ||
      (spaceAbove > spaceBelow && spaceAbove > 96);
    const preferredTop = showAbove
      ? buttonRect.top - height - gap
      : buttonRect.bottom + gap;
    speedMenu.style.left = `${clamp(buttonRect.left, leftBound + 8, leftBound + viewportWidth - width - 8)}px`;
    speedMenu.style.top = `${clamp(preferredTop, topBound + 8, topBound + viewportHeight - height - 8)}px`;
    speedMenu.classList.toggle('wmdx-media-speed-menu--above', showAbove);
  };
  function onOutsideSpeedMenu(event) {
    if (speedMenu?.contains(event.target) || speedButton.contains(event.target)) return;
    closeSpeedMenu();
  }
  const updateSpeedButton = () => {
    const rate = Number(media.playbackRate) || 1;
    speedButton.textContent = `${rate}×`;
    speedButton.setAttribute('aria-label', `Playback speed ${rate} times`);
  };
  const openSpeedMenu = () => {
    if (speedMenu) {
      closeSpeedMenu();
      return;
    }
    speedMenu = document.createElement('div');
    speedMenu.className = 'wmdx-media-speed-menu';
    speedMenu.setAttribute('role', 'menu');
    speedMenu.setAttribute('aria-label', 'Playback speed');
    PLAYBACK_RATES.forEach(rate => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'wmdx-media-speed-option';
      option.textContent = `${rate}×`;
      option.setAttribute('role', 'menuitemradio');
      option.setAttribute('aria-checked', String(Number(media.playbackRate) === rate));
      option.addEventListener('click', () => {
        media.playbackRate = rate;
        try {
          view.localStorage.setItem(PLAYBACK_RATE_STORAGE_KEY, String(rate));
        } catch {
          // Playback still changes for this player when storage is unavailable.
        }
        updateSpeedButton();
        closeSpeedMenu();
      });
      speedMenu.appendChild(option);
    });
    document.body.appendChild(speedMenu);
    speedButton.setAttribute('aria-expanded', 'true');
    positionSpeedMenu();
    document.addEventListener('pointerdown', onOutsideSpeedMenu, true);
    view?.addEventListener('resize', positionSpeedMenu, { passive: true });
    view?.addEventListener('scroll', positionSpeedMenu, { passive: true, capture: true });
    view?.visualViewport?.addEventListener('resize', positionSpeedMenu, { passive: true });
    view?.visualViewport?.addEventListener('scroll', positionSpeedMenu, { passive: true });
  };

  const updateTime = () => {
    const duration = Number.isFinite(media.duration) ? media.duration : 0;
    const current = Number.isFinite(media.currentTime) ? media.currentTime : 0;
    time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    seek.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : '0';
  };
  const updatePlayButton = () => {
    const playing = !media.paused && !media.ended;
    playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playButton.innerHTML = playing
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor" stroke="none"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>';
  };
  const showPlaybackError = (message = `This device could not play “${label || (type === 'audio' ? 'audio' : 'video')}”. The file is still attached; try opening it in another player.`) => {
    error.textContent = message;
    error.hidden = false;
    root.classList.add('wmdx-media-player--error');
    [
      playButton,
      seek,
      muteButton,
      volume,
      speedButton,
      fullscreenButton
    ].forEach(control => {
      if (control) control.disabled = true;
    });
  };
  const showMediaLoadError = () => {
    const mediaName = label || (type === 'audio' ? 'Audio' : 'Video');
    showPlaybackError(
      `Unable to play ${type} “${mediaName}” (${reference || src}). The file may be missing, unreadable, or unsupported by this device.`
    );
  };

  // canPlayType() may return an empty string for formats the device can still
  // decode. Let the media element try the source and report an actual load error.
  media.src = src;

  media.playbackRate = readPlaybackRate(view);
  updateSpeedButton();
  updateTime();
  updatePlayButton();
  media.addEventListener('loadedmetadata', updateTime);
  media.addEventListener('durationchange', updateTime);
  media.addEventListener('timeupdate', updateTime);
  media.addEventListener('play', updatePlayButton);
  media.addEventListener('pause', updatePlayButton);
  media.addEventListener('ended', updatePlayButton);
  media.addEventListener('ratechange', updateSpeedButton);
  media.addEventListener('error', showMediaLoadError);
  playButton.addEventListener('click', async () => {
    if (media.paused) {
      try {
        await media.play();
        error.hidden = true;
      } catch {
        showPlaybackError();
      }
    } else {
      media.pause();
    }
  });
  seek.addEventListener('input', () => {
    if (Number.isFinite(media.duration) && media.duration > 0) {
      media.currentTime = media.duration * (Number(seek.value) / 1000);
    }
  });
  speedButton.addEventListener('click', openSpeedMenu);
  muteButton.addEventListener('click', () => {
    media.muted = !media.muted;
    muteButton.setAttribute('aria-label', media.muted ? 'Unmute' : 'Mute');
    muteButton.classList.toggle('is-muted', media.muted);
  });
  volume.addEventListener('input', () => {
    media.volume = Number(volume.value);
    media.muted = media.volume === 0;
    muteButton.classList.toggle('is-muted', media.muted);
  });
  fullscreenButton?.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (typeof media.requestFullscreen === 'function') {
        await media.requestFullscreen();
      } else {
        showPlaybackError();
      }
    } catch {
      showPlaybackError();
    }
  });

  root.closeMediaSpeedMenu = closeSpeedMenu;
  root.destroyMediaPlayer = () => {
    closeSpeedMenu();
    media.pause();
    media.removeAttribute('src');
  };
  return root;
}
