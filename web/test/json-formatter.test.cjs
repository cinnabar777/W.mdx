const assert = require('node:assert/strict');
const test = require('node:test');

test('JSON formatting changes whitespace only and preserves duplicate keys and number spelling', async () => {
  const { formatJsonWhitespace } = await import('../src/jsonFormatter.mjs');
  const source = '{"second":1e+03,"duplicate":true,"duplicate":false,"nested":[{"x":-0.0e2},null]}';
  const result = formatJsonWhitespace(source);

  assert.equal(result.ok, true);
  assert.equal(result.formatted, [
    '{',
    '  "second": 1e+03,',
    '  "duplicate": true,',
    '  "duplicate": false,',
    '  "nested": [',
    '    {',
    '      "x": -0.0e2',
    '    },',
    '    null',
    '  ]',
    '}'
  ].join('\n'));
});

test('JSON formatting preserves existing final-newline choice and handles scalar roots', async () => {
  const { formatJsonWhitespace } = await import('../src/jsonFormatter.mjs');

  assert.equal(formatJsonWhitespace(' { "ok" : true } ').formatted, '{\n  "ok": true\n}');
  assert.equal(formatJsonWhitespace('[1, 2]\n').formatted, '[\n  1,\n  2\n]\n');
  assert.equal(formatJsonWhitespace('1e+03').formatted, '1e+03');
  assert.equal(formatJsonWhitespace('null').formatted, 'null');
});

test('invalid JSON is reported with a location and has no formatted replacement', async () => {
  const { formatJsonWhitespace } = await import('../src/jsonFormatter.mjs');
  const result = formatJsonWhitespace('{\n  "ok": true,\n  "bad": }\n');

  assert.equal(result.ok, false);
  assert.equal(result.line, 3);
  assert.ok(result.column >= 1);
  assert.equal(Object.hasOwn(result, 'formatted'), false);
});
