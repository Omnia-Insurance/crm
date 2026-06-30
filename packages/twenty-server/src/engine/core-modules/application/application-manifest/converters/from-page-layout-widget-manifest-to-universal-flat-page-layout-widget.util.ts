import { type PageLayoutWidgetManifest } from 'twenty-shared/application';
import { DEFAULT_WIDGET_SIZE } from 'twenty-shared/constants';
import {
  PageLayoutTabLayoutMode,
  type PageLayoutWidgetVerticalListPosition,
} from 'twenty-shared/types';

import { type WidgetType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-type.enum';
import { type UniversalFlatPageLayoutWidget } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/universal-flat-page-layout-widget.type';

const createVerticalListPosition = (
  index: number,
): PageLayoutWidgetVerticalListPosition => ({
  layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
  index,
});

export const fromPageLayoutWidgetManifestToUniversalFlatPageLayoutWidget = ({
  pageLayoutWidgetManifest,
  pageLayoutTabUniversalIdentifier,
  pageLayoutTabLayoutMode,
  pageLayoutWidgetIndex,
  applicationUniversalIdentifier,
  now,
}: {
  pageLayoutWidgetManifest: PageLayoutWidgetManifest;
  pageLayoutTabUniversalIdentifier: string;
  pageLayoutTabLayoutMode?: PageLayoutTabLayoutMode | null;
  pageLayoutWidgetIndex?: number;
  applicationUniversalIdentifier: string;
  now: string;
}): UniversalFlatPageLayoutWidget => {
  const position =
    pageLayoutTabLayoutMode === PageLayoutTabLayoutMode.VERTICAL_LIST &&
    typeof pageLayoutWidgetIndex === 'number'
      ? createVerticalListPosition(pageLayoutWidgetIndex)
      : null;

  return {
    universalIdentifier: pageLayoutWidgetManifest.universalIdentifier,
    applicationUniversalIdentifier,
    pageLayoutTabUniversalIdentifier,
    title: pageLayoutWidgetManifest.title,
    isActive: true,
    isSystemSideEffect: false,
    type: pageLayoutWidgetManifest.type as WidgetType,
    objectMetadataUniversalIdentifier:
      pageLayoutWidgetManifest.objectUniversalIdentifier ?? null,
    conditionalDisplay: pageLayoutWidgetManifest.conditionalDisplay ?? null,
    gridPosition: pageLayoutWidgetManifest.gridPosition ?? {
      row: 0,
      column: 0,
      rowSpan: DEFAULT_WIDGET_SIZE.default.h,
      columnSpan: DEFAULT_WIDGET_SIZE.default.w,
    },
    position,
    universalConfiguration:
      pageLayoutWidgetManifest.configuration as UniversalFlatPageLayoutWidget['universalConfiguration'],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    conditionalAvailabilityExpression: null,
    universalOverrides: null,
  };
};
