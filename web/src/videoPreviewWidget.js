import { WidgetType } from '@codemirror/view';

export class VideoPreviewWidget extends WidgetType {
  constructor(src, label, relativeLink, markdown, from, to) {
    super();
    this.src = src;
    this.label = label;
    this.relativeLink = relativeLink;
    this.markdown = markdown;
    this.from = from;
    this.to = to;
  }

  eq(other) {
    return other instanceof VideoPreviewWidget &&
      other.src === this.src &&
      other.label === this.label &&
      other.relativeLink === this.relativeLink &&
      other.markdown === this.markdown &&
      other.from === this.from &&
      other.to === this.to;
  }

  toDOM(view) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-mdzip-video-preview-wrapper';
    wrapper.style.cssText = [
      'display:block',
      'box-sizing:border-box',
      'width:100%',
      'max-width:100%',
      'margin:10px 0',
      'padding:10px',
      'border:1px solid var(--border-color, #444)',
      'border-radius:8px',
      'background:var(--media-player-bg, #111)',
      'color:var(--media-controls-text, #fff)',
      'user-select:none',
      '-webkit-user-select:none'
    ].join(';');

    const header = document.createElement('div');
    header.className = 'cm-mdzip-video-label';
    header.textContent = this.label;
    header.title = 'Long-press for video options';
    header.style.cssText = [
      'font-size:13px',
      'line-height:1.4',
      'margin:0 0 8px',
      'overflow-wrap:anywhere',
      'color:var(--media-controls-text, #fff)',
      'touch-action:manipulation'
    ].join(';');
    wrapper.appendChild(header);

    const video = document.createElement('video');
    video.src = this.src;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.dataset.mdzipVideo = 'true';
    video.dataset.mdzipLink = this.relativeLink;
    video.setAttribute('webkit-playsinline', '');
    video.style.cssText = [
      'display:block',
      'width:100%',
      'max-width:100%',
      'max-height:65vh',
      'border-radius:var(--media-controls-radius, 8px)',
      'background:#000',
      'object-fit:contain'
    ].join(';');
    wrapper.appendChild(video);

    const status = document.createElement('div');
    status.className = 'cm-mdzip-video-status';
    status.hidden = true;
    status.textContent = 'Unable to play this MP4 video on this device.';
    status.style.cssText = 'font-size:13px;line-height:1.5;margin-top:8px;color:var(--media-controls-text,#fff)';
    wrapper.appendChild(status);
    video.addEventListener('error', () => {
      status.hidden = false;
    });

    let pressTimer = null;
    let menu = null;
    const cancelLongPress = () => {
      if (pressTimer !== null) clearTimeout(pressTimer);
      pressTimer = null;
    };
    const removeMenu = () => {
      menu?.remove();
      menu = null;
    };
    const showMenu = () => {
      if (menu) return;
      menu = document.createElement('div');
      menu.setAttribute('role', 'menu');
      menu.style.cssText = [
        'display:flex',
        'justify-content:flex-end',
        'margin-top:8px'
      ].join(';');
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = 'Remove video';
      removeButton.setAttribute('role', 'menuitem');
      removeButton.style.cssText = [
        'padding:8px 12px',
        'border:1px solid var(--border-color,#555)',
        'border-radius:6px',
        'background:var(--media-controls-bg,#242424)',
        'color:var(--media-controls-text,#fff)',
        'font:inherit'
      ].join(';');
      removeButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const currentText = view.state.doc.sliceString(this.from, this.to);
        if (currentText === this.markdown) {
          view.dispatch({
            changes: { from: this.from, to: this.to, insert: '' },
            userEvent: 'delete.mdzip-video'
          });
          view.focus();
        }
        removeMenu();
      });
      menu.appendChild(removeButton);
      wrapper.appendChild(menu);
    };

    header.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      cancelLongPress();
      pressTimer = setTimeout(showMenu, 550);
    });
    for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) {
      header.addEventListener(eventName, cancelLongPress);
    }
    header.addEventListener('contextmenu', event => {
      event.preventDefault();
      showMenu();
    });
    wrapper._cleanupVideoWidget = () => {
      cancelLongPress();
      removeMenu();
      video.pause();
      video.removeAttribute('src');
      video.load();
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
