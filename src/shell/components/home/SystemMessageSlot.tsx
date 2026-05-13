// src/shell/components/home/SystemMessageSlot.tsx
// Spec: 260513_HotPick_HomeRedesign_Spec.docx §6.4.1
//
// Single-line system banner at the very top of Home, above IdentityBar.
// Sourced from organizer_notifications rows with pool_id IS NULL and
// notification_type = 'system' that were sent in the last 7 days.
//
// Dismissible. Dismissed message IDs persist in AsyncStorage only —
// no server-side dismissal record at v1 per spec §6.4.1.
//
// Hides entirely when:
//   - no active system message exists in the 7-day window, OR
//   - the user has dismissed the most recent one

import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useTheme} from '@shell/theme/hooks';
import {supabase} from '@shared/config/supabase';
import {bodyType, spacing, borderRadius} from '@shared/theme';

const DISMISSED_KEY = '@hotpick/dismissed_system_messages';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface SystemMessage {
  id: string;
  message: string;
  sent_at: string;
}

export function SystemMessageSlot() {
  const {colors} = useTheme();
  const [message, setMessage] = useState<SystemMessage | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Load dismissed-message set once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DISMISSED_KEY);
        if (raw && !cancelled) {
          const ids = JSON.parse(raw);
          if (Array.isArray(ids)) setDismissedIds(new Set(ids));
        }
      } catch {
        // ignore — empty set is a safe default
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the latest active system message.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
      const {data} = await supabase
        .from('organizer_notifications')
        .select('id, message, sent_at')
        .is('pool_id', null)
        .eq('notification_type', 'system')
        .gte('sent_at', sevenDaysAgo)
        .order('sent_at', {ascending: false})
        .limit(1);

      if (cancelled) return;
      const row = (data?.[0] as SystemMessage | undefined) ?? null;
      setMessage(row && row.message ? row : null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismiss = useCallback(async () => {
    if (!message) return;
    const next = new Set(dismissedIds);
    next.add(message.id);
    setDismissedIds(next);
    try {
      await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(next)));
    } catch {
      // best-effort; if persistence fails the banner will reappear next launch
    }
  }, [message, dismissedIds]);

  if (!message) return null;
  if (dismissedIds.has(message.id)) return null;

  return (
    <View style={[styles.wrap, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
      <View style={[styles.accent, {backgroundColor: colors.primary}]} />
      <Text
        style={[bodyType.regular, styles.message, {color: colors.textPrimary}]}
        numberOfLines={2}>
        {message.message}
      </Text>
      <Pressable
        onPress={handleDismiss}
        hitSlop={10}
        style={({pressed}) => [styles.dismiss, {opacity: pressed ? 0.6 : 1}]}
        accessibilityRole="button"
        accessibilityLabel="Dismiss this system message">
        <Text style={[styles.dismissText, {color: colors.textSecondary}]}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  accent: {width: 3, alignSelf: 'stretch'},
  message: {
    flex: 1,
    fontSize: 13,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    lineHeight: 18,
  },
  dismiss: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dismissText: {fontSize: 22, lineHeight: 22, fontWeight: '400'},
});
