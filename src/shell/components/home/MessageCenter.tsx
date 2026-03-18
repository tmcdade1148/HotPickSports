import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {Mail, AlertTriangle, Megaphone} from 'lucide-react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

/**
 * MessageCenter — Home Screen module showing actionable notifications.
 *
 * Surfaces:
 * - Organizer/admin broadcasts (last 24 hours)
 * - Direct messages (broadcasts + moderator notes) count
 * - Flagged messages needing moderation (organizer/admin only)
 *
 * Tapping navigates to the relevant screen.
 */
export function MessageCenter({
  onNavigateToMessageCenter,
  onNavigateToFlagged,
}: {
  onNavigateToMessageCenter: () => void;
  onNavigateToFlagged: (poolId: string) => void;
}) {
  const {colors} = useTheme();
  const styles = createStyles(colors);

  const flaggedCounts = useGlobalStore(s => s.flaggedCounts);
  const recentBroadcasts = useGlobalStore(s => s.recentBroadcasts);
  const userPools = useGlobalStore(s => s.userPools);

  // Count of recent direct messages (broadcasts shown in last 24h)
  const directMessageCount = recentBroadcasts.length;

  // Pools with flagged messages
  const flaggedPools = Object.entries(flaggedCounts)
    .filter(([, count]) => count > 0)
    .map(([poolId, count]) => ({
      poolId,
      count,
      name: userPools.find(p => p.id === poolId)?.name ?? 'Pool',
    }));

  // Nothing to show
  if (directMessageCount === 0 && flaggedPools.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Messages</Text>

      {/* Recent broadcasts preview — tap to open Message Center */}
      {recentBroadcasts.slice(0, 2).map((bc, i) => {
        const timeAgo = getTimeAgo(bc.sentAt);
        return (
          <TouchableOpacity
            key={`bc-${i}`}
            style={styles.broadcastRow}
            onPress={onNavigateToMessageCenter}
            activeOpacity={0.7}>
            <View style={[styles.iconCircle, {backgroundColor: colors.secondary + '20'}]}>
              <Megaphone size={16} color={colors.secondary} />
            </View>
            <View style={styles.rowContent}>
              <View style={styles.broadcastHeader}>
                <Text style={[styles.rowLabel, {color: colors.textPrimary}]}>
                  {bc.poolName}
                </Text>
                <Text style={[styles.timeLabel, {color: colors.textSecondary}]}>
                  {timeAgo}
                </Text>
              </View>
              <Text
                style={[styles.broadcastMessage, {color: colors.textPrimary}]}
                numberOfLines={2}>
                {bc.message}
              </Text>
              <Text style={[styles.broadcastSender, {color: colors.textSecondary}]}>
                — {bc.senderName}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* "View all" link if more than 2 broadcasts */}
      {recentBroadcasts.length > 2 && (
        <TouchableOpacity
          style={styles.viewAllRow}
          onPress={onNavigateToMessageCenter}>
          <Mail size={14} color={colors.primary} />
          <Text style={[styles.viewAllText, {color: colors.primary}]}>
            View all {recentBroadcasts.length} messages
          </Text>
        </TouchableOpacity>
      )}

      {/* Flagged messages per pool */}
      {flaggedPools.map(fp => (
        <TouchableOpacity
          key={fp.poolId}
          style={styles.row}
          onPress={() => onNavigateToFlagged(fp.poolId)}>
          <View style={[styles.iconCircle, {backgroundColor: '#E5393520'}]}>
            <AlertTriangle size={18} color="#E53935" />
          </View>
          <View style={styles.rowContent}>
            <Text style={[styles.rowLabel, {color: colors.textPrimary}]}>
              {fp.name}
            </Text>
            <Text style={[styles.rowDetail, {color: colors.textSecondary}]}>
              {fp.count} flagged message{fp.count !== 1 ? 's' : ''} awaiting review
            </Text>
          </View>
          <View style={[styles.badge, {backgroundColor: '#E53935'}]}>
            <Text style={styles.badgeText}>{fp.count}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Returns a human-readable time ago string */
function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMin = Math.round((now - then) / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.round(diffHrs / 24)}d ago`;
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: borderRadius.md,
      padding: spacing.md,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    broadcastRow: {
      flexDirection: 'row',
      paddingVertical: spacing.sm,
      gap: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      marginBottom: spacing.xs,
    },
    broadcastHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    broadcastMessage: {
      fontSize: 14,
      lineHeight: 19,
      marginTop: 2,
    },
    broadcastSender: {
      fontSize: 12,
      marginTop: 2,
    },
    timeLabel: {
      fontSize: 11,
    },
    viewAllRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      marginBottom: spacing.xs,
    },
    viewAllText: {
      fontSize: 13,
      fontWeight: '600',
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowContent: {
      flex: 1,
    },
    rowLabel: {
      fontSize: 14,
      fontWeight: '600',
    },
    rowDetail: {
      fontSize: 12,
      marginTop: 1,
    },
    badge: {
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 3,
      minWidth: 24,
      alignItems: 'center',
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
  });
