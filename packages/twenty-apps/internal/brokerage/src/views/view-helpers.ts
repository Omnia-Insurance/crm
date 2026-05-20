import {
  ViewFilterOperand,
  ViewOpenRecordIn,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

export const MONTH_TO_DATE_FILTER_VALUE = 'THIS_1_MONTH';

export const TABLE_VIEW_DEFAULTS = {
  type: ViewType.TABLE,
  openRecordIn: ViewOpenRecordIn.SIDE_PANEL,
};

export const createVisibleViewField = ({
  universalIdentifier,
  fieldMetadataUniversalIdentifier,
  position,
  size,
}: {
  universalIdentifier: string;
  fieldMetadataUniversalIdentifier: string;
  position: number;
  size: number;
}) => ({
  universalIdentifier,
  fieldMetadataUniversalIdentifier,
  isVisible: true,
  position,
  size,
});

export const createTodayFilter = ({
  universalIdentifier,
  fieldMetadataUniversalIdentifier,
}: {
  universalIdentifier: string;
  fieldMetadataUniversalIdentifier: string;
}) => ({
  universalIdentifier,
  fieldMetadataUniversalIdentifier,
  operand: ViewFilterOperand.IS_TODAY,
  value: '',
});

export const createMonthToDateFilter = ({
  universalIdentifier,
  fieldMetadataUniversalIdentifier,
}: {
  universalIdentifier: string;
  fieldMetadataUniversalIdentifier: string;
}) => ({
  universalIdentifier,
  fieldMetadataUniversalIdentifier,
  operand: ViewFilterOperand.IS_RELATIVE,
  value: MONTH_TO_DATE_FILTER_VALUE,
});

export const createDescendingSort = ({
  universalIdentifier,
  fieldMetadataUniversalIdentifier,
}: {
  universalIdentifier: string;
  fieldMetadataUniversalIdentifier: string;
}) => ({
  universalIdentifier,
  fieldMetadataUniversalIdentifier,
  direction: ViewSortDirection.DESC,
});
