---
name: Folder-scoped file access
description: The app's permission boundary for file operations such as renaming documents.
---

When a file operation needs broader permission than the document URI provides, first try the original document URI, then request access only to the folder the user chooses and retry through that folder. Do not launch an exact-file permission picker for renaming; it caused the app to disappear after the rename. If Android blocks selecting the Downloads directory with `ACTION_OPEN_DOCUMENT_TREE`, offer a selectable subfolder or Save As. Do not request device-wide file access.

**Why:** The user wants folder access limited to folders they allow, not global access. The per-file picker caused the app to disappear after renaming. Android's Storage Access Framework excludes the Downloads directory from tree selection on Android 11 and newer.

**How to apply:** For rename or similar operations, use Android's folder-scoped picker and persist only the selected tree grant. If the folder cannot be selected or the provider cannot rename the document, offer Save As without changing the original.
