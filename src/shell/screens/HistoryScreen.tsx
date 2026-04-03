import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
// SafeAreaView handled by HistoryTabWrapper in MainTabNavigator
import {
  Trophy,
  Target,
  Flame,
  Shield,
  Zap,
  Award,
  Lock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react-native';
// EyeOff, Eye, Users, ChevronUp removed — visibility toggle removed
import {useGlobalStore} from '@shell/stores/globalStore';
import type {UserHardwareItem} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme';
import {spacing, borderRadius} from '@shared/theme';
import {useNFLStore} from '@sports/nfl/stores/nflStore';

// ---------------------------------------------------------------------------
// Hardware catalog — display info for all launch awards
// ---------------------------------------------------------------------------

const HARDWARE_CATALOG: Record<string, {
  icon: any;
  description: string;
  lockedHint: string;
}> = {
  sharpshooter_week: {
    icon: Target,
    description: 'Highest regular pick win rate in the pool that week.',
    lockedHint: 'Finish a week with the best regular pick accuracy in your pool (min 10 picks).',
  },
  gunslinger_week: {
    icon: Zap,
    description: 'Won a Rank 12+ HotPick — high risk, high reward.',
    lockedHint: 'Win a HotPick on a Rank 12 or higher game.',
  },
  contrarian_week: {
    icon: Shield,
    description: 'Went against the pool majority and still finished top 3.',
    lockedHint: 'Go against your pool on 8+ games, finish top 3, and win your HotPick.',
  },
  perfect_week: {
    icon: Award,
    description: '15/15 regular picks correct AND HotPick correct.',
    lockedHint: 'Get every single pick right in a week — including your HotPick.',
  },
  pool_champion: {
    icon: Trophy,
    description: '1st place in the final pool standings.',
    lockedHint: 'Finish the season in 1st place in any pool.',
  },
  podium_2nd: {
    icon: Trophy,
    description: '2nd place in the final pool standings.',
    lockedHint: 'Finish the season in 2nd place in any pool.',
  },
  podium_3rd: {
    icon: Trophy,
    description: '3rd place in the final pool standings.',
    lockedHint: 'Finish the season in 3rd place in any pool.',
  },
  biggest_comeback: {
    icon: Zap,
    description: 'Largest rank swing from worst week to final standing.',
    lockedHint: 'Make the biggest comeback in your pool from your worst week to the final standings.',
  },
  iron_poolie: {
    icon: Shield,
    description: 'Submitted picks every week of the season without missing one.',
    lockedHint: 'Submit picks every week of the season without missing one.',
  },
  season_sharpshooter: {
    icon: Target,
    description: 'Best regular pick win rate across the full season.',
    lockedHint: 'Have the highest regular pick accuracy across the full 18-week season (min 15 weeks).',
  },
  hotpick_artist: {
    icon: Flame,
    description: 'Best HotPick win rate across the full season.',
    lockedHint: 'Have the highest HotPick win rate across the full season (min 15 HotPicks).',
  },
  season_contrarian: {
    icon: Shield,
    description: 'Went against pool majority most often and finished above median.',
    lockedHint: 'Go against your pool the most often across the season and still finish above the median.',
  },
  season_tactician: {
    icon: Target,
    description: 'Played it smart with low-rank HotPicks for 12+ weeks and finished positive.',
    lockedHint: 'Choose Rank 1-6 HotPicks for 12+ weeks and finish the season with positive points.',
  },
};

// Weekly + season slugs only (no career at launch)
const LAUNCH_SLUGS = [
  'sharpshooter_week', 'gunslinger_week', 'contrarian_week', 'perfect_week',
  'pool_champion', 'podium_2nd', 'podium_3rd', 'biggest_comeback',
  'iron_poolie', 'season_sharpshooter', 'hotpick_artist', 'season_contrarian', 'season_tactician',
];

type FilterTab = 'all' | 'weekly' | 'season';

/** Format competition string for display: "nfl_2026" → "NFL 2026" */
function formatCompetition(comp: string): string {
  return comp
    .split('_')
    .map(part => {
      // If it's all digits, keep as-is; otherwise uppercase
      return /^\d+$/.test(part) ? part : part.toUpperCase();
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export function HistoryScreen() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const userHardware = useGlobalStore(s => s.userHardware);
  const playerArchetype = useGlobalStore(s => s.playerArchetype);
  const loadUserHardware = useGlobalStore(s => s.loadUserHardware);
  const userProfile = useGlobalStore(s => s.userProfile);

  const [filter, setFilter] = useState<FilterTab>('all');
  const [selectedHardware, setSelectedHardware] = useState<UserHardwareItem | null>(null);
  const [selectedLocked, setSelectedLocked] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hardwareExpanded, setHardwareExpanded] = useState(false);

  const competition = useNFLStore(s => s.competition);

  useEffect(() => {
    loadUserHardware().finally(() => setLoading(false));
  }, [loadUserHardware]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const earnedSlugs = new Set(userHardware.map(h => h.hardwareSlug));

  const filteredEarned = userHardware.filter(h => {
    if (filter === 'weekly') return h.category === 'weekly';
    if (filter === 'season') return h.category === 'season';
    return true;
  });

  const lockedSlugs = LAUNCH_SLUGS.filter(slug => {
    if (filter === 'weekly' && !['sharpshooter_week', 'gunslinger_week', 'contrarian_week', 'perfect_week'].includes(slug)) return false;
    if (filter === 'season' && ['sharpshooter_week', 'gunslinger_week', 'contrarian_week', 'perfect_week'].includes(slug)) return false;
    return !earnedSlugs.has(slug);
  });

  const hardwareCount = userHardware.length;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Player Archetype Block */}
        {playerArchetype && (
          <View style={styles.archetypeBlock}>
            <Text style={styles.archetypeLabel}>{playerArchetype.label}</Text>
            <Text style={styles.archetypeDescription}>{playerArchetype.description}</Text>
            {userProfile && (
              <View style={styles.careerStats}>
                <Text style={styles.careerStat}>
                  {(userProfile as any).career_picks_correct ?? 0}/{(userProfile as any).career_picks_total ?? 0} picks
                </Text>
                <Text style={styles.careerStatDivider}>{'\u2022'}</Text>
                <Text style={styles.careerStat}>
                  {(userProfile as any).career_hotpick_correct ?? 0}/{(userProfile as any).career_hotpick_total ?? 0} HotPicks
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Hardware Section — collapsible */}
        <TouchableOpacity
          style={styles.sectionHeader}
          activeOpacity={0.7}
          onPress={() => setHardwareExpanded(prev => !prev)}>
          <Text style={styles.sectionTitle}>Hardware</Text>
          <View style={styles.sectionHeaderRight}>
            {hardwareCount > 0 && (
              <Text style={styles.sectionBadge}>{hardwareCount}</Text>
            )}
            {hardwareExpanded ? (
              <ChevronDown size={20} color={colors.textSecondary} />
            ) : (
              <ChevronRight size={20} color={colors.textSecondary} />
            )}
          </View>
        </TouchableOpacity>

        {hardwareExpanded && (
          <View style={styles.collapsibleContent}>
            {/* Filter tabs */}
            <View style={styles.filterRow}>
              {(['all', 'weekly', 'season'] as FilterTab[]).map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.filterTab, filter === tab && styles.filterTabActive]}
                  onPress={() => setFilter(tab)}>
                  <Text style={[styles.filterTabText, filter === tab && styles.filterTabTextActive]}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Earned hardware */}
            {filteredEarned.length > 0 && (
              <View style={styles.hardwareGrid}>
                {filteredEarned.map(hw => {
                  const catalog = HARDWARE_CATALOG[hw.hardwareSlug];
                  const Icon = catalog?.icon ?? Award;
                  return (
                    <TouchableOpacity
                      key={hw.id}
                      style={styles.hardwareCard}
                      onPress={() => setSelectedHardware(hw)}>
                      <View style={[styles.hardwareIconCircle, {backgroundColor: colors.primary + '20'}]}>
                        <Icon size={24} color={colors.primary} />
                      </View>
                      <Text style={styles.hardwareName} numberOfLines={2}>{hw.hardwareName}</Text>
                      {hw.week && <Text style={styles.hardwareWeek}>Wk {hw.week}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Locked hardware silhouettes */}
            {lockedSlugs.length > 0 && (
              <View style={styles.hardwareGrid}>
                {lockedSlugs.map(slug => {
                  const catalog = HARDWARE_CATALOG[slug];
                  if (!catalog) return null;
                  const Icon = catalog.icon;
                  const name = slug.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  return (
                    <TouchableOpacity
                      key={slug}
                      style={[styles.hardwareCard, styles.hardwareCardLocked]}
                      onPress={() => setSelectedLocked(slug)}>
                      <View style={[styles.hardwareIconCircle, {backgroundColor: colors.border + '40'}]}>
                        <Icon size={24} color={colors.textSecondary} />
                        <View style={styles.lockOverlay}>
                          <Lock size={10} color={colors.textSecondary} />
                        </View>
                      </View>
                      <Text style={[styles.hardwareName, {color: colors.textSecondary}]} numberOfLines={2}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {filteredEarned.length === 0 && lockedSlugs.length === 0 && (
              <View style={styles.emptyState}>
                <Trophy size={40} color={colors.textSecondary} />
                <Text style={styles.emptyText}>Complete a week to start earning hardware.</Text>
              </View>
            )}
          </View>
        )}

        {/* Current Sports — active competition + coming soon teaser */}
        <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>My Sports</Text>

        <View style={styles.competitionsList}>
          {/* Active competition */}
          {competition && (
            <View style={styles.competitionCard}>
              <View style={styles.competitionInfo}>
                <Text style={styles.competitionName}>{formatCompetition(competition)}</Text>
                <Text style={styles.competitionStatus}>In Progress</Text>
              </View>
            </View>
          )}

          {/* Coming soon teaser */}
          <View style={[styles.competitionCard, styles.competitionCardTeaser]}>
            <View style={styles.competitionInfo}>
              <Text style={styles.competitionTeaser}>
                More sports coming soon
              </Text>
              <Text style={styles.competitionTeaserSub}>
                Browse your picks, results, and history across every sport and season — all in one place.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Earned Hardware Detail Modal */}
      <Modal visible={!!selectedHardware} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setSelectedHardware(null)}>
          <View style={styles.modalCard}>
            {selectedHardware && (
              <>
                <Text style={styles.modalTitle}>{selectedHardware.hardwareName}</Text>
                <Text style={styles.modalDescription}>
                  {formatNarrative(selectedHardware)}
                </Text>
                <Text style={styles.modalDate}>
                  Awarded {new Date(selectedHardware.awardedAt).toLocaleDateString()}
                </Text>
                <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedHardware(null)}>
                  <Text style={styles.modalCloseText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Locked Hardware Detail Modal */}
      <Modal visible={!!selectedLocked} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setSelectedLocked(null)}>
          <View style={styles.modalCard}>
            {selectedLocked && HARDWARE_CATALOG[selectedLocked] && (
              <>
                <Lock size={24} color={colors.textSecondary} />
                <Text style={styles.modalTitle}>
                  {selectedLocked.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Text>
                <Text style={styles.modalDescription}>
                  {HARDWARE_CATALOG[selectedLocked].lockedHint}
                </Text>
                <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedLocked(null)}>
                  <Text style={styles.modalCloseText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Narrative formatter — builds display text from context_json
// ---------------------------------------------------------------------------

function formatNarrative(hw: UserHardwareItem): string {
  const ctx = hw.contextJson;
  switch (hw.hardwareSlug) {
    case 'pool_champion':
    case 'podium_2nd':
    case 'podium_3rd': {
      const rank = ctx.final_rank ?? '';
      const pool = ctx.pool_name ?? '';
      const pts = ctx.final_points ?? '';
      const size = ctx.pool_size ?? '';
      const hpRecord = ctx.hotpick_record ?? '';
      return `${pool}, ${hw.competition.replace('_', ' ').toUpperCase()}. Finished #${rank} of ${size} with ${pts} points. HotPick record: ${hpRecord}.`;
    }
    case 'sharpshooter_week':
      return `Week ${ctx.week}: ${ctx.correct}/${ctx.total} regular picks correct (${Math.round((ctx.pick_rate as number ?? 0) * 100)}%). Pool size: ${ctx.pool_size}.`;
    case 'gunslinger_week':
      return `Week ${ctx.week}: Won a Rank ${ctx.hotpick_rank} HotPick on ${ctx.hotpick_team}. +${ctx.points_earned} pts.`;
    case 'contrarian_week':
      return `Week ${ctx.week}: Went against the pool on ${ctx.against_majority_count} games, won ${ctx.against_majority_wins}. Finished #${ctx.week_rank}.`;
    case 'perfect_week':
      return `Week ${ctx.week}: 15/15 picks correct + Rank ${ctx.hotpick_rank} HotPick on ${ctx.hotpick_team}. ${ctx.total_points} total points.`;
    case 'biggest_comeback':
      return `Dropped to #${ctx.low_rank} in Week ${ctx.low_rank_week}, climbed back to #${ctx.final_rank}. A ${ctx.rank_swing}-spot swing in ${ctx.pool_name}.`;
    case 'iron_poolie':
      return `${ctx.weeks_submitted}/${ctx.weeks_possible} weeks submitted in ${ctx.pool_name}. Never missed a pick.`;
    case 'season_sharpshooter':
      return `${ctx.correct}/${ctx.total} regular picks correct across ${ctx.weeks_played} weeks (${Math.round((ctx.pick_rate as number ?? 0) * 100)}%).`;
    case 'hotpick_artist':
      return `${ctx.hotpick_correct}/${ctx.hotpick_total} HotPicks correct (${Math.round((ctx.hotpick_rate as number ?? 0) * 100)}%). Avg rank chosen: ${ctx.avg_rank_chosen}.`;
    case 'season_tactician':
      return `Chose Rank 1-6 HotPicks for ${ctx.low_rank_hotpick_weeks} weeks. Avg rank: ${ctx.avg_hotpick_rank}. Season total: ${ctx.season_total_points} pts.`;
    default:
      return hw.hardwareName;
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  // Archetype block
  archetypeBlock: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  archetypeLabel: {
    fontSize: 22,
    fontWeight: '900',
    fontStyle: 'italic',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  archetypeDescription: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  careerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  careerStat: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  careerStatDivider: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionTitleSpaced: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  collapsibleContent: {
    marginBottom: spacing.sm,
  },
  // Filter tabs
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  filterTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  // Hardware grid
  hardwareGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  hardwareCard: {
    width: '30%',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  hardwareCardLocked: {
    opacity: 0.5,
  },
  hardwareIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  lockOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 2,
  },
  hardwareName: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  hardwareWeek: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // Competitions
  competitionsList: {
    gap: spacing.sm,
  },
  competitionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  competitionInfo: {
    flex: 1,
  },
  competitionName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  competitionStatus: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginTop: 2,
  },
  competitionCardTeaser: {
    opacity: 0.6,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  competitionTeaser: {
    fontSize: 15,
    fontWeight: '700',
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  competitionTeaserSub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalDate: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  modalClose: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
