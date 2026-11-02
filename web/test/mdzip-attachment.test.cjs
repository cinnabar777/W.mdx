const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('MDZip attachment links parse only local attachment paths', async () => {
  const { parseMarkdownAttachmentLink } = await import('../src/markdownMedia.js');

  assert.deepEqual(
    parseMarkdownAttachmentLink('[Reference PDF](attachments/reference.pdf)'),
    { label: 'Reference PDF', url: 'attachments/reference.pdf' }
  );
  assert.deepEqual(
    parseMarkdownAttachmentLink('[A & B](../attachments/a%20%26%20b.pdf)'),
    { label: 'A & B', url: '../attachments/a%20%26%20b.pdf' }
  );
  assert.equal(parseMarkdownAttachmentLink('[Website](https://example.com/file.pdf)'), null);
  assert.equal(parseMarkdownAttachmentLink('[Audio](audio/voice.mp3)'), null);
  assert.equal(parseMarkdownAttachmentLink('![Image](attachments/photo.png)'), null);
});

test('MDZip attachment link formatting escapes labels and filename characters', async () => {
  const { formatMarkdownAttachmentLink, parseMarkdownAttachmentLink } =
    await import('../src/markdownMedia.js');
  const markdown = formatMarkdownAttachmentLink(
    'A] reference.pdf',
    'attachments/A & B (final).pdf'
  );

  assert.equal(
    markdown,
    '[A\\] reference.pdf](attachments/A%20%26%20B%20%28final%29.pdf)'
  );
  assert.deepEqual(parseMarkdownAttachmentLink(markdown), {
    label: 'A] reference.pdf',
    url: 'attachments/A%20%26%20B%20%28final%29.pdf'
  });
});

test('MDZip attachment width and alignment metadata round-trip safely', async () => {
  const { formatMarkdownAttachmentLink, parseMarkdownAttachmentLink } =
    await import('../src/markdownMedia.js');
  const markdown = formatMarkdownAttachmentLink(
    'Project files',
    'attachments/project files.zip',
    { width: 65, alignment: 'center' }
  );

  assert.equal(
    markdown,
    '[Project files](attachments/project%20files.zip "wmdx-attachment:width=65;align=center")'
  );
  assert.deepEqual(parseMarkdownAttachmentLink(markdown), {
    label: 'Project files',
    url: 'attachments/project%20files.zip',
    layout: { width: 65, alignment: 'center' }
  });
  const parsed = parseMarkdownAttachmentLink(markdown);
  assert.equal(
    formatMarkdownAttachmentLink(
      'Renamed files',
      parsed.url.split('/').map(decodeURIComponent).join('/'),
      { width: 65, alignment: 'center' }
    ),
    '[Renamed files](attachments/project%20files.zip "wmdx-attachment:width=65;align=center")'
  );
  assert.throws(
    () => formatMarkdownAttachmentLink('Bad width', 'attachments/file.pdf', {
      width: 20,
      alignment: 'left'
    }),
    /Attachment width/
  );
});

test('MDZip attachments expose whole-element edit and delete actions in the widget', () => {
  const widget = fs.readFileSync(
    path.join(__dirname, '../src/mdzipAttachmentWidget.js'),
    'utf8'
  );
  assert.match(widget, /createAction\('Edit'/);
  assert.match(widget, /createAction\('Delete'/);
  assert.match(widget, /changes: \{ from: this\.from, to: this\.to, insert: '' \}/);
  assert.match(widget, /userEvent: 'delete\.mdzip-attachment'/);
  assert.match(widget, /sliceString\(this\.from, this\.to\) !== expectedMarkdown/);
  assert.match(widget, /--mdzip-attachment-border-radius/);
});

test('both insert toolbars expose the generic attachment picker', () => {
  const main = fs.readFileSync(
    path.join(__dirname, '../src/main.js'),
    'utf8'
  );
  const native = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/MainActivity.kt'),
    'utf8'
  );
  assert.equal((main.match(/title: 'Attach File'/g) || []).length, 2);
  assert.match(main, /insertAttachmentLink: function/);
  assert.match(main, /new MdzipAttachmentWidget/);
  assert.match(native, /pickAttachmentLauncher\.launch\(arrayOf\("\*\/\*"\)\)/);
  assert.match(native, /fun canOpenMdzipAttachment/);
  assert.match(native, /fun openMdzipAttachment/);
});
