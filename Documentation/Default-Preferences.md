# App Default Preferences

`app/src/main/res/raw/wmdx_default_preferences.json` contains 255 scalar preference defaults recovered from the supplied Wmdx backup.

## How the defaults apply

- `AppPreferenceDefaults.initialize()` fills only keys that are not already present in Android's default preferences. A saved user choice is not overwritten.
- The defaults are initialized before `MainActivity` reads preferences and before `SettingsActivity` displays them.
- **Reset All** clears saved preferences and then reseeds this file.
- Per-setting reset state reads from the same defaults. Generic preference types such as color pickers explicitly save the restored value.

## What the backup contributes

- Font-family preference values are retained, including the selected family names.
- No font files or custom font-file paths are included or installed.
- The backup's toolbar ordering, deleted groups, custom groups, per-document cursor/URI state, obsolete list-wrap key, and migration sentinels are excluded.
- Distinct SVG icons from the backup are applied to existing built-in toolbar actions. The app's existing default group/order is kept, and no syntax-view toolbar actions are introduced.

The attached ZIP had malformed central-directory data. Its preferences JSON was recovered and parsed; no other archive contents were imported.
