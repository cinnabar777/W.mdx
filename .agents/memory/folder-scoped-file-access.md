---
name: Folder-scoped file access
description: The app's permission boundary for file operations such as renaming documents.
---

When a file operation needs broader permission than the document URI provides, first try the original document URI, then request access only to the folder the user chooses and retry through that folder. Do not request device-wide file access.

**Why:** The user explicitly said folder access is acceptable when limited to folders they allow, and global access is not needed.

**How to apply:** For rename or similar operations, use Android's folder-scoped document picker and persist only the selected tree grant. If the provider still cannot perform the operation, offer Save As without changing the original.
