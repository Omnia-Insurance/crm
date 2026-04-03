import { transformRowsForServerImport } from '../transformRowsForServerImport';

/**
 * Tests based on the actual policies.csv export format:
 *
 * Headers:
 * Id, Name, Agent / Name, Agent / NPN, Agent / Status,
 * Lead / Name / First Name, Lead / Name / Last Name,
 * Lead / Date of Birth, Lead / Gender, Lead / Lead Source,
 * Lead / Phones / Primary Phone Number, Lead / Phones / Primary Phone Country Code,
 * Lead / Phones / Primary Phone Calling Code, Lead / Phones / Additional Phones,
 * Lead / Emails / Primary Email, Lead / Emails / Additional Emails,
 * Lead / Address / Address 1, Lead / Address / Address 2,
 * Lead / Address / City, Lead / Address / State,
 * Lead / Address / Country, Lead / Address / Post Code,
 * Lead / Address / Latitude, Lead / Address / Longitude,
 * Lead / Family Members, Policy Number, Application ID, Status,
 * Submitted Date, Effective Date, Expiration Date,
 * Carrier, Product / Name, Product / Product Type,
 * Premium / Amount, Premium / Currency, Applicant Count, Old CRM Policy ID
 */

// Simulates a row after buildRecordFromImportedStructuredRow + raw keys
// The update: keys come from the raw structured row (not the built record)
const SAMPLE_RAW_ROW: Record<string, unknown> = {
  // Direct fields (from buildRecordFromImportedStructuredRow)
  id: 'ef3db3f7-ad98-4a3e-8dc7-98c754780221',
  name: 'Ambetter - ACA - Bronze',
  policyNumber: '7909057374',
  status: 'SUBMITTED',

  // Relation update keys (from raw structured row, frontend format)
  'update:firstName-name (lead)': 'ciera',
  'update:lastName-name (lead)': 'mays',
  'update:dateOfBirth (lead)': '',
  'update:gender (lead)': '',
  'update:primaryPhoneNumber-phones (lead)': '9412935341',
  'update:primaryPhoneCountryCode-phones (lead)': 'US',
  'update:primaryPhoneCallingCode-phones (lead)': '+1',
  'update:additionalPhones-phones (lead)': '[]',
  'update:primaryEmail-emails (lead)': 'mayscutco@gmail.com',
  'update:additionalEmails-emails (lead)': '[]',
  'update:addressStreet1-addressCustom (lead)': '1013 7TH ST W',
  'update:addressStreet2-addressCustom (lead)': '',
  'update:addressCity-addressCustom (lead)': 'bradenton',
  'update:addressState-addressCustom (lead)': 'FL',
  'update:addressCountry-addressCustom (lead)': 'UnitedStates',
  'update:addressPostcode-addressCustom (lead)': '34205',

  // Agent relation update keys (should be detected)
  'update:npn (agent)': '14516709',
  'update:status (agent)': 'ACTIVE',

  // Relation labels
  '__relationLabel:carrier': 'Ambetter',
  '__relationLabel:leadSource': 'Slate U65 Leads',
};

describe('transformRowsForServerImport', () => {
  describe('key transformation', () => {
    it('should convert scalar update keys to dot notation', () => {
      const { transformedRows } = transformRowsForServerImport([
        { 'update:dateOfBirth (lead)': '1984-01-31' },
      ]);

      expect(transformedRows[0]).toHaveProperty(['lead.dateOfBirth'], '1984-01-31');
      expect(transformedRows[0]).not.toHaveProperty('update:dateOfBirth (lead)');
    });

    it('should convert composite update keys to dot notation', () => {
      const { transformedRows } = transformRowsForServerImport([
        { 'update:primaryPhoneNumber-phones (lead)': '9412935341' },
      ]);

      expect(transformedRows[0]).toHaveProperty(
        ['lead.phones.primaryPhoneNumber'],
        '9412935341',
      );
    });

    it('should convert FULL_NAME composite keys to dot notation', () => {
      const { transformedRows } = transformRowsForServerImport([
        {
          'update:firstName-name (lead)': 'John',
          'update:lastName-name (lead)': 'Doe',
        },
      ]);

      expect(transformedRows[0]).toHaveProperty(['lead.name.firstName'], 'John');
      expect(transformedRows[0]).toHaveProperty(['lead.name.lastName'], 'Doe');
    });

    it('should convert address composite keys to dot notation', () => {
      const { transformedRows } = transformRowsForServerImport([
        {
          'update:addressCity-addressCustom (lead)': 'bradenton',
          'update:addressState-addressCustom (lead)': 'FL',
        },
      ]);

      expect(transformedRows[0]).toHaveProperty(
        ['lead.addressCustom.addressCity'],
        'bradenton',
      );
      expect(transformedRows[0]).toHaveProperty(
        ['lead.addressCustom.addressState'],
        'FL',
      );
    });

    it('should convert relation label keys to plain names', () => {
      const { transformedRows } = transformRowsForServerImport([
        { '__relationLabel:carrier': 'Ambetter' },
      ]);

      expect(transformedRows[0]).toHaveProperty('carrier', 'Ambetter');
      expect(transformedRows[0]).not.toHaveProperty('__relationLabel:carrier');
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
      const { transformedRows } = transformRowsForServerImport([SAMPLE_RAW_ROW]);

      const row = transformedRows[0];

      // Direct fields preserved
      expect(row.id).toBe('ef3db3f7-ad98-4a3e-8dc7-98c754780221');
      expect(row.name).toBe('Ambetter - ACA - Bronze');
      expect(row.policyNumber).toBe('7909057374');
      expect(row.status).toBe('SUBMITTED');

      // Lead sub-fields converted to dot notation
      expect(row['lead.name.firstName']).toBe('ciera');
      expect(row['lead.name.lastName']).toBe('mays');
      expect(row['lead.phones.primaryPhoneNumber']).toBe('9412935341');
      expect(row['lead.phones.primaryPhoneCountryCode']).toBe('US');
      expect(row['lead.emails.primaryEmail']).toBe('mayscutco@gmail.com');
      expect(row['lead.addressCustom.addressStreet1']).toBe('1013 7TH ST W');
      expect(row['lead.addressCustom.addressCity']).toBe('bradenton');
      expect(row['lead.addressCustom.addressState']).toBe('FL');

      // Agent sub-fields converted
      expect(row['agent.npn']).toBe('14516709');
      expect(row['agent.status']).toBe('ACTIVE');

      // Relation labels converted
      expect(row['carrier']).toBe('Ambetter');
      expect(row['leadSource']).toBe('Slate U65 Leads');

      // No update: or __relationLabel: keys remain
      const keys = Object.keys(row);

      expect(keys.every((k) => !k.startsWith('update:'))).toBe(true);
      expect(keys.every((k) => !k.startsWith('__relationLabel:'))).toBe(true);
    });
  });

  describe('relation behavior auto-detection', () => {
    it('should detect SMART_UPDATE for relations with sub-fields', () => {
      const { relationBehaviors } = transformRowsForServerImport([
        {
          'update:dateOfBirth (lead)': '1990-01-01',
          'update:primaryPhoneNumber-phones (lead)': '5551234567',
        },
      ]);

      const leadBehavior = relationBehaviors.find(
        (rb) => rb.relationFieldName === 'lead',
      );

      expect(leadBehavior).toBeDefined();
      expect(leadBehavior?.behavior).toBe('SMART_UPDATE');
      expect(leadBehavior?.onNotFound).toBe('CREATE');
    });

    it('should detect LOOKUP_ASSIGN for relations with only labels', () => {
      const { relationBehaviors } = transformRowsForServerImport([
        { '__relationLabel:carrier': 'Ambetter' },
      ]);

      const carrierBehavior = relationBehaviors.find(
        (rb) => rb.relationFieldName === 'carrier',
      );

      expect(carrierBehavior).toBeDefined();
      expect(carrierBehavior?.behavior).toBe('LOOKUP_ASSIGN');
      expect(carrierBehavior?.onNotFound).toBe('ERROR');
    });

    it('should detect multiple relation behaviors from a full row', () => {
      const { relationBehaviors } = transformRowsForServerImport([
        SAMPLE_RAW_ROW,
      ]);

      const names = relationBehaviors.map((rb) => rb.relationFieldName);

      expect(names).toContain('lead');
      expect(names).toContain('agent');
      expect(names).toContain('carrier');
      expect(names).toContain('leadSource');
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
        (rb) => rb.relationFieldName === 'agent',
      );

      expect(agentBehavior?.behavior).toBe('SKIP');
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
        { 'update:dateOfBirth (lead)': '1990-01-01', id: 'a' },
        { 'update:dateOfBirth (lead)': '1985-06-15', id: 'b' },
        { 'update:dateOfBirth (lead)': '', id: 'c' },
      ]);

      expect(transformedRows).toHaveLength(3);
      expect(transformedRows[0]['lead.dateOfBirth']).toBe('1990-01-01');
      expect(transformedRows[1]['lead.dateOfBirth']).toBe('1985-06-15');
      expect(transformedRows[2]['lead.dateOfBirth']).toBe('');
    });
  });
});
