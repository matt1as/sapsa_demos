---
name: rap-business-logic
description: Write or change RAP behavior on the SAPSA BTP ABAP trial — behavior definitions (BDEF) with draft and strict(2), determinations, validations, actions, T100 messages and message classes (MSAG), and behavior pool (lhc_) handler code with EML. Use for any BDEF edit, behavior pool change or new message, or when BDEF activation fails with "not activated for drafts", "lock master" or "authorization master" errors.
---

# RAP behavior on the SAPSA trial

The Site Visit BDEF `ZR_SAPSA_VISIT` and behavior pool `ZBP_R_SAPSA_VISIT` were deleted on
2026-09-14; the snippets below are their proven source. SAP's own `/DMO/R_TRAVEL_D` (package
`/DMO/FLIGHT_DRAFT`) is on this trial — read it rather than guess BDEF grammar. Prove changes with `rap-prove-bo`.

## 1. BDEF shape: managed + draft + strict(2)

```
managed implementation in class ZBP_R_SAPSA_VISIT unique;
strict ( 2 );
with draft;
define behavior for ZR_SAPSA_VISIT alias SAPSA_VISIT
persistent table ZSAPSAVISIT
draft table ZSAPSAVISIT_D
etag master LocalLastChangedAt
lock master total etag LastChangedAt
authorization master ( global )
{
  field ( readonly ) UUID, LocalCreatedBy, LocalCreatedAt, LocalLastChangedBy, LocalLastChangedAt, LastChangedAt;
  field ( numbering : managed ) UUID;
  field ( mandatory ) CustomerName, Country, VisitDate;

  create; update; delete;

  determination setDefaultStatus on modify { create; }
  validation validateVisitDate on save { create; update; field VisitDate; }

  draft action Activate optimized;
  draft action Discard;
  draft action Edit;
  draft action Resume;
  draft determine action Prepare { validation validateVisitDate; }

  mapping for ZSAPSAVISIT corresponding { … }
}
```

- **`with draft;` is its own top-level statement**, after `strict ( 2 );`, before `define behavior
  for`. Without it activation reports three misleading errors at once — "not activated for
  drafts", "must be flagged lock master", "must be flagged authorization master" — although both
  clauses are present. Adding the one line clears all three.
- Draft needs `lock master` **with** `total etag <field>`, not `etag master` alone.
- **List every validation that must run before a Fiori save in `draft determine action Prepare`.**
  A validation missing there only fires on direct EML saves.
- Projection BDEF needs `use draft;`, `use etag`, and all five actions spelled out:
  `use action Edit; use action Activate; use action Discard; use action Resume; use action Prepare;`
- **Plain lookup associations (value helps) are not declared in either BDEF** — only compositions.
- Every BDEF element needs a draft-table column and a `mapping` entry; no derived fields in a
  managed root view.

## 2. Messages

- **Message class:** `SAPWrite(action="create", type="MSAG")`. Via `batch_create` the activation
  step returns `403 … no display authorization` *after* creating an empty class — then just
  `SAPWrite(action="update", type="MSAG", messages=[…])`. Message classes need no activation. Don't
  delete and recreate.
- **`CX_ABAP_BEHV_MESSAGE` does not exist here.** Use `new_message( id = … number = … severity = …
  v1 = … )`. If you truly need a class: inherit `CX_NO_CHECK`, implement only
  `IF_ABAP_BEHV_MESSAGE` (it already includes the T100 interfaces — re-declaring them errors).
- Leave spare message numbers for live demo changes (`ZSAPSA_VISIT` 003/004 are reserved, unused).

## 3. Validation — proven pattern

```abap
METHOD validatevisitdate.
  READ ENTITIES OF zr_sapsa_visit IN LOCAL MODE
    ENTITY SAPSA_VISIT FIELDS ( VisitDate ) WITH CORRESPONDING #( keys )
    RESULT DATA(visits).

  DATA(today) = cl_abap_context_info=>get_system_date( ).

  LOOP AT visits INTO DATA(visit).
    " clear what this validation reported on an earlier save attempt
    APPEND VALUE #( %tky = visit-%tky  %state_area = 'VALIDATE_VISIT_DATE' ) TO reported-sapsa_visit.

    IF visit-VisitDate < today.
      APPEND VALUE #( %tky = visit-%tky ) TO failed-sapsa_visit.
      APPEND VALUE #( %tky               = visit-%tky
                      %state_area        = 'VALIDATE_VISIT_DATE'
                      %element-VisitDate = if_abap_behv=>mk-on          " marks the field in Fiori
                      %msg               = new_message( id       = msg_class
                                                        number   = '001'
                                                        severity = if_abap_behv_message=>severity-error
                                                        v1       = |{ visit-VisitDate DATE = ISO }| ) )
             TO reported-sapsa_visit.
    ENDIF.
  ENDLOOP.
ENDMETHOD.
```

- A `reported` entry carrying only `%tky` + `%state_area` (the reset above) is fine — proven here.
- **A `reported` entry with neither `%msg` nor `%state_area`** (e.g. a "processed" marker per key)
  dumps with `CX_RAP_BHV_EMPTY_MSG_OBJECT`, even for valid keys.
- Always pair an error message with a `failed` entry.

## 4. Determination — proven pattern

```abap
METHOD setdefaultstatus.
  READ ENTITIES OF zr_sapsa_visit IN LOCAL MODE
    ENTITY SAPSA_VISIT FIELDS ( Status ) WITH CORRESPONDING #( keys )
    RESULT DATA(visits).

  DELETE visits WHERE Status IS NOT INITIAL.     " respect an explicitly supplied value
  CHECK visits IS NOT INITIAL.

  MODIFY ENTITIES OF zr_sapsa_visit IN LOCAL MODE
    ENTITY SAPSA_VISIT UPDATE FIELDS ( Status )
    WITH VALUE #( FOR visit IN visits ( %tky = visit-%tky  Status = status_open ) )
    REPORTED DATA(update_reported).

  reported = CORRESPONDING #( DEEP update_reported ).
ENDMETHOD.
```

`on modify { create; }` (not `on save`) makes the default visible in the draft immediately.

## 5. EML syntax traps

- Delete is `DELETE FROM VALUE #( … )` — `DELETE WITH` is a syntax error.
- `CREATE`/`UPDATE`/`DELETE`/`READ` on a draft BO take `%is_draft = if_abap_behv=>mk-off` (active)
  or `mk-on` (draft).
- **Draft actions take `%cid` + `%key`, never `%is_draft`**:
  `EXECUTE Edit FROM VALUE #( ( %cid = 'EDIT_1' %key-UUID = uuid ) )`. `%is_draft` does not
  compile; a missing `%cid` dumps with `BEHAVIOR_CONTRACT_VIOLATION` / `MISSING_CID`, because
  `Edit` and `Activate` generate instances.

After a change, activate the BDEF and behavior pool in one batch, then run the proof tests.
