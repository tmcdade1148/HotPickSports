import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ChevronLeft} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {supabase} from '@shared/config/supabase';
import {useTheme} from '@shell/theme';
import {spacing, borderRadius} from '@shared/theme';

/**
 * HardwareAdminScreen — Manual award computation trigger.
 *
 * Super admin only (gated by is_super_admin in SettingsScreen).
 * Posts to compute-hardware Edge Function with service role key.
 * Idempotent — safe to run at any time.
 */
export function HardwareAdminScreen() {
  const navigation = useNavigation<any>();
  const {colors} = useTheme();
  const styles = createStyles(colors);

  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const triggerCompute = async (trigger: string, week?: number) => {
    setLoading(true);
    setLastResult(null);

    try {
      const body: Record<string, any> = {
        trigger,
        competition: 'nfl_2026',
        season_year: 2026,
      };
      if (week) body.week = week;

      const {data, error} = await supabase.functions.invoke('compute-hardware', {
        body,
      });

      if (error) {
        setLastResult(`Error: ${error.message}`);
      } else {
        setLastResult(JSON.stringify(data, null, 2));
      }
    } catch (err) {
      setLastResult(`Error: ${String(err)}`);
    }

    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <ChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hardware Admin</Text>
        <View style={{width: 24}} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Weekly Awards</Text>
        <Text style={styles.hint}>
          Computes sharpshooter, gunslinger, contrarian, perfect week for a specific week.
          Safe to run multiple times (idempotent).
        </Text>

        <View style={styles.weekButtons}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(w => (
            <TouchableOpacity
              key={w}
              style={styles.weekButton}
              disabled={loading}
              onPress={() => {
                Alert.alert(
                  `Compute Week ${w}?`,
                  'This will compute weekly awards for this week. Safe to re-run.',
                  [
                    {text: 'Cancel', style: 'cancel'},
                    {text: 'Compute', onPress: () => triggerCompute('weekly_settle', w)},
                  ],
                );
              }}>
              <Text style={styles.weekButtonText}>{w}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionTitle, {marginTop: spacing.lg}]}>Season-End Awards</Text>
        <Text style={styles.hint}>
          Computes champion, podium, comeback, iron poolie, sharpshooter, hotpick artist, tactician.
          Only runs if season is complete.
        </Text>

        <TouchableOpacity
          style={[styles.bigButton, {backgroundColor: colors.primary}]}
          disabled={loading}
          onPress={() => {
            Alert.alert(
              'Compute Season Awards?',
              'This will compute all season-end awards. Requires is_season_complete = true.',
              [
                {text: 'Cancel', style: 'cancel'},
                {text: 'Compute', onPress: () => triggerCompute('season_settle')},
              ],
            );
          }}>
          <Text style={styles.bigButtonText}>Compute Season Awards</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, {marginTop: spacing.lg}]}>Full Override</Text>
        <Text style={styles.hint}>
          Runs BOTH weekly (all weeks) and season awards. Use sparingly.
        </Text>

        <TouchableOpacity
          style={[styles.bigButton, {backgroundColor: colors.error}]}
          disabled={loading}
          onPress={() => {
            Alert.alert(
              'Full Override?',
              'This will compute ALL weekly awards for ALL weeks PLUS all season-end awards.',
              [
                {text: 'Cancel', style: 'cancel'},
                {text: 'Run Full Override', style: 'destructive', onPress: () => triggerCompute('manual_override')},
              ],
            );
          }}>
          <Text style={styles.bigButtonText}>Full Override</Text>
        </TouchableOpacity>

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Computing awards...</Text>
          </View>
        )}

        {lastResult && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>Result</Text>
            <Text style={styles.resultText}>{lastResult}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  hint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  weekButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  weekButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  bigButton: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  bigButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  resultBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  resultText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
});
