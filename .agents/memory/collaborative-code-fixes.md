---
name: Collaborative code fixes
description: The user's expectation for diagnosing and fixing ambiguous UI or settings issues.
---

Before making a fix when the symptom or intended behavior is unclear, inspect the relevant code and evidence, explain the concrete finding and planned scope in plain language, and align with the user. Do not ask the user to read code or approve implementation details; they have already provided the desired behavior. Avoid speculative fixes and repeated trial changes. When the user asks to restore a specific prior version for comparison, restore that baseline rather than substituting a narrow fix.

**Why:** The user explicitly asked to collaborate after assumptions led to settings changes that did not match what they wanted, clarified that they are not a software engineer, and corrected repeated diagnoses made against builds they had not installed. They also asked for an exact pre-change comparison after repeated micro-fixes failed to establish a baseline, and said they get APKs from Actions without needing links.

**How to apply:** For UI reports, inspect the affected screen/code first and confirm the exact installed commit/build before attributing behavior to source. If the user requests a specific baseline, restore it exactly and preserve unrelated changes. For this repository, let the user retrieve APK artifacts from Actions instead of sending run links. If the evidence does not identify one narrow user-visible behavior, ask about that behavior in chat. Own the code review and verification.
