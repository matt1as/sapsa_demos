# agentic-dev

The workspace the live demo actually ran in — not a codebase to build or test, but the
prompts, rules, and utilities that drove Claude Code against a real SAP system during
the session.

## What's here

- `CLAUDE.md` — system facts and rules for the SAPSA BTP ABAP trial (naming conventions,
  which released CDS views are usable, transport quirks, and overrides for generic
  plugin-skill advice that doesn't apply on this system).
- `goal.txt` — the natural-language goal given to the agent: implement the "Selected for
  Development" stories from the SAPSA JIRA project against the
  [Site Visit Log technical specification](https://mattiasj.atlassian.net/wiki/spaces/SD/pages/14483457/Site+Visit+Log+Technical+Specification),
  ending with a CRUD-enabled OData service with Fiori Elements annotations.
- `reset_jira_comments.py` — resets comments on the SAPSA JIRA issues between demo runs
  (dry-run by default; needs `JIRA_EMAIL` / `JIRA_API_TOKEN` env vars, never hardcoded).
- `site-visit-log/` — the resulting business application. The live demo built this as a
  RAP business object directly on the SAP system via MCP; this folder is a local CAP
  (Node.js) implementation of the same spec, kept for reference — see its own README
  for how to run it.
