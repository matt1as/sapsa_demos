---
name: rap-generate-stack
description: Create a new RAP business object or OData UI service on the SAPSA BTP ABAP trial (package ZSAPSA_DEMO) — with the adt MCP x-ui-service generator, or by hand-writing tables, CDS views, value helps, metadata extensions or draft tables. Use for any new RAP stack, draft-enabled BO, TABL, DDLS, DDLX or value-help view on this system, including extending the Site Visit Log.
---

# Generate a RAP stack on the SAPSA trial

System facts (package, `ZSAPSA_*` prefix, user id, which released views are usable) live in the
project `CLAUDE.md`. This skill is the procedure, plus what the generator gets wrong here.
Continue with `rap-business-logic`, `rap-publish-service` and `rap-prove-bo`.

## 1. Before generating

- Resolve every intended name with `SAPSearch(searchType="tadir_lookup")`. This is a shared trial;
  never update an object whose package is not `ZSAPSA_DEMO`.
- Only model against SAP views with `useInSAPCloudPlatform: true`
  (`SAPRead(type="API_STATE", name=…, objectType="DDLS")`).
- `abap_transport-get` returns `isRecordingRequired: false` for `ZSAPSA_DEMO` →
  `transportRequestNumber: ""`.
- **Large generator runs can time out on the Claude Code side.** `adt` is an HTTP MCP server
  (project-local entry in `~/.claude.json`, no `timeout` set). For HTTP servers Claude Code times
  each request to its first response byte at the **greatest of 60 s, the server's tool timeout,
  and `MCP_TIMEOUT`** — so with nothing configured, a call silent for over 60 s is cut off. The
  single-entity Site Visit run returned in time; multi-entity BOs reportedly take 60–180 s.
  Before a big generation, add `"timeout": 600000` to the `adt` server entry and restart Claude
  Code — it raises both the wall-clock limit and the per-request timer for that server only.
  `MCP_TOOL_TIMEOUT=600000` (all servers) also works; `MCP_TIMEOUT=600000` works for HTTP servers
  too but mainly stretches every server's startup wait.
- **If a generate call times out anyway, do not re-run it** — the server keeps generating, and a
  second run collides with the half-created objects. Check `SAPRead(type="DEVC",
  name="ZSAPSA_DEMO")` or `abap_business_services-fetch_services` to see what was created.

## 2. Generator config that works

`abap_generators-generate_objects`, destination `CloudTrial`, generator `x-ui-service`
("OData UI Service from Scratch"). Proven config from 2026-09-14:

```json
{
  "metadata": { "package": "ZSAPSA_DEMO" },
  "sessionId": "<from get_schema referenceContent>",
  "serviceConfiguration": {
    "applicationType": "withDraft",
    "objectsNaming": {},
    "serviceNaming": { "projectName": "SAPSA_VISIT_LOG" },
    "useTableEntities": false
  },
  "businessEntities": [ { "entityName": "SAPSA_VISIT", "compositionCardinality": "none" } ],
  "businessEntitiesFields": [ { "entityName": "SAPSA_VISIT", "entityFields": [
    { "fieldName": "CustomerName", "semanticType": "text", "dataType": "char", "length": 80, "isSemanticKey": true },
    { "fieldName": "Country",      "semanticType": "dataElement", "dataElement": "LAND1" },
    { "fieldName": "VisitDate",    "semanticType": "date", "dataType": "date" },
    { "fieldName": "Purpose",      "semanticType": "custom", "dataType": "char", "length": 60 },
    { "fieldName": "Notes",        "semanticType": "custom", "dataType": "string" }
  ] } ]
}
```

Rules:

- **`objectsNaming: {}`.** The generator prepends its own `Z`; `prefix: "Z"` produces `ZZ*` names.
- **Every field needs `semanticType`.** Without it: `Builtin type  of field <X> is invalid` (blank
  type). Plain field → `"custom"` + `dataType`; DDIC data element → `"dataElement"` + `dataElement`.
- **Don't add a UUID key field.** The generator adds `key uuid as UUID` itself; your own becomes a
  redundant second UUID column.
- `useTableEntities: false` (classic `TABL`), `applicationType: "withDraft"`.

Names produced, for `entityName: E`, `projectName: P`:

| Object | Name |
| --- | --- |
| Table / draft table | `Z<E without underscores>` / `…_D` |
| Interface view, BDEF, DCLS | `ZR_<E>` |
| Projection view, BDEF, DCLS, DDLX | `ZC_<E>` |
| Behavior pools | `ZBP_R_<E>`, `ZBP_C_<E>` |
| SRVD **and** SRVB | `ZUI_<P>_O4` |
| NONT / RONT | `Z<P>` — **cannot be deleted later**, choose `P` carefully |

**`TABL` names are capped at 16 characters** and the draft table is the longest name. Keep `E`
short: `SAPSA_VISIT` → `ZSAPSAVISIT_D` (13).

## 3. Post-generation checklist — do every item

1. **Read both tables back and fix the types.** For `semanticType: "custom"` the generator ignores
   `length` and non-char types: `char(80)`, `char(60)` and `string` all came back `abap.char(10)`.
   It activates clean; data truncates later. Fix the persistence table (snake_case columns) **and**
   the draft table (flattened element names, key in position 2, `"%admin" : include
   sych_bdl_draft_admin_inc;`). `dataElement` fields are generated correctly.
2. **Keep `_BaseEntity` in the projection view.** The generated projection DCLS does
   `REPLACING { ROOT WITH _BaseEntity }`. Drop the association and everything still activates, but
   the access condition is silently not evaluated (ATC: `Access conditions not analyzed because of
   error`).
3. **Rewrite the generated DDLX.** It puts every field, admin timestamps included, into both
   `@UI.lineItem` and `@UI.selectionField`.
4. **Fix the SRVD** — rename entity sets (`expose ZC_X as SiteVisit;`) and add
   `@AbapCatalog.extensibility.extensible: true`; see `rap-publish-service`.
5. Expect extra objects in the package: `SUSH`, `SCO2` (`<SRVB>_0001_G4BA`), and `SIA6` after
   publish. They go away with the `SRVB`.

## 4. Hand-writing CDS / DDIC on this system

- **Draft tables use CDS element names**, not DB column names: `client`/`mandt`, key, then
  `customername`, `visitdate`, `locallastchangedat`, …, then the `%admin` include. Copying the
  persistence table's columns fails with ~9 "not a suitable draft persistency" messages.
- **`abap.` is only for built-ins** (`abap.char(n)`, `abap.datn`, `abap.string(0)`). Data elements
  are referenced bare and lowercase: `land1`, `zsapsa_visit_status`.
- **`TABL` ≤ 16 chars**; `DDLS`/`BDEF`/`SRVD` ≤ 30.
- **`@AccessControl.authorizationCheck: #MANDATORY` needs a DCLS**, or every read dumps with
  `ACM_UNEXPECTED_VALUE`. Minimal permissive role:
  `@MappingRole: true define role <NAME> { grant select on <ENTITY> where TRUE; }`
- `@ObjectModel.usageType.sizeCategory: #XS` is invalid ("Invalid annotation enum value");
  `@ObjectModel.resultSet.sizeCategory: #XS` is fine.
- **`@UI.facet` must be attached to an element in a DDLX**, not placed at view scope before
  `annotate view` ("used at wrong position (wrong scope)"). `@UI.headerInfo` is fine at view scope.

## 5. Value helps — proven pattern (`ZSAPSA_I_COUNTRY_VH`)

```cds
@AccessControl.authorizationCheck: #NOT_REQUIRED
@ObjectModel.resultSet.sizeCategory: #XS
define view entity ZSAPSA_I_COUNTRY_VH
  as select from I_Country
  association [0..*] to I_CountryText as _Text on $projection.Country = _Text.Country
{
      @ObjectModel.text.element: [ 'CountryName' ]
  key Country,
      @Semantics.text: true
      _Text[ 1: Language = $session.system_language ].CountryName as CountryName,
      _Text
}
```

- **Use `@ObjectModel.text.element`, never `@ObjectModel.text.association` to a flat view.** The
  latter activates, then `$metadata` returns HTTP 500 `SADL_COMPILER/001`.
- Interface view: `association [0..1] to ZSAPSA_I_COUNTRY_VH as _Country on …` and
  `@ObjectModel.foreignKey.association: '_Country'` on the key field; expose `_Country`.
- Projection view: `@Consumption.valueHelpDefinition: [ { entity: { name: 'ZSAPSA_I_COUNTRY_VH',
  element: 'Country' } } ]`; expose `_Country`.
- **Do not declare the association in either BDEF** — `association`/`use association` is only for
  compositions ("not part of a composition hierarchy").
- **Do not pull derived text fields into a managed root view** (e.g. `_Country.CountryName as
  CountryName`). Every element needs a draft-table column and a mapping, so activation fails with
  "not a suitable draft persistency (there is no COUNTRYNAME field)". Expose the association for
  `$expand` instead.
