# Pre-experiment hypothesis

Recorded 2026-10-28 before running either target/control below. Base: 58ad57cea2dcd8b94b8d1f7644e9e21fc02c7cd1.

C wield.c:873-885 uwepgone ends burning for an artifact-light weapon, prints the stopping-shine message when sighted, clears the weapon slot and refreshes inventory. JS wield.js:1235-1247 instead throws explicitly for artifact_light && lamplit. JS polyself.js:965 calls uwepgone when a form cannot retain weapons, corresponding to C polyself.c:1346.

Suspected difference: a lawful hero wielding lit Sunsword, then publicly invoking wizard #polyself to become a giant bat, will drop/extinguish the sword in C but hit the explicit JS boundary. Nearby control: identical input using an ordinary long sword. This is a hypothesis, not a confirmed result. Artifact wish acceptance, light activation and the exact force-drop route must be demonstrated from the C capture and JS trace.

Excluded investigations are not involved. Earlier setuwep artifact-light repair 907748df7 addresses a different caller; current uwepgone still contains the explicit throw. No gameplay edits are authorized here.
