// Check the packaged APK, rather than trusting source resource names alone.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const [apk, expectedPackage, expectedLabel] = process.argv.slice(2);
assert.ok(apk && expectedPackage && expectedLabel, 'usage: verify-apk-icons.cjs APK PACKAGE LABEL');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
assert.ok(sdk, 'Android SDK is required for packaged icon verification');
const buildTools = path.join(sdk, 'build-tools');
const versions = fs.readdirSync(buildTools)
  .filter(version => fs.existsSync(path.join(buildTools, version, 'aapt2')))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
assert.ok(versions.length, 'aapt2 was not found in the Android SDK');
const aapt = path.join(buildTools, versions.at(-1), 'aapt2');
const badging = execFileSync(aapt, ['dump', 'badging', apk], { encoding: 'utf8' });
const entries = new Set(execFileSync('unzip', ['-Z1', apk], { encoding: 'utf8' }).trim().split('\n'));
assert.ok(badging.includes(`package: name='${expectedPackage}'`), 'incorrect application ID');
assert.ok(badging.includes(`application-label:'${expectedLabel}'`), 'incorrect application label');

// Release optimization rewrites paths such as res/mipmap-mdpi/ic_launcher.png
// to res/9w.png. Resolve the compiled resource table, never infer identity from
// ZIP filenames. Inspect both launcher resources, including their night assets.
const table = execFileSync(aapt, ['dump', 'resources', apk], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const resources = new Map();
let current;
for (const line of table.split('\n')) {
  const resource = line.match(/^\s*resource (0x[0-9a-f]+) (\S+)\s*$/i);
  if (resource) {
    current = { id: resource[1], files: [] };
    resources.set(resource[2], current);
  } else {
    const file = line.match(/^\s*\(([^)]*)\) \(file\) (\S+) type=(\w+)/);
    if (file && current) current.files.push({ config: file[1], path: file[2], type: file[3] });
  }
}
const foreground = resources.get('drawable/ic_launcher_foreground');
const background = resources.get('color/ic_launcher_background');
assert.ok(foreground && background, 'missing adaptive foreground or background resource');
for (const name of ['mipmap/ic_launcher', 'mipmap/ic_launcher_round', 'drawable/ic_launcher_foreground']) {
  const resource = resources.get(name);
  assert.ok(resource, `missing ${name} resource`);
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    for (const night of [false, true]) {
      assert.ok(resource.files.some(file => file.type === 'PNG' &&
        file.config.split('-').includes(density) &&
        file.config.split('-').includes('night') === night),
      `${name}: missing standalone PNG for ${night ? 'night-' : ''}${density}`);
    }
  }
  for (const file of resource.files) {
    assert.ok(entries.has(file.path), `packaged icon does not exist: ${file.path}`);
    if (expectedPackage === 'com.wmdx.markdownapp') {
      const night = file.config.split('-').includes('night');
      const variant = night ? 'night-' : '';
      const basename = name === 'mipmap/ic_launcher_round' ? 'ic_launcher_round' :
        name === 'drawable/ic_launcher_foreground' ? 'ic_launcher_foreground' : 'ic_launcher';
      const density = file.config.split('-').find(value =>
        ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].includes(value));
      const expectedPath = file.type === 'XML'
        ? `res/mipmap-${variant}anydpi-v26/${basename}.xml`
        : `res/${name.startsWith('drawable/') ? 'drawable' : 'mipmap'}-${variant}${density}-v${night ? 8 : 4}/${basename}.png`;
      assert.equal(file.path, expectedPath,
        'release resource optimization changed the standard icon filename used by APK browsers');
    }
    if (file.type === 'XML') {
      const xml = execFileSync(aapt, ['dump', 'xmltree', '--file', file.path, apk], { encoding: 'utf8' });
      assert.match(xml, /E: adaptive-icon\b/, `${name}: expected adaptive-icon root`);
      for (const [tag, id] of [['background', background.id], ['foreground', foreground.id]]) {
        assert.match(xml, new RegExp(`E: ${tag}\\b[\\s\\S]*?drawable[^\\n]*=@${id}\\b`),
          `${name}: ${tag} must reference the shared Wmdx resource`);
      }
    }
  }
  if (name.startsWith('mipmap/')) {
    for (const night of [false, true]) {
      assert.ok(resource.files.some(file => file.type === 'XML' &&
        file.config.split('-').includes('anydpi') &&
        file.config.split('-').includes('night') === night),
      `${name}: missing ${night ? 'night' : 'default'} adaptive XML; legacy PNGs could override it`);
    }
  }
}

const icons = [...badging.matchAll(/application-icon-\d+:'([^']+)'/g)].map(match => match[1]);
assert.ok(icons.length, 'no application icon was resolved by Android');
const launcherPaths = new Set(resources.get('mipmap/ic_launcher').files.map(file => file.path));
for (const icon of icons) {
  assert.ok(launcherPaths.has(icon), 'application must use the Wmdx resource, not a platform fallback');
  assert.ok(entries.has(icon), `packaged icon does not exist: ${icon}`);
}
const launcher = badging.match(/^launchable-activity:.*$/m)?.[0];
assert.ok(launcher?.includes(`label='${expectedLabel}'`), 'incorrect launcher label');
const launcherIcon = launcher.match(/icon='([^']*)'/);
// An empty activity icon means Android inherits the application's icon.
assert.ok(launcherIcon && (!launcherIcon[1] || icons.includes(launcherIcon[1])),
  'launcher activity must use the same icon as the application');
console.log(`${expectedLabel}: application ID, launcher label, adaptive icon, and PNG fallback verified.`);
console.log([...new Set(icons)].join('\n'));
