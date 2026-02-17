/**
 * Sport Switcher — persistent element at top of screen.
 * Slack-style dropdown with Active Now / Coming Soon / Completed sections.
 *
 * Blueprint reference: Section 2.2
 */
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGlobalStore } from '../stores/globalStore';
import {
  getSportsSorted,
  getEvent,
  getSportForEvent,
} from '../../shared/types/sport-registry';
import type { EventConfig, SportConfig } from '../../shared/types/sport-registry';
import theme from '../../shared/theme';
import { strings } from '../../shared/i18n';

export function SportSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const activeEventKey = useGlobalStore(s => s.activeEventKey);
  const setActiveEvent = useGlobalStore(s => s.setActiveEvent);
  const insets = useSafeAreaInsets();

  const activeEvent = getEvent(activeEventKey);
  const activeSport = getSportForEvent(activeEventKey);

  function handleSelect(eventKey: string) {
    setActiveEvent(eventKey);
    setIsOpen(false);
  }

  // Group events by status
  const sports = getSportsSorted();
  const active: Array<{ sport: SportConfig; event: EventConfig }> = [];
  const upcoming: Array<{ sport: SportConfig; event: EventConfig }> = [];
  const completed: Array<{ sport: SportConfig; event: EventConfig }> = [];

  for (const sport of sports) {
    for (const event of sport.events) {
      const entry = { sport, event };
      if (event.status === 'active') active.push(entry);
      else if (event.status === 'upcoming') upcoming.push(entry);
      else completed.push(entry);
    }
  }

  return (
    <>
      {/* Trigger bar */}
      <Pressable
        style={[styles.trigger, { paddingTop: insets.top + theme.spacing.sm }]}
        onPress={() => setIsOpen(true)}
      >
        <Text style={styles.triggerText}>
          {activeSport?.name ?? 'Sport'} — {activeEvent?.shortLabel ?? 'Event'}
        </Text>
        <Text style={styles.triggerChevron}>▼</Text>
      </Pressable>

      {/* Dropdown modal */}
      <Modal visible={isOpen} transparent animationType="slide">
        <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)} />
        <View style={[styles.sheet, { paddingTop: insets.top + theme.spacing.md }]}>
          <Text style={styles.sheetTitle}>{strings.sport.switchSport}</Text>

          <ScrollView style={styles.scrollArea}>
            {active.length > 0 && (
              <Section
                title={strings.sport.activeNow}
                items={active}
                activeEventKey={activeEventKey}
                onSelect={handleSelect}
              />
            )}
            {upcoming.length > 0 && (
              <Section
                title={strings.sport.comingSoon}
                items={upcoming}
                activeEventKey={activeEventKey}
                onSelect={handleSelect}
              />
            )}
            {completed.length > 0 && (
              <Section
                title={strings.sport.completed}
                items={completed}
                activeEventKey={activeEventKey}
                onSelect={handleSelect}
              />
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function Section({
  title,
  items,
  activeEventKey,
  onSelect,
}: {
  title: string;
  items: Array<{ sport: SportConfig; event: EventConfig }>;
  activeEventKey: string;
  onSelect: (eventKey: string) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map(({ sport, event }) => {
        const isActive = event.eventKey === activeEventKey;
        return (
          <Pressable
            key={event.eventKey}
            style={[styles.eventRow, isActive && styles.eventRowActive]}
            onPress={() => onSelect(event.eventKey)}
          >
            <Text
              style={[styles.eventLabel, isActive && styles.eventLabelActive]}
            >
              {event.label}
            </Text>
            <Text style={styles.eventSport}>{sport.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  triggerText: {
    fontSize: theme.typography.size.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  triggerChevron: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
    maxHeight: '70%',
  },
  sheetTitle: {
    fontSize: theme.typography.size.xl,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  scrollArea: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.size.sm,
    fontWeight: '600',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.xs,
  },
  eventRowActive: {
    backgroundColor: theme.colors.primary + '20', // 20% opacity
  },
  eventLabel: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textPrimary,
  },
  eventLabelActive: {
    fontWeight: '600',
    color: theme.colors.primary,
  },
  eventSport: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
});
