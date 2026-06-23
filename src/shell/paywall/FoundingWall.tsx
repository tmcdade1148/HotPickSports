import React from 'react';
import {Text} from '@shared/components/AppText';
import {Modal, View, TouchableOpacity, StyleSheet} from 'react-native';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';
import {LEXICON} from '@shared/lexicon';
import {usePaywallConfig} from './usePaywallConfig';

/**
 * FoundingWall — the facade paywall (spec §6a / §6b).
 *
 * Shown when the server returns a `show_wall` flag after the organizer crosses a
 * cap. It displays the REAL paid-tier prices (read from config, never hardcoded)
 * to prime the expectation that paid is coming — then passes the organizer
 * through free. No payment is taken this season.
 *
 * The client only DISPLAYS here: the server already decided to allow the action.
 * All prices/caps come from `usePaywallConfig`; if config is unavailable the wall
 * renders nothing (the action still succeeded server-side).
 */
export interface FoundingWallProps {
  visible: boolean;
  onClose: () => void;
  /** Which cap was crossed — drives the headline + tier marker. */
  trigger: 'member_cap' | 'pool_cap';
  /** Contest name, woven into the member-cap headline. */
  contestName?: string;
  /** True if this organizer redeemed a founding code (cohort top line, §6a). */
  isFoundingGaffer?: boolean;
}

export function FoundingWall({
  visible,
  onClose,
  trigger,
  contestName,
  isFoundingGaffer,
}: FoundingWallProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const {config} = usePaywallConfig();

  // No config → nothing to display. The server already allowed the action.
  if (!config) return null;

  const {freeTierMaxMembers, smallMaxMembers, mediumMaxMembers, prices} = config;
  const Players = LEXICON.player.plural;
  const Contest = LEXICON.contest.singular;
  const contestLabel = contestName ?? `your ${Contest}`;

  const tiers = [
    {price: null, label: `up to ${freeTierMaxMembers} ${Players}`, here: trigger === 'member_cap'},
    {price: prices.small, label: `up to ${smallMaxMembers} ${Players}`, here: false},
    {price: prices.medium, label: `up to ${mediumMaxMembers} ${Players}`, here: false},
    {price: prices.large, label: `${mediumMaxMembers + 1}+ ${Players}`, here: false},
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {isFoundingGaffer && (
            <Text style={styles.cohortLine}>
              Founding {LEXICON.gaffer.short} — you're set.
            </Text>
          )}

          {trigger === 'member_cap' ? (
            <>
              <Text style={styles.title}>Look at you go.</Text>
              <Text style={styles.subtitle}>
                That's {freeTierMaxMembers} {Players} in {contestLabel}.{' '}
                {LEXICON.contest.plural} this size move to a paid tier — here's the
                lay of the land:
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>Running a second {Contest}?</Text>
              <Text style={styles.subtitle}>
                Extra {LEXICON.contest.plural} are a paid tier — ${prices.small} and
                up. But not this season.
              </Text>
            </>
          )}

          <View style={styles.tierList}>
            {tiers.map((t, i) => (
              <View key={i} style={[styles.tierRow, t.here && styles.tierRowHere]}>
                <Text style={styles.tierPrice}>
                  {t.price == null ? 'Free' : `$${t.price}`}
                </Text>
                <Text style={styles.tierLabel}>{t.label}</Text>
                {t.here && <Text style={styles.tierHere}>you're here</Text>}
              </View>
            ))}
          </View>

          <Text style={styles.founding}>
            But you got in early — your founding season is on us, every tier, all
            the way through the Super Bowl. Keep building.
          </Text>

          <TouchableOpacity style={styles.cta} onPress={onClose}>
            <Text style={styles.ctaText}>
              {trigger === 'member_cap' ? 'Keep going →' : `Start the ${Contest} →`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  cohortLine: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  tierList: {
    marginBottom: spacing.md,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  tierRowHere: {
    backgroundColor: colors.surface,
  },
  tierPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    width: 56,
  },
  tierLabel: {
    fontSize: 15,
    color: colors.textPrimary,
    flex: 1,
  },
  tierHere: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  founding: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  cta: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  ctaText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
