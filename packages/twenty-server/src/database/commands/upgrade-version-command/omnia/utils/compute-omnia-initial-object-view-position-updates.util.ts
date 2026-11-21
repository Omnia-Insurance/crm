import { ViewKey } from 'twenty-shared/types';
import {
  isDefined,
  isNonEmptyArray,
  isWidgetViewType,
} from 'twenty-shared/utils';

import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatView } from 'src/engine/metadata-modules/flat-view/types/flat-view.type';
import { getInitialObjectViewUniversalIdentifier } from 'src/engine/metadata-modules/view/utils/get-initial-object-view-universal-identifier.util';

type PositionInputFlatObjectMetadata = Pick<
  FlatObjectMetadata,
  'universalIdentifier' | 'nameSingular' | 'viewUniversalIdentifiers'
>;

type PositionInputFlatView = Pick<
  FlatView,
  'id' | 'universalIdentifier' | 'key' | 'type' | 'position' | 'deletedAt'
>;

export type OmniaInitialObjectViewPositionUpdate = {
  viewId: string;
  objectNameSingular: string;
  position: number;
};

// Mirrors the front's computeObjectViewTargetIds order: position, then id.
const sortsBefore = (
  view: PositionInputFlatView,
  otherView: PositionInputFlatView,
) =>
  view.position < otherView.position ||
  (view.position === otherView.position &&
    view.id.localeCompare(otherView.id) < 0);

export const computeOmniaInitialObjectViewPositionUpdates = ({
  flatObjectMetadatas,
  flatViewsByUniversalIdentifier,
  initialViewApplicationUniversalIdentifier,
}: {
  flatObjectMetadatas: PositionInputFlatObjectMetadata[];
  flatViewsByUniversalIdentifier: Partial<
    Record<string, PositionInputFlatView>
  >;
  initialViewApplicationUniversalIdentifier: string;
}): OmniaInitialObjectViewPositionUpdate[] =>
  flatObjectMetadatas.flatMap((flatObjectMetadata) => {
    const initialViewUniversalIdentifier =
      getInitialObjectViewUniversalIdentifier({
        viewApplicationUniversalIdentifier:
          initialViewApplicationUniversalIdentifier,
        objectUniversalIdentifier: flatObjectMetadata.universalIdentifier,
      });

    const selectableViews = flatObjectMetadata.viewUniversalIdentifiers
      .map(
        (viewUniversalIdentifier) =>
          flatViewsByUniversalIdentifier[viewUniversalIdentifier],
      )
      .filter(isDefined)
      .filter(
        (view) =>
          !isDefined(view.deletedAt) &&
          view.key !== ViewKey.INDEX &&
          !isWidgetViewType(view.type),
      );

    const initialView = selectableViews.find(
      (view) => view.universalIdentifier === initialViewUniversalIdentifier,
    );

    if (!isDefined(initialView)) {
      return [];
    }

    const otherViews = selectableViews.filter(
      (view) => view.id !== initialView.id,
    );

    if (
      !isNonEmptyArray(otherViews) ||
      otherViews.every((otherView) => sortsBefore(initialView, otherView))
    ) {
      return [];
    }

    return [
      {
        viewId: initialView.id,
        objectNameSingular: flatObjectMetadata.nameSingular,
        position: Math.min(...otherViews.map((view) => view.position)) - 1,
      },
    ];
  });
