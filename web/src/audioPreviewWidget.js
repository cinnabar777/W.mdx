import { WidgetType } from '@codemirror/view';
import { fetchM4aSeekBlob, MAX_M4A_SEEK_BYTES } from './mdzipAudioBlobSeek.js';

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

function waitForMediaEvent(media, eventName, { signal, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    let timeoutId;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeoutId);
      media.removeEventListener(eventName, onSuccess);
      media.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onSuccess = () => settle(resolve);
    const onError = () => settle(reject, new Error('The audio source failed to load.'));
    const onAbort = () => settle(
      reject,
      signal.reason instanceof Error
        ? signal.reason
        : new DOMException('Audio seek preparation was cancelled.', 'AbortError')
    );

    media.addEventListener(eventName, onSuccess, { once: true });
    media.addEventListener('error', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
    timeoutId = setTimeout(
      () => settle(reject, new Error('Timed out preparing audio seeking.')),
      timeoutMs
    );
    if (signal?.aborted) onAbort();
  });
}

function makeIcon(name) {
  const icons = {
    play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
    pause: '<path d="M6 5h4v14H6zm8 0h4v14h-4z" fill="currentColor"/>',
    volume: '<path d="M3 9v6h4l5 4V5L7 9H3zm12.5 3a3.5 3.5 0 0 0-2-3.16v6.31a3.5 3.5 0 0 0 2-3.15zm-2-8.77v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z" fill="currentColor"/>',
    muted: '<path d="M3 9v6h4l5 4V5L7 9H3zm11.6 0L13.2 10.4 15.8 13l-2.6 2.6 1.4 1.4 2.6-2.6 2.6 2.6 1.4-1.4-2.6-2.6 2.6-2.6-1.4-1.4-2.6 2.6z" fill="currentColor"/>'
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">${icons[name]}</svg>`;
}

function styleButton(button, { compact = false } = {}) {
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
    'border-radius:10px',
    'background:var(--media-controls-bg, #242424)',
    'color:var(--media-controls-text, #fff)',
    'box-shadow:0 5px 22px rgba(0,0,0,.48)'
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

function viewportBounds() {
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

export class AudioPreviewWidget extends WidgetType {
  constructor(src, label, relativeLink, from, to, layout = null, onEdit = null) {
    super();
    this.src = src;
    this.label = label || 'audio file';
    this.relativeLink = relativeLink;
    this.from = from;
    this.to = to;
    const width = Number(layout?.width ?? 100);
    this.layout = {
      width: Number.isInteger(width) && width >= 40 && width <= 100 ? width : 100,
      alignment: ['left', 'center', 'right'].includes(layout?.alignment)
        ? layout.alignment
        : 'left'
    };
    this.onEdit = onEdit;
  }

  eq(other) {
    return other instanceof AudioPreviewWidget &&
      other.src === this.src &&
      other.label === this.label &&
      other.relativeLink === this.relativeLink &&
      other.from === this.from &&
      other.to === this.to &&
      other.layout.width === this.layout.width &&
      other.layout.alignment === this.layout.alignment;
  }

  toDOM(view) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-mdzip-audio-preview-wrapper';
    const alignmentMargin = this.layout.alignment === 'center'
      ? '10px auto'
      : this.layout.alignment === 'right'
        ? '10px 0 10px auto'
        : '10px auto 10px 0';
    wrapper.style.cssText = [
      'display:block',
      'box-sizing:border-box',
      'max-width:100%',
      `width:${this.layout.width}%`,
      `margin:${alignmentMargin}`,
      'padding:10px',
      'border:1px solid var(--border-color, #444)',
      'border-radius:8px',
      'background:var(--media-player-bg, #111)',
      'color:var(--media-controls-text, #fff)',
      'touch-action:manipulation',
      'user-select:none',
      '-webkit-user-select:none'
    ].join(';');

    const labelRow = document.createElement('div');
    labelRow.className = 'cm-mdzip-audio-label';
    labelRow.textContent = this.label;
    labelRow.title = 'Long-press for audio options';
    labelRow.style.cssText = [
      'font-size:13px',
      'line-height:1.4',
      'margin:0 0 8px',
      'overflow-wrap:anywhere',
      'color:var(--media-controls-text, #fff)',
      'touch-action:manipulation'
    ].join(';');
    wrapper.appendChild(labelRow);

    const audio = document.createElement('audio');
    const isM4aSource = /\.m4a(?:$|[?#])/i.test(this.relativeLink || this.src);
    let seekBlobUrl = null;
    let seekAbortController = null;
    let isPreparingM4aSeek = false;
    let disposed = false;
    audio.preload = isM4aSource ? 'auto' : 'metadata';
    audio.src = this.src;
    audio.dataset.mdzipAudio = 'true';
    audio.dataset.mdzipLink = this.relativeLink;
    audio.hidden = true;
    const initialRate = Number(window.mdzipAudioPlaybackRate ?? 1);
    audio.playbackRate = PLAYBACK_RATES.includes(initialRate) ? initialRate : 1;
    wrapper.appendChild(audio);

    const controls = document.createElement('div');
    controls.className = 'cm-mdzip-audio-controls';
    controls.style.cssText = [
      'display:flex',
      'flex-wrap:wrap',
      'align-items:center',
      'gap:8px',
      'box-sizing:border-box',
      'width:100%',
      'max-width:100%',
      'padding:8px',
      'border-radius:var(--media-controls-radius, 24px)',
      'background:var(--media-controls-bg, #242424)',
      'color:var(--media-controls-text, #fff)'
    ].join(';');
    wrapper.appendChild(controls);

    const playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.setAttribute('aria-label', 'Play audio');
    styleButton(playButton);
    playButton.innerHTML = makeIcon('play');
    controls.appendChild(playButton);

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
    seek.setAttribute('aria-label', 'Seek audio');
    seek.style.cssText = [
      'flex:1 1 54px',
      'min-width:54px',
      'height:24px',
      'margin:0',
      'accent-color:var(--media-controls-accent, #00d6c9)'
    ].join(';');
    controls.appendChild(seek);

    const speedButton = document.createElement('button');
    speedButton.type = 'button';
    speedButton.setAttribute('aria-label', 'Playback speed');
    styleButton(speedButton, { compact: true });
    speedButton.textContent = formatRate(audio.playbackRate);
    controls.appendChild(speedButton);

    const muteButton = document.createElement('button');
    muteButton.type = 'button';
    muteButton.setAttribute('aria-label', 'Mute audio');
    styleButton(muteButton);
    muteButton.innerHTML = makeIcon('volume');
    controls.appendChild(muteButton);

    const volume = document.createElement('input');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '1';
    volume.step = '0.01';
    volume.value = String(audio.volume);
    volume.setAttribute('aria-label', 'Volume');
    volume.style.cssText = [
      'flex:1 1 120px',
      'min-width:100px',
      'height:20px',
      'accent-color:var(--media-controls-accent, #00d6c9)'
    ].join(';');
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
    volumeRow.append(volumeLabel, volume);
    controls.appendChild(volumeRow);

    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    status.style.cssText = [
      'display:none',
      'margin-top:8px',
      'color:var(--media-controls-text, #fff)',
      'font-size:13px'
    ].join(';');
    wrapper.appendChild(status);

    const speedMenu = document.createElement('div');
    speedMenu.setAttribute('role', 'menu');
    speedMenu.setAttribute('aria-label', 'Playback speed');
    stylePopup(speedMenu);
    for (const rate of PLAYBACK_RATES) {
      const option = document.createElement('button');
      option.type = 'button';
      option.setAttribute('role', 'menuitemradio');
      option.setAttribute('aria-checked', String(rate === audio.playbackRate));
      option.textContent = rate === 1 ? 'Normal (1×)' : formatRate(rate);
      stylePopupButton(option);
      option.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        setPlaybackRate(rate, true);
        hidePopup(speedMenu);
      });
      speedMenu.appendChild(option);
    }

    const actions = document.createElement('div');
    actions.setAttribute('role', 'menu');
    actions.setAttribute('aria-label', 'Audio actions');
    stylePopup(actions);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.setAttribute('role', 'menuitem');
    editButton.textContent = 'Edit';
    stylePopupButton(editButton);
    actions.appendChild(editButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.setAttribute('role', 'menuitem');
    deleteButton.textContent = 'Delete from MDZip';
    stylePopupButton(deleteButton);
    actions.appendChild(deleteButton);

    let lastPressPoint = null;
    let activePopup = null;
    let popupAnchor = null;
    let popupPoint = null;
    let pressTimer = null;
    const clearPressTimer = () => {
      if (pressTimer !== null) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    const positionPopup = () => {
      const popup = activePopup;
      if (!popup?.isConnected) return;
      const bounds = viewportBounds();
      const rect = popupAnchor?.isConnected
        ? popupAnchor.getBoundingClientRect()
        : null;
      const anchorX = rect ? rect.left : (popupPoint?.x ?? bounds.left + 8);
      const anchorY = rect ? rect.bottom : (popupPoint?.y ?? bounds.top + 8);
      const width = popup.offsetWidth || 190;
      const height = popup.offsetHeight || 100;
      const minLeft = bounds.left + 8;
      const maxLeft = Math.max(minLeft, bounds.right - width - 8);
      const left = rect
        ? Math.min(Math.max(minLeft, rect.right - width), maxLeft)
        : Math.min(Math.max(minLeft, anchorX - width / 2), maxLeft);
      const below = anchorY + 8;
      const above = (rect ? rect.top : anchorY) - height - 8;
      const minTop = bounds.top + 8;
      const maxTop = Math.max(minTop, bounds.bottom - height - 8);
      const top = below + height <= bounds.bottom - 8
        ? below
        : Math.max(minTop, Math.min(above, maxTop));
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    };
    const hidePopup = popup => {
      popup?.remove();
      if (popup === activePopup) {
        activePopup = null;
        popupAnchor = null;
        popupPoint = null;
      }
    };
    const showPopup = (popup, { anchor = null, point = null } = {}) => {
      if (activePopup && activePopup !== popup) hidePopup(activePopup);
      activePopup = popup;
      popupAnchor = anchor;
      popupPoint = point;
      if (!popup.isConnected) document.body.appendChild(popup);
      popup.style.display = 'block';
      positionPopup();
    };
    const dismissPopup = event => {
      if (
        activePopup &&
        !wrapper.contains(event.target) &&
        !activePopup.contains(event.target)
      ) {
        hidePopup(activePopup);
      }
    };
    const setPlaybackRate = (rate, persist) => {
      audio.playbackRate = rate;
      window.mdzipAudioPlaybackRate = rate;
      speedButton.textContent = formatRate(rate);
      speedButton.setAttribute('aria-label', `Playback speed ${formatRate(rate)}`);
      for (const option of speedMenu.querySelectorAll('[role="menuitemradio"]')) {
        const selected = option.textContent === (rate === 1 ? 'Normal (1×)' : formatRate(rate));
        option.setAttribute('aria-checked', String(selected));
      }
      if (persist && window.AndroidNative?.setMediaPlaybackSpeed?.(String(rate)) !== true) {
        status.textContent = 'Playback speed changed but could not be saved.';
        status.style.display = 'block';
      }
    };
    let isDraggingSeek = false;
    const updateTime = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const displayedTime = isDraggingSeek
        ? Number(seek.value)
        : audio.currentTime;
      timeLabel.textContent = `${formatTime(displayedTime)} / ${formatTime(duration)}`;
      seek.max = String(Math.max(1, duration));
      if (!isDraggingSeek) {
        seek.value = String(Math.min(audio.currentTime || 0, duration || 1));
      }
    };
    const seekM4aWithBlob = async targetTime => {
      if (seekBlobUrl) {
        audio.currentTime = targetTime;
        updateTime();
        return;
      }
      if (isPreparingM4aSeek) return;

      isPreparingM4aSeek = true;
      const controller = new AbortController();
      seekAbortController = controller;
      const wasPlaying = !audio.paused && !audio.ended;
      const playbackRate = audio.playbackRate;
      const volumeLevel = audio.volume;
      const wasMuted = audio.muted;
      let blobUrl = null;
      let probe = null;
      let switchedToBlob = false;
      playButton.disabled = true;
      seek.disabled = true;
      status.textContent = 'Preparing audio for seeking…';
      status.style.display = 'block';

      try {
        const blob = await fetchM4aSeekBlob(this.src, { signal: controller.signal });
        if (disposed) return;

        blobUrl = URL.createObjectURL(blob);
        probe = document.createElement('audio');
        probe.preload = 'metadata';
        const probeMetadataReady = waitForMediaEvent(
          probe,
          'loadedmetadata',
          { signal: controller.signal }
        );
        probe.src = blobUrl;
        probe.load();
        await probeMetadataReady;

        if (!Number.isFinite(probe.duration) || probe.duration <= 0) {
          throw new Error('The buffered M4A has no usable duration.');
        }
        const probeTarget = Math.max(0, Math.min(targetTime, probe.duration));
        if (probeTarget > 0.05) {
          const probeSeeked = waitForMediaEvent(
            probe,
            'seeked',
            { signal: controller.signal }
          );
          probe.currentTime = probeTarget;
          await probeSeeked;
          if (Math.abs(probe.currentTime - probeTarget) > 1) {
            throw new Error('The buffered M4A did not seek to the requested position.');
          }
        }
        if (disposed) return;

        audio.pause();
        const audioMetadataReady = waitForMediaEvent(
          audio,
          'loadedmetadata',
          { signal: controller.signal }
        );
        audio.src = blobUrl;
        audio.load();
        switchedToBlob = true;
        await audioMetadataReady;

        seekBlobUrl = blobUrl;
        blobUrl = null;
        audio.playbackRate = playbackRate;
        audio.volume = volumeLevel;
        audio.muted = wasMuted;
        const audioTarget = Math.max(0, Math.min(targetTime, audio.duration));
        if (audioTarget > 0.05) {
          const audioSeeked = waitForMediaEvent(
            audio,
            'seeked',
            { signal: controller.signal }
          );
          audio.currentTime = audioTarget;
          await audioSeeked;
          if (Math.abs(audio.currentTime - audioTarget) > 1) {
            throw new Error('Audio did not reach the requested position.');
          }
        } else {
          audio.currentTime = audioTarget;
        }
        let resumeFailed = false;
        if (wasPlaying) {
          try {
            await audio.play();
          } catch {
            resumeFailed = true;
          }
        }
        if (resumeFailed) {
          status.textContent = 'The seek is ready. Tap Play to resume audio.';
          status.style.display = 'block';
        } else {
          status.textContent = '';
          status.style.display = 'none';
        }
      } catch (error) {
        if (disposed || error?.name === 'AbortError') return;
        if (switchedToBlob && !seekBlobUrl) {
          try {
            const originalSourceReady = waitForMediaEvent(
              audio,
              'loadedmetadata',
              { signal: controller.signal }
            );
            audio.src = this.src;
            audio.load();
            await originalSourceReady;
            audio.playbackRate = playbackRate;
            audio.volume = volumeLevel;
            audio.muted = wasMuted;
            if (wasPlaying) await audio.play();
          } catch {
            // Keep the seek error visible if restoring the original source also fails.
          }
        }
        if (error?.code === 'M4A_SEEK_TOO_LARGE') {
          status.textContent =
            `This file exceeds the ${Math.round(MAX_M4A_SEEK_BYTES / (1024 * 1024))} MB seek limit. Playback remains available, but seeking is unavailable.`;
        } else {
          status.textContent = 'Could not prepare seeking. Playback remains available.';
        }
        status.style.display = 'block';
      } finally {
        probe?.pause();
        if (probe) {
          probe.removeAttribute('src');
          probe.load();
        }
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        if (seekAbortController === controller) seekAbortController = null;
        isPreparingM4aSeek = false;
        playButton.disabled = false;
        seek.disabled = false;
        if (!disposed) {
          updateTime();
          syncPlayButton();
        }
      }
    };
    const commitSeek = () => {
      if (!isDraggingSeek) return;
      isDraggingSeek = false;
      if (Number.isFinite(audio.duration)) {
        const targetTime = Math.max(0, Math.min(Number(seek.value), audio.duration));
        if (isM4aSource) {
          void seekM4aWithBlob(targetTime);
          return;
        }
        audio.currentTime = targetTime;
      }
    };
    const syncPlayButton = () => {
      const playing = !audio.paused && !audio.ended;
      playButton.innerHTML = makeIcon(playing ? 'pause' : 'play');
      playButton.setAttribute('aria-label', playing ? 'Pause audio' : 'Play audio');
    };
    const syncMuteButton = () => {
      const muted = audio.muted || audio.volume === 0;
      muteButton.innerHTML = makeIcon(muted ? 'muted' : 'volume');
      muteButton.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
    };
    audio._syncMdzipPlaybackRate = () => {
      const rate = Number(window.mdzipAudioPlaybackRate ?? audio.playbackRate);
      if (PLAYBACK_RATES.includes(rate)) setPlaybackRate(rate, false);
    };

    playButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (audio.paused) {
        audio.play().catch(() => {
          status.textContent = 'Unable to play this audio file on this device.';
          status.style.display = 'block';
        });
      } else {
        audio.pause();
      }
    });
    seek.addEventListener('pointerdown', () => {
      isDraggingSeek = true;
    });
    seek.addEventListener('input', () => {
      isDraggingSeek = true;
      updateTime();
    });
    seek.addEventListener('pointerup', commitSeek);
    seek.addEventListener('pointercancel', commitSeek);
    seek.addEventListener('change', commitSeek);
    muteButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      audio.muted = !audio.muted;
      syncMuteButton();
    });
    volume.addEventListener('input', () => {
      audio.volume = Number(volume.value);
      audio.muted = audio.volume === 0;
      syncMuteButton();
    });
    speedButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (activePopup === speedMenu) hidePopup(speedMenu);
      else showPopup(speedMenu, { anchor: speedButton });
    });
    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('durationchange', updateTime);
    audio.addEventListener('loadedmetadata', updateTime);
    audio.addEventListener('play', syncPlayButton);
    audio.addEventListener('pause', syncPlayButton);
    audio.addEventListener('ended', syncPlayButton);
    audio.addEventListener('volumechange', syncMuteButton);
    audio.addEventListener('error', () => {
      if (isPreparingM4aSeek) return;
      status.textContent = 'Unable to play this audio file on this device.';
      status.style.display = 'block';
    });

    const onLabelPointerDown = event => {
      if (event.isPrimary === false || (event.button != null && event.button !== 0)) return;
      const point = { x: event.clientX, y: event.clientY };
      lastPressPoint = point;
      clearPressTimer();
      pressTimer = setTimeout(() => {
        pressTimer = null;
        showPopup(actions, { point });
      }, 550);
      labelRow._pressStart = point;
    };
    const onLabelPointerMove = event => {
      const start = labelRow._pressStart;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) {
        clearPressTimer();
        labelRow._pressStart = null;
      }
    };
    const onLabelPointerEnd = () => {
      clearPressTimer();
      labelRow._pressStart = null;
    };
    const onContextMenu = event => {
      event.preventDefault();
      event.stopPropagation();
      const point = { x: event.clientX, y: event.clientY };
      lastPressPoint = point;
      showPopup(actions, { point });
    };
    const editAudio = event => {
      event.preventDefault();
      event.stopPropagation();
      hidePopup(actions);
      if (typeof this.onEdit !== 'function') {
        status.textContent = 'Audio layout editing is unavailable.';
        status.style.display = 'block';
        return;
      }
      this.onEdit(view, {
        from: this.from,
        to: this.to,
        label: this.label,
        url: this.relativeLink,
        layout: this.layout
      });
    };
    const deleteAudio = event => {
      event.preventDefault();
      event.stopPropagation();
      hidePopup(actions);
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: '' },
        selection: { anchor: this.from },
        userEvent: 'delete.mdzip-audio'
      });
      view.focus();
    };

    labelRow.addEventListener('pointerdown', onLabelPointerDown);
    labelRow.addEventListener('pointermove', onLabelPointerMove);
    labelRow.addEventListener('pointerup', onLabelPointerEnd);
    labelRow.addEventListener('pointercancel', onLabelPointerEnd);
    labelRow.addEventListener('contextmenu', onContextMenu);
    editButton.addEventListener('click', editAudio);
    deleteButton.addEventListener('click', deleteAudio);
    document.addEventListener('pointerdown', dismissPopup, true);
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup, true);
    window.visualViewport?.addEventListener('resize', positionPopup);
    window.visualViewport?.addEventListener('scroll', positionPopup);

    wrapper._audioCleanup = () => {
      disposed = true;
      seekAbortController?.abort();
      clearPressTimer();
      hidePopup(activePopup);
      document.removeEventListener('pointerdown', dismissPopup, true);
      window.removeEventListener('resize', positionPopup);
      window.removeEventListener('scroll', positionPopup, true);
      window.visualViewport?.removeEventListener('resize', positionPopup);
      window.visualViewport?.removeEventListener('scroll', positionPopup);
      audio.pause();
      if (seekBlobUrl) URL.revokeObjectURL(seekBlobUrl);
      seekBlobUrl = null;
      delete audio._syncMdzipPlaybackRate;
    };
    return wrapper;
  }

  destroy(dom) {
    dom?._audioCleanup?.();
  }

  ignoreEvent(event) {
    return Boolean(event.target?.closest?.('.cm-mdzip-audio-preview-wrapper'));
  }
}
