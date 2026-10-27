---
name: Toolbar folder placement
description: User-defined rules for toolbar keys, nested folders, and the shared holding area.
---

The toolbar editor uses one shared, flat holding area. Each key has one saved location. Popup actions are listed individually in the holding area rather than hidden inside their former group. Dropping one key onto another creates a folder; folders are keys too and can be nested or moved.

Moving a folder to the holding area releases its direct members there and leaves the now-empty folder visible. Empty custom folders must remain visible until the user moves or explicitly deletes them. Deleting a custom folder releases its direct members instead of deleting them. Moving a key to a new location must not silently restore it to its previous folder.

The group-opening gesture action is generic: when invoked on a group key, it opens that key's group. Never create a separate action for each named group.

**Why:** The user repeated the folder rules after earlier toolbar iterations hid empty folders and restored keys to their former groups. They also clarified that “Open group” must use the group key it is invoked on, not target a named group.

**How to apply:** Keep the one-location, shared-holding, empty-folder, and explicit-deletion rules consistent across toolbar drag-and-drop, preview rendering, configuration normalization, and Android persistence. Keep “Open group” as one generic action, resolve its group from the invoking key, and migrate old per-group IDs to the generic action only for group keys.
