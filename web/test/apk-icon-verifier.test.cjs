const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../tools/verify-apk-icons.cjs'), 'utf8');
const configs = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].flatMap(d => [d, `night-${d}`]);
const adaptive = 'res/mipmap-anydpi-v26/ic_launcher.xml';
const nightAdaptive = 'res/mipmap-night-anydpi-v26/ic_launcher.xml';
const round = 'res/mipmap-anydpi-v26/ic_launcher_round.xml';
const nightRound = 'res/mipmap-night-anydpi-v26/ic_launcher_round.xml';
const ids = { foreground: '0x7f080091', background: '0x7f06005f' };
const groups = [
  ['0x7f0f0000', 'mipmap/ic_launcher', 'fallback', adaptive, nightAdaptive],
  ['0x7f0f0001', 'mipmap/ic_launcher_round', 'round', round, nightRound],
  [ids.foreground, 'drawable/ic_launcher_foreground', 'foreground']
];
const rasterPath = (resource, config, index, shortened = false) => {
  if (shortened) return `res/${resource.split('/')[1]}-${index}.png`;
  const night = config.split('-').includes('night');
  const density = config.split('-').find(value =>
    ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].includes(value));
  const [type, name] = resource.split('/');
  return `res/${type}-${night ? 'night-' : ''}${density}-v${night ? 8 : 4}/${name}.png`;
};
const xmlPath = (resource, night, shortened = false) => {
  if (shortened) return `res/${resource.split('/')[1] === 'ic_launcher' ? 'BW' : '0K'}${night ? 'N' : ''}.xml`;
  const name = resource.split('/')[1];
  return `res/mipmap-${night ? 'night-' : ''}anydpi-v26/${name}.xml`;
};
const entriesFor = (shortened = false) => groups.flatMap(([, name, , xml, nightXml]) => [
  ...configs.map((config, i) => rasterPath(name, config, i, shortened)),
  ...(xml ? [xmlPath(name, false, shortened), xmlPath(name, true, shortened)] : [])
]);
const allEntries = entriesFor();
const png = rasterPath('mipmap/ic_launcher', 'mdpi', 0);
function verify({ entries, launcherIcon, applicationIcon, expectedPackage = 'debug', shortenedPaths = false,
  missingFallback = false, wrongForeground = false, missingNightAdaptive = false } = {}) {
  entries ||= entriesFor(shortenedPaths);
  const isRelease = expectedPackage === 'release';
  const packageName = isRelease ? 'com.wmdx.markdownapp' : 'com.wmdx.markdownapp.debug';
  const appLabel = isRelease ? 'Wmdx' : 'Wmdx-debug';
  const appIcon = applicationIcon || xmlPath('mipmap/ic_launcher', false, shortenedPaths);
  const activityIcon = launcherIcon === undefined ? appIcon : launcherIcon;
  const badging = [
    `package: name='${packageName}' versionCode='1'`,
    `application-label:'${appLabel}'`,
    `application-icon-160:'${appIcon}'`,
    `application-icon-65534:'${appIcon}'`,
    `launchable-activity: name='com.wmdx.markdownapp.DocumentDispatchActivity' label='${appLabel}' icon='${activityIcon}'`
  ].join('\n');
  const table = groups.map(([id, name, , xml, nightXml]) =>
    `    resource ${id} ${name}\n` +
    (missingFallback && name === 'mipmap/ic_launcher' ? '' :
      configs.map((config, i) => `      (${config}) (file) ${rasterPath(name, config, i, shortenedPaths)} type=PNG\n`).join('')) +
    (xml ? `      (anydpi) (file) ${xmlPath(name, false, shortenedPaths)} type=XML\n` : '') +
    (nightXml && !missingNightAdaptive ? `      (night-anydpi) (file) ${xmlPath(name, true, shortenedPaths)} type=XML\n` : '')
  ).join('') + `    resource ${ids.background} color/ic_launcher_background\n      () #ffe5e5e5\n`;
  const xml = `E: adaptive-icon\n  E: background\n    A: drawable(0x01010199)=@${ids.background}\n` +
    `  E: foreground\n    A: drawable(0x01010199)=@${wrongForeground ? '0x7f080099' : ids.foreground}\n`;
  vm.runInNewContext(source, {
    process: {
      argv: ['node', 'verify-apk-icons.cjs', 'test.apk', packageName, appLabel],
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

test('APK verification keeps adaptive and legacy icon paths consistent with Android', () => {
  verify();
  assert.throws(() => verify({ launcherIcon: png }), /same icon/);
  verify({ launcherIcon: '' });
  verify({ expectedPackage: 'release' });
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

test('APK verification catches release resource-name shortening that breaks APK browser previews', () => {
  assert.throws(() => verify({ expectedPackage: 'release', shortenedPaths: true }),
    /standard icon filename used by APK browsers/);
});
