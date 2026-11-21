import { ViewKey, ViewType } from 'twenty-shared/types';

import { computeOmniaInitialObjectViewPositionUpdates } from 'src/database/commands/upgrade-version-command/omnia/utils/compute-omnia-initial-object-view-position-updates.util';
import { getInitialObjectViewUniversalIdentifier } from 'src/engine/metadata-modules/view/utils/get-initial-object-view-universal-identifier.util';

const CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER =
  '20202020-0000-4000-8000-0000000000c1';
const OBJECT_UNIVERSAL_IDENTIFIER = '20202020-0000-4000-8000-0000000000a1';

const INITIAL_VIEW_UNIVERSAL_IDENTIFIER =
  getInitialObjectViewUniversalIdentifier({
    viewApplicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
    objectUniversalIdentifier: OBJECT_UNIVERSAL_IDENTIFIER,
  });

type TestView = {
  id: string;
  universalIdentifier: string;
  key: ViewKey | null;
  type: ViewType;
  position: number;
  deletedAt: string | null;
};

const buildView = (overrides: Partial<TestView> & { id: string }): TestView => ({
  universalIdentifier: `${overrides.id}-uid`,
  key: null,
  type: ViewType.TABLE,
  position: 0,
  deletedAt: null,
  ...overrides,
});

const INDEX_VIEW = buildView({
  id: 'a0000000-0000-4000-8000-000000000000',
  key: ViewKey.INDEX,
  position: 0,
});

const buildInitialView = (overrides: Partial<TestView> = {}) =>
  buildView({
    id: 'd0000000-0000-4000-8000-000000000000',
    universalIdentifier: INITIAL_VIEW_UNIVERSAL_IDENTIFIER,
    position: 1,
    ...overrides,
  });

const compute = (views: TestView[]) =>
  computeOmniaInitialObjectViewPositionUpdates({
    flatObjectMetadatas: [
      {
        universalIdentifier: OBJECT_UNIVERSAL_IDENTIFIER,
        nameSingular: 'call',
        viewUniversalIdentifiers: views.map((view) => view.universalIdentifier),
      },
    ],
    flatViewsByUniversalIdentifier: Object.fromEntries(
      views.map((view) => [view.universalIdentifier, view]),
    ) as Parameters<
      typeof computeOmniaInitialObjectViewPositionUpdates
    >[0]['flatViewsByUniversalIdentifier'],
    initialViewApplicationUniversalIdentifier:
      CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
  });

describe('computeOmniaInitialObjectViewPositionUpdates', () => {
  it('moves the initial view ahead of a custom view at a lower position', () => {
    const initialView = buildInitialView();

    expect(
      compute([
        INDEX_VIEW,
        initialView,
        buildView({ id: 'b0000000-0000-4000-8000-000000000000', position: 0 }),
      ]),
    ).toEqual([
      { viewId: initialView.id, objectNameSingular: 'call', position: -1 },
    ]);
  });

  it('moves the initial view ahead of a custom view that wins the position tie on id', () => {
    const initialView = buildInitialView();

    expect(
      compute([
        INDEX_VIEW,
        initialView,
        buildView({ id: '20000000-0000-4000-8000-000000000000', position: 1 }),
      ]),
    ).toEqual([
      { viewId: initialView.id, objectNameSingular: 'call', position: 0 },
    ]);
  });

  it('leaves the initial view alone when it already opens first', () => {
    expect(
      compute([
        INDEX_VIEW,
        buildInitialView(),
        buildView({ id: 'e0000000-0000-4000-8000-000000000000', position: 1 }),
        buildView({ id: 'f0000000-0000-4000-8000-000000000000', position: 2 }),
      ]),
    ).toEqual([]);
  });

  it('ignores INDEX, widget and soft-deleted views', () => {
    expect(
      compute([
        INDEX_VIEW,
        buildInitialView(),
        buildView({
          id: 'b0000000-0000-4000-8000-000000000000',
          type: ViewType.FIELDS_WIDGET,
          position: 0,
        }),
        buildView({
          id: 'c0000000-0000-4000-8000-000000000000',
          position: 0,
          deletedAt: '2026-11-20T00:00:00.000Z',
        }),
      ]),
    ).toEqual([]);
  });

  it('skips objects without a seeded initial view', () => {
    expect(
      compute([
        INDEX_VIEW,
        buildView({ id: 'b0000000-0000-4000-8000-000000000000', position: 0 }),
      ]),
    ).toEqual([]);
  });
});
