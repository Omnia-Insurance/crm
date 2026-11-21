import {
  scoreRecordMatch,
  extractMatchDataFromRecord,
  isSamePerson,
  AUTO_MATCH_THRESHOLD,
  DIFFERENT_PERSON_THRESHOLD,
  type RecordMatchData,
} from 'src/engine/core-modules/import-job/utils/score-record-match.util';

// Synthetic lead data only (example.com addresses, 555-01xx numbers), shaped like a lead export:
// FULL_NAME (name.firstName/name.lastName), PHONES, EMAILS and ADDRESS (addressCustom).

describe('scoreRecordMatch', () => {
  const existingLead: RecordMatchData = {
    firstName: 'jamie',
    lastName: 'sample',
    email: 'jamie.sample@example.com',
    phone: '2025550143',
    city: 'testville',
    state: 'TX',
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
        firstName: 'jamie',
        email: 'jamie.sample@example.com',
      };

      const { same, score } = isSamePerson(existingLead, csvData);

      expect(score).toBe(65);
      expect(same).toBe(true);
    });

    it('should match with name + phone (score=50, borderline)', () => {
      const csvData: RecordMatchData = {
        firstName: 'jamie',
        lastName: 'sample',
        phone: '2025550143',
      };

      const { same, score } = isSamePerson(existingLead, csvData);

      expect(score).toBe(50);
      // 50 < 55 threshold — NOT same person
      expect(same).toBe(false);
    });

    it('should match with name + phone + city (score=55, at threshold)', () => {
      const csvData: RecordMatchData = {
        firstName: 'jamie',
        lastName: 'sample',
        phone: '2025550143',
        city: 'testville',
      };

      const { same, score } = isSamePerson(existingLead, csvData);

      expect(score).toBe(55);
      expect(same).toBe(true);
    });

    it('should match with email only (score=50)', () => {
      const csvData: RecordMatchData = {
        email: 'jamie.sample@example.com',
      };

      const { same, score } = isSamePerson(existingLead, csvData);

      expect(score).toBe(50);
      expect(same).toBe(false);
    });
  });

  describe('different person detection (below threshold)', () => {
    it('should NOT match with only name (score=30)', () => {
      const csvData: RecordMatchData = {
        firstName: 'jamie',
        lastName: 'sample',
      };

      const { same, score } = isSamePerson(existingLead, csvData);

      expect(score).toBe(30);
      expect(same).toBe(false);
    });

    it('should NOT match with completely different data (score=0)', () => {
      const csvData: RecordMatchData = {
        firstName: 'Robin',
        lastName: 'Doe',
        email: 'robin@example.org',
        phone: '3125550178',
        city: 'New Town',
        state: 'OH',
      };

      const { same, score } = isSamePerson(existingLead, csvData);

      expect(score).toBe(0);
      expect(same).toBe(false);
    });

    it('should NOT match two Alex Does in different cities (score=35)', () => {
      const firstAlexDoe: RecordMatchData = {
        firstName: 'Alex',
        lastName: 'Doe',
        email: 'alex1@example.com',
        phone: '2025550161',
        city: 'testville',
        state: 'TX',
      };

      const secondAlexDoe: RecordMatchData = {
        firstName: 'Alex',
        lastName: 'Doe',
        email: 'alex2@example.com',
        phone: '2025550162',
        city: 'Othertown',
        state: 'TX',
      };

      const { same, score } = isSamePerson(firstAlexDoe, secondAlexDoe);

      // Name matches (30) + state (5) = 35, below threshold
      expect(score).toBe(35);
      expect(same).toBe(false);
    });
  });

  describe('fuzzy name matching', () => {
    it('should fuzzy match names with first 3 chars matching', () => {
      const csvData: RecordMatchData = {
        firstName: 'jamey', // a different spelling whose first 3 chars "jam" match
        lastName: 'sample',
        email: 'jamie.sample@example.com',
      };

      const result = scoreRecordMatch(existingLead, csvData);

      // firstName fuzzy=10, lastName exact=15, email=50
      expect(result.breakdown.firstName).toBe(10);
      expect(result.breakdown.lastName).toBe(15);
      expect(result.score).toBe(75);
    });

    it('should NOT fuzzy match when first 3 chars differ', () => {
      const csvData: RecordMatchData = {
        firstName: 'jaime', // first 3 "jai" vs "jam" — no match
        lastName: 'sample',
      };

      const result = scoreRecordMatch(existingLead, csvData);

      expect(result.breakdown.firstName).toBeUndefined();
      expect(result.breakdown.lastName).toBe(15);
    });
  });

  describe('phone normalization', () => {
    it('should match phones regardless of formatting', () => {
      const result = scoreRecordMatch(
        { phone: '2025550143' },
        { phone: '(202) 555-0143' },
      );

      expect(result.breakdown.phone).toBe(20);
    });

    it('should strip leading 1 from 11-digit numbers', () => {
      const result = scoreRecordMatch(
        { phone: '2025550143' },
        { phone: '12025550143' },
      );

      expect(result.breakdown.phone).toBe(20);
    });
  });

  describe('case insensitivity', () => {
    it('should match emails case-insensitively', () => {
      const result = scoreRecordMatch(
        { email: 'Jamie.Sample@Example.COM' },
        { email: 'jamie.sample@example.com' },
      );

      expect(result.breakdown.email).toBe(50);
    });

    it('should match names case-insensitively', () => {
      const result = scoreRecordMatch(
        { firstName: 'JAMIE', lastName: 'SAMPLE' },
        { firstName: 'jamie', lastName: 'sample' },
      );

      expect(result.breakdown.firstName).toBe(15);
      expect(result.breakdown.lastName).toBe(15);
    });

    it('should match cities case-insensitively', () => {
      const result = scoreRecordMatch(
        { city: 'Testville' },
        { city: 'TESTVILLE' },
      );

      expect(result.breakdown.city).toBe(5);
    });
  });
});

describe('extractMatchDataFromRecord', () => {
  it('should extract from a record with composite name object', () => {
    const record = {
      name: { firstName: 'Robin', lastName: 'Roe' },
      phones: { primaryPhoneNumber: '3125550178' },
      emails: { primaryEmail: 'robin@example.org' },
      addressCustom: { addressCity: 'Othertown', addressState: 'TX' },
    };

    const data = extractMatchDataFromRecord(record);

    expect(data.firstName).toBe('Robin');
    expect(data.lastName).toBe('Roe');
    expect(data.phone).toBe('3125550178');
    expect(data.email).toBe('robin@example.org');
    expect(data.city).toBe('Othertown');
    expect(data.state).toBe('TX');
  });

  it('should extract from a record with flat DB columns', () => {
    const record = {
      nameFirstName: 'jamie',
      nameLastName: 'sample',
      phonesPrimaryPhoneNumber: '2025550143',
      emailsPrimaryEmail: 'jamie.sample@example.com',
      addressCustomAddressCity: 'testville',
      addressCustomAddressState: 'TX',
    };

    const data = extractMatchDataFromRecord(record);

    expect(data.firstName).toBe('jamie');
    expect(data.lastName).toBe('sample');
    expect(data.phone).toBe('2025550143');
    expect(data.email).toBe('jamie.sample@example.com');
    expect(data.city).toBe('testville');
    expect(data.state).toBe('TX');
  });

  it('should extract from a record with simple string name', () => {
    const record = {
      name: 'Sample Q10 Plan',
    };

    const data = extractMatchDataFromRecord(record);

    expect(data.firstName).toBe('Sample');
    expect(data.lastName).toBe('Q10 Plan');
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
