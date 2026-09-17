using { sapsa.sitevisit as db } from '../db/schema';
using { sap.common.Countries } from '@sap/cds/common';
using from '@sap/cds-common-content';

/**
 * OData V4 UI service for the Site Visit Log Fiori Elements app.
 */
@path    : '/odata/v4/site-visit'
@requires: 'authenticated-user'
service SiteVisitService {

  @odata.draft.enabled
  entity SiteVisit   as projection on db.SiteVisits;

  @readonly
  entity Country     as projection on Countries;

  @readonly
  entity VisitStatus as projection on db.VisitStatuses;
}

// Optimistic concurrency: stale edits are rejected (SAPSA-6)
annotate SiteVisitService.SiteVisit with {
  modifiedAt @odata.etag;
}
