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
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {Flame, ChevronRight} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useTheme} from '@shell/theme/hooks';
import {supabase} from '@shared/config/supabase';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import {hexToRgba} from '@shared/utils/color';

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

  // Brief: flame-tinted pill. Border = flame @ 32%, bg = flame @ 6%.
  // The flame circle (left) + chevron right serve the "tappable" affordance;
  // long-press dismisses (kept from prior behavior).
  return (
    <Pressable
      onLongPress={handleDismiss}
      delayLongPress={400}
      style={({pressed}) => [
        styles.wrap,
        {
          backgroundColor: hexToRgba(colors.primary, 0.06),
          borderColor: hexToRgba(colors.primary, 0.32),
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="System message — long press to dismiss">
      <View
        style={[
          styles.iconCircle,
          {backgroundColor: hexToRgba(colors.primary, 0.18)},
        ]}>
        <Flame size={15} color={colors.primary} strokeWidth={2} />
      </View>
      <Text
        style={[bodyType.regular, styles.message, {color: colors.textPrimary}]}
        numberOfLines={2}>
        {message.message}
      </Text>
      <ChevronRight size={16} color={colors.textTertiary} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: borderRadius.lg - 2,
    borderWidth: 1,
  },
  iconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
});
