const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const previewHtml = fs.readFileSync(
  path.join(__dirname, '../findreplace-settings-preview.html'),
  'utf8'
);
const previewScript = fs.readFileSync(
  path.join(__dirname, '../src/findreplaceSettingsPreview.js'),
  'utf8'
);

test('find and replace preview matches live icon sizing and saved button layout', () => {
  const dom = new JSDOM(previewHtml, { runScripts: 'outside-only' });
  const { document } = dom.window;
  dom.window.eval(previewScript);

  let savedLayout = null;
  let selectedCategory = null;
  dom.window.FindReplaceSettings = {
    saveButtonLayout: (...args) => {
      savedLayout = args;
      return 'saved';
    },
    selectCategory: category => {
      selectedCategory = category;
    }
  };

  dom.window.applyFindReplaceSettings({
    pref_findreplace_field_height: 50,
    pref_findreplace_btn_prev_width: 42,
    pref_findreplace_button_row1: 'next,prev,highlight,regex,close',
    pref_findreplace_button_row2: 'case,word,replace-one,replace-all',
    pref_findreplace_hidden_buttons: 'regex'
  });

  assert.equal(
    document.querySelector('#search-btn-prev').style.getPropertyValue('--findreplace-icon-size'),
    '34px'
  );
  assert.equal(
    document.documentElement.style.getPropertyValue('--findreplace-prev-width'),
    '42px'
  );
  assert.equal(
    document.querySelector('#findreplace-row1').firstElementChild.dataset.buttonId,
    'next'
  );
  assert.equal(
    document.querySelector('#findreplace-row1').contains(document.querySelector('#search-btn-regex')),
    false
  );
  assert.equal(
    document.querySelector('.findreplace-preview-hidden-button').textContent,
    '+ Regex'
  );

  document.querySelector('.findreplace-preview-hidden-button').click();
  assert.ok(document.querySelector('#findreplace-row1').contains(document.querySelector('#search-btn-regex')));
  assert.deepEqual(savedLayout, ['next,prev,highlight,regex,close', 'case,word,replace-one,replace-all', '']);

  document.querySelector('#replace-input').click();
  assert.equal(selectedCategory, 'category_field_replace');
  document.querySelector('#search-btn-prev').click();
  assert.equal(selectedCategory, 'category_btn_prev');
  dom.window.close();
});
