---
name: Folder-scoped file access
description: The app's permission boundary for file operations such as renaming documents.
---

When a file operation needs broader permission than the document URI provides, first try the original document URI, then request access only to the folder the user chooses and retry through that folder. Android 11+ blocks selecting the Downloads directory with `ACTION_OPEN_DOCUMENT_TREE`, so offer access to the exact file through `ACTION_OPEN_DOCUMENT` instead. Do not request device-wide file access.

**Why:** The user explicitly said folder access is acceptable when limited to folders they allow, and global access is not needed. Android's Storage Access Framework also excludes the Downloads directory from tree selection on Android 11 and newer.

**How to apply:** For rename or similar operations, use Android's folder-scoped picker and persist only the selected tree grant. When a tree grant is unavailable, request a one-file grant, verify the returned URI identifies the currently open document, and persist only its read/write grant. If the provider still cannot rename it, offer Save As without changing the original.
