using SiteVisitService as service from '../../srv/site-visit-service';

// ---------------------------------------------------------------------------
// Field labels, texts and value helps
// ---------------------------------------------------------------------------

annotate service.SiteVisit with {
  ID           @title: '{i18n>VisitID}'      @UI.Hidden;
  customerName @title: '{i18n>CustomerName}';
  country      @title: '{i18n>Country}'
               @Common.Text: country.name
               @Common.TextArrangement: #TextFirst;
  visitDate    @title: '{i18n>VisitDate}';
  purpose      @title: '{i18n>Purpose}';
  status       @title: '{i18n>Status}'
               @Common.Text: status.name
               @Common.TextArrangement: #TextOnly
               @Common.ValueListWithFixedValues;
  notes        @title: '{i18n>Notes}'        @UI.MultiLineText;
  createdAt    @title: '{i18n>CreatedAt}';
  createdBy    @title: '{i18n>CreatedBy}';
  modifiedAt   @title: '{i18n>ChangedAt}';
  modifiedBy   @title: '{i18n>ChangedBy}';
}

annotate service.SiteVisit with {
  // Field-control hints so the UI marks mandatory fields before the save check runs
  customerName @Common.FieldControl: #Mandatory;
  country      @Common.FieldControl: #Mandatory;
  visitDate    @Common.FieldControl: #Mandatory;
}

annotate service.Country with {
  code @title: '{i18n>CountryCode}' @Common.Text: name @Common.TextArrangement: #TextLast;
  name @title: '{i18n>CountryName}';
}

annotate service.VisitStatus with {
  code @title: '{i18n>Status}' @Common.Text: name @Common.TextArrangement: #TextOnly;
}

// ---------------------------------------------------------------------------
// List report + object page
// ---------------------------------------------------------------------------

annotate service.SiteVisit with @(
  UI.HeaderInfo: {
    TypeName      : '{i18n>SiteVisit}',
    TypeNamePlural: '{i18n>SiteVisits}',
    Title         : { Value: customerName },
    Description   : { Value: purpose }
  },

  UI.SelectionFields: [ status_code, country_code, visitDate ],

  UI.LineItem: [
    { Value: customerName },
    { Value: country_code },
    { Value: visitDate },
    { Value: status_code },
    { Value: purpose }
  ],

  // Newest visits first
  UI.PresentationVariant: {
    SortOrder     : [{ Property: visitDate, Descending: true }],
    Visualizations: ['@UI.LineItem']
  },

  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', ID: 'General', Label: '{i18n>General}', Target: '@UI.FieldGroup#General' },
    { $Type: 'UI.ReferenceFacet', ID: 'Notes',   Label: '{i18n>Notes}',   Target: '@UI.FieldGroup#Notes' },
    { $Type: 'UI.ReferenceFacet', ID: 'Admin',   Label: '{i18n>Admin}',   Target: '@UI.FieldGroup#Admin' }
  ],

  UI.FieldGroup #General: { Data: [
    { Value: customerName },
    { Value: country_code },
    { Value: visitDate },
    { Value: status_code },
    { Value: purpose }
  ]},

  UI.FieldGroup #Notes: { Data: [
    { Value: notes }
  ]},

  UI.FieldGroup #Admin: { Data: [
    { Value: createdBy },
    { Value: createdAt },
    { Value: modifiedBy },
    { Value: modifiedAt }
  ]}
);
