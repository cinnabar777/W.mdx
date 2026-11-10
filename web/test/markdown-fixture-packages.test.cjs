const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('Markdown compatibility MDZip fixtures contain every current local resource', () => {
  const repositoryRoot = path.resolve(__dirname, '../..');
  const checker = path.join(
    repositoryRoot,
    'Documentation/Markdown-Fixtures/build_mdz.py',
  );
  const output = execFileSync('python3', [checker, '--check'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  for (const flavor of ['CommonMark', 'GFM', 'Obsidian', 'Markdown-Syntax']) {
    assert.match(output, new RegExp(`${flavor}.*archive and every packaged file verified`));
  }
});
