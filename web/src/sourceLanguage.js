import { cpp } from '@codemirror/lang-cpp';
import { css } from '@codemirror/lang-css';
import { go } from '@codemirror/lang-go';
import { html } from '@codemirror/lang-html';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { php } from '@codemirror/lang-php';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';

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

export const SOURCE_LANGUAGE_OPTIONS = Object.freeze([
  { value: 'auto', label: 'Automatic (filename)' },
  { value: 'plain', label: 'Plain Text' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'jsx', label: 'JavaScript / JSX' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'tsx', label: 'TypeScript / TSX' },
  { value: 'html', label: 'HTML / XML / SVG' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'python', label: 'Python' },
  { value: 'sql', label: 'SQL' },
  { value: 'java', label: 'Java' },
  { value: 'rust', label: 'Rust' },
  { value: 'cpp', label: 'C / C++' },
  { value: 'go', label: 'Go' },
  { value: 'php', label: 'PHP' }
]);

const SOURCE_LANGUAGE_IDS = new Set(
  SOURCE_LANGUAGE_OPTIONS.map(option => option.value)
);

export function normalizeSourceLanguageOverride(value) {
  const normalized = String(value || 'auto').trim().toLowerCase();
  return SOURCE_LANGUAGE_IDS.has(normalized) ? normalized : 'auto';
}

function getLanguageFromExtension(fileName) {
  const baseName = String(fileName || '').split(/[\\/]/).pop() || '';
  const extensionSeparator = baseName.lastIndexOf('.');
  if (extensionSeparator <= 0 || extensionSeparator === baseName.length - 1) return 'plain';
  const extension = baseName.slice(extensionSeparator + 1).toLowerCase();
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown';

  switch (extension) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'json':
    case 'jsonc':
      return 'json';
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
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'py':
    case 'pyw':
      return 'python';
    case 'sql':
      return 'sql';
    case 'java':
      return 'java';
    case 'rs':
      return 'rust';
    case 'c':
    case 'h':
    case 'cc':
    case 'cpp':
    case 'cxx':
    case 'hh':
    case 'hpp':
    case 'hxx':
      return 'cpp';
    case 'go':
      return 'go';
    case 'php':
    case 'phtml':
      return 'php';
    default:
      return 'plain';
  }
}

export function getSourceLanguageMode(fileName, override = 'auto') {
  const normalizedOverride = normalizeSourceLanguageOverride(override);
  return normalizedOverride === 'auto'
    ? getLanguageFromExtension(fileName)
    : normalizedOverride;
}

export function sourceLanguageExtension(fileName, override = 'auto') {
  switch (getSourceLanguageMode(fileName, override)) {
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
    case 'json':
      return json();
    case 'yaml':
      return yaml();
    case 'python':
      return python();
    case 'sql':
      return sql();
    case 'java':
      return java();
    case 'rust':
      return rust();
    case 'cpp':
      return cpp();
    case 'go':
      return go();
    case 'php':
      return php();
    case 'markdown':
      return null;
    default:
      return [];
  }
}
