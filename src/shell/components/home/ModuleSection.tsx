// ModuleSection — THE Home section eyebrow. One component, every module.
//
// Home carried ten-plus hand-written label strings (YOUR PICKS, YOUR CONTESTS,
// LAST WEEK RECAP, YOUR HISTORY in three spellings, HISTORY…). `sectionHeaderType`
// already exists because that label had been hand-copied into three files and a
// fourth drifted to a different letter-spacing — but only the TYPE was shared;
// each module still rendered its own <Text>. Adding a value and a chevron to that
// arrangement would drift the same way, so the whole row lives here.
//
// The row is: LABEL · VALUE ................................ STATUS  chevron
//
//   Label   uppercase, sectionHeaderType, textTertiary (textPrimary for WEEK).
//   Value   after a bullet. Positive → gameWon · negative → gameLost WITH its
//           minus · nothing settled → grey en-dash. Never a green zero.
//           Tabular figures so the ones column holds still as it changes.
//   Status  right-aligned, heavy italic. WEEK only.
//   Chevron toggles the children. Collapsed by default; the value stays visible
//           while collapsed, because the value is the reason to look.
//
// Two behaviours worth knowing:
//   • It renders NOTHING when it has no children — an eyebrow over an empty
//     module is a promise the module doesn't keep. Components whose content is
//     conditional return null themselves before reaching here.
//   • Collapse RESETS on Home blur. Home stays mounted between tabs, so without
//     this you'd come back to whatever you left open three tabs ago.
//
// Hard Rule #9 — every colour is a token; there is no hex in this file.

import React, {useCallback, useState} from 'react';
import {Text} from '@shared/components/AppText';
import {Pressable, StyleSheet, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {ChevronDown, ChevronUp} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, displayType, monoType, sectionHeaderType, spacing} from '@shared/theme';
import {fmtPoints} from '@shared/utils/format';

// Eyebrow scale (Tom, 2026-07-23). Both multiply their own previous size, so
// the number stays clearly larger than the label rather than matching it.
const LABEL_SIZE = sectionHeaderType.fontSize * 2;   // 11 → 22, bold
const VALUE_SIZE = Math.round(13 * 2.25);            // 13 → 29, heavy italic
// Sized off the label so the affordance doesn't read as an afterthought beside
// a 29px number.
const CHEVRON = LABEL_SIZE;

/** Right-aligned week status. `tone` picks the token, never a literal colour. */
export interface ModuleSectionStatus {
  text: string;
  tone: 'go' | 'stop';
}

export interface ModuleSectionProps {
  /** Uppercased by the caller-facing contract; rendered as given. */
  label: string;
  /**
   * Points shown after the bullet. `null` = nothing settled → grey en-dash.
   * OMIT the prop entirely for a module that has no number (Contests, Leagues).
   */
  value?: number | null;
  /** Right-aligned heavy-italic status. WEEK eyebrow only. */
  status?: ModuleSectionStatus | null;
  /** Right-aligned node — the Contest carousel's page dots. */
  accessory?: React.ReactNode;
  /** Adds the chevron and makes the whole row a toggle. Collapsed by default. */
  collapsible?: boolean;
  /** The WEEK eyebrow's label renders in textPrimary; every other one tertiary. */
  emphasis?: boolean;
  children?: React.ReactNode;
}

export function ModuleSection({
  label,
  value,
  status,
  accessory,
  collapsible = false,
  emphasis = false,
  children,
}: ModuleSectionProps) {
  const {colors} = useTheme();
  const [open, setOpen] = useState(false);

  // Back to collapsed whenever Home loses focus. The cleanup fires on blur.
  useFocusEffect(
    useCallback(() => {
      return () => setOpen(false);
    }, []),
  );

  // `{cond && <Thing/>}` collapses to `false`, which is not content.
  const hasChildren = React.Children.toArray(children).length > 0;
  if (!hasChildren) return null;

  const showValue = value !== undefined;
  // A settled 0 is a real result and stays neutral — "never a green zero".
  const valueColor =
    value == null
      ? colors.textTertiary
      : value > 0
        ? colors.gameWon
        : value < 0
          ? colors.gameLost
          : colors.textPrimary;

  const header = (
    <View style={styles.row}>
      {/* The type sits on a shared BASELINE. The row itself stays centred —
          baseline-aligning the dots and the chevron (plain Views, no text)
          hangs them off their bottom edge instead. */}
      <View style={styles.titleGroup}>
        <Text
          style={[
            bodyType.bold,
            styles.label,
            {color: emphasis ? colors.textPrimary : colors.textTertiary},
          ]}
          numberOfLines={1}>
          {label}
        </Text>

        {showValue && (
          <>
            <Text style={[bodyType.bold, styles.bullet, {color: colors.textTertiary}]}>
              {'•'}
            </Text>
            <Text style={[displayType.display, styles.value, {color: valueColor}]}>
              {/* U+2013 en-dash: nothing has settled. Not a zero. */}
              {value == null ? '–' : fmtPoints(value)}
            </Text>
            {/* No unit on the en-dash — "– pts" reads like a broken number. */}
            {value != null && (
              <Text style={[bodyType.bold, styles.valueUnit, {color: colors.textTertiary}]}>
                pts
              </Text>
            )}
          </>
        )}
      </View>

      <View style={styles.spacer} />

      {accessory}

      {status ? (
        <Text
          style={[
            displayType.display,
            styles.status,
            {color: status.tone === 'go' ? colors.gameWon : colors.gameLost},
          ]}
          numberOfLines={1}>
          {status.text}
        </Text>
      ) : null}

      {collapsible &&
        (open ? (
          <ChevronUp size={CHEVRON} color={colors.textTertiary} strokeWidth={2.5} />
        ) : (
          <ChevronDown size={CHEVRON} color={colors.textTertiary} strokeWidth={2.5} />
        ))}
    </View>
  );

  return (
    <View style={styles.section}>
      {collapsible ? (
        // The ENTIRE row is the target — a chevron glyph is a ~20px tap area
        // sitting next to a full-width row that looks just as tappable.
        <Pressable
          onPress={() => setOpen(o => !o)}
          style={({pressed}) => [{opacity: pressed ? 0.6 : 1}]}
          accessibilityRole="button"
          accessibilityState={{expanded: open}}
          accessibilityLabel={label}>
          {header}
        </Pressable>
      ) : (
        header
      )}

      {(!collapsible || open) && children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: 10,
    gap: 6,
  },
  // Label · value · pts, sharing one baseline so the 22px label and the 29px
  // number read as a single line rather than two stacked things.
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexShrink: 1,
    gap: 6,
  },
  label: {
    ...sectionHeaderType,
    fontSize: LABEL_SIZE,
    // sectionHeaderType's 1.8 tracking was tuned for an 11px caps label; at
    // twice the size it opens into a gap. Scaled down proportionally.
    letterSpacing: 0.9,
    flexShrink: 1,
  },
  bullet: {
    fontSize: LABEL_SIZE,
  },
  value: {
    ...monoType.regular,
    fontSize: VALUE_SIZE,
  },
  // Rides to the right of the number, small — a unit on that number, not a
  // second thing to read.
  valueUnit: {
    fontSize: 11,
    letterSpacing: 0.8,
  },
  // Pushes status + chevron to the right edge without letting the label's
  // flexShrink fight them for space.
  spacer: {
    flex: 1,
    minWidth: spacing.sm,
  },
  status: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
