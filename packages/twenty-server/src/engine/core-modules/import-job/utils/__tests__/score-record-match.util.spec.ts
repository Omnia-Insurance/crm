import {
  scoreRecordMatch,
  extractMatchDataFromRecord,
  isSamePerson,
  AUTO_MATCH_THRESHOLD,
  DIFFERENT_PERSON_THRESHOLD,
  type RecordMatchData,
} from '../score-record-match.util';

/**
 * Tests based on real data from the policies.csv export.
 * Lead records have FULL_NAME (name.firstName/name.lastName),
 * PHONES (phones.primaryPhoneNumber), EMAILS (emails.primaryEmail),
 * and ADDRESS (addressCustom.addressCity/addressState).
 */

describe('scoreRecordMatch', () => {
  const existingLead: RecordMatchData = {
    firstName: 'ciera',
    lastName: 'mays',
    email: 'mayscutco@gmail.com',
    phone: '9412935341',
    city: 'bradenton',
    state: 'FL',
  };

  describe('exact match', () => {
    it('should score 110 for identical data', () => {
      const result = scoreRecordMatch(existingLead, { ...existingLead });

      expect(result.score).toBe(110);
      expect(result.breakdown.email).toBe(50);
      expect(result.breakdown.firstName).toBe(15);
      expect(result.breakdown.lastName).toBe(15);
      expect(result.breakdown.phone).toBe(20);
      expect(result.breakdown.city).toBe(5);
      expect(result.breakdown.state).toBe(5);
    });
  });

  describe('same person detection (above threshold)', () => {
    it('should match with just email + first name (score=65)', () => {
      const csvData: RecordMatchData = {
        firstName: 'ciera',
        email: 'mayscutco@gmail.com',
      };

      const { same, score } = isSamePerson(existingLead, csvData);

      expect(score).toBe(65);
      expect(same).toBe(true);
    });

    it('should match with name + phone (score=50, borderline)', () => {
      const csvData: RecordMatchData = {
        firstName: 'ciera',
        lastName: 'mays',
        phone: '9412935341',
      };

      const { same, score } = isSamePerson(existingLead, csvData);

      expect(score).toBe(50);
      // 50 < 55 threshold — NOT same person
      expect(same).toBe(false);
    });

    it('should match with name + phone + city (score=55, at threshold)', () => {
      const csvData: RecordMatchData = {
        firstName: 'ciera',
        lastName: 'mays',
        phone: '9412935341',
        city: 'bradenton',
      };

      const { same, score } = isSamePerson(existingLead, csvData);

      expect(score).toBe(55);
      expect(same).toBe(true);
    });

    it('should match with email only (score=50)', () => {
      const csvData: RecordMatchData = {
        email: 'mayscutco@gmail.com',
      };

      const { same, score } = isSamePerson(existingLead, csvData);

      expect(score).toBe(50);
      expect(same).toBe(false);
    });
  });

  describe('different person detection (below threshold)', () => {
    it('should NOT match with only name (score=30)', () => {
      const csvData: RecordMatchData = {
        firstName: 'ciera',
        lastName: 'mays',
      };

      const { same, score } = isSamePerson(existingLead, csvData);

      expect(score).toBe(30);
      expect(same).toBe(false);
    });

    it('should NOT match with completely different data (score=0)', () => {
      const csvData: RecordMatchData = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
        phone: '5551234567',
        city: 'New York',
        state: 'NY',
      };

      const { same, score } = isSamePerson(existingLead, csvData);

      expect(score).toBe(0);
      expect(same).toBe(false);
    });

    it('should NOT match two Michael Smiths in different cities (score=30)', () => {
      const michaelSmith1: RecordMatchData = {
        firstName: 'Michael',
        lastName: 'Smith',
        email: 'mike1@gmail.com',
        phone: '5551111111',
        city: 'bradenton',
        state: 'FL',
      };

      const michaelSmith2: RecordMatchData = {
        firstName: 'Michael',
        lastName: 'Smith',
        email: 'mike2@yahoo.com',
        phone: '5552222222',
        city: 'Tampa',
        state: 'FL',
      };

      const { same, score } = isSamePerson(michaelSmith1, michaelSmith2);

      // Name matches (30) + state (5) = 35, below threshold
      expect(score).toBe(35);
      expect(same).toBe(false);
    });
  });

  describe('fuzzy name matching', () => {
    it('should fuzzy match names with first 3 chars matching', () => {
      const csvData: RecordMatchData = {
        firstName: 'cierra', // extra 'r', first 3 chars "cie" match
        lastName: 'mays',
        email: 'mayscutco@gmail.com',
      };

      const result = scoreRecordMatch(existingLead, csvData);

      // firstName fuzzy=10, lastName exact=15, email=50
      expect(result.breakdown.firstName).toBe(10);
      expect(result.breakdown.lastName).toBe(15);
      expect(result.score).toBe(75);
    });

    it('should NOT fuzzy match when first 3 chars differ', () => {
      const csvData: RecordMatchData = {
        firstName: 'sierra', // first 3 "sie" vs "cie" — no match
        lastName: 'mays',
      };

      const result = scoreRecordMatch(existingLead, csvData);

      expect(result.breakdown.firstName).toBeUndefined();
      expect(result.breakdown.lastName).toBe(15);
    });
  });

  describe('phone normalization', () => {
    it('should match phones regardless of formatting', () => {
      const result = scoreRecordMatch(
        { phone: '9412935341' },
        { phone: '(941) 293-5341' },
      );

      expect(result.breakdown.phone).toBe(20);
    });

    it('should strip leading 1 from 11-digit numbers', () => {
      const result = scoreRecordMatch(
        { phone: '9412935341' },
        { phone: '19412935341' },
      );

      expect(result.breakdown.phone).toBe(20);
    });
  });

  describe('case insensitivity', () => {
    it('should match emails case-insensitively', () => {
      const result = scoreRecordMatch(
        { email: 'MaysCutco@Gmail.COM' },
        { email: 'mayscutco@gmail.com' },
      );

      expect(result.breakdown.email).toBe(50);
    });

    it('should match names case-insensitively', () => {
      const result = scoreRecordMatch(
        { firstName: 'CIERA', lastName: 'MAYS' },
        { firstName: 'ciera', lastName: 'mays' },
      );

      expect(result.breakdown.firstName).toBe(15);
      expect(result.breakdown.lastName).toBe(15);
    });

    it('should match cities case-insensitively', () => {
      const result = scoreRecordMatch(
        { city: 'Bradenton' },
        { city: 'BRADENTON' },
      );

      expect(result.breakdown.city).toBe(5);
    });
  });
});

describe('extractMatchDataFromRecord', () => {
  it('should extract from a record with composite name object', () => {
    const record = {
      name: { firstName: 'John', lastName: 'Doe' },
      phones: { primaryPhoneNumber: '5551234567' },
      emails: { primaryEmail: 'john@example.com' },
      addressCustom: { addressCity: 'Tampa', addressState: 'FL' },
    };

    const data = extractMatchDataFromRecord(record);

    expect(data.firstName).toBe('John');
    expect(data.lastName).toBe('Doe');
    expect(data.phone).toBe('5551234567');
    expect(data.email).toBe('john@example.com');
    expect(data.city).toBe('Tampa');
    expect(data.state).toBe('FL');
  });

  it('should extract from a record with flat DB columns', () => {
    const record = {
      nameFirstName: 'ciera',
      nameLastName: 'mays',
      phonesPrimaryPhoneNumber: '9412935341',
      emailsPrimaryEmail: 'mayscutco@gmail.com',
      addressCustomAddressCity: 'bradenton',
      addressCustomAddressState: 'FL',
    };

    const data = extractMatchDataFromRecord(record);

    expect(data.firstName).toBe('ciera');
    expect(data.lastName).toBe('mays');
    expect(data.phone).toBe('9412935341');
    expect(data.email).toBe('mayscutco@gmail.com');
    expect(data.city).toBe('bradenton');
    expect(data.state).toBe('FL');
  });

  it('should extract from a record with simple string name', () => {
    const record = {
      name: 'Slate U65 Leads',
    };

    const data = extractMatchDataFromRecord(record);

    expect(data.firstName).toBe('Slate');
    expect(data.lastName).toBe('U65 Leads');
  });

  it('should handle missing fields gracefully', () => {
    const data = extractMatchDataFromRecord({});

    expect(data.firstName).toBeUndefined();
    expect(data.lastName).toBeUndefined();
    expect(data.email).toBeUndefined();
    expect(data.phone).toBeUndefined();
  });
});

describe('thresholds', () => {
  it('should have AUTO_MATCH_THRESHOLD at 80', () => {
    expect(AUTO_MATCH_THRESHOLD).toBe(80);
  });

  it('should have DIFFERENT_PERSON_THRESHOLD at 55', () => {
    expect(DIFFERENT_PERSON_THRESHOLD).toBe(55);
  });

  it('should have AUTO > DIFFERENT thresholds', () => {
    expect(AUTO_MATCH_THRESHOLD).toBeGreaterThan(DIFFERENT_PERSON_THRESHOLD);
  });
});
