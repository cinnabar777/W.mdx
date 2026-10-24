const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const resDir = path.join(__dirname, '../../app/src/main/res');

test('adaptive launcher icons use vector foregrounds and preserve day/night backgrounds', () => {
  const manifest = fs.readFileSync(
    path.join(resDir, '../AndroidManifest.xml'),
    'utf8'
  );
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);

  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    const xml = fs.readFileSync(path.join(resDir, 'mipmap-anydpi-v26', name), 'utf8');
    assert.match(xml, /<background android:drawable="@color\/ic_launcher_background"/);
    assert.match(xml, /<foreground android:drawable="@drawable\/ic_launcher_foreground"/);
    assert.match(xml, /<monochrome android:drawable="@drawable\/ic_launcher_monochrome"/);
  }

  assert.match(
    fs.readFileSync(path.join(resDir, 'values/colors.xml'), 'utf8'),
    /<color name="ic_launcher_background">#FFFFFF<\/color>/
  );
  assert.match(
    fs.readFileSync(path.join(resDir, 'values-night/colors.xml'), 'utf8'),
    /<color name="ic_launcher_background">#171717<\/color>/
  );

  // Vector foregrounds must exist in drawable/ and drawable-night/
  assert.ok(fs.existsSync(path.join(resDir, 'drawable/ic_launcher_foreground.xml')));
  assert.ok(fs.existsSync(path.join(resDir, 'drawable-night/ic_launcher_foreground.xml')));
  assert.ok(fs.existsSync(path.join(resDir, 'drawable/ic_launcher_monochrome.xml')));

  // Density folders must not contain raster ic_launcher_foreground.png files that shadow vector XMLs
  const densityDirs = ['hdpi', 'mdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  for (const density of densityDirs) {
    assert.ok(!fs.existsSync(path.join(resDir, `drawable-${density}/ic_launcher_foreground.png`)));
    assert.ok(!fs.existsSync(path.join(resDir, `drawable-night-${density}/ic_launcher_foreground.png`)));
  }
});
