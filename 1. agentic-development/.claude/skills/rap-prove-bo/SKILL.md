---
name: rap-prove-bo
description: Test, verify or prove a RAP business object on the SAPSA BTP ABAP trial — ABAP Unit tests, EML-driven CRUD and draft round trips, resetting demo data, ATC clean-core checks, reading short dumps, and deciding whether a SAPSA JIRA story's acceptance criteria are really met. Use before calling any RAP story done or transitioning a SAPSA JIRA issue.
---

# Prove a RAP business object on the SAPSA trial

## 1. Constraints

- **No HTTP write path.** `SAPDiagnose(action="odata_perf")` is GET-only and returns status and
  byte counts, never bodies. Prove writes with EML from an ABAP class; read back with `SAPQuery`
  on the projection view plus OData GET status codes.
- **ABAP Unit is the only way to execute code from MCP** — there is no classrun trigger. Run with
  `SAPDiagnose(action="unittest", type="CLAS", name=…)`.
- **Declare `RISK LEVEL HARMLESS`.** `DANGEROUS` classes are silently skipped (`outcome:
  "incomplete"`, 0 tests, listed under `omittedNonHarmlessTestClasses`). `COMMIT ENTITIES` does
  persist from a harmless test.

## 2. Reference implementation — `ZCL_SAPSA_VISIT_CRUD_DEMO`

The class was **deleted with the rest of the stack on 2026-09-14**, so it can't be read on the
system any more. Rebuild it to this shape — the table below is the spec:

| Method | Proves |
| --- | --- |
| `check( step, expected, actual )` | collects one assertion row |
| `run_crud_cycle( )` | create ×3 → read (determination fired) → update → delete → gone → cleanup → backdated create rejected |
| `run_draft_cycle( )` | `Edit` → change the draft → **active copy unchanged** → `Activate` → change published |
| `reset_demo_data( )` | wipes the log, recreates exactly the two demo rows |
| `if_oo_adt_classrun~main` | same log, F9-runnable in ADT |

Test class `LTC_CRUD_CYCLE` asserts every row, then calls `reset_demo_data( )`. **Tests must clean
up what they create** — otherwise every run on stage adds rows to the list report.

## 3. Traps

- **Put expected-failure scenarios last and `ROLLBACK ENTITIES.` straight after asserting.** A
  failed validation's `COMMIT ENTITIES` poisons later, unrelated saves in the same session — they
  fail citing the earlier message.
- **Draft actions via EML:** `EXECUTE Edit FROM VALUE #( ( %cid = 'EDIT_1' %key-UUID = uuid ) )`.
  No `%is_draft` (compile error); `%cid` required (`MISSING_CID` dump).
- **Creating the class:** `SAPWrite(action="create", type="CLAS")` can return `409 … cannot be
  created without a package` on the source write while the shell *was* created — check with
  `SAPSearch(tadir_lookup)`, then `SAPWrite(action="update")`. The first activation may then
  report "Implementation missing" for every method; confirm with
  `SAPDiagnose(action="syntax", version="inactive")` → `hasErrors: false`, and activate again.
- **Test aborted with a runtime error:** `SAPDiagnose(action="dumps")` lists recent dumps; read one
  by `id`. Section `kap1` names the RAP contract violation.

## 4. Quality gate — ATC

- Run `SAPDiagnose(action="atc", variant="ABAP_CLOUD_DEVELOPMENT_DEFAULT")` **per RAP object**
  (interface + projection DDLS, behavior pool, value helps, SRVD). A package-level run is dominated
  by test-harness noise.
- Target: **zero findings on every RAP object**. Accepted harness findings: untranslated literals,
  "SY-SUBRC query missing after COMMIT ENTITIES" (the class checks `FAILED`, the correct idiom),
  "No WHERE condition" on the reset select.
- **"Access conditions not analyzed because of error" is a real defect** — usually a projection
  that lost its `_BaseEntity` association.

## 5. Evidence and JIRA

The JIRA board (project `SAPSA`, cloudId `c0b92160-5799-4dac-b379-30c545df1252`) is the spec.
Transition ids: `11` To Do, `21` In Progress, `3` Ready for Review, `31` Done.

- **Only the product owner moves a story to Done.** Never transition to `31`.
- **Move a story to Ready for Review once everything automatable is proven**, even if some
  criteria still need the user's manual check. Criteria about the rendered UI (value help dialog,
  list report columns, filter dropdown, object page, field messages on draft save) and two-user
  locking cannot be observed through MCP. List each one as a numbered pending manual check in the
  evidence comment. Don't leave the story In Progress while waiting for the user's review.
- When the user reports the manual results, add a dated comment recording them as the user's
  check (not something observed via MCP).
- Comment the evidence on each story before transitioning: objects involved, what ran, results,
  and that writes were proven via EML rather than HTTP.
