/**
 * Internationalization — all user-facing strings in one place.
 * Localization-ready from day one per Blueprint.
 *
 * Usage: import { strings } from '@shared/i18n';
 * Then: <Text>{strings.auth.signIn}</Text>
 */

export const strings = {
  app: {
    name: 'HotPick Sports',
    tagline: 'Pick. Compete. Talk Smack.',
  },

  auth: {
    signIn: 'Sign In',
    signUp: 'Sign Up',
    signOut: 'Sign Out',
    email: 'Email',
    password: 'Password',
    fullName: 'Full Name',
    poolieName: 'Poolie Name',
    poolieNameHint: 'Your unique display name — this is how others see you',
    forgotPassword: 'Forgot Password?',
    noAccount: "Don't have an account?",
    hasAccount: 'Already have an account?',
    signingIn: 'Signing in...',
    signingUp: 'Creating account...',
  },

  pools: {
    createPool: 'Create Pool',
    joinPool: 'Join Pool',
    inviteCode: 'Invite Code',
    enterCode: 'Enter 6-character invite code',
    myPools: 'My Pools',
    members: 'Members',
    leavePool: 'Leave Pool',
    poolSettings: 'Pool Settings',
  },

  picks: {
    makePick: 'Make Your Pick',
    pickLocked: 'Pick Locked',
    picksSubmitted: 'Picks Submitted',
    noPicks: 'No picks yet',
    deadline: 'Deadline',
    correct: 'Correct',
    incorrect: 'Incorrect',
    pending: 'Pending',
  },

  leaderboard: {
    title: 'Leaderboard',
    rank: 'Rank',
    points: 'Points',
    streak: 'Streak',
    you: 'You',
  },

  smackTalk: {
    title: 'SmackTalk',
    placeholder: 'Talk smack...',
    send: 'Send',
  },

  sport: {
    switchSport: 'Switch Sport',
    activeNow: 'Active Now',
    comingSoon: 'Coming Soon',
    completed: 'Completed',
  },

  common: {
    loading: 'Loading...',
    error: 'Something went wrong',
    retry: 'Retry',
    cancel: 'Cancel',
    save: 'Save',
    done: 'Done',
    ok: 'OK',
    next: 'Next',
    back: 'Back',
  },
} as const;

export type Strings = typeof strings;
