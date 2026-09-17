---
name: rap-publish-service
description: Activate a RAP stack and publish, unpublish or troubleshoot an OData service binding (SRVB) on the SAPSA BTP ABAP trial. Use when activating RAP objects in dependency order, publishing a service, when a publish or unpublish times out, or when $metadata returns 404 or 500, "Service group not published", "Usage of <SRVD> not permitted" or "blocked by UCON".
---

# Activate and publish a RAP service on the SAPSA trial

**Core rule: activation success does not mean the service works. The endpoint is the only gate.**

## 1. Activation order

One batch call, `SAPActivate(objects=[…])`, in dependency order:

DOMA → DTEL → TABL (persistence, draft) → DDLS (value helps, interface, projection) → DCLS →
BDEF (interface, projection) → CLAS (behavior pools) → DDLX → SRVD → then SRVB on its own.

Transient warnings such as "Field X is still used in projection list" resolve inside the batch.

## 2. SRVD prerequisites

```cds
@EndUserText.label: 'Site Visit Log - OData V4 UI Service'
@AbapCatalog.extensibility.extensible: true
@ObjectModel.leadingEntity.name: 'ZC_SAPSA_VISIT'
define service ZUI_SAPSA_SITE_VISIT_O4 provider contracts odata_v4_ui {
  expose ZC_SAPSA_VISIT      as SiteVisit;
  expose ZSAPSA_I_COUNTRY_VH as Country;
}
```

- **`Usage of <SRVD> not permitted` on SRVB activation means these two annotations are missing.**
  It is *not* an API release problem, even though ADT's Release Contracts dialog makes it look like
  one. A same-package category-0 (UI) binding needs no release.
- Don't try to set a release contract anyway: `SAPManage(action="set_api_state")` always fails on
  this system and the `adt` MCP has no release step.
- The generator emits `leadingEntity` but not `extensible` — add it.

## 3. Publish — follow exactly

1. `SAPActivate(type="SRVB", name=…)`.
2. `SAPActivate(action="publish_srvb", name=…, service_type="odatav4")` — **once**.
3. **If it times out, do not call publish again.** It usually completes server-side; a retry
   collides with the half-created artifacts, after which both publish *and* unpublish fail
   permanently on that binding and leave undeletable `SCO2`/`SIA6` objects.
   This timeout (`ADT network error: The operation was aborted due to timeout`) comes from
   `arc-1`'s own HTTP call to SAP, not from Claude Code. `arc-1` runs over stdio, which has no
   Claude Code per-request timer, so **no `MCP_*TIMEOUT` setting prevents it** — waiting and
   probing is the only fix.
4. Wait (a background `sleep 45`, then another 90 s if needed), then probe:
   `SAPDiagnose(action="odata_perf", url="/sap/opu/odata4/sap/<srvb>/srvd/sap/<srvd>/0001/$metadata")`
   (names lowercase).
5. **`published: true` is not proof.** On 2026-09-14 `SAPRead(type="SRVB")` and
   `abap_business_services-fetch_services` both reported published while the endpoint returned
   404 `/IWBEP/CM_V4_COS/014 Service group not published` for ~90 seconds. Re-probe until 200.
6. Then probe each entity set and one `$expand` path.

## 4. Diagnosing a failing service

| Symptom | Cause / action |
| --- | --- |
| `$metadata` 500 `SADL_COMPILER/001` | `@ObjectModel.text.association` to a flat value-help view — use `text.element` (see `rap-generate-stack`) |
| 404 `Service group not published` | Publish still settling — wait and re-probe, never republish |
| 403 `blocked by UCON` | Category 1 (Web API) binding; needs a communication arrangement. Use category 0 (UI) |
| `Usage of <SRVD> not permitted` | SRVD annotations from §2 |
| Activates, but data looks wrong | `odata_perf` returns no response body — `SAPQuery` the projection view to see what OData will return |

The Fiori Elements preview cannot be probed through MCP (`odata_perf` refuses non-OData paths).
Open it from ADT: service binding → Preview.

## 5. Unpublish

Needed before an `SRVB` can be deleted (`412 Service endpoint is published`).
`SAPActivate(action="unpublish_srvb")` has the same timeout behaviour — after a timeout, check
`SAPRead(type="SRVB")` → `published` before trying anything else.
