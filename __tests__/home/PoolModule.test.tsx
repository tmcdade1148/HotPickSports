// __tests__/home/PoolModule.test.tsx
// Spec §8 — verification gate test #2 of 4: Pool module tap routing.
//
// Verifies:
//   • Tap body      → setActivePoolId(pool.id) + navigate('Leaders')
//   • Tap indicator → setActivePoolId(pool.id) + navigate('SmackTalk')
//
// Rendering uses React Test Renderer with mocked navigation and globalStore.
// The component itself reads ThemeColors and (optional) pool indicator
// data, which we stub to defaults.

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockNavigate = jest.fn();
const mockSetActivePoolId = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate}),
}));

jest.mock('@shell/theme/hooks', () => ({
  useTheme: () => ({
    colors: {
      primary: '#F66321',
      surface: '#1A1A1A',
      surfaceElevated: '#242424',
      border: '#2A2A2A',
      ink: '#303030',
      textPrimary: '#FFFFFF',
      textSecondary: '#B8B8B8',
      textTertiary: '#7A7A7A',
      // Added 2026-05-14 (Home redesign-v3): PoolModule now reads these
      // tokens for the unread badge tint, "New" megaphone, and the
      // win/loss/live delta colors.
      error: '#DC2626',
      win:   '#22C55E',
      loss:  '#DC2626',
      live:  '#22C55E',
    },
    isDark: true,
  }),
}));

// Mock globalStore selectors. The component calls useGlobalStore(s => s.xxx)
// so the mock factory returns a function that runs the selector against a
// canned state object.
const mockStoreState = {
  setActivePoolId: mockSetActivePoolId,
  smackUnreadCounts: {} as Record<string, number>,
  poolIndicators:   {} as Record<string, {orgUnread: number; mostRecentAt: string | null}>,
  userRankByPool:   {} as Record<string, {rank: number; memberCount: number; total: number}>,
  weekRankByPool:   {} as Record<string, {rank: number; memberCount: number; weekPoints: number}>,
  // Affiliations slice — keyed by poolId. Empty by default; the legacy
  // single-Club fallback path kicks in via pool.partner_id + brand_config.
  poolAffiliations: {} as Record<string, unknown[]>,
  partnersById:     {} as Record<string, unknown>,
  partnerIndicators: {} as Record<string, {unread: number; mostRecentAt: string | null}>,
};

jest.mock('@shell/stores/globalStore', () => ({
  useGlobalStore: (selector: (s: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

// ---------------------------------------------------------------------------
// Helpers — find every node with an onPress handler.
// More robust than findAllByType(Pressable) because the RN preset may
// stub Pressable differently than what the component file imports.
// ---------------------------------------------------------------------------
function findPressables(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll(
    n => n.props != null && typeof (n.props as {onPress?: unknown}).onPress === 'function',
  );
}

// Late import so the mocks are wired before the component file is evaluated
// (RN testing convention — see __tests__/App.test.tsx).
let PoolModule: typeof import('@shell/components/home/PoolModule').PoolModule;
beforeAll(() => {
  PoolModule = require('@shell/components/home/PoolModule').PoolModule;
});

beforeEach(() => {
  mockNavigate.mockClear();
  mockSetActivePoolId.mockClear();
  mockStoreState.smackUnreadCounts = {};
  mockStoreState.poolIndicators    = {};
  mockStoreState.userRankByPool    = {};
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const privatePool = {
  id: 'pool-abc',
  name: "Sonny's NFL",
  name_display: null,
  partner_id: null,
  brand_config: null,
  is_archived: false,
  competition: 'nfl_2026',
} as any;

const partnerPool = {
  id: 'pool-mesq',
  name: "Mesquite Pool",
  name_display: null,
  partner_id: 'partner-1',
  brand_config: {primary_color: '#7A2E2E', partner_name: 'Mesquite Bar'},
  is_archived: false,
  competition: 'nfl_2026',
} as any;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PoolModule tap routing (spec §6.4.6)', () => {
  test('tap card body navigates to Leaders + sets activePoolId', () => {
    mockStoreState.userRankByPool = {[privatePool.id]: {rank: 3, memberCount: 28, total: 132}};
    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<PoolModule pool={privatePool} />);
    });

    const pressables = findPressables(tree!.root);
    // First Pressable is the card body (outer wrapper).
    expect(pressables.length).toBeGreaterThan(0);
    const cardPress = pressables[0].props.onPress;

    ReactTestRenderer.act(() => {
      cardPress();
    });

    expect(mockSetActivePoolId).toHaveBeenCalledWith('pool-abc');
    expect(mockNavigate).toHaveBeenCalledWith('LeaderboardTab');
  });

  test('tap indicator navigates to SmackTalk + sets activePoolId', () => {
    mockStoreState.smackUnreadCounts = {[privatePool.id]: 4};
    mockStoreState.poolIndicators   = {[privatePool.id]: {orgUnread: 1, mostRecentAt: null}};
    mockStoreState.userRankByPool   = {[privatePool.id]: {rank: 1, memberCount: 12, total: 99}};

    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<PoolModule pool={privatePool} />);
    });

    const pressables = findPressables(tree!.root);
    // Pressable order (redesign-v5, per-Contest settings gear dropped):
    //   [0] card body
    //   [1] Chirps badge (was "SmackTalk")
    expect(pressables.length).toBeGreaterThanOrEqual(2);
    const smackPress = pressables.find(p => {
      const label = String(p.props.accessibilityLabel ?? '').toLowerCase();
      // Label vocabulary moved from "SmackTalk" to "Chirps" per lexicon spec.
      return label.includes('chirp') || label.includes('smacktalk');
    })?.props.onPress;
    expect(typeof smackPress).toBe('function');

    ReactTestRenderer.act(() => {
      smackPress();
    });

    expect(mockSetActivePoolId).toHaveBeenCalledWith('pool-abc');
    expect(mockNavigate).toHaveBeenCalledWith('SmackTalkTab');
  });

  test('partner-aligned pool: tap body still routes to Leaders + sets pool', () => {
    // Per the May 13 locked decision, partner pools are not ranked — but
    // the body tap still navigates to the Leaderboard for that pool (the
    // pool-scoped leaderboard renders pool-scoped scores; no ranking
    // happens across partners).
    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<PoolModule pool={partnerPool} />);
    });

    const pressables = findPressables(tree!.root);
    const cardPress = pressables[0].props.onPress;

    ReactTestRenderer.act(() => {
      cardPress();
    });

    expect(mockSetActivePoolId).toHaveBeenCalledWith('pool-mesq');
    expect(mockNavigate).toHaveBeenCalledWith('LeaderboardTab');
  });

  test('partner-aligned pool: no rank chip rendered (renders card + gear + Chirps + affiliation row + info pill)', () => {
    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<PoolModule pool={partnerPool} />);
    });
    // Redesign-v6: the broadcast indicator (Megaphone) became a
    // Pressable that routes to Message Center (was a plain View that
    // fell through to the card-level Leaderboard nav).
    // Four Pressables: card body, broadcast indicator, Chirps badge,
    // affiliated-Club name.
    expect(findPressables(tree!.root)).toHaveLength(4);
  });
});
