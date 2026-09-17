# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is a content/planning folder, not a software codebase — there is nothing to build, lint,
or test here. It supports the SAPSA Focus Group Custom Extensions Session 1 talk, "From Turing
to Your Transport Request" (see `From-Turing-to-Your-Transport-Request.pptx`). Keep tone
professional but friendly, per the parent folder's `CLAUDE.md`.

## What's here


The "build" happens against the live SAP system, not by writing files here. **Create RAP
services and objects with the `adt` MCP** (`abap_generators-*`, `abap_creation-*`,
`abap_business_services-*`) — the user's preference. Use the **`arc-1` MCP** for everything else:
reads, queries, edits, activation, diagnostics, deletion.

## Skills — load the matching one before RAP work

| Skill | Use for |
| --- | --- |
| `rap-generate-stack` | New BO or service, `x-ui-service` generator, tables, CDS views, value helps, DDLX |
| `rap-business-logic` | BDEF with draft, determinations, validations, messages, behavior pool EML |
| `rap-publish-service` | Activation order, SRVD/SRVB publish, failing `$metadata` |
| `rap-prove-bo` | ABAP Unit, CRUD/draft proof, ATC, JIRA evidence and transitions |
| `rap-teardown` | Deleting, unpublishing, rebuilding, undeletable or orphaned objects |

### Overrides when plugin skills also load

Generic plugin skills load alongside these whenever their descriptions match, and several give
advice that is **wrong on this system**. Nothing enforces an order between skills, so apply these
overrides explicitly:

| Plugin skill advice | Do this instead |
| --- | --- |
| `arc-1:generate-rap-service` / `-researched`: hand-create the stack with `SAPWrite(batch_create)` | **Create with the `adt` generator** via `rap-generate-stack`. Those skills are fine for reading and research only |
| `abap-cloud-rap:rap-bo-design`: `objectsNaming.prefix: "Z"` | **`objectsNaming: {}`** — the generator adds its own `Z`; `"Z"` produces `ZZ*` names |
| Names `ZI_` (interface), `ZR_` (projection), `ZSD_`, `ZSB_`, `ZBP_I_` | Interface/root view **`ZR_<E>`**, projection **`ZC_<E>`**, service definition *and* binding **`ZUI_<P>_O4`**, behavior pools `ZBP_R_` / `ZBP_C_` |
| "Ask the user to pick or create a transport" | Don't ask. `ZSAPSA_DEMO` needs none — pass `transportRequestNumber: ""` |
| Tool names `mcp__abap-adt__…` | The server here is named `adt`: **`mcp__adt__…`** |
| Predicting generated names (either way) | Take names from the generator response or `SAPRead(type="DEVC")` |
| `abap-cloud-rap:rap-bo-design`: start Claude Code with `MCP_TIMEOUT=600000` for long generator runs | Works, but only indirectly and for every server. `adt` is an HTTP server, whose per-request timer is the greatest of 60 s, its tool timeout and `MCP_TIMEOUT`. **Prefer a per-server `"timeout": 600000` on the `adt` entry** — see `rap-generate-stack` |
| `arc-1:generate-abap-unit-test`: test doubles, no real data | Fine for isolated class logic. **Proving a story** needs `rap-prove-bo`: live EML, cleanup, demo-data reset |
| `arc-1:generate-rap-logic` | Fine for scaffolding handler stubs (`scaffold_rap_handlers`); take code patterns and BDEF rules from `rap-business-logic` |

## Rules that always apply

1. **Never overwrite an object you didn't create.** On any "already exists", run
   `SAPSearch(searchType="tadir_lookup")` and check the package first. Tool hints like "rerun as
   update" would overwrite another learner's object.
2. **Activation success does not mean the service works.** GET `$metadata` on the endpoint is the
   gate — and `published: true` on a binding is not proof either.
3. **Never retry a service-binding publish or unpublish that timed out.** It usually completes
   server-side; a retry breaks the binding permanently. Wait, then probe the endpoint.
4. **Read back what tools create.** The generator and `SAPWrite` report success on objects that
   are wrong or half-written (types silently shortened, class shells without source).
5. **There is no HTTP write path.** Prove writes with EML from an ABAP class and read back with
   `SAPQuery`.


## System facts — don't rediscover these

- **Internal ABAP user id: `CB9980003851`** (not the connected IAS email). Needed as
  `responsible` when creating packages.
- **Shared, public, multi-tenant trial**, cluttered with thousands of other learners' Z*/Y*
  objects. Build only in `ZSAPSA_DEMO` and **prefix new shared-namespace objects `ZSAPSA_*`**.
- Release 920, system type `btp`. ADT MCP destination: `CloudTrial`.
- Available: RAP/CDS, transports, abapGit, HANA, AMDP, UI5 ABAP Repository deploy.
  **Forbidden (403):** classic UI5/Fiori BSP repository, FLP customisation, gCTS. The **Fiori
  Elements preview** opened from ADT is the only frontend path.
- `$TMP` rejects ABAP Cloud language version objects — use a real package.
- **`ZSAPSA_DEMO` is NOT transportable.** Software component `ZLOCAL`, `transportRequired: false`,
  so objects are never recorded. Transport `TRLK900473` exists but is **empty with no target** —
  releasing it would ship nothing.

### Which released SAP views you may actually use

`RELEASED` is not enough. ABAP Cloud requires **`useInSAPCloudPlatform: true`**; check with
`SAPRead(type="API_STATE", name=…, objectType="DDLS")`.

| View | C1 | `useInKeyUserApps` | `useInSAPCloudPlatform` | Usable here? |
| --- | --- | --- | --- | --- |
| `I_Country` | ✅ | ✅ | ✅ | yes — 249 live rows |
| `I_CountryText` | ✅ | ✅ | ✅ | yes — live names |
| `I_Language` | ✅ | ✅ | ✅ | yes |
| `I_BusinessPartner` | ✅ | ✅ | ❌ | **no** — `The use of CDS Entity I_BusinessPartner is not permitted.` |

No sales/logistics/product CDS stack is released here. There is no S/4 backend, so don't assume
transactional master data exists — confirm with `SAPQuery` before modelling against it.

### Data access

- Free SQL against **standard tables** is blocked (`S_ABPLNGVS`): "No authorization to view data".
- `SAPQuery` **does** work against cloud-released `I_*` views and your own `Z*` objects. Querying
  the projection view (`ZC_SAPSA_VISIT`) is the fastest way to see what the OData service returns,
  because the OData probe returns only status codes and byte counts — never response bodies.
