import { sortMemberSidebarObjectMetadataItems } from '@/navigation-menu-item/display/utils/sortMemberSidebarObjectMetadataItems';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const buildObjectMetadataItem = (
  nameSingular: string,
  createdAt = '2024-01-01T00:00:00.000Z',
): EnrichedObjectMetadataItem => ({
  ...getMockObjectMetadataItemOrThrow('company'),
  id: `${nameSingular}-id`,
  nameSingular,
  createdAt,
});

const getNameSingulars = (objectMetadataItems: EnrichedObjectMetadataItem[]) =>
  objectMetadataItems.map(({ nameSingular }) => nameSingular);

describe('sortMemberSidebarObjectMetadataItems', () => {
  it('should list Dashboards, Leads, Calls, Policies, Notes and Tasks first, in that order', () => {
    const sortedObjectMetadataItems = sortMemberSidebarObjectMetadataItems([
      buildObjectMetadataItem('task'),
      buildObjectMetadataItem('note'),
      buildObjectMetadataItem('policy'),
      buildObjectMetadataItem('call'),
      buildObjectMetadataItem('person'),
      buildObjectMetadataItem('dashboard'),
    ]);

    expect(getNameSingulars(sortedObjectMetadataItems)).toEqual([
      'dashboard',
      'person',
      'call',
      'policy',
      'note',
      'task',
    ]);
  });

  it('should list the other objects after them, newest first', () => {
    const sortedObjectMetadataItems = sortMemberSidebarObjectMetadataItems([
      buildObjectMetadataItem('carrier', '2025-01-01T00:00:00.000Z'),
      buildObjectMetadataItem('task', '2020-01-01T00:00:00.000Z'),
      buildObjectMetadataItem('leadSource', '2025-06-01T00:00:00.000Z'),
      buildObjectMetadataItem('company', '2019-01-01T00:00:00.000Z'),
      buildObjectMetadataItem('person', '2020-01-01T00:00:00.000Z'),
    ]);

    expect(getNameSingulars(sortedObjectMetadataItems)).toEqual([
      'person',
      'task',
      'leadSource',
      'carrier',
      'company',
    ]);
  });

  it('should keep only the objects it is given', () => {
    expect(
      getNameSingulars(
        sortMemberSidebarObjectMetadataItems([
          buildObjectMetadataItem('note'),
          buildObjectMetadataItem('policy'),
        ]),
      ),
    ).toEqual(['policy', 'note']);
    expect(sortMemberSidebarObjectMetadataItems([])).toEqual([]);
  });
});
