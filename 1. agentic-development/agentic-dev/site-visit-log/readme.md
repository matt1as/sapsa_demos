# Site Visit Log (CAP)

A local SAP CAP (Node.js) implementation of the **Site Visit Log** from the SAPSA Focus Group
demo. It covers stories SAPSA-2 … SAPSA-8 and the
[technical specification](https://mattiasj.atlassian.net/wiki/spaces/SD/pages/14483457/Site+Visit+Log+Technical+Specification),
built as a CAP app instead of a RAP business object.

## Run it

```sh
npm install
npm run watch        # http://localhost:4004 — opens the Fiori Elements app, no login
npm run watch:login  # same, but with a login prompt for the mocked users alice / bob
npm test             # acceptance tests, one or more per acceptance criterion
```

`npm run watch` signs everyone in as one dummy user, so the page opens straight away (including in
VS Code's built-in browser). To try draft locking between two users, run `npm run watch:login` and
sign in as `alice` and `bob` (empty password) in two browser profiles. The tests always use the
mocked users.

| URL | What |
| --- | --- |
| `/site-visits/webapp/index.html` | Fiori Elements list report + object page |
| `/odata/v4/site-visit/$metadata` | OData V4 metadata with `@UI` annotations |
| `/odata/v4/site-visit/SiteVisit` | Site visits (draft-enabled, full CRUD) |
| `/odata/v4/site-visit/Country` | Country value help (ISO master data, localized names) |

## Layout

| File | Role | RAP counterpart in the spec |
| --- | --- | --- |
| `db/schema.cds` | `SiteVisits` (cuid + managed) and the `VisitStatuses` code list | TABL, DOMA/DTEL, root view |
| `db/data/*.csv` | Status values and demo visits | — |
| `srv/site-visit-service.cds` | `SiteVisitService`: draft-enabled `SiteVisit`, read-only `Country`, `VisitStatus`; ETag | projection, BDEF, SRVD/SRVB |
| `srv/site-visit-service.js` | Status default, visit-date / country / status checks, lock message | behavior pool |
| `_i18n/messages*.properties` | Translatable messages (EN, DE) | MSAG |
| `app/site-visits/annotations.cds` | Labels, value helps, list report, object page | DDLX |
| `app/site-visits/webapp/` | Fiori Elements V4 app | Fiori Elements preview |
| `test/site-visit.test.js` | Acceptance tests over OData, cleaning up their own data | ABAP Unit / EML proof |

## Design notes

- **Country master data** comes from `@sap/cds-common-content` (`sap.common.Countries`, ISO codes
  with translated names), which plays the role of the released `I_Country` / `I_CountryText` views.
- **Associations:** the country association is called `country`, so the expand from SAPSA-3
  is `SiteVisit(ID=…,IsActiveEntity=true)?$expand=country`.
- **Mandatory fields** use `@mandatory`: the save fails with a message on each missing field, and
  the UI marks the fields as required.
- **Checks on save** run in `before CREATE/UPDATE`, which lean-draft activation calls. Message
  targets get the `in/` prefix during draft actions, so Fiori shows them on the field.
- **Visit date:** a past date fails only when a visit is created or its date is changed. "Today"
  means the UTC date.
- **Concurrency:** a draft locks the visit for other users (CAP default lock timeout is 15 min). An
  `@odata.etag` on `modifiedAt` rejects edits based on an outdated copy with HTTP 412.
- **Purpose** is `String(80)` and **Notes** `String(1000)`, per the SAPSA-1 data model. That model
  takes precedence over the spec's older 100-character Purpose.
