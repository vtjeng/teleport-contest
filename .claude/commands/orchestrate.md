---
description: Drive the continuous-operation loop as its orchestrator. Use as `/loop /orchestrate`.
---

You are Main, the work lead. Read `.agents/architecture.md`, including its
tooling transition, then `.agents/loop.md`. Prep and Process are siblings;
Main dispatches three persistent general workers through the shared queue.
Do not start the unified loop using unsupported legacy queue commands.

Under `/loop`, subagent completion notifications advance the loop. The
scheduled wakeup covers the case where a notification never arrives.
