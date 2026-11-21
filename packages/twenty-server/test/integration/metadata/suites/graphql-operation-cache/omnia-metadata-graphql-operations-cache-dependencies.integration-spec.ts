import { gql } from 'graphql-tag';
import { makeMetadataApiRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { getAppProviderByClassName } from 'test/integration/utils/get-app-provider-by-class-name.util';

import { type ASTNode } from 'graphql';

import { METADATA_GRAPHQL_OPERATIONS_TO_CACHE } from 'src/engine/api/graphql/graphql-config/constants/metadata-graphql-operations-to-cache.constant';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceCacheOrDerivedCacheKeyName } from 'src/engine/workspace-cache/types/workspace-cache-key.type';

// Mirrors FIND_ALL_RECORD_PAGE_LAYOUTS and its page layout, tab and widget fragments from
// twenty-front: the recorded resolver reads are only as complete as this selection set.
// The operation names stay out of the cache config, so a cached response never skips the resolvers.
const FIND_ALL_RECORD_PAGE_LAYOUTS_QUERY = gql`
  query OmniaFindAllRecordPageLayoutsCacheDependencies {
    getPageLayouts(pageLayoutType: RECORD_PAGE) {
      id
      applicationId
      name
      objectMetadataId
      type
      universalIdentifier
      isSystemSideEffect
      isFirstTabPinned
      defaultTabToFocusOnMobileAndSidePanelId
      createdAt
      updatedAt
      tabs {
        id
        applicationId
        universalIdentifier
        isSystemSideEffect
        title
        icon
        position
        layoutMode
        widgets {
          id
          applicationId
          universalIdentifier
          isSystemSideEffect
          title
          type
          objectMetadataId
          createdAt
          updatedAt
          isActive
          deletedAt
          conditionalDisplay
          conditionalAvailabilityExpression
          gridPosition {
            column
            columnSpan
            row
            rowSpan
          }
          position {
            ... on PageLayoutWidgetGridPosition {
              layoutMode
              row
              column
              rowSpan
              columnSpan
            }
            ... on PageLayoutWidgetVerticalListPosition {
              layoutMode
              index
              heightBehavior
            }
            ... on PageLayoutWidgetCanvasPosition {
              layoutMode
            }
          }
          configuration {
            ... on BarChartConfiguration {
              configurationType
              aggregateFieldMetadataId
              aggregateOperation
              primaryAxisGroupByFieldMetadataId
              primaryAxisGroupBySubFieldName
              primaryAxisDateGranularity
              primaryAxisOrderBy
              primaryAxisManualSortOrder
              secondaryAxisGroupByFieldMetadataId
              secondaryAxisGroupBySubFieldName
              secondaryAxisGroupByDateGranularity
              secondaryAxisOrderBy
              secondaryAxisManualSortOrder
              omitNullValues
              axisNameDisplay
              displayDataLabel
              displayLegend
              numberFormat
              rangeMin
              rangeMax
              color
              description
              filter
              groupMode
              layout
              isCumulative
              splitMultiValueFields
              timezone
              firstDayOfTheWeek
            }
            ... on LineChartConfiguration {
              configurationType
              aggregateFieldMetadataId
              aggregateOperation
              primaryAxisGroupByFieldMetadataId
              primaryAxisGroupBySubFieldName
              primaryAxisDateGranularity
              primaryAxisOrderBy
              primaryAxisManualSortOrder
              secondaryAxisGroupByFieldMetadataId
              secondaryAxisGroupBySubFieldName
              secondaryAxisGroupByDateGranularity
              secondaryAxisOrderBy
              secondaryAxisManualSortOrder
              omitNullValues
              axisNameDisplay
              displayDataLabel
              displayLegend
              numberFormat
              rangeMin
              rangeMax
              color
              description
              filter
              isStacked
              isCumulative
              splitMultiValueFields
              timezone
              firstDayOfTheWeek
            }
            ... on PieChartConfiguration {
              configurationType
              groupByFieldMetadataId
              aggregateFieldMetadataId
              aggregateOperation
              groupBySubFieldName
              dateGranularity
              orderBy
              manualSortOrder
              displayDataLabel
              showCenterMetric
              displayLegend
              numberFormat
              hideEmptyCategory
              splitMultiValueFields
              color
              description
              filter
              timezone
              firstDayOfTheWeek
            }
            ... on AggregateChartConfiguration {
              configurationType
              aggregateFieldMetadataId
              aggregateOperation
              label
              displayDataLabel
              numberFormat
              description
              filter
              prefix
              suffix
              timezone
              firstDayOfTheWeek
              ratioAggregateConfig {
                fieldMetadataId
                optionValue
              }
            }
            ... on IframeConfiguration {
              configurationType
              url
            }
            ... on StandaloneRichTextConfiguration {
              configurationType
              body {
                blocknote
                markdown
                tiptap
              }
            }
            ... on CalendarConfiguration {
              configurationType
            }
            ... on EmailsConfiguration {
              configurationType
            }
            ... on EmailThreadConfiguration {
              configurationType
            }
            ... on CallRecordingSummaryConfiguration {
              configurationType
            }
            ... on CallRecordingTranscriptConfiguration {
              configurationType
            }
            ... on ChatThreadsConfiguration {
              configurationType
            }
            ... on ChatConfiguration {
              configurationType
            }
            ... on MessageCampaignBodyConfiguration {
              configurationType
            }
            ... on MessageCampaignDetailsConfiguration {
              configurationType
            }
            ... on FieldConfiguration {
              configurationType
              fieldDisplayMode
              fieldMetadataId
              viewId
              nestedRelationFieldMetadataId
              isUIEditable
            }
            ... on FieldRichTextConfiguration {
              configurationType
            }
            ... on FieldsConfiguration {
              configurationType
              viewId
              newFieldDefaultVisibility
              shouldAllowUserToSeeHiddenFields
            }
            ... on FormFieldConfiguration {
              configurationType
              fieldMetadataId
            }
            ... on FilesConfiguration {
              configurationType
            }
            ... on NotesConfiguration {
              configurationType
            }
            ... on TasksConfiguration {
              configurationType
            }
            ... on TimelineConfiguration {
              configurationType
            }
            ... on ViewConfiguration {
              configurationType
            }
            ... on RecordTableConfiguration {
              configurationType
              viewId
              recordLimit
              isUIEditable
            }
            ... on WorkflowConfiguration {
              configurationType
            }
            ... on WorkflowRunConfiguration {
              configurationType
            }
            ... on WorkflowVersionConfiguration {
              configurationType
            }
            ... on FrontComponentConfiguration {
              configurationType
              frontComponentId
              headerCommandMenuItemUniversalIdentifiers
            }
          }
          pageLayoutTabId
        }
        pageLayoutId
        isActive
        createdAt
        updatedAt
      }
    }
  }
`;

const FIND_ALL_RECORD_PAGE_LAYOUTS_BASELINE_QUERY = gql`
  query OmniaFindAllRecordPageLayoutsCacheDependenciesBaseline {
    getPageLayouts(pageLayoutType: RECORD_PAGE) {
      id
    }
  }
`;

describe('Omnia metadata GraphQL operations cache dependencies', () => {
  const recordAccessedCacheKeys = async (
    query: ASTNode,
  ): Promise<Set<WorkspaceCacheOrDerivedCacheKeyName>> => {
    const workspaceCacheService =
      getAppProviderByClassName<WorkspaceCacheService>('WorkspaceCacheService');
    const spy = jest.spyOn(workspaceCacheService, 'getOrRecomputeWithHashes');

    try {
      const response = await makeMetadataApiRequest({ query });

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.getPageLayouts.length).toBeGreaterThan(0);

      return new Set<WorkspaceCacheOrDerivedCacheKeyName>(
        spy.mock.calls.flatMap(([, cacheKeyNames]) => cacheKeyNames),
      );
    } finally {
      spy.mockRestore();
    }
  };

  // A flat map read but not declared leaves the cached response stale until CACHE_STORAGE_TTL
  it('declares every flat map the FindAllRecordPageLayouts resolvers read', async () => {
    const declaredDependencies = new Set<WorkspaceCacheOrDerivedCacheKeyName>(
      METADATA_GRAPHQL_OPERATIONS_TO_CACHE.FindAllRecordPageLayouts
        .dependencies,
    );
    const requestInfrastructureKeys = await recordAccessedCacheKeys(
      FIND_ALL_RECORD_PAGE_LAYOUTS_BASELINE_QUERY,
    );
    const accessedCacheKeys = await recordAccessedCacheKeys(
      FIND_ALL_RECORD_PAGE_LAYOUTS_QUERY,
    );

    const undeclaredDependencies = [...accessedCacheKeys].filter(
      (cacheKeyName) =>
        !declaredDependencies.has(cacheKeyName) &&
        !requestInfrastructureKeys.has(cacheKeyName),
    );

    expect(undeclaredDependencies).toEqual([]);
  });
});
