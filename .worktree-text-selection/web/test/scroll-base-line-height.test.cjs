const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `CSS rule exists: ${selector}`);
  return match[1];
}

test('base content line height follows active body typography', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const content = ruleBody(html, '.cm-content');

  assert.match(
    content,
    /line-height:\s*var\(--paragraph-line-height,\s*1\.6\)\s*!important/i
  );
  assert.doesNotMatch(content, /line-height:\s*normal/i);

  assert.match(html, /\.cm-content \.cm-paragraph:not\(\.cm-list-item\)[\s\S]*?line-height:\s*var\(--paragraph-line-height,\s*1\.6\)\s*!important/i);
  assert.match(html, /\.cm-content \.cm-list-item[\s\S]*?line-height:\s*var\(--list-line-height,\s*1\.5\)\s*!important/i);
  assert.match(html, /\.cm-content \.cm-heading[\s\S]*?line-height:\s*var\(--heading-line-height,\s*1\.2\)\s*!important/i);
});
