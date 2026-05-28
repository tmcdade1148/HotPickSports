// __tests__/home/PartnerModule.test.tsx
// Spec §8 — verification gate test #3 of 4: Partner module tap routing.
//
// Verifies: tap (anywhere on the card) → navigate('PartnerRoster', {slug}).

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

// Find every node with an onPress handler — more robust than findAllByType(Pressable)
// (RN preset may stub Pressable to a different reference).
function findPressables(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll(
    n => n.props != null && typeof (n.props as {onPress?: unknown}).onPress === 'function',
  );
}

const mockNavigate = jest.fn();

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
    },
    isDark: true,
  }),
}));

const mockStoreState = {
  partnersById: {} as Record<string, {
    id: string;
    name: string;
    slug: string;
    perk_text: string;
    perk_icon: string | null;
    logo_url: string | null;
    primary_color: string | null;
  }>,
  partnerIndicators: {} as Record<string, {unread: number; mostRecentAt: string | null}>,
};

jest.mock('@shell/stores/globalStore', () => ({
  useGlobalStore: (selector: (s: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

let PartnerModule: typeof import('@shell/components/home/PartnerModule').PartnerModule;
beforeAll(() => {
  PartnerModule = require('@shell/components/home/PartnerModule').PartnerModule;
});

beforeEach(() => {
  mockNavigate.mockClear();
  mockStoreState.partnersById = {};
  mockStoreState.partnerIndicators = {};
});

const mesquiteId = 'partner-mesq';
const mesquite = {
  id: mesquiteId,
  name: 'Mesquite Bar & Grill',
  slug: 'mesque',
  perk_text: '$1 off any draft, Sundays.',
  perk_icon: '🍺',
  logo_url: null,
  primary_color: '#7A2E2E',
};

const alignedPool = {
  id: 'pool-1',
  name: "Mesquite Sunday Pool",
  name_display: null,
  partner_id: mesquiteId,
} as any;

describe('PartnerModule tap routing (spec §6.4.7)', () => {
  test('tap card body navigates to PartnerRoster with partner.slug', () => {
    mockStoreState.partnersById = {[mesquiteId]: mesquite};

    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <PartnerModule partnerId={mesquiteId} />,
      );
    });

    const pressables = findPressables(tree!.root);
    expect(pressables.length).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      pressables[0].props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('PartnerRoster', {slug: 'mesque'});
  });

  test('renders null when partner is not loaded yet', () => {
    // partnersById intentionally empty — race condition before
    // loadAlignedPartners has resolved.
    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <PartnerModule partnerId={mesquiteId} />,
      );
    });

    // No tree output → toJSON() returns null
    expect(tree!.toJSON()).toBeNull();
  });

  test('with unread indicator: the indicator is part of the same Pressable surface', () => {
    // Spec §6.4.7: "Tap card body or indicator badge → navigate to
    // PartnerRosterScreen". Unlike PoolModule, BOTH go to the same place,
    // so a single Pressable suffices.
    mockStoreState.partnersById      = {[mesquiteId]: mesquite};
    mockStoreState.partnerIndicators = {[mesquiteId]: {unread: 3, mostRecentAt: null}};

    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <PartnerModule partnerId={mesquiteId} />,
      );
    });

    const pressables = findPressables(tree!.root);
    // Exactly one outer Pressable — the indicator badge is decorative inside.
    expect(pressables).toHaveLength(1);

    ReactTestRenderer.act(() => {
      pressables[0].props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('PartnerRoster', {slug: 'mesque'});
  });
});
