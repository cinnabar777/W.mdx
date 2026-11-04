const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('attachment links parse local package paths and marked external asset paths', async () => {
  const { parseMarkdownAttachmentLink } = await import('../src/markdownMedia.js');

  assert.deepEqual(
    parseMarkdownAttachmentLink('[Reference PDF](attachments/reference.pdf)'),
    { label: 'Reference PDF', url: 'attachments/reference.pdf' }
  );
  assert.deepEqual(
    parseMarkdownAttachmentLink('[Word document](attachments/reference.doc)'),
    { label: 'Word document', url: 'attachments/reference.doc' }
  );
  assert.deepEqual(
    parseMarkdownAttachmentLink('[A & B](../attachments/a%20%26%20b.pdf)'),
    { label: 'A & B', url: '../attachments/a%20%26%20b.pdf' }
  );
  assert.deepEqual(
    parseMarkdownAttachmentLink('[Reference](../assets/reference.pdf "wmdx-attachment")'),
    { label: 'Reference', url: '../assets/reference.pdf' }
  );
  assert.equal(parseMarkdownAttachmentLink('[Website](https://example.com/file.pdf)'), null);
  assert.equal(parseMarkdownAttachmentLink('[Audio](audio/voice.mp3)'), null);
  assert.equal(parseMarkdownAttachmentLink('[Ordinary link](assets/reference.pdf)'), null);
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
    '[A\\] reference.pdf](attachments/A%20%26%20B%20%28final%29.pdf "wmdx-attachment")'
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

test('attachments expose whole-element edit, remove-link, and packaged-delete actions', () => {
  const widget = fs.readFileSync(
    path.join(__dirname, '../src/mdzipAttachmentWidget.js'),
    'utf8'
  );
  assert.match(widget, /button\.textContent = this\.label/);
  assert.match(widget, /button\.setAttribute\('aria-label', `Open \$\{this\.label\}`\)/);
  assert.doesNotMatch(widget, /Open attachment:/);
  assert.match(widget, /createAction\('Edit'/);
  assert.match(widget, /createAction\('Remove link'/);
  assert.match(widget, /createAction\('Delete'/);
  assert.match(widget, /canDeletePackagedAsset/);
  assert.match(widget, /deletePackagedAsset/);
  assert.match(widget, /changes: \{ from: this\.from, to: this\.to, insert: '' \}/);
  assert.match(widget, /userEvent: 'delete\.packaged-attachment'/);
  assert.match(widget, /sliceString\(this\.from, this\.to\) !== expectedMarkdown/);
  assert.match(widget, /--mdzip-attachment-border-radius/);
});

test('all document formats can resolve and open inserted attachments', () => {
  const main = fs.readFileSync(
    path.join(__dirname, '../src/main.js'),
    'utf8'
  );
  const widget = fs.readFileSync(
    path.join(__dirname, '../src/mdzipAttachmentWidget.js'),
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
  assert.match(native, /fun canOpenAttachment/);
  assert.match(native, /fun openAttachment/);
  assert.match(native, /resolveEmbeddedAttachmentUri\(relativeLink, sourceContextJson\)/);
  assert.match(native, /MdzipManager\.resolveAttachmentArchivePath\(/);
  assert.match(native, /DocumentFormat\.TEXT_PACK -> currentTextPackSession/);
  assert.match(native, /DocumentFormat\.MARKDOWN -> resolveMarkdownAssetUrl/);
  assert.match(
    main,
    /canOpenAttachment\?\.\([\s\S]*?JSON\.stringify\(attachmentSourceContext\)/
  );
  assert.match(widget, /openAttachment\?\.\([\s\S]*?this\.sourceContextJson/);
});
