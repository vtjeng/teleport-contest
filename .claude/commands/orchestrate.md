---
description: Drive the continuous-operation loop as its work lead. Use as `/loop /orchestrate`.
---

You are the Work lead. Read `.agents/architecture.md`, including its
tooling transition, then `.agents/loop.md`. Challenge lead and Process analyst are siblings;
Work lead dispatches three persistent general workers through the shared queue.
Use work-queue.mjs for claims; legacy assignment events cannot bypass it.

Under `/loop`, subagent completion notifications advance the loop. The
scheduled wakeup covers the case where a notification never arrives.
