const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const resDir = path.join(__dirname, '../../app/src/main/res');

function readPng(filePath) {
  const png = fs.readFileSync(filePath);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(png[24], 8, 'icons use 8-bit PNGs');
  assert.equal(png[25], 4, 'icons use grayscale plus real alpha');
  assert.equal(png[28], 0, 'icons are not interlaced');
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * 2;
  const pixels = Buffer.alloc(stride * height);
  function paeth(a, b, c) {
    const p = a + b - c;
    const distances = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
    return distances[0] <= distances[1] && distances[0] <= distances[2] ? a :
      distances[1] <= distances[2] ? b : c;
  }
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= 2 ? pixels[index - 2] : 0;
      const up = y ? pixels[index - stride] : 0;
      const upperLeft = y && x >= 2 ? pixels[index - stride - 2] : 0;
      const predictors = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)];
      assert.ok(filter <= 4);
      pixels[index] = (raw[y * (stride + 1) + 1 + x] + predictors[filter]) & 255;
    }
  }
  return { width, height, pixels, pixel(x, y) {
    const index = (Math.floor(y) * width + Math.floor(x)) * 2;
    return { gray: pixels[index], alpha: pixels[index + 1] };
  }};
}

function visiblePixels(png) {
  const result = [];
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const pixel = png.pixel(x, y);
      if (pixel.alpha >= 128) result.push({ x, y, ...pixel });
    }
  };
  return result;
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
    assert.doesNotMatch(xml, /<monochrome\b/);
  }

  assert.match(
    fs.readFileSync(path.join(resDir, 'values/colors.xml'), 'utf8'),
    /<color name="ic_launcher_background">#E5E5E5<\/color>/
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
      const icon = readPng(
        path.join(resDir, `drawable-${theme}${density}/ic_launcher_foreground.png`)
      );
      assert.equal(icon.width, size, `${theme}${density} foreground width`);
      assert.equal(icon.height, size, `${theme}${density} foreground height`);
      const mark = visiblePixels(icon);
      const x0 = Math.min(...mark.map(p => p.x));
      const x1 = Math.max(...mark.map(p => p.x));
      assert.ok(Math.abs(x1 - x0 + 1 - size / 2) <= 2, 'logo uses 54dp of the 108dp layer');
      assert.ok(Math.abs((x0 + x1) / 2 - (size - 1) / 2) <= 1, 'logo is centered');
      assert.ok(mark.length / size ** 2 > .03 && mark.length / size ** 2 < .06,
        'use the thin Wmdx mark, not the unrelated block W or an opaque circular badge');
      const safeRadius = size * 33 / 108;
      for (const pixel of mark) {
        assert.ok(Math.hypot(pixel.x + .5 - size / 2, pixel.y + .5 - size / 2) <= safeRadius + 1,
          'the complete logo fits Android’s safe circle rather than being cropped');
        if (pixel.alpha === 255) assert.equal(pixel.gray, theme ? 229 : 23);
      }
    }
  }
});

test('standalone APK icons match adaptive icon colors and have no nested background rim', () => {
  for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
    for (const theme of ['', 'night-']) {
      const directory = path.join(resDir, `mipmap-${theme}${density}`);
      const icon = readPng(path.join(directory, 'ic_launcher.png'));
      assert.equal(icon.width, size);
      assert.equal(icon.height, size);
      assert.deepEqual(fs.readFileSync(path.join(directory, 'ic_launcher.png')),
        fs.readFileSync(path.join(directory, 'ic_launcher_round.png')));
      assert.equal(icon.pixel(0, 0).alpha, 0, 'transparent corners outside the round fallback');
      for (const [x, y] of [[.04, .5], [.1, .5], [.5, .1], [.5, .9]]) {
        assert.deepEqual(icon.pixel(x * size, y * size), { gray: theme ? 23 : 229, alpha: 255 },
          'background extends to the icon edge with no inner circular backplate or colored ring');
      }
    }
  }
});
