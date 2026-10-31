export function createMediaPreviewElement(document, type, src, label) {
  const media = document.createElement(type);
  media.controls = true;
  media.preload = 'metadata';
  media.setAttribute('aria-label', label || (type === 'audio' ? 'Audio' : 'Video'));
  media.src = src;
  media.style.cssText = type === 'video'
    ? 'display: block; width: 100%; max-width: 100%; max-height: 420px; border-radius: 6px; background: #000;'
    : 'display: block; width: 100%; max-width: 560px;';
  return media;
}
