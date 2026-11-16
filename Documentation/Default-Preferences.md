# App Default Preferences

`app/src/main/res/raw/wmdx_default_preferences_gzip.b64` is the compressed, base64-encoded JSON snapshot of the supplied Wmdx backup. It seeds all 259 app preference keys from `preferences.json`, excluding only the two font-file path/name preferences. `AppPreferenceDefaults.initialize()` fills only missing shared-preference keys, so an existing installation keeps its saved choices until the user resets preferences or installs cleanly.

Document/session state outside `pref_` keys is not seeded. The archive's font file is not copied into the app, and font-file preferences are omitted so the backup cannot reference an absent bundled font. All other scalar preferences are retained without substituting defaults—including list indentation/wrapping, dialect profile, colors, editor appearance, and toolbar configuration.

The saved bottom-toolbar configuration is intentionally part of the global defaults. It preserves both custom toolbar groups, their layout, gestures, and 11 custom SVG icons. Four rendered-syntax exposure commands (hide, caret, line, and block) are added to the saved “Switch View Mode” group so users can control the setting directly without losing their icons or arrangement.

Each exposure command has an optional keyboard shortcut under **Settings → Keyboard shortcuts**; all four are empty by default. Choosing a scope from the toolbar updates the saved rendered-syntax preference. In Source/Code view, the setting is remembered for the next rendered view but does not change literal source editing.

For tables, an exposed raw-Markdown table in a rendered view uses the **Source/Code table-scroll preference**, because the whole table is being edited as source. A normally rendered WYSIWYG table continues to use the separate WYSIWYG preference. The toolbar toggle follows the active table representation.

`Reset All` clears saved preferences and reseeds the backup values. The default Markdown profile is GFM, body font family is Roboto Flex, body size is 17, list indent is 12, and non-hanging list wrapping is off. No custom font file is bundled.
