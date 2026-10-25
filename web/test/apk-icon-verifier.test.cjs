const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../tools/verify-apk-icons.cjs'), 'utf8');
const configs = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].flatMap(d => [d, `night-${d}`]);
const png = 'res/fallback-0.png';
const adaptive = 'res/BW.xml';
const round = 'res/0K.xml';
const ids = { foreground: '0x7f080091', background: '0x7f06005f' };
const groups = [
  ['0x7f0f0000', 'mipmap/ic_launcher', 'fallback', adaptive, 'res/NA.xml'],
  ['0x7f0f0001', 'mipmap/ic_launcher_round', 'round', round, 'res/NR.xml'],
  [ids.foreground, 'drawable/ic_launcher_foreground', 'foreground']
];
const allEntries = groups.flatMap(([, , prefix, xml, nightXml]) => [
  ...configs.map((_, i) => `res/${prefix}-${i}.png`), ...(xml ? [xml, nightXml] : [])
]);
function verify({ entries = allEntries, launcherIcon = adaptive, applicationIcon = adaptive,
  missingFallback = false, wrongForeground = false, missingNightAdaptive = false } = {}) {
  const badging = [
    "package: name='com.wmdx.markdownapp.debug' versionCode='1'",
    "application-label:'Wmdx-debug'",
    `application-icon-160:'${png}'`,
    `application-icon-65534:'${applicationIcon}'`,
    `launchable-activity: name='com.wmdx.markdownapp.DocumentDispatchActivity' label='Wmdx-debug' icon='${launcherIcon}'`
  ].join('\n');
  const table = groups.map(([id, name, prefix, xml, nightXml]) =>
    `    resource ${id} ${name}\n` +
    (missingFallback && name === 'mipmap/ic_launcher' ? '' :
      configs.map((config, i) => `      (${config}) (file) res/${prefix}-${i}.png type=PNG\n`).join('')) +
    (xml ? `      (anydpi) (file) ${xml} type=XML\n` : '') +
    (nightXml && !missingNightAdaptive ? `      (night-anydpi) (file) ${nightXml} type=XML\n` : '')
  ).join('') + `    resource ${ids.background} color/ic_launcher_background\n      () #ffe5e5e5\n`;
  const xml = `E: adaptive-icon\n  E: background\n    A: drawable(0x01010199)=@${ids.background}\n` +
    `  E: foreground\n    A: drawable(0x01010199)=@${wrongForeground ? '0x7f080099' : ids.foreground}\n`;
  vm.runInNewContext(source, {
    process: {
      argv: ['node', 'verify-apk-icons.cjs', 'test.apk', 'com.wmdx.markdownapp.debug', 'Wmdx-debug'],
      env: { ANDROID_HOME: '/sdk' }
    },
    console: { log() {} },
    require(name) {
      if (name === 'node:fs') return { readdirSync: () => ['34.0.0'], existsSync: () => true };
      if (name === 'node:child_process') return {
        execFileSync: (executable, args) => executable === 'unzip' ? entries.join('\n') :
          args[1] === 'badging' ? badging : args[1] === 'resources' ? table : xml
      };
      return require(name);
    }
  });
}

test('APK verification resolves optimized release paths and legacy configurations through the resource table', () => {
  verify();
  verify({ launcherIcon: png });
  verify({ launcherIcon: '' });
});

test('APK verification rejects missing fallback artwork and mismatched launcher icons', () => {
  assert.throws(() => verify({ missingFallback: true }), /missing standalone PNG/);
  assert.throws(() => verify({ entries: allEntries.filter(entry => entry !== png) }), /packaged icon does not exist/);
  assert.throws(() => verify({ launcherIcon: 'android:drawable/sym_def_app_icon' }), /same icon/);
  assert.throws(() => verify({ applicationIcon: 'res/drawable/android.png' }), /platform fallback/);
  assert.throws(() => verify({ wrongForeground: true }), /foreground must reference/);
});

test('APK verification catches legacy night PNGs shadowing default adaptive icons', () => {
  assert.throws(() => verify({ missingNightAdaptive: true }), /missing night adaptive XML/);
});
