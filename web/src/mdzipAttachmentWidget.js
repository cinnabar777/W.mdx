import { WidgetType } from '@codemirror/view';

export class MdzipAttachmentWidget extends WidgetType {
  constructor(
    label,
    relativeLink,
    documentSessionId,
    from,
    to,
    layout = null,
    onEdit = null
  ) {
    super();
    this.label = label || 'Attachment';
    this.relativeLink = relativeLink;
    this.documentSessionId = documentSessionId;
    this.from = from;
    this.to = to;
    this.layout = {
      width: Number(layout?.width ?? 100),
      alignment: ['left', 'center', 'right'].includes(layout?.alignment)
        ? layout.alignment
        : 'left'
    };
    this.onEdit = onEdit;
  }

  eq(other) {
    return other instanceof MdzipAttachmentWidget &&
      other.label === this.label &&
      other.relativeLink === this.relativeLink &&
      other.documentSessionId === this.documentSessionId &&
      other.from === this.from &&
      other.to === this.to &&
      other.layout.width === this.layout.width &&
      other.layout.alignment === this.layout.alignment;
  }

  toDOM(view) {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-mdzip-attachment-shell';
    wrapper.style.cssText = 'display:block;width:100%;';
    const expectedMarkdown = view?.state?.doc?.sliceString(this.from, this.to) ?? '';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-mdzip-attachment';
    button.textContent = `Open attachment: ${this.label}`;
    button.setAttribute('aria-label', `Open attachment: ${this.label}`);
    button.title = 'Open attachment';
    const alignmentMargin = this.layout.alignment === 'center'
      ? '4px auto'
      : this.layout.alignment === 'right'
        ? '4px 0 4px auto'
        : '4px 0';
    button.style.cssText = [
      'display:flex',
      'align-items:center',
      `width:${this.layout.width}%`,
      'max-width:100%',
      `margin:${alignmentMargin}`,
      'padding:var(--mdzip-attachment-padding-y, 7px) var(--mdzip-attachment-padding-x, 10px)',
      'border:var(--mdzip-attachment-border-width, 1px) solid var(--mdzip-attachment-border-color, rgba(127,127,127,.65))',
      'border-radius:var(--mdzip-attachment-border-radius, 8px)',
      'background:var(--mdzip-attachment-bg-color, var(--body-background-color, #202124))',
      'color:var(--mdzip-attachment-text-color, var(--body-text-color, var(--text-color, #f1f3f4)))',
      'font:inherit',
      'font-size:var(--mdzip-attachment-font-size, 14px)',
      'text-align:left',
      'white-space:normal',
      'overflow-wrap:anywhere',
      'touch-action:manipulation'
    ].join(';');
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (suppressNextClick) {
        suppressNextClick = false;
        hideActions();
        return;
      }
      hideActions();
      window.AndroidNative?.openMdzipAttachment?.(
        this.relativeLink,
        this.documentSessionId
      );
    });

    const actions = document.createElement('div');
    actions.className = 'cm-mdzip-attachment-actions';
    actions.setAttribute('role', 'menu');
    actions.setAttribute('aria-label', 'Attachment actions');
    actions.hidden = true;
    actions.style.cssText = [
      'position:fixed',
      'z-index:10020',
      'display:none',
      'gap:8px',
      'padding:8px',
      'border:1px solid var(--mdzip-attachment-border-color, rgba(127,127,127,.65))',
      'border-radius:12px',
      'background:var(--body-background-color, #202124)',
      'box-shadow:0 8px 24px rgba(0,0,0,.45)'
    ].join(';');
    const createAction = (label, action) => {
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.textContent = label;
      actionButton.setAttribute('role', 'menuitem');
      actionButton.style.cssText = [
        'border:0',
        'border-radius:8px',
        'padding:9px 12px',
        'background:transparent',
        'color:var(--body-text-color, var(--text-color, #f1f3f4))',
        'font:inherit'
      ].join(';');
      actionButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        hideActions();
        action();
      });
      actions.appendChild(actionButton);
    };

    let pressTimer = null;
    let suppressClickTimer = null;
    let pressStart = null;
    let longPressTriggered = false;
    let suppressNextClick = false;
    const clearPressTimer = () => {
      if (pressTimer !== null) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    const hideActions = () => {
      actions.hidden = true;
      actions.style.display = 'none';
      actions.remove();
    };
    const showActions = point => {
      actions.hidden = false;
      actions.style.display = 'flex';
      if (!actions.isConnected) document.body.appendChild(actions);
      actions.style.left = '0px';
      actions.style.top = '0px';
      const rect = actions.getBoundingClientRect();
      actions.style.left = `${Math.max(8, Math.min(point.x, window.innerWidth - rect.width - 8))}px`;
      actions.style.top = `${Math.max(8, Math.min(point.y - rect.height, window.innerHeight - rect.height - 8))}px`;
    };
    const onPointerDown = event => {
      if (event.isPrimary === false || (event.button != null && event.button !== 0)) return;
      pressStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      longPressTriggered = false;
      clearPressTimer();
      pressTimer = setTimeout(() => {
        pressTimer = null;
        if (!pressStart) return;
        longPressTriggered = true;
        suppressNextClick = true;
        clearTimeout(suppressClickTimer);
        suppressClickTimer = setTimeout(() => {
          suppressNextClick = false;
          suppressClickTimer = null;
        }, 500);
        showActions(pressStart);
      }, 550);
    };
    const onPointerMove = event => {
      if (pressStart?.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 12) {
        clearPressTimer();
        pressStart = null;
      }
    };
    const onPointerEnd = event => {
      if (pressStart && pressStart.pointerId !== event.pointerId) return;
      clearPressTimer();
      pressStart = null;
      if (longPressTriggered) event.preventDefault();
    };
    const onContextMenu = event => {
      event.preventDefault();
      event.stopPropagation();
      suppressNextClick = true;
      clearTimeout(suppressClickTimer);
      suppressClickTimer = setTimeout(() => {
        suppressNextClick = false;
        suppressClickTimer = null;
      }, 500);
      showActions({ x: event.clientX, y: event.clientY });
    };
    const dismissActions = event => {
      if (!wrapper.contains(event.target) && !actions.contains(event.target)) {
        hideActions();
      }
    };
    createAction('Edit', () => {
      if (typeof this.onEdit !== 'function') return;
      this.onEdit(view, {
        from: this.from,
        to: this.to,
        label: this.label,
        url: this.relativeLink,
        layout: this.layout
      });
    });
    createAction('Delete', () => {
      if (
        !view ||
        this.from < 0 ||
        this.to > view.state.doc.length ||
        this.from >= this.to ||
        view.state.doc.sliceString(this.from, this.to) !== expectedMarkdown
      ) return;
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: '' },
        selection: { anchor: this.from },
        userEvent: 'delete.mdzip-attachment'
      });
      view.focus();
    });

    button.addEventListener('pointerdown', onPointerDown);
    button.addEventListener('pointermove', onPointerMove);
    button.addEventListener('pointerup', onPointerEnd);
    button.addEventListener('pointercancel', onPointerEnd);
    button.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerdown', dismissActions, true);
    wrapper.appendChild(button);
    wrapper._cleanupMdzipAttachment = () => {
      clearPressTimer();
      clearTimeout(suppressClickTimer);
      hideActions();
      document.removeEventListener('pointerdown', dismissActions, true);
      button.removeEventListener('pointerdown', onPointerDown);
      button.removeEventListener('pointermove', onPointerMove);
      button.removeEventListener('pointerup', onPointerEnd);
      button.removeEventListener('pointercancel', onPointerEnd);
      button.removeEventListener('contextmenu', onContextMenu);
    };
    return wrapper;
  }

  ignoreEvent() {
    return true;
  }

  destroy(dom) {
    dom?._cleanupMdzipAttachment?.();
  }
}
