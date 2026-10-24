---
name: SeekBar reset alignment
description: Confirmed alignment fix for reset controls in AndroidX SeekBarPreference rows.
---

AndroidX SeekBarPreference adds 16dp of trailing padding inside its widget row. Clear that inner padding so the reset control aligns with the common preference-row trailing edge; margin adjustments alone do not fix it.

**Why:** the user confirmed the inner-padding correction fixed the reset icons after the earlier margin-only adjustment had no visible effect.

**How to apply:** when aligning reset controls in SeekBar rows, preserve the preference item's shared trailing inset and remove the extra inner row padding.
