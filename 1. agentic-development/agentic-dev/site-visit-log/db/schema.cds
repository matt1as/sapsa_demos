namespace sapsa.sitevisit;

using {
  cuid,
  managed,
  Country,
  sap.common.CodeList
} from '@sap/cds/common';

/**
 * A field rep's visit to a customer site (SAPSA-1).
 */
entity SiteVisits : cuid, managed {
  customerName : String(80)   @mandatory;
  country      : Country      @mandatory;
  visitDate    : Date         @mandatory;
  purpose      : String(80);
  status       : Association to VisitStatuses default 'OPEN';
  notes        : String(1000);
}

/**
 * Fixed values for a visit's status: OPEN / COMPLETED / CANCELLED.
 */
entity VisitStatuses : CodeList {
  key code : String(10);
}
