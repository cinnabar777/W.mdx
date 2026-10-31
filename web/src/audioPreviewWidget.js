import { WidgetType } from '@codemirror/view';

function styleActionButton(button) {
  button.style.cssText = [
    'appearance:none',
    'border:0',
    'border-radius:6px',
    'background:transparent',
    'color:var(--text-color, #fff)',
    'font:inherit',
    'text-align:left',
    'padding:10px 14px',
    'min-height:40px',
    'cursor:pointer'
  ].join(';');
}

export class AudioPreviewWidget extends WidgetType {
  constructor(src, label, relativeLink, from, to) {
    super();
    this.src = src;
    this.label = label || 'audio.mp3';
    this.relativeLink = relativeLink;
    this.from = from;
    this.to = to;
  }

  eq(other) {
    return other instanceof AudioPreviewWidget &&
      other.src === this.src &&
      other.label === this.label &&
      other.relativeLink === this.relativeLink &&
      other.from === this.from &&
      other.to === this.to;
  }

  toDOM(view) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-mdzip-audio-preview-wrapper';
    wrapper.style.cssText = [
      'display:block',
      'box-sizing:border-box',
      'max-width:100%',
      'margin:10px 0',
      'padding:10px',
      'border:1px solid var(--border-color, #444)',
      'border-radius:8px',
      'background:var(--body-background, rgba(255,255,255,.04))',
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
      'color:var(--text-color, #fff)',
      'touch-action:manipulation'
    ].join(';');
    wrapper.appendChild(labelRow);

    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = this.src;
    audio.style.cssText = 'display:block;width:100%;max-width:100%;';
    wrapper.appendChild(audio);

    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    status.style.cssText = 'display:none;margin-top:8px;color:var(--text-color, #aaa);font-size:13px;';
    audio.addEventListener('error', () => {
      status.textContent = 'Unable to play this MP3 on this device.';
      status.style.display = 'block';
    });
    wrapper.appendChild(status);

    const actions = document.createElement('div');
    actions.setAttribute('role', 'menu');
    actions.setAttribute('aria-label', 'Audio options');
    actions.style.cssText = [
      'position:fixed',
      'z-index:100000',
      'display:none',
      'min-width:180px',
      'padding:4px',
      'border:1px solid var(--border-color, #555)',
      'border-radius:8px',
      'background:var(--panel-background, #202020)',
      'box-shadow:0 4px 18px rgba(0,0,0,.45)'
    ].join(';');
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.setAttribute('role', 'menuitem');
    removeButton.textContent = 'Remove audio from MDZip';
    styleActionButton(removeButton);
    actions.appendChild(removeButton);

    let lastPressPoint = null;
    let pressTimer = null;
    const clearPressTimer = () => {
      if (pressTimer !== null) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    const positionActions = () => {
      if (!actions.isConnected || !lastPressPoint) return;
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const width = actions.offsetWidth || 200;
      const height = actions.offsetHeight || 52;
      const minLeft = leftEdge + 8;
      const maxLeft = Math.max(minLeft, leftEdge + viewportWidth - width - 8);
      const left = Math.max(minLeft, Math.min(lastPressPoint.x - width / 2, maxLeft));
      const minTop = topEdge + 8;
      const maxTop = Math.max(minTop, topEdge + viewportHeight - height - 8);
      const above = lastPressPoint.y - height - 12;
      const below = lastPressPoint.y + 12;
      const top = above >= minTop ? above : below <= maxTop ? below : Math.max(minTop, Math.min(above, maxTop));
      actions.style.left = `${left}px`;
      actions.style.top = `${Math.max(minTop, Math.min(top, maxTop))}px`;
    };
    const hideActions = () => {
      actions.style.display = 'none';
      actions.remove();
    };
    const showActions = point => {
      lastPressPoint = point;
      if (!actions.isConnected) document.body.appendChild(actions);
      actions.style.display = 'block';
      positionActions();
    };
    const onLabelPointerDown = event => {
      if (event.isPrimary === false || (event.button != null && event.button !== 0)) return;
      const point = { x: event.clientX, y: event.clientY };
      clearPressTimer();
      pressTimer = setTimeout(() => {
        pressTimer = null;
        showActions(point);
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
      showActions({ x: event.clientX, y: event.clientY });
    };
    const dismissActions = event => {
      if (!wrapper.contains(event.target) && !actions.contains(event.target)) hideActions();
    };
    const removeAudio = event => {
      event.preventDefault();
      event.stopPropagation();
      hideActions();
      const removed = window.AndroidNative?.removeMdzipAudio?.(this.relativeLink) === true;
      if (!removed) {
        status.textContent = 'The MP3 could not be removed from this package.';
        status.style.display = 'block';
        return;
      }
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
    removeButton.addEventListener('click', removeAudio);
    document.addEventListener('pointerdown', dismissActions, true);
    window.visualViewport?.addEventListener('resize', positionActions);

    wrapper._audioCleanup = () => {
      clearPressTimer();
      hideActions();
      document.removeEventListener('pointerdown', dismissActions, true);
      window.visualViewport?.removeEventListener('resize', positionActions);
    };
    wrapper._audioActions = actions;
    wrapper._audioDismiss = dismissActions;
    return wrapper;
  }

  destroy(dom) {
    dom?._audioCleanup?.();
  }

  ignoreEvent(event) {
    return Boolean(event.target?.closest?.('.cm-mdzip-audio-preview-wrapper'));
  }
}
