# 1. Agentic Development

Session 1 demo for the SAPSA Focus Group talk "From Turing to Your Transport Request":
using Claude Code, with system-specific skills, to build a RAP OData service live
against a real SAP BTP ABAP trial system, driven by a JIRA backlog and a technical spec.

## What's here

- `.claude/skills/` — Claude Code skills that encode the rules for driving RAP
  development on this system through the `adt` and `arc-1` MCP servers:
  - `rap-generate-stack` — scaffold a new business object or service
  - `rap-business-logic` — behavior definitions, determinations, validations, messages
  - `rap-publish-service` — activation order and service binding publish/unpublish
  - `rap-prove-bo` — ABAP Unit, CRUD/draft proof, ATC, JIRA evidence
  - `rap-teardown` — deleting, unpublishing, rebuilding objects
- `.vscode/launch.json` — run configs for the Fiori Elements preview of the RAP app.
- `agentic-dev/` — the actual workspace the demo ran in; see its own README.

## License

Released under the repo's [MIT License](../LICENSE) — use it however is useful to you.
