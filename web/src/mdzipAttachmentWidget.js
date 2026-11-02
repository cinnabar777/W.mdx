import { WidgetType } from '@codemirror/view';

export class MdzipAttachmentWidget extends WidgetType {
  constructor(label, relativeLink, documentSessionId) {
    super();
    this.label = label || 'Attachment';
    this.relativeLink = relativeLink;
    this.documentSessionId = documentSessionId;
  }

  eq(other) {
    return other instanceof MdzipAttachmentWidget &&
      other.label === this.label &&
      other.relativeLink === this.relativeLink &&
      other.documentSessionId === this.documentSessionId;
  }

  toDOM() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-mdzip-attachment';
    button.textContent = `Open attachment: ${this.label}`;
    button.setAttribute('aria-label', `Open attachment: ${this.label}`);
    button.title = 'Open attachment';
    button.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'max-width:100%',
      'margin:4px 0',
      'padding:7px 10px',
      'border:1px solid var(--border-color, #555)',
      'border-radius:8px',
      'background:var(--surface-color, #202124)',
      'color:var(--text-color, #f1f3f4)',
      'font:inherit',
      'text-align:left',
      'white-space:normal',
      'overflow-wrap:anywhere',
      'touch-action:manipulation'
    ].join(';');
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      window.AndroidNative?.openMdzipAttachment?.(
        this.relativeLink,
        this.documentSessionId
      );
    });
    return button;
  }

  ignoreEvent() {
    return true;
  }
}
