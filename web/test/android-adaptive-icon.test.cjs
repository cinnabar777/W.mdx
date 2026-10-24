const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const resDir = path.join(__dirname, '../../app/src/main/res');

function readPngInfo(filePath) {
  const png = fs.readFileSync(filePath);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png[25]
  };
}

test('adaptive launcher icons use transparent full-color layers and preserve requested day/night backgrounds', () => {
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
    /<color name="ic_launcher_background">#C3C3C3<\/color>/
  );
  assert.match(
    fs.readFileSync(path.join(resDir, 'values-night/colors.xml'), 'utf8'),
    /<color name="ic_launcher_background">#171717<\/color>/
  );

  const densitySizes = {
    mdpi: 108,
    hdpi: 162,
    xhdpi: 216,
    xxhdpi: 324,
    xxxhdpi: 432
  };
  for (const [density, size] of Object.entries(densitySizes)) {
    for (const theme of ['', 'night-']) {
      const icon = readPngInfo(
        path.join(resDir, `drawable-${theme}${density}/ic_launcher_foreground.png`)
      );
      assert.equal(icon.width, size, `${theme}${density} foreground width`);
      assert.equal(icon.height, size, `${theme}${density} foreground height`);
      assert.equal(icon.colorType, 4, `${theme}${density} foreground must contain alpha`);
    }
  }
});
