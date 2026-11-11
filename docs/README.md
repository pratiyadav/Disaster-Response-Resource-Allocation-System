# DRRAS implementation documentation

This folder explains the parts of DRRAS that have actually been built. It is intended to grow alongside the project. The original coursework and requirements PDFs remain in [`../Document/`](../Document/); they describe the intended system. [`../AGENT.MD`](../AGENT.MD) summarizes the product goal, requirements, and unresolved design questions.

## Start here

| Document | What it explains |
| --- | --- |
| [Architecture](architecture.md) | Current components, data flow, and the boundary between the demo and planned backend. |
| [Frontend](frontend.md) | Screens, state, scenario editing, map, preview calculations, and metrics. |
| [Docker](docker.md) | How the frontend image is built and served, commands, and current verification limits. |
| [Change log](changes.md) | What was added or changed and how it was verified. |

## Documentation convention for future work

When a part of the application changes, update its document in this folder in the same change. Explain:

1. What the part does and which source files own it.
2. How data enters, changes, and leaves it.
3. How to run or configure it, including defaults and required services.
4. What has been verified and what is still a demo, assumption, or open decision.

Add a dated entry to [changes.md](changes.md) for a meaningful feature or architectural change. If a new subsystem needs more detail, add a separate Markdown file here and link it from this index. Keep the implementation docs aligned with source code; use the PDFs as requirements, not as proof a feature is implemented.
