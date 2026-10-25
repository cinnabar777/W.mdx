const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../tools/verify-apk-icons.cjs'), 'utf8');
const png = 'res/mipmap-mdpi-v4/ic_launcher.png';
const adaptive = 'res/mipmap-anydpi-v26/ic_launcher.xml';
function verify({ entries = [png, adaptive], launcherIcon = adaptive, applicationIcon = adaptive } = {}) {
  const badging = [
    "package: name='com.wmdx.markdownapp.debug' versionCode='1'",
    "application-label:'Wmdx-debug'",
    `application-icon-160:'${png}'`,
    `application-icon-65534:'${applicationIcon}'`,
    `launchable-activity: name='com.wmdx.markdownapp.DocumentDispatchActivity' label='Wmdx-debug' icon='${launcherIcon}'`
  ].join('\n');
  vm.runInNewContext(source, {
    process: {
      argv: ['node', 'verify-apk-icons.cjs', 'test.apk', 'com.wmdx.markdownapp.debug', 'Wmdx-debug'],
      env: { ANDROID_HOME: '/sdk' }
    },
    console: { log() {} },
    require(name) {
      if (name === 'node:fs') return { readdirSync: () => ['34.0.0'], existsSync: () => true };
      if (name === 'node:child_process') return {
        execFileSync: executable => executable === 'unzip' ? entries.join('\n') : badging
      };
      return require(name);
    }
  });
}

test('APK verification accepts adaptive or legacy configuration resolution for the same icon', () => {
  verify();
  verify({ launcherIcon: png });
});

test('APK verification rejects missing fallback artwork and mismatched launcher icons', () => {
  assert.throws(() => verify({ entries: [adaptive] }), /missing standalone PNG/);
  assert.throws(() => verify({ entries: [png] }), /missing adaptive launcher/);
  assert.throws(() => verify({ launcherIcon: 'android:drawable/sym_def_app_icon' }), /same icon/);
  assert.throws(() => verify({ applicationIcon: 'res/drawable/android.png' }), /platform fallback/);
});
