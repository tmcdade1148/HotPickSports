import React, {useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {supabase} from '@shared/config/supabase';
import {spacing} from '@shared/theme';
import {useTheme} from '@shell/theme';

interface MentionResult {
  userId: string;
  name: string;
}

interface MentionAutocompleteProps {
  poolId: string;
  query: string; // text after the last '@'
  currentUserId: string;
  onSelect: (mention: MentionResult) => void;
}

/**
 * MentionAutocomplete — pool-scoped inline suggestion list.
 *
 * Queries pool_members JOIN profiles for the current pool only.
 * NEVER queries profiles globally — see CLAUDE.md SmackTalk rules.
 */
export function MentionAutocomplete({poolId, query, currentUserId, onSelect}: MentionAutocompleteProps) {
  const {colors} = useTheme();
  const [results, setResults] = useState<MentionResult[]>([]);

  useEffect(() => {
    if (!query || query.length < 1) {
      setResults([]);
      return;
    }

    const search = async () => {
      const {data} = await supabase
        .from('pool_members')
        .select('user_id, profiles(poolie_name, first_name)')
        .eq('pool_id', poolId)
        .eq('status', 'active')
        .neq('user_id', currentUserId)
        .limit(8);

      if (!data) return;

      const matches: MentionResult[] = [];
      for (const row of data as any[]) {
        const name = row.profiles?.poolie_name || row.profiles?.first_name || '';
        if (name.toLowerCase().includes(query.toLowerCase())) {
          matches.push({userId: row.user_id, name});
        }
      }
      setResults(matches.slice(0, 5));
    };

    search();
  }, [poolId, query, currentUserId]);

  if (results.length === 0) return null;

  return (
    <View style={[styles.container, {backgroundColor: colors.surface, borderColor: colors.border}]}>
      {results.map(r => (
        <TouchableOpacity
          key={r.userId}
          style={styles.row}
          onPress={() => onSelect(r)}>
          <Text style={[styles.name, {color: colors.textPrimary}]}>@{r.name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
  },
});
