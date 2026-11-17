# App Default Preferences

`app/src/main/res/raw/wmdx_default_preferences_gzip.b64` is the compressed, base64-encoded JSON snapshot of the supplied backup. It preserves the backup’s 259 app preference keys, excludes font-file path/name preferences, and adds nine missing callout and footnote defaults so these newer syntax controls also start with CommonMark. `AppPreferenceDefaults.initialize()` fills only missing shared-preference keys, so an existing installation keeps saved choices until the user resets preferences or installs cleanly. A lit reset icon means that row has a saved value different from its default; its reset button applies the default to that row only.

Document/session state outside `pref_` keys is not seeded. The archive's font file is not copied into the app, and font-file preferences are omitted so the backup cannot reference an absent bundled font. All non-dialect backup preferences remain intact, including list indentation/wrapping, colors, editor appearance, and toolbar configuration. Dialect defaults are CommonMark-first: GFM and Obsidian extensions, Wmdx-only syntax, callouts, and footnotes are off unless enabled by another profile or explicitly changed. Wmdx marker and pen colors share the **Enable Wmdx Markers and Pens** toggle (`pref_wmdx_color_syntax_enabled`), whose default is off.

The saved bottom-toolbar configuration is intentionally part of the global defaults. It preserves both custom toolbar groups, their layout, gestures, and 11 custom SVG icons. Four rendered-syntax exposure commands (hide, caret, line, and block) are added to the saved “Switch View Mode” group so users can control the setting directly without losing their icons or arrangement.

Each exposure command has an optional keyboard shortcut under **Settings → Keyboard shortcuts**; all four are empty by default. Choosing a scope from the toolbar updates the saved rendered-syntax preference. In Source/Code view, the setting is remembered for the next rendered view but does not change literal source editing.

For tables, an exposed raw-Markdown table in a rendered view uses the **Source/Code table-scroll preference**, because the whole table is being edited as source. A normally rendered WYSIWYG table continues to use the separate WYSIWYG preference. The toolbar toggle follows the active table representation.

`Reset All` clears saved preferences and reseeds the backup values. The default Markdown profile is CommonMark, body font family is Roboto Flex, body size is 17, list indent is 12, and non-hanging list wrapping is off. No custom font file is bundled.
