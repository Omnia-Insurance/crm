import { transformRowsForServerImport } from '@/object-record/spreadsheet-import/utils/transformRowsForServerImport';

// A policy row as the dialog sends it: direct fields from buildRecordFromImportedStructuredRow,
// plus the relation keys of the raw structured row. All values are synthetic.
const SAMPLE_RAW_ROW: Record<string, unknown> = {
  id: '6b8e7a52-3f0c-4d8e-9a51-2c4b7d9e1f03',
  name: 'Example Carrier - ACA - Bronze',
  policyNumber: 'POL-0001',
  status: 'SUBMITTED',

  'update:firstName-name (lead)': 'Jane',
  'update:lastName-name (lead)': 'Doe',
  'update:dateOfBirth (lead)': '',
  'update:gender (lead)': '',
  'update:primaryPhoneNumber-phones (lead)': '5550100100',
  'update:primaryPhoneCountryCode-phones (lead)': 'US',
  'update:primaryPhoneCallingCode-phones (lead)': '+1',
  'update:additionalPhones-phones (lead)': '[]',
  'update:primaryEmail-emails (lead)': 'jane.doe@example.com',
  'update:additionalEmails-emails (lead)': '[]',
  'update:addressStreet1-addressCustom (lead)': '100 Example St',
  'update:addressStreet2-addressCustom (lead)': '',
  'update:addressCity-addressCustom (lead)': 'Springfield',
  'update:addressState-addressCustom (lead)': 'FL',
  'update:addressCountry-addressCustom (lead)': 'United States',
  'update:addressPostcode-addressCustom (lead)': '00000',

  'update:npn (agent)': '10000001',
  'update:status (agent)': 'ACTIVE',

  '__relationLabel:carrier': 'Example Carrier',
  '__relationLabel:leadSource': 'Example Lead Source',

  '__readOnly:lead.familyMembers': 'Example Member',
};

describe('transformRowsForServerImport', () => {
  describe('key transformation', () => {
    it('should convert scalar update keys to dot notation', () => {
      const { transformedRows } = transformRowsForServerImport([
        { 'update:dateOfBirth (lead)': '1980-01-01' },
      ]);

      expect(transformedRows[0]).toHaveProperty(
        ['lead.dateOfBirth'],
        '1980-01-01',
      );
      expect(transformedRows[0]).not.toHaveProperty(
        'update:dateOfBirth (lead)',
      );
    });

    it('should convert composite update keys to dot notation', () => {
      const { transformedRows } = transformRowsForServerImport([
        { 'update:primaryPhoneNumber-phones (lead)': '5550100100' },
      ]);

      expect(transformedRows[0]).toHaveProperty(
        ['lead.phones.primaryPhoneNumber'],
        '5550100100',
      );
    });

    it('should convert FULL_NAME composite keys to dot notation', () => {
      const { transformedRows } = transformRowsForServerImport([
        {
          'update:firstName-name (lead)': 'John',
          'update:lastName-name (lead)': 'Doe',
        },
      ]);

      expect(transformedRows[0]).toHaveProperty(
        ['lead.name.firstName'],
        'John',
      );
      expect(transformedRows[0]).toHaveProperty(['lead.name.lastName'], 'Doe');
    });

    it('should convert address composite keys to dot notation', () => {
      const { transformedRows } = transformRowsForServerImport([
        {
          'update:addressCity-addressCustom (lead)': 'Springfield',
          'update:addressState-addressCustom (lead)': 'FL',
        },
      ]);

      expect(transformedRows[0]).toHaveProperty(
        ['lead.addressCustom.addressCity'],
        'Springfield',
      );
      expect(transformedRows[0]).toHaveProperty(
        ['lead.addressCustom.addressState'],
        'FL',
      );
    });

    it('should convert relation label keys to plain names', () => {
      const { transformedRows } = transformRowsForServerImport([
        { '__relationLabel:carrier': 'Example Carrier' },
      ]);

      expect(transformedRows[0]).toHaveProperty('carrier', 'Example Carrier');
      expect(transformedRows[0]).not.toHaveProperty('__relationLabel:carrier');
    });

    it('should convert pre-normalized connect field keys to dot notation', () => {
      const { transformedRows } = transformRowsForServerImport([
        { 'update:primaryPhoneNumber-phones (lead)': '5550100101' },
      ]);

      expect(transformedRows[0]).toHaveProperty(
        ['lead.phones.primaryPhoneNumber'],
        '5550100101',
      );
    });

    it('should convert the relation id connect key so a re-import reconnects by id', () => {
      const { transformedRows } = transformRowsForServerImport([
        { 'update:id (carrier)': '0f1d5e8a-2b3c-4d5e-8f90-a1b2c3d4e5f6' },
      ]);

      expect(transformedRows[0]).toEqual({
        'carrier.id': '0f1d5e8a-2b3c-4d5e-8f90-a1b2c3d4e5f6',
      });
    });

    it('should drop read-only keys', () => {
      const { transformedRows, relationBehaviors } =
        transformRowsForServerImport([
          {
            '__readOnly:lead.familyMembers': 'Example Member',
            '__readOnly:lead.addressCustom.addressLat': '0',
          },
        ]);

      expect(transformedRows[0]).toEqual({});
      expect(relationBehaviors).toHaveLength(0);
    });

    it('should pass through composite field keys unchanged (not treat as relations)', () => {
      const { transformedRows, relationBehaviors } =
        transformRowsForServerImport([
          { 'Amount (premium)': '55.00', 'Currency (premium)': 'USD' },
        ]);

      expect(transformedRows[0]).toHaveProperty('Amount (premium)', '55.00');
      expect(transformedRows[0]).toHaveProperty('Currency (premium)', 'USD');
      expect(relationBehaviors).toHaveLength(0);
    });

    it('should pass through direct field keys unchanged', () => {
      const { transformedRows } = transformRowsForServerImport([
        { id: 'abc-123', name: 'Test', status: 'SUBMITTED' },
      ]);

      expect(transformedRows[0]).toEqual({
        id: 'abc-123',
        name: 'Test',
        status: 'SUBMITTED',
      });
    });
  });

  describe('full row transformation (policies.csv format)', () => {
    it('should correctly transform a complete policy export row', () => {
      const { transformedRows } = transformRowsForServerImport([
        SAMPLE_RAW_ROW,
      ]);

      const row = transformedRows[0];

      expect(row.id).toBe('6b8e7a52-3f0c-4d8e-9a51-2c4b7d9e1f03');
      expect(row.name).toBe('Example Carrier - ACA - Bronze');
      expect(row.policyNumber).toBe('POL-0001');
      expect(row.status).toBe('SUBMITTED');

      expect(row['lead.name.firstName']).toBe('Jane');
      expect(row['lead.name.lastName']).toBe('Doe');
      expect(row['lead.phones.primaryPhoneNumber']).toBe('5550100100');
      expect(row['lead.phones.primaryPhoneCountryCode']).toBe('US');
      expect(row['lead.emails.primaryEmail']).toBe('jane.doe@example.com');
      expect(row['lead.addressCustom.addressStreet1']).toBe('100 Example St');
      expect(row['lead.addressCustom.addressCity']).toBe('Springfield');
      expect(row['lead.addressCustom.addressState']).toBe('FL');

      expect(row['agent.npn']).toBe('10000001');
      expect(row['agent.status']).toBe('ACTIVE');

      expect(row['carrier']).toBe('Example Carrier');
      expect(row['leadSource']).toBe('Example Lead Source');

      const keys = Object.keys(row);

      expect(keys.every((key) => !key.startsWith('update:'))).toBe(true);
      expect(keys.every((key) => !key.startsWith('__relationLabel:'))).toBe(
        true,
      );
      expect(keys.every((key) => !key.startsWith('__readOnly:'))).toBe(true);
    });
  });

  describe('relation behavior auto-detection', () => {
    it('should detect SMART_UPDATE for relations with sub-fields', () => {
      const { relationBehaviors } = transformRowsForServerImport([
        {
          'update:dateOfBirth (lead)': '1985-01-01',
          'update:primaryPhoneNumber-phones (lead)': '5550100101',
        },
      ]);

      const leadBehavior = relationBehaviors.find(
        (relationBehavior) => relationBehavior.relationFieldName === 'lead',
      );

      expect(leadBehavior).toBeDefined();
      expect(leadBehavior?.behavior).toBe('SMART_UPDATE');
      expect(leadBehavior?.onNotFound).toBe('CREATE');
    });

    it('should detect LOOKUP_ASSIGN for relations with only labels', () => {
      const { relationBehaviors } = transformRowsForServerImport([
        { '__relationLabel:carrier': 'Example Carrier' },
      ]);

      const carrierBehavior = relationBehaviors.find(
        (relationBehavior) => relationBehavior.relationFieldName === 'carrier',
      );

      expect(carrierBehavior).toBeDefined();
      expect(carrierBehavior?.behavior).toBe('LOOKUP_ASSIGN');
      expect(carrierBehavior?.onNotFound).toBe('ERROR');
    });

    it('should detect SMART_UPDATE when pre-normalized connect fields present', () => {
      const { relationBehaviors } = transformRowsForServerImport([
        {
          'update:primaryPhoneNumber-phones (lead)': '5550100101',
          'update:dateOfBirth (lead)': '1985-01-01',
        },
      ]);

      const leadBehavior = relationBehaviors.find(
        (relationBehavior) => relationBehavior.relationFieldName === 'lead',
      );

      expect(leadBehavior?.behavior).toBe('SMART_UPDATE');
    });

    it('should detect multiple relation behaviors from a full row', () => {
      const { relationBehaviors } = transformRowsForServerImport([
        SAMPLE_RAW_ROW,
      ]);

      const relationFieldNames = relationBehaviors.map(
        (relationBehavior) => relationBehavior.relationFieldName,
      );

      expect(relationFieldNames).toContain('lead');
      expect(relationFieldNames).toContain('agent');
      expect(relationFieldNames).toContain('carrier');
      expect(relationFieldNames).toContain('leadSource');
    });

    it('should use configured behaviors over auto-detected ones', () => {
      const { relationBehaviors } = transformRowsForServerImport(
        [{ 'update:npn (agent)': '12345' }],
        [
          {
            relationFieldName: 'agent',
            behavior: 'SKIP',
            onNotFound: 'ERROR',
          },
        ],
      );

      const agentBehavior = relationBehaviors.find(
        (relationBehavior) => relationBehavior.relationFieldName === 'agent',
      );

      expect(agentBehavior?.behavior).toBe('SKIP');
    });

    it('should keep configured behaviors for relations without data', () => {
      const { relationBehaviors } = transformRowsForServerImport(
        [{ name: 'Test' }],
        [
          {
            relationFieldName: 'carrier',
            behavior: 'LOOKUP_ASSIGN',
            onNotFound: 'ERROR',
          },
        ],
      );

      expect(relationBehaviors).toEqual([
        {
          relationFieldName: 'carrier',
          behavior: 'LOOKUP_ASSIGN',
          onNotFound: 'ERROR',
        },
      ]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty rows', () => {
      const { transformedRows, relationBehaviors } =
        transformRowsForServerImport([{}]);

      expect(transformedRows).toHaveLength(1);
      expect(transformedRows[0]).toEqual({});
      expect(relationBehaviors).toHaveLength(0);
    });

    it('should handle rows with only direct fields', () => {
      const { transformedRows, relationBehaviors } =
        transformRowsForServerImport([
          { id: 'abc', name: 'Test', status: 'SUBMITTED' },
        ]);

      expect(transformedRows[0]).toEqual({
        id: 'abc',
        name: 'Test',
        status: 'SUBMITTED',
      });
      expect(relationBehaviors).toHaveLength(0);
    });

    it('should handle multiple rows consistently', () => {
      const { transformedRows } = transformRowsForServerImport([
        { 'update:dateOfBirth (lead)': '1985-01-01', id: 'a' },
        { 'update:dateOfBirth (lead)': '1990-01-01', id: 'b' },
        { 'update:dateOfBirth (lead)': '', id: 'c' },
      ]);

      expect(transformedRows).toHaveLength(3);
      expect(transformedRows[0]['lead.dateOfBirth']).toBe('1985-01-01');
      expect(transformedRows[1]['lead.dateOfBirth']).toBe('1990-01-01');
      expect(transformedRows[2]['lead.dateOfBirth']).toBe('');
    });
  });
});
