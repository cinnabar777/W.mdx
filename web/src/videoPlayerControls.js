import { calculateViewportClampedPopupPosition } from './mediaPopupPosition.js';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function formatRate(rate) {
  const value = Number(rate);
  return `${Number.isInteger(value) ? value : String(value).replace(/0+$/, '').replace(/\.$/, '')}×`;
}

function makeIcon(name) {
  const icons = {
    play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
    pause: '<path d="M6 5h4v14H6zm8 0h4v14h-4z" fill="currentColor"/>',
    volume: '<path d="M3 9v6h4l5 4V5L7 9H3zm12.5 3a3.5 3.5 0 0 0-2-3.16v6.31a3.5 3.5 0 0 0 2-3.15zm-2-8.77v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z" fill="currentColor"/>',
    muted: '<path d="M3 9v6h4l5 4V5L7 9H3zm11.6 0L13.2 10.4 15.8 13l-2.6 2.6 1.4 1.4 2.6-2.6 2.6 2.6 1.4-1.4-2.6-2.6 2.6-2.6-1.4-1.4-2.6 2.6z" fill="currentColor"/>',
    fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    fullscreenExit: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">${icons[name]}</svg>`;
}

function styleButton(button, compact = false) {
  button.style.cssText = [
    'appearance:none',
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'box-sizing:border-box',
    'min-width:38px',
    'min-height:38px',
    `padding:${compact ? '7px 10px' : '8px'}`,
    'border:1px solid var(--border-color, #444)',
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

export function createVideoPlayerControls(video, wrapper, status) {
  const controls = document.createElement('div');
  controls.className = 'cm-mdzip-video-controls';
  controls.style.cssText = [
    'display:flex',
    'flex-wrap:wrap',
    'align-items:center',
    'gap:8px',
    'box-sizing:border-box',
    'width:100%',
    'max-width:100%',
    'margin-top:8px',
    'padding:8px',
    'border-radius:var(--media-controls-radius, 24px)',
    'background:var(--media-controls-bg, #242424)',
    'color:var(--media-controls-text, #fff)'
  ].join(';');
  wrapper.appendChild(controls);

  const makeButton = (label, icon, compact = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    styleButton(button, compact);
    if (icon) button.innerHTML = makeIcon(icon);
    controls.appendChild(button);
    return button;
  };

  const playButton = makeButton('Play video', 'play');
  const timeLabel = document.createElement('span');
  timeLabel.setAttribute('aria-live', 'off');
  timeLabel.style.cssText = [
    'flex:0 0 auto',
    'min-width:72px',
    'color:var(--media-controls-text, #fff)',
    'font-size:12px',
    'font-variant-numeric:tabular-nums',
    'text-align:center'
  ].join(';');
  timeLabel.textContent = '0:00 / 0:00';
  controls.appendChild(timeLabel);

  const seek = document.createElement('input');
  seek.type = 'range';
  seek.min = '0';
  seek.max = '1';
  seek.value = '0';
  seek.disabled = true;
  seek.setAttribute('aria-label', 'Seek video');
  seek.style.cssText = [
    'flex:1 1 54px',
    'min-width:54px',
    'height:24px',
    'margin:0',
    'accent-color:var(--media-controls-accent, #00d6c9)'
  ].join(';');
  controls.appendChild(seek);

  const initialRate = Number(window.mdzipAudioPlaybackRate ?? 1);
  video.playbackRate = PLAYBACK_RATES.includes(initialRate) ? initialRate : 1;
  const speedButton = makeButton(`Playback speed ${formatRate(video.playbackRate)}`, null, true);
  speedButton.textContent = formatRate(video.playbackRate);
  const muteButton = makeButton('Mute video', 'volume');
  const fullscreenButton = makeButton('Enter full screen', 'fullscreen');

  const volumeRow = document.createElement('div');
  volumeRow.style.cssText = [
    'display:flex',
    'flex:1 0 100%',
    'align-items:center',
    'gap:8px',
    'padding:0 8px',
    'color:var(--media-controls-text, #fff)',
    'font-size:12px'
  ].join(';');
  const volumeLabel = document.createElement('span');
  volumeLabel.textContent = 'Volume';
  const volume = document.createElement('input');
  volume.type = 'range';
  volume.min = '0';
  volume.max = '1';
  volume.step = '0.01';
  volume.value = String(video.volume);
  volume.setAttribute('aria-label', 'Video volume');
  volume.style.cssText = [
    'flex:1 1 120px',
    'min-width:100px',
    'height:20px',
    'accent-color:var(--media-controls-accent, #00d6c9)'
  ].join(';');
  volumeRow.append(volumeLabel, volume);
  controls.appendChild(volumeRow);

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

  let isDraggingSeek = false;
  let speedMenuOpen = false;
  let disposed = false;
  const showStatus = message => {
    status.textContent = message;
    status.hidden = false;
  };
  const getDuration = () => {
    const duration = Number(video.duration);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  };
  const updateTime = () => {
    const duration = getDuration();
    timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
    seek.max = String(duration || 1);
    seek.disabled = duration <= 0;
    if (!isDraggingSeek) {
      seek.value = String(duration > 0 ? Math.min(video.currentTime || 0, duration) : 0);
    }
  };
  const syncPlayButton = () => {
    const playing = !video.paused && !video.ended;
    playButton.innerHTML = makeIcon(playing ? 'pause' : 'play');
    playButton.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
  };
  const syncMuteButton = () => {
    const muted = video.muted || video.volume === 0;
    muteButton.innerHTML = makeIcon(muted ? 'muted' : 'volume');
    muteButton.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
  };
  const setPlaybackRate = (rate, persist = false) => {
    video.playbackRate = rate;
    window.mdzipAudioPlaybackRate = rate;
    speedButton.textContent = formatRate(rate);
    speedButton.setAttribute('aria-label', `Playback speed ${formatRate(rate)}`);
    for (const item of rateOptions) {
      item.option.setAttribute('aria-checked', String(item.rate === rate));
    }
    if (persist && window.AndroidNative?.setMediaPlaybackSpeed?.(String(rate)) !== true) {
      showStatus('Playback speed changed but could not be saved.');
    }
  };

  const positionSpeedMenu = () => {
    if (!speedMenuOpen || !speedMenu.isConnected) return;
    const bounds = getViewportBounds();
    speedMenu.style.maxHeight = `${Math.max(80, bounds.bottom - bounds.top - 16)}px`;
    const rect = speedButton.getBoundingClientRect();
    const position = calculateViewportClampedPopupPosition({
      bounds,
      anchorRect: rect,
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

  const isFullscreen = () =>
    document.fullscreenElement === wrapper ||
    document.webkitFullscreenElement === wrapper;
  const originalWrapperCss = wrapper.style.cssText;
  const originalVideoMaxHeight = video.style.maxHeight;
  const fullscreenWrapperCss = [
    originalWrapperCss,
    'position:fixed',
    'inset:0',
    'z-index:100000',
    'display:flex',
    'flex-direction:column',
    'justify-content:center',
    'width:100vw',
    'height:100vh',
    'max-width:none',
    'margin:0',
    'padding:16px',
    'background:var(--media-player-bg,#000)',
    'box-sizing:border-box'
  ].join(';');
  const syncFullscreenButton = () => {
    const fullscreen = isFullscreen();
    fullscreenButton.innerHTML = makeIcon(fullscreen ? 'fullscreenExit' : 'fullscreen');
    fullscreenButton.setAttribute(
      'aria-label',
      fullscreen ? 'Exit full screen' : 'Enter full screen'
    );
  };
  const toggleFullscreen = async event => {
    event.preventDefault();
    event.stopPropagation();
    try {
      if (isFullscreen()) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else document.webkitExitFullscreen?.();
      } else if (wrapper.requestFullscreen) {
        await wrapper.requestFullscreen();
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      } else {
        showStatus('Full screen is unavailable on this device.');
      }
    } catch {
      if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else showStatus('Full screen is unavailable on this device.');
    }
  };
  const onFullscreenChange = () => {
    if (isFullscreen()) {
      wrapper.style.cssText = fullscreenWrapperCss;
      video.style.maxHeight = 'calc(100vh - 150px)';
    } else {
      wrapper.style.cssText = originalWrapperCss;
      video.style.maxHeight = originalVideoMaxHeight;
    }
    syncFullscreenButton();
  };
  const commitSeek = () => {
    if (!isDraggingSeek) return;
    isDraggingSeek = false;
    const duration = getDuration();
    if (duration > 0) {
      video.currentTime = Math.max(0, Math.min(Number(seek.value), duration));
    }
  };

  for (const item of rateOptions) {
    item.option.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      setPlaybackRate(item.rate, true);
      hideSpeedMenu();
    });
  }
  playButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (video.paused) {
      video.play().catch(() => showStatus('Unable to play this MP4 video on this device.'));
    } else {
      video.pause();
    }
  });
  video.addEventListener('click', () => {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  });
  seek.addEventListener('pointerdown', () => {
    isDraggingSeek = true;
  });
  seek.addEventListener('input', () => {
    isDraggingSeek = true;
    timeLabel.textContent = `${formatTime(Number(seek.value))} / ${formatTime(getDuration())}`;
  });
  seek.addEventListener('pointerup', commitSeek);
  seek.addEventListener('pointercancel', commitSeek);
  seek.addEventListener('change', commitSeek);
  muteButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    video.muted = !video.muted;
    syncMuteButton();
  });
  volume.addEventListener('input', () => {
    video.volume = Number(volume.value);
    video.muted = video.volume === 0;
    syncMuteButton();
  });
  speedButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    showSpeedMenu();
  });
  fullscreenButton.addEventListener('click', toggleFullscreen);
  video.addEventListener('timeupdate', updateTime);
  video.addEventListener('durationchange', updateTime);
  video.addEventListener('loadedmetadata', updateTime);
  video.addEventListener('seeked', updateTime);
  video.addEventListener('play', syncPlayButton);
  video.addEventListener('pause', syncPlayButton);
  video.addEventListener('ended', syncPlayButton);
  video.addEventListener('volumechange', syncMuteButton);
  video._syncMdzipPlaybackRate = () =>
    setPlaybackRate(Number(window.mdzipAudioPlaybackRate ?? video.playbackRate));
  document.addEventListener('pointerdown', dismissSpeedMenu, true);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  window.addEventListener('resize', positionSpeedMenu);
  window.addEventListener('scroll', positionSpeedMenu, true);
  window.visualViewport?.addEventListener('resize', positionSpeedMenu);
  window.visualViewport?.addEventListener('scroll', positionSpeedMenu);
  updateTime();
  syncPlayButton();
  syncMuteButton();

  return () => {
    if (disposed) return;
    disposed = true;
    hideSpeedMenu();
    document.removeEventListener('pointerdown', dismissSpeedMenu, true);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    window.removeEventListener('resize', positionSpeedMenu);
    window.removeEventListener('scroll', positionSpeedMenu, true);
    window.visualViewport?.removeEventListener('resize', positionSpeedMenu);
    window.visualViewport?.removeEventListener('scroll', positionSpeedMenu);
    delete video._syncMdzipPlaybackRate;
  };
}
