import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';

const MARKDOWN_EXTENSIONS = new Set([
  'md',
  'markdown',
  'mdx',
  'mdz',
  'mdzip',
  'mdtxt',
  'textpack',
  'wmdx'
]);

export function getSourceLanguageMode(fileName) {
  const baseName = String(fileName || '').split(/[\\/]/).pop() || '';
  const extensionSeparator = baseName.lastIndexOf('.');
  if (extensionSeparator <= 0 || extensionSeparator === baseName.length - 1) return 'plain';
  const extension = baseName.slice(extensionSeparator + 1).toLowerCase();
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown';

  switch (extension) {
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'json':
    case 'jsonc':
      return 'javascript';
    case 'jsx':
      return 'jsx';
    case 'ts':
    case 'mts':
    case 'cts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'html':
    case 'htm':
    case 'xhtml':
    case 'xml':
    case 'svg':
      return 'html';
    case 'css':
      return 'css';
    default:
      return 'plain';
  }
}

export function sourceLanguageExtension(fileName) {
  switch (getSourceLanguageMode(fileName)) {
    case 'javascript':
      return javascript();
    case 'jsx':
      return javascript({ jsx: true });
    case 'typescript':
      return javascript({ typescript: true });
    case 'tsx':
      return javascript({ typescript: true, jsx: true });
    case 'html':
      return html();
    case 'css':
      return css();
    case 'markdown':
      return null;
    default:
      return [];
  }
}
