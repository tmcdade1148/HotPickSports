/**
 * SmackTalk configuration — reaction validation and display config.
 *
 * Server-side enforcement lives in the validate_reaction() Postgres trigger.
 * This config is the client-side guard and display source of truth.
 * To add a new reaction type: update both this file AND the trigger function.
 */
export const SMACK_REACTIONS = {
  /** Allowed emoji reactions — must match the Postgres trigger array exactly */
  allowed: ['\u{1F44D}', '\u{1F44E}', '\u{2764}\u{FE0F}', '\u{1F602}', '\u{1F62E}', '\u{1F622}'] as const,

  /** Maximum distinct reaction types on a single message */
  maxTypesPerMessage: 8,

  /** Maximum reaction types in the system (ceiling for future expansion) */
  maxTotalTypes: 8,
};

/** Type-safe reaction emoji literal */
export type SmackReaction = (typeof SMACK_REACTIONS.allowed)[number];
