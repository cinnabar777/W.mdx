import { WidgetType } from '@codemirror/view';

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

export class VideoPreviewWidget extends WidgetType {
  constructor(
    src,
    label,
    relativeLink,
    from,
    to,
    layout = null,
    onEdit = null,
    unsupported = false,
    documentSessionId = null
  ) {
    super();
    this.src = src;
    this.label = label || 'video file';
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
    this.unsupported = unsupported;
    this.documentSessionId = documentSessionId;
  }

  eq(other) {
    return other instanceof VideoPreviewWidget &&
      other.src === this.src &&
      other.label === this.label &&
      other.relativeLink === this.relativeLink &&
      other.documentSessionId === this.documentSessionId &&
      other.from === this.from &&
      other.to === this.to &&
      other.layout.width === this.layout.width &&
      other.layout.alignment === this.layout.alignment &&
      other.unsupported === this.unsupported;
  }

  toDOM(view) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-mdzip-video-preview-wrapper';
    const expectedMarkdown = view?.state?.doc?.sliceString(this.from, this.to) ?? '';
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
      'touch-action:manipulation',
      'user-select:none',
      '-webkit-user-select:none',
      '-webkit-touch-callout:none'
    ].join(';');

    const labelRow = document.createElement('div');
    labelRow.className = 'cm-mdzip-video-label';
    labelRow.textContent = this.label;
    labelRow.title = 'Long-press for video options';
    labelRow.style.cssText = [
      'font-size:13px',
      'line-height:1.4',
      'margin:0 0 8px',
      'overflow-wrap:anywhere',
      'color:var(--media-controls-text,#fff)',
      'touch-action:manipulation',
      'user-select:none',
      '-webkit-user-select:none',
      '-webkit-touch-callout:none'
    ].join(';');
    wrapper.appendChild(labelRow);

    const video = this.unsupported ? null : document.createElement('video');
    if (video) {
      video.src = this.src;
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.setAttribute('aria-label', this.label);
      video.dataset.mdzipVideo = 'true';
      video.dataset.mdzipLink = this.relativeLink;
      video.setAttribute('webkit-playsinline', '');
      video.style.cssText = [
        'display:block',
        'width:100%',
        'max-width:100%',
        'max-height:65vh',
        'object-fit:contain',
        'color-scheme:inherit',
        'user-select:none',
        '-webkit-user-select:none',
        '-webkit-touch-callout:none'
      ].join(';');
      wrapper.appendChild(video);
    }

    const status = document.createElement('div');
    status.className = this.unsupported
      ? 'cm-mdzip-video-status cm-mdzip-video-unsupported'
      : 'cm-mdzip-video-status';
    status.hidden = !this.unsupported;
    status.setAttribute('role', 'status');
    status.textContent = this.unsupported
      ? 'Unsupported video format. This app can play MP4, M4V, WebM, 3GP, MOV, and MKV.'
      : 'Unable to play this video on this device.';
    status.style.cssText = [
      'font-size:13px',
      'line-height:1.5',
      'margin-top:8px',
      'color:var(--media-controls-text,#fff)',
      ...(this.unsupported
        ? [
            'padding:12px',
            'border:1px solid var(--border-color,#444)',
            'border-radius:6px',
            'background:var(--media-controls-bg,#242424)'
          ]
        : [])
    ].join(';');
    wrapper.appendChild(status);

    const actions = document.createElement('div');
    actions.setAttribute('role', 'menu');
    actions.setAttribute('aria-label', 'Video actions');
    stylePopup(actions);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.setAttribute('role', 'menuitem');
    editButton.textContent = 'Edit';
    stylePopupButton(editButton);
    actions.appendChild(editButton);

    const removeLinkButton = document.createElement('button');
    removeLinkButton.type = 'button';
    removeLinkButton.setAttribute('role', 'menuitem');
    removeLinkButton.textContent = 'Remove link';
    stylePopupButton(removeLinkButton);
    actions.appendChild(removeLinkButton);

    const canDeletePackagedAsset =
      window.AndroidNative?.canDeletePackagedAsset?.(
        this.relativeLink,
        this.documentSessionId
      ) === true;
    let deleteButton = null;
    if (canDeletePackagedAsset) {
      deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.setAttribute('role', 'menuitem');
      deleteButton.textContent = 'Delete';
      stylePopupButton(deleteButton);
      actions.appendChild(deleteButton);
    }

    let widgetDisposed = false;
    let pressTimer = null;
    let pressPoint = null;
    let pressStart = null;
    let activePopup = null;
    const clearPressTimer = () => {
      if (pressTimer !== null) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    const positionPopup = () => {
      if (!activePopup?.isConnected) return;
      const bounds = viewportBounds();
      const width = activePopup.offsetWidth || 190;
      const height = activePopup.offsetHeight || 100;
      const x = pressPoint?.x ?? bounds.left + 8;
      const y = pressPoint?.y ?? bounds.top + 8;
      const minLeft = bounds.left + 8;
      const maxLeft = Math.max(minLeft, bounds.right - width - 8);
      const left = Math.min(Math.max(minLeft, x - width / 2), maxLeft);
      const below = y + 8;
      const above = y - height - 8;
      const minTop = bounds.top + 8;
      const maxTop = Math.max(minTop, bounds.bottom - height - 8);
      const top = below + height <= bounds.bottom - 8
        ? below
        : Math.max(minTop, Math.min(above, maxTop));
      activePopup.style.left = `${left}px`;
      activePopup.style.top = `${top}px`;
    };
    const hidePopup = () => {
      activePopup?.remove();
      activePopup = null;
      pressPoint = null;
    };
    const showPopup = point => {
      activePopup = actions;
      pressPoint = point;
      document.body.appendChild(actions);
      actions.style.display = 'block';
      positionPopup();
    };
    const dismissPopup = event => {
      if (activePopup && !wrapper.contains(event.target) && !activePopup.contains(event.target)) {
        hidePopup();
      }
    };
    const onPointerDown = event => {
      if (event.isPrimary === false || (event.button != null && event.button !== 0)) return;
      if (!event.target?.closest?.('video, .cm-mdzip-video-label')) return;
      const point = { x: event.clientX, y: event.clientY };
      pressStart = point;
      pressPoint = point;
      clearPressTimer();
      pressTimer = setTimeout(() => {
        pressTimer = null;
        pressStart = null;
        showPopup(point);
      }, 550);
    };
    const onPointerMove = event => {
      const start = pressStart;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) {
        clearPressTimer();
        pressStart = null;
      }
    };
    const onPointerEnd = () => {
      clearPressTimer();
      pressStart = null;
    };
    const onContextMenu = event => {
      if (!event.target?.closest?.('video, .cm-mdzip-video-label')) return;
      event.preventDefault();
      event.stopPropagation();
      showPopup({ x: event.clientX, y: event.clientY });
    };
    const editVideo = event => {
      event.preventDefault();
      event.stopPropagation();
      hidePopup();
      if (typeof this.onEdit !== 'function') {
        status.textContent = 'Video layout editing is unavailable.';
        status.hidden = false;
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
    const removeVideoLink = (event, deletePackagedAsset = false) => {
      event.preventDefault();
      event.stopPropagation();
      hidePopup();
      if (
        !view ||
        this.from < 0 ||
        this.to > view.state.doc.length ||
        this.from >= this.to ||
        view.state.doc.sliceString(this.from, this.to) !== expectedMarkdown
      ) return;
      if (
        deletePackagedAsset &&
        window.AndroidNative?.deletePackagedAsset?.(
          this.relativeLink,
          this.documentSessionId
        ) !== true
      ) {
        status.textContent = 'Could not delete this file from the package.';
        status.hidden = false;
        return;
      }
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: '' },
        selection: { anchor: this.from },
        userEvent: deletePackagedAsset ? 'delete.packaged-video' : 'delete.video-link'
      });
      view.focus();
    };

    wrapper.addEventListener('pointerdown', onPointerDown);
    wrapper.addEventListener('pointermove', onPointerMove);
    wrapper.addEventListener('pointerup', onPointerEnd);
    wrapper.addEventListener('pointercancel', onPointerEnd);
    wrapper.addEventListener('contextmenu', onContextMenu);
    video?.addEventListener('contextmenu', onContextMenu);
    editButton.addEventListener('click', editVideo);
    removeLinkButton.addEventListener('click', event => removeVideoLink(event));
    deleteButton?.addEventListener('click', event => removeVideoLink(event, true));
    document.addEventListener('pointerdown', dismissPopup, true);
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup, true);
    window.visualViewport?.addEventListener('resize', positionPopup);
    window.visualViewport?.addEventListener('scroll', positionPopup);

    video?.addEventListener('error', () => {
      if (widgetDisposed || !video.getAttribute('src')) return;
      const code = video.error?.code;
      const errorDescriptions = {
        1: 'Playback was interrupted.',
        2: 'The video could not be loaded.',
        3: 'The video could not be decoded.',
        4: 'The video format is unsupported.'
      };
      const description = errorDescriptions[code] || 'The video failed to play.';
      status.textContent = `Video playback failed: ${description} (media error ${code ?? 'unknown'}).`;
      status.hidden = false;
    });
    video?.addEventListener('playing', () => {
      status.hidden = true;
    });

    wrapper._cleanupVideoWidget = () => {
      widgetDisposed = true;
      clearPressTimer();
      hidePopup();
      wrapper.removeEventListener('pointerdown', onPointerDown);
      wrapper.removeEventListener('pointermove', onPointerMove);
      wrapper.removeEventListener('pointerup', onPointerEnd);
      wrapper.removeEventListener('pointercancel', onPointerEnd);
      wrapper.removeEventListener('contextmenu', onContextMenu);
      video?.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerdown', dismissPopup, true);
      window.removeEventListener('resize', positionPopup);
      window.removeEventListener('scroll', positionPopup, true);
      window.visualViewport?.removeEventListener('resize', positionPopup);
      window.visualViewport?.removeEventListener('scroll', positionPopup);
      video?.pause();
      video?.removeAttribute('src');
      video?.load();
    };
    return wrapper;
  }

  ignoreEvent() {
    return true;
  }

  destroy(dom) {
    dom?._cleanupVideoWidget?.();
  }
}
