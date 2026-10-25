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
  .filter(version => fs.existsSync(path.join(buildTools, version, 'aapt')))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
assert.ok(versions.length, 'aapt was not found in the Android SDK');
const aapt = path.join(buildTools, versions.at(-1), 'aapt');
const badging = execFileSync(aapt, ['dump', 'badging', apk], { encoding: 'utf8' });
const entries = new Set(execFileSync('unzip', ['-Z1', apk], { encoding: 'utf8' }).trim().split('\n'));
assert.ok(badging.includes(`package: name='${expectedPackage}'`), 'incorrect application ID');
assert.ok(badging.includes(`application-label:'${expectedLabel}'`), 'incorrect application label');
const icons = [...badging.matchAll(/application-icon-\d+:'([^']+)'/g)].map(match => match[1]);
assert.ok([...entries].some(icon => /res\/mipmap.*ic_launcher\.png$/.test(icon)), 'missing standalone PNG icon for APK inspectors');
assert.ok([...entries].some(icon => /res\/mipmap.*ic_launcher\.xml$/.test(icon)), 'missing adaptive launcher icon');
assert.ok(icons.length, 'no application icon was resolved by Android');
for (const icon of icons) {
  assert.match(icon, /mipmap.*ic_launcher\.(png|xml)$/, 'application must use the Wmdx icon, not a platform fallback');
  assert.ok(entries.has(icon), `packaged icon does not exist: ${icon}`);
}
const launcher = badging.match(/^launchable-activity:.*$/m)?.[0];
assert.ok(launcher?.includes(`label='${expectedLabel}'`), 'incorrect launcher label');
const launcherIcon = launcher.match(/icon='([^']+)'/)?.[1];
assert.ok(icons.includes(launcherIcon), 'launcher activity must use the same icon as the application');
console.log(`${expectedLabel}: application ID, launcher label, adaptive icon, and PNG fallback verified.`);
console.log([...new Set(icons)].join('\n'));
