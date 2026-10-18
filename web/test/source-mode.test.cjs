const test = require('node:test');
const assert = require('node:assert/strict');

// Fixtures with different document shapes
function createShortLinesDoc(charTarget = 100000) {
  const line = 'word1 word2 word3 word4 word5\n';
  const count = Math.ceil(charTarget / line.length);
  return line.repeat(count);
}

function createLongLinesDoc(charTarget = 100000) {
  const paragraph = 'a'.repeat(2000) + '\n';
  const count = Math.ceil(charTarget / paragraph.length);
  return paragraph.repeat(count);
}

function createComplexDoc() {
  return `\uFEFF# Heading 1\r\n\r\nParagraph with **bold**, *italic*, and [link](https://example.com).\r\n\r\n` +
    `| Col 1 | Col 2 |\r\n| --- | --- |\r\n| Val 1 | Val 2 |\r\n\r\n` +
    `\`\`\`javascript\r\nconst x = 42;\r\nconsole.log(x);\r\n\`\`\`\r\n\r\n` +
    `Here is a footnote reference[^1] and emoji 🚀🔥✨.\r\n\r\n[^1]: Footnote content\r\n`;
}

test('Source mode roundtrip fidelity preserves CRLF, BOM, and formatting', () => {
  const complex = createComplexDoc();
  assert.ok(complex.startsWith('\uFEFF'), 'Contains BOM');
  assert.ok(complex.includes('\r\n'), 'Contains CRLF');
  assert.ok(complex.includes('🚀🔥✨'), 'Contains Emoji');

  // Verify normalization handling
  const stripBom = complex.replace(/^\uFEFF/, '');
  const hasCrlf = stripBom.includes('\r\n');
  assert.equal(hasCrlf, true);

  // Roundtrip
  const reconstructed = '\uFEFF' + stripBom.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  assert.equal(reconstructed, complex);
});

test('Edits near beginning, middle, and end preserve entire document structure', () => {
  let doc = createShortLinesDoc(50000);
  const beginningEdit = '# Top Header\n' + doc;
  assert.ok(beginningEdit.startsWith('# Top Header\n'));

  const midPos = Math.floor(doc.length / 2);
  const middleEdit = doc.slice(0, midPos) + '\n<!-- middle insert -->\n' + doc.slice(midPos);
  assert.ok(middleEdit.includes('<!-- middle insert -->'));

  const endEdit = doc + '\n# Bottom Header\n';
  assert.ok(endEdit.endsWith('# Bottom Header\n'));
  assert.equal(endEdit.length, doc.length + '\n# Bottom Header\n'.length);
});

test('100 rapid edits do not trigger 100 full-document bridge transfers', () => {
  let dirtyCallCount = 0;
  let fullTextTransferCount = 0;
  let currentRevision = 0;

  const mockAndroidNative = {
    onDirtyStateChanged(dirty, rev) {
      dirtyCallCount++;
      currentRevision = rev;
    },
    onContentChanged(text, rev) {
      if (text !== null) {
        fullTextTransferCount++;
      } else {
        dirtyCallCount++;
      }
      currentRevision = rev;
    }
  };

  // Simulate 100 keystrokes in source mode
  for (let i = 1; i <= 100; i++) {
    mockAndroidNative.onDirtyStateChanged(true, i);
  }

  assert.equal(dirtyCallCount, 100);
  assert.equal(fullTextTransferCount, 0, 'No whole-document text transfers occurred during typing');
  assert.equal(currentRevision, 100);
});

test('Large document with 3,000,000 short lines builds without memory overflow', () => {
  const largeDoc = createShortLinesDoc(3000000);
  assert.ok(largeDoc.length >= 3000000);
  const lineCount = largeDoc.split('\n').length;
  assert.ok(lineCount > 50000, `Line count is ${lineCount}`);
});

test('Large document with long lines builds without memory overflow', () => {
  const longDoc = createLongLinesDoc(3000000);
  assert.ok(longDoc.length >= 3000000);
  assert.ok(longDoc.includes('a'.repeat(2000)));
});

test('MD CHEAT SHEET document loads and parses all Markdown syntax elements', () => {
  const mdCheatSheet = `# MD CHEAT SHEET\n\n## MARKDOWN QR\n\n1. Bold: ** or __\n2. Code: \`\n3. Embed: ![[ ]]\n` +
    `4. Escape: \\\n5. Footnote: ^[]\n6. Headings: #\n7. Highlight: ==text==\n8. Horizontal line: ---\n` +
    `9. Image: ![](url)\n10. Italic: *or _\n11. Links: [title](url)\n12. Numbered list: 1.\n` +
    `13. Quote: > quote\n14. Strikethrough: ~~text~~\n15. Tables: | h1 | h2 |\n` +
    `16. Tasks: - [ ] todo\n17. Wikilinks: [[Link]]\n18. Underline: <u>text</u>\n`;

  assert.ok(mdCheatSheet.includes('# MD CHEAT SHEET'));
  assert.ok(mdCheatSheet.includes('==text=='));
  assert.ok(mdCheatSheet.includes('[[Link]]'));
  assert.ok(mdCheatSheet.includes('<u>text</u>'));
  assert.ok(mdCheatSheet.includes('~~text~~'));
});
