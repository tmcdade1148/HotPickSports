// EventSwitchModal — the Player-facing Event Switcher (SWITCHER-01 §5d).
//
// Opened by tapping the period pill in HomeHeader. Lists the events this
// Player is CONNECTED to (plus the default landing event) and switches on
// selection — instantly, with no confirmation and no restart warning.
//
// Why nothing happens here beyond setActiveSport (spec §5d / §6):
// setActiveSport already clears the pool selection, restores the target
// competition's cache, and refetches; HomeScreen's effects key on
// `competition` and re-subscribe + refetch on the change. Clearing state,
// refetching, or navigating by hand here would duplicate that and can race
// nflStore's own mid-flight competition guard.
//
// Shape mirrors the Settings competition picker (the super-admin surface this
// replaces for ordinary Players) so the two read as the same control: scrim,
// centered card, checked current row. HotPick-themed throughout (Hard Rule
// #9 / #25) — the switcher is shell chrome, never Club-branded.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {Modal, ScrollView, StyleSheet, TouchableOpacity, View} from 'react-native';
import {Check} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import type {AnyEventConfig} from '@shared/types/templates';

export function EventSwitchModal({
  visible,
  onClose,
  events,
}: {
  visible: boolean;
  onClose: () => void;
  /** Connected events, already ordered — from getConnectedEvents(). */
  events: AnyEventConfig[];
}) {
  const {colors} = useTheme();
  const activeSport = useGlobalStore(s => s.activeSport);
  const setActiveSport = useGlobalStore(s => s.setActiveSport);

  const select = (ev: AnyEventConfig) => {
    // Selecting the current event is a dismiss, not a state change.
    if (ev.competition !== activeSport?.competition) {
      setActiveSport(ev);
    }
    onClose();
  };

  return (
    // animationType="none" per the app-wide modal rule (see DemoModals).
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        accessible={false}
        style={styles.scrim}>
        <View
          style={[styles.card, {backgroundColor: colors.surface, borderColor: colors.border}]}>
          <Text
            style={[
              bodyType.bold,
              styles.title,
              {color: colors.textSecondary},
            ]}>
            SWITCH EVENT
          </Text>
          <ScrollView bounces={false}>
            {events.map(ev => {
              const isActive = activeSport?.competition === ev.competition;
              return (
                <TouchableOpacity
                  key={ev.competition}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityState={{selected: isActive}}
                  accessibilityLabel={
                    isActive ? `${ev.name}, current event` : `Switch to ${ev.name}`
                  }
                  onPress={() => select(ev)}>
                  {isActive ? (
                    <Check size={20} color={colors.primary} />
                  ) : (
                    <View style={styles.checkSpacer} />
                  )}
                  {/* The full event name, never the pill's abbreviation — the
                      list is where the long form belongs (spec §5d). */}
                  <Text
                    numberOfLines={2}
                    style={[
                      bodyType.regular,
                      styles.rowText,
                      {color: isActive ? colors.primary : colors.textPrimary},
                    ]}>
                    {ev.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingBottom: spacing.sm,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  title: {
    fontSize: 12,
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  checkSpacer: {
    width: 20,
  },
  rowText: {
    fontSize: 16,
    flex: 1,
  },
});
