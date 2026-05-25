// __tests__/home/partnerIndicatorClearing.test.ts
// Spec §8 — verification gate test #4 of 4: partner broadcast indicator clearing.
//
// Verifies: calling markPartnerNotificationsRead optimistically zeroes
// the partnerIndicators[partnerId].unread count in globalStore, so the
// Home indicator disappears as soon as the user enters PartnerRosterScreen.
//
// Pure store test — no rendering. Mocks the supabase client so the upsert
// call returns success.

const mockUpsert = jest.fn().mockResolvedValue({error: null});

jest.mock('@shared/config/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({upsert: mockUpsert})),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

// Stub stores that globalStore touches transitively (not under test here).
jest.mock('@sports/nfl/stores/nflStore', () => ({useNFLStore: jest.fn()}));
jest.mock('@templates/season/stores/seasonStore', () => ({useSeasonStore: jest.fn()}));
jest.mock('@templates/series/stores/seriesStore', () => ({useSeriesStore: jest.fn()}));

let useGlobalStore: typeof import('@shell/stores/globalStore').useGlobalStore;
beforeAll(() => {
  useGlobalStore = require('@shell/stores/globalStore').useGlobalStore;
});

beforeEach(() => {
  mockUpsert.mockClear();
  // Reset relevant slice state.
  useGlobalStore.setState({
    partnerIndicators: {
      'partner-1': {unread: 7, mostRecentAt: '2026-05-13T10:00:00Z'},
      'partner-2': {unread: 2, mostRecentAt: '2026-05-13T11:00:00Z'},
    },
  });
});

describe('markPartnerNotificationsRead optimistically clears indicator', () => {
  test('zeroes unread for the target partner and keeps mostRecentAt', async () => {
    const {markPartnerNotificationsRead} = useGlobalStore.getState();

    await markPartnerNotificationsRead('user-xyz', 'partner-1');

    const after = useGlobalStore.getState().partnerIndicators;
    expect(after['partner-1']).toEqual({
      unread: 0,
      mostRecentAt: '2026-05-13T10:00:00Z',
    });
  });

  test('does not touch other partners', async () => {
    const {markPartnerNotificationsRead} = useGlobalStore.getState();

    await markPartnerNotificationsRead('user-xyz', 'partner-1');

    const after = useGlobalStore.getState().partnerIndicators;
    expect(after['partner-2']).toEqual({
      unread: 2,
      mostRecentAt: '2026-05-13T11:00:00Z',
    });
  });

  test('upserts partner_notification_read_state for the (user, partner) pair', async () => {
    const {markPartnerNotificationsRead} = useGlobalStore.getState();

    await markPartnerNotificationsRead('user-xyz', 'partner-1');

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const [payload, options] = mockUpsert.mock.calls[0];
    expect(payload).toEqual(
      expect.objectContaining({
        user_id:    'user-xyz',
        partner_id: 'partner-1',
        // last_read_at is a generated ISO timestamp; we just verify it's a string.
        last_read_at: expect.any(String),
      }),
    );
    expect(options).toEqual({onConflict: 'user_id,partner_id'});
  });

  test('handles a partner_id we have no prior indicator for (no crash)', async () => {
    const {markPartnerNotificationsRead} = useGlobalStore.getState();

    // partner-new wasn't in our seed state
    await markPartnerNotificationsRead('user-xyz', 'partner-new');

    const after = useGlobalStore.getState().partnerIndicators;
    expect(after['partner-new']).toEqual({
      unread: 0,
      mostRecentAt: null,
    });
  });
});
