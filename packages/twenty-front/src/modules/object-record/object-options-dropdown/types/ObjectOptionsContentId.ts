export type ObjectOptionsContentId =
  | 'layout'
  | 'fields'
  | 'hiddenFields'
  // OMNIA-CUSTOM: a relation's target fields, added as sub-field columns ("Lead / Date of Birth")
  | 'relationSubFields'
  | 'recordGroups'
  | 'hiddenRecordGroups'
  | 'recordGroupFields'
  | 'recordGroupSort'
  | 'recordGroupLoadLimit'
  | 'recordGroupDisplay'
  | 'addRecordGroup'
  | 'calendarFields'
  | 'calendarView'
  | 'visibility';
