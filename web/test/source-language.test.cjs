const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Source selects a parser from common code-file extensions', async () => {
  const { getSourceLanguageMode, sourceLanguageExtension } =
    await import('../src/sourceLanguage.js');
  const expected = new Map([
    ['/project/example.js', 'javascript'],
    ['example.json', 'json'],
    ['component.jsx', 'jsx'],
    ['module.ts', 'typescript'],
    ['component.tsx', 'tsx'],
    ['page.html', 'html'],
    ['document.xml', 'html'],
    ['styles.css', 'css'],
    ['settings.yaml', 'yaml'],
    ['settings.yml', 'yaml'],
    ['script.py', 'python'],
    ['query.sql', 'sql'],
    ['Main.java', 'java'],
    ['lib.rs', 'rust'],
    ['engine.cpp', 'cpp'],
    ['module.go', 'go'],
    ['index.php', 'php'],
    ['notes.md', 'markdown'],
    ['archive.mdz', 'markdown'],
    ['readme.wmdx', 'markdown'],
    ['notes.txt', 'plain'],
    ['README', 'plain'],
    ['.gitignore', 'plain'],
    ['unknown.custom', 'plain']
  ]);

  for (const [fileName, mode] of expected) {
    assert.equal(getSourceLanguageMode(fileName), mode, fileName);
    const extension = sourceLanguageExtension(fileName);
    if (mode === 'markdown') {
      assert.equal(extension, null, `${fileName} uses the Markdown parser`);
    } else if (mode === 'plain') {
      assert.deepEqual(extension, [], `${fileName} stays unhighlighted plain text`);
    } else {
      assert.ok(extension, `${fileName} should have a CodeMirror language extension`);
    }
  }

  assert.equal(getSourceLanguageMode('notes.txt', 'python'), 'python');
  assert.equal(getSourceLanguageMode('notes.txt', 'invalid'), 'plain');
  assert.equal(getSourceLanguageMode('notes.md', 'json'), 'json');
});

test('the Android document filename selects a parser only in Source/Code', () => {
  const projectRoot = path.join(__dirname, '../../');
  const main = fs.readFileSync(path.join(projectRoot, 'web/src/main.js'), 'utf8');
  const activity = fs.readFileSync(
    path.join(projectRoot, 'app/src/main/java/com/wmdx/markdownapp/MainActivity.kt'),
    'utf8'
  );

  assert.match(
    main,
    /function getEditorLanguageExtension\(\) \{[\s\S]*?currentEditorMode === 'source'[\s\S]*?sourceLanguageExtension\([\s\S]*?currentEditorFileName,[\s\S]*?getCurrentSourceLanguageOverride\(\)[\s\S]*?if \(sourceExtension !== null\) return sourceExtension/
  );
  assert.match(main, /registerMarkdownParserView\([\s\S]*?getEditorLanguageExtension/);
  assert.match(main, /id: 'sourceLanguage', title: 'Source \/ Code Language'/);
  assert.match(main, /function openSourceLanguageDialog\(\)/);
  assert.match(main, /setDocumentTitle: function\(title, documentKey, fileName\)/);
  assert.match(main, /setCurrentSourceDocumentKey\(String\(documentKey\)\)/);
  assert.match(main, /setCurrentEditorFileName\(fileName, documentIdentityChanged\)/);
  assert.match(activity, /val escapedFileName = JSONObjectWrapper\.quote\(currentFileName\)/);
  assert.match(activity, /setDocumentTitle\(\$escapedTitle, \$escapedDocumentKey, \$escapedFileName\)/);
});
