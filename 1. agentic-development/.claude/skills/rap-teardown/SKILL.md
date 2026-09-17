---
name: rap-teardown
description: Delete, tear down, clean up or rebuild RAP objects in package ZSAPSA_DEMO on the SAPSA BTP ABAP trial. Use when removing a RAP stack or individual objects, unpublishing a binding before deleting it, regenerating a stack under a new name, or when an object refuses to delete, is orphaned, or collides with another learner's object.
---

# Tear down or rebuild RAP objects on the SAPSA trial

## 1. Before deleting anything

- **Look at the target first.** `SAPRead(type="DEVC", name="ZSAPSA_DEMO")` for the inventory, and
  `SAPSearch(searchType="tadir_lookup")` per name. **The package must be `ZSAPSA_DEMO`.** This is a
  shared trial — `ZI_COUNTRY_VH` once turned out to belong to another learner's `ZAM_TEST`.
- **Confirm with the user.** The package holds the live demo; deletion is irreversible.
- Unsure what depends on an object? `SAPContext(action="impact")`.

## 2. Delete order that worked (2026-09-14)

All via `SAPWrite(action="delete", type=…, name=…)`:

1. `SRVB` — unpublish first if published (`412 Service endpoint … is published`)
2. `SRVD`
3. `DDLX`
4. `BDEF` — projection, then interface
5. `DCLS` — both, **before** the interface view they reference
6. `DDLS` — projection, then interface and value helps
7. `CLAS` — behavior pools, proof/test classes
8. `MSAG`
9. `TABL` — draft table, then persistence table
10. `DTEL`, then `DOMA`

A "blocking dependents" error names the exact order it wants — follow it. **Objects that nothing
else references can be deleted in parallel**: the full 18-object stack went in seven rounds on
2026-09-14 (a proof class with no dependents can go at any time, even before the `SRVB`).

**Unpublishing** can time out client-side while completing server-side. After a timeout, check
`SAPRead(type="SRVB")` → `published` before doing anything else; never retry blind (see
`rap-publish-service`).

**`published: false` doesn't mean the endpoint is gone yet.** On 2026-09-14 `$metadata` kept
returning HTTP 200 for 3+ minutes after the flag flipped — served from Gateway's metadata cache.
Probe a **data** request instead (e.g. `…/Country?$top=1`): `403 No authorization to access
service group` means the service is deregistered and the `SRVB` can be deleted. Once the `SRVD`
is gone too, the endpoint answers `Group '<SRVB>' not registered`.

## 3. What cleans itself up — and what never will

- **Gone with the `SRVB`:** `SUSH`, `SCO2` (`<SRVB>_0001_G4BA`), `SIA6`.
- **`NONT` / `RONT` cannot be deleted by either MCP.** `SAPWrite` rejects the type codes and the
  `adt` MCP has no delete path. A generator teardown always strands the pair named `Z<projectName>`,
  so **regenerate under a different `projectName`**. Already stranded: `ZZSAPSA_SITE_VISIT` and
  `ZSAPSA_SITE_VISIT` — ignore them, and don't reuse project name `SAPSA_SITE_VISIT`.
- **The package shell refuses to delete** (`400 Package … still contains development objects`)
  even when empty. Reproducible, not lag. Leave it and rebuild into it.

## 4. Orphaned DDLS

Symptom: the view appears in the `DEVC` listing and `tadir_lookup`, but `SAPRead` and `SAPWrite`
both 404 with `Data definition <name> of version  does not exist` (blank version); not in
`INACTIVE_OBJECTS` either.

Fix: `SAPWrite(action="create", type="DDLS")` with any trivial valid DDL over the same name —
it succeeds and gives the object a real version — then delete it immediately.

## 5. Rebuild or patch?

Rebuild when the *shape* is wrong — bad name prefix, redundant key column — and the package holds
no data yet. That is the cheapest moment it will ever be. Otherwise patch in place. When
regenerating, choose new names so the stranded `NONT`/`RONT` don't collide.

## 6. After a teardown

Verify, don't assume: `SAPRead(type="DEVC")` should list only the package and stranded NONT/RONT,
`SAPRead(type="INACTIVE_OBJECTS")` should be empty, and the old service endpoint should answer
`not registered`. Then update the "Current state" section of `CLAUDE.md` and `DEMO-SCRIPT.md`,
which otherwise still describe objects that no longer exist.
