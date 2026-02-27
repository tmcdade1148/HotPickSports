/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

// ---------------------------------------------------------------------------
// Mocks — native modules & libraries that don't run in the Jest environment
// ---------------------------------------------------------------------------

// Navigation
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({children}: {children: React.ReactNode}) => children,
  useNavigation: () => ({navigate: jest.fn()}),
  useRoute: () => ({params: {}}),
}));
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({children}: {children: React.ReactNode}) => children,
    Screen: () => null,
  }),
}));
jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({children}: {children: React.ReactNode}) => children,
    Screen: () => null,
  }),
}));

// AsyncStorage — in-memory mock
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

// Supabase — return inert client to avoid network calls
jest.mock('@shared/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({data: {session: null}}),
      onAuthStateChange: jest.fn(() => ({
        data: {subscription: {unsubscribe: jest.fn()}},
      })),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({data: [], error: null}),
    })),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
    })),
    removeChannel: jest.fn(),
  },
}));

// Lucide icons — simple text stubs (must use require inside factory)
jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const R = require('react');
  const icon = (name: string) => {
    const Icon = (props: Record<string, unknown>) =>
      R.createElement(RN.Text, props, name);
    Icon.displayName = name;
    return Icon;
  };
  return {
    CheckCircle: icon('CheckCircle'),
    Grid3x3: icon('Grid3x3'),
    BarChart2: icon('BarChart2'),
    MessageCircle: icon('MessageCircle'),
    ChevronDown: icon('ChevronDown'),
    User: icon('User'),
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
