import { useExportProcessRecordsForCSV } from '@/object-record/object-options-dropdown/hooks/useExportProcessRecordsForCSV';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { FieldMetadataType } from '~/generated-metadata/graphql';

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: jest.fn(() => ({
    objectMetadataItem: {
      fields: [
        { type: FieldMetadataType.CURRENCY, name: 'price' },
        { type: FieldMetadataType.TEXT, name: 'name' },
        { type: FieldMetadataType.MULTI_SELECT, name: 'tags' },
        { type: FieldMetadataType.ARRAY, name: 'skills' },
        {
          type: FieldMetadataType.RELATION,
          name: 'agent',
          relation: {
            targetObjectMetadata: { nameSingular: 'person' },
          },
        },
      ],
    },
  })),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: jest.fn(() => ({
    objectMetadataItems: [
      {
        nameSingular: 'person',
        labelIdentifierFieldMetadataId: 'name-field-id',
        fields: [
          {
            id: 'name-field-id',
            name: 'name',
            type: FieldMetadataType.FULL_NAME,
          },
        ],
      },
      {
        nameSingular: 'company',
        labelIdentifierFieldMetadataId: 'company-name-field-id',
        fields: [
          {
            id: 'company-name-field-id',
            name: 'name',
            type: FieldMetadataType.TEXT,
          },
        ],
      },
    ],
  })),
}));

describe('useExportProcessRecordsForCSV', () => {
  it('processes records with currency fields correctly', () => {
    const { result } = renderHook(() =>
      useExportProcessRecordsForCSV('someObject'),
    );

    const records = [
      {
        __typename: 'ObjectRecord',
        id: '1',
        price: { amountMicros: 123456, currencyCode: 'USD' },
        name: 'Item 1',
      },
      {
        __typename: 'ObjectRecord',
        id: '2',
        price: { amountMicros: 789012, currencyCode: 'EUR' },
        name: 'Item 2',
      },
    ];

    let processedRecords;

    act(() => {
      processedRecords = result.current.processRecordsForCSVExport(records);
    });

    expect(processedRecords).toEqual([
      {
        __typename: 'ObjectRecord',
        id: '1',
        price: { amountMicros: 0.123456, currencyCode: 'USD' },
        name: 'Item 1',
      },
      {
        __typename: 'ObjectRecord',
        id: '2',
        price: { amountMicros: 0.789012, currencyCode: 'EUR' },
        name: 'Item 2',
      },
    ]);
  });

  it('processes records with multi-select and array fields correctly', () => {
    const { result } = renderHook(() =>
      useExportProcessRecordsForCSV('someObject'),
    );

    const records = [
      {
        __typename: 'ObjectRecord',
        id: '1',
        tags: ['TAG1', 'TAG2'],
        skills: ['skill1', 'skill2', 'skill3'],
        name: 'Item 1',
      },
      {
        __typename: 'ObjectRecord',
        id: '2',
        tags: ['TAG3'],
        skills: ['skill4'],
        name: 'Item 2',
      },
    ];

    let processedRecords;

    act(() => {
      processedRecords = result.current.processRecordsForCSVExport(records);
    });

    expect(processedRecords).toEqual([
      {
        __typename: 'ObjectRecord',
        id: '1',
        tags: '["TAG1","TAG2"]',
        skills: '["skill1","skill2","skill3"]',
        name: 'Item 1',
      },
      {
        __typename: 'ObjectRecord',
        id: '2',
        tags: '["TAG3"]',
        skills: '["skill4"]',
        name: 'Item 2',
      },
    ]);
  });

  it('processes records with empty multi-select and array fields correctly', () => {
    const { result } = renderHook(() =>
      useExportProcessRecordsForCSV('someObject'),
    );

    const records = [
      {
        __typename: 'ObjectRecord',
        id: '1',
        tags: [],
        skills: [],
        name: 'Item 1',
      },
    ];

    let processedRecords;

    act(() => {
      processedRecords = result.current.processRecordsForCSVExport(records);
    });

    expect(processedRecords).toEqual([
      {
        __typename: 'ObjectRecord',
        id: '1',
        tags: '[]',
        skills: '[]',
        name: 'Item 1',
      },
    ]);
  });

  it('processes relation fields with FULL_NAME label identifier', () => {
    const { result } = renderHook(() =>
      useExportProcessRecordsForCSV('someObject'),
    );

    const records = [
      {
        __typename: 'ObjectRecord',
        id: '1',
        name: 'Policy 1',
        agent: {
          id: 'agent-uuid',
          name: { firstName: 'Jovone', lastName: 'Brown' },
        },
      },
    ];

    let processedRecords;

    act(() => {
      processedRecords = result.current.processRecordsForCSVExport(records);
    });

    expect(processedRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '1',
          agent: 'Jovone Brown',
        }),
      ]),
    );
  });

  it('processes null relation fields gracefully', () => {
    const { result } = renderHook(() =>
      useExportProcessRecordsForCSV('someObject'),
    );

    const records = [
      {
        __typename: 'ObjectRecord',
        id: '1',
        name: 'Policy 1',
        agent: null,
      },
    ];

    let processedRecords;

    act(() => {
      processedRecords = result.current.processRecordsForCSVExport(records);
    });

    expect(processedRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '1',
          agent: null,
        }),
      ]),
    );
  });
});
