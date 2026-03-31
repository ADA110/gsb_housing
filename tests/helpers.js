// Shared test helpers

// Returns mock sql calls for an authenticated request:
//   1st call: ipRateLimit INSERT → [{ count: 1 }]
//   2nd call: sessions SELECT   → [{ email }]
export function mockAuth(sql, email = 'test@stanford.edu') {
  sql.mockResolvedValueOnce([{ count: 1 }]);
  sql.mockResolvedValueOnce([{ email, expires_at: Date.now() + 9999999 }]);
}

// A minimal DB row representing a search post
export const searchRow = {
  id: 'p123',
  type: 'search',
  name: 'Alice',
  email: 'alice@stanford.edu',
  phone: '555-1234',
  class_year: '2026',
  city: 'San Francisco',
  move_in: '2025-06-01',
  move_out: '2025-08-31',
  lifestyle: ['Quiet', 'Early riser'],
  created_at: 1700000000000,
  neighborhoods: 'Mission, SOMA',
  budget_max: 2500,
  gender_pref: 'No preference',
  furnished: 'Either',
  beds: ['2', '3'],
  baths: ['1', '2'],
  bath_privacy: 'Shared bath OK',
  note: 'Looking for a quiet place',
};

// A minimal DB row representing a sublet post
export const subletRow = {
  id: 'p456',
  type: 'sublet',
  name: 'Bob',
  email: 'bob@stanford.edu',
  phone: '',
  class_year: '2027',
  city: 'New York',
  move_in: '2025-07-01',
  move_out: '2025-09-30',
  lifestyle: [],
  created_at: 1700000001000,
  address: '123 Main St',
  price: 3000,
  beds_avail: 1,
  beds: '2',
  baths: '1',
  bath_privacy: 'Private bath',
  furnished: 'Furnished',
  description: 'Nice apartment',
};
