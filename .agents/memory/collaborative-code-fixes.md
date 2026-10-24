---
name: Collaborative code fixes
description: The user's expectation for diagnosing and fixing ambiguous UI or settings issues.
---

Before making a fix when the symptom or intended behavior is unclear, inspect the relevant code and evidence, explain the concrete finding and planned scope in plain language, and align with the user. Do not ask the user to read code or approve implementation details; they have already provided the desired behavior. Avoid speculative fixes and repeated trial changes.

**Why:** The user explicitly asked to collaborate after assumptions led to settings changes that did not match what they wanted, and clarified that they are not a software engineer.

**How to apply:** For ambiguous UI or settings reports, inspect the affected screen/code first; if the evidence does not identify one narrow user-visible behavior, ask about that behavior in chat. Own the code review and verification.
