# App Default Preferences

`app/src/main/res/raw/wmdx_default_preferences.json` contains the 119 scalar preferences recovered intact from the supplied Wmdx backup. `AppPreferenceDefaults.initialize()` fills only missing shared-preference keys, so existing user choices are not overwritten. Settings absent from the backup use the app's XML and Kotlin defaults instead of being copied from unrelated values.

The uploaded ZIP has damaged directory and compressed-data records. Its `preferences.json` ends inside `pref_todo_unchecked_color`, so that color is intentionally omitted rather than guessed. The previous 255-key resource included 136 values that could not be verified from this backup; several also differed from the app's explicit reset defaults.

Font-family choices that are present in the recovered preferences remain. Font-file paths and the two bundled font files are not installed or copied into the app. The body font family was not present in the recovered preferences, so it continues to use the app's normal system-font default.

The backup's personal `pref_toolbar_bottom_config` is not used as a global default. It contains custom groups named “Switch View Mode” and “Insert Footnote”; those saved groups are separate from the app's built-in controls. The current toolbar code has no syntax-exposure toolbar action: “Rendered Syntax Exposure” is a settings preference, and the existing `switchView` action switches between source and rendered editing.

`Reset All` clears saved preferences and reseeds the recovered backup values. Individual settings absent from that set use the corresponding built-in reset value; the primary Markdown flavor defaults to Wmdx. The Body setting **Join Soft Line Breaks** is off by default, so a single newline remains a line break; explicit two-space hard breaks remain unchanged.
