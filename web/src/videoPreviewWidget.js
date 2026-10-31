import { WidgetType } from '@codemirror/view';

export class VideoPreviewWidget extends WidgetType {
  constructor(src, label, relativeLink) {
    super();
    this.src = src;
    this.label = label;
    this.relativeLink = relativeLink;
  }

  eq(other) {
    return other instanceof VideoPreviewWidget &&
      other.src === this.src &&
      other.label === this.label &&
      other.relativeLink === this.relativeLink;
  }

  toDOM() {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-mdzip-video-preview-wrapper';
    wrapper.style.cssText = 'display:block;width:100%;max-width:100%;margin:10px 0';

    const video = document.createElement('video');
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
      'color-scheme:inherit'
    ].join(';');
    wrapper.appendChild(video);

    const status = document.createElement('div');
    status.className = 'cm-mdzip-video-status';
    status.hidden = true;
    status.textContent = 'Unable to play this video on this device.';
    status.style.cssText = 'font-size:13px;line-height:1.5;margin-top:8px;color:var(--media-controls-text,#fff)';
    wrapper.appendChild(status);
    let widgetDisposed = false;
    video.addEventListener('error', () => {
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
    video.addEventListener('playing', () => {
      status.hidden = true;
    });

    wrapper._cleanupVideoWidget = () => {
      widgetDisposed = true;
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
