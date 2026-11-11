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

test('Source language parsers tokenize representative code samples', async () => {
  const [{ EditorState }, { syntaxTree }, { sourceLanguageExtension }] =
    await Promise.all([
      import('@codemirror/state'),
      import('@codemirror/language'),
      import('../src/sourceLanguage.js')
    ]);
  const cases = [
    ['JavaScript', 'module.js', 'const answer = "x";', 'VariableDeclaration'],
    ['JSON', 'data.json', '{"key": true}', 'Property'],
    ['YAML', 'data.yaml', 'name: test', 'BlockMapping'],
    ['Python', 'script.py', 'def greet(name): return name', 'FunctionDefinition'],
    ['SQL', 'query.sql', 'SELECT * FROM users;', 'Keyword'],
    ['Java', 'Example.java', 'class Example { int value = 1; }', 'ClassDeclaration'],
    ['Rust', 'main.rs', 'fn main() { let value = 1; }', 'FunctionItem'],
    ['C++', 'main.cpp', 'int main() { return 0; }', 'FunctionDefinition'],
    ['Go', 'main.go', 'package main\nfunc main() {}', 'FunctionDecl'],
    ['PHP', 'index.php', '<?php echo "hello";', 'EchoStatement'],
    ['HTML', 'page.html', '<p>hello</p>', 'Element'],
    ['CSS', 'styles.css', '.thing { color: red; }', 'RuleSet'],
    ['manual Python override', 'notes.txt', 'def greet(name): return name', 'FunctionDefinition', 'python']
  ];

  for (const [label, fileName, source, expectedNode, override = 'auto'] of cases) {
    const state = EditorState.create({
      doc: source,
      extensions: sourceLanguageExtension(fileName, override)
    });
    const nodeNames = new Set();
    syntaxTree(state).iterate({
      enter(node) {
        nodeNames.add(node.name);
      }
    });
    assert.ok(nodeNames.has(expectedNode), `${label} should produce ${expectedNode}`);
  }
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
