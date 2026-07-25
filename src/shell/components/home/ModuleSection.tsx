// ModuleSection — THE Home section eyebrow. One component, every module.
//
// Home carried ten-plus hand-written label strings (YOUR PICKS, YOUR CONTESTS,
// LAST WEEK RECAP, YOUR HISTORY in three spellings, HISTORY…). `sectionHeaderType`
// already exists because that label had been hand-copied into three files and a
// fourth drifted to a different letter-spacing — but only the TYPE was shared;
// each module still rendered its own <Text>. Adding a value and a chevron to that
// arrangement would drift the same way, so the whole row lives here.
//
// The row is: LABEL VALUE pts ............................. STATUS  chevron
//
//   Label   uppercase, sectionHeaderType, textTertiary (textPrimary for WEEK).
//   Value   a space after the label (no separator). Positive → gameWon ·
//           negative → gameLost WITH its minus · nothing settled → grey en-dash.
//           Never a green zero. Tabular figures so the ones column holds still.
//   pts     a tight unit on the number, in the number's OWN colour — the two
//           read as one thing, not a value and a grey afterthought.
//   Trailing a small node right after the label word (the HOTPICK flame).
//   Status  right-aligned, heavy italic, 2× the label. WEEK only. Yields to the
//           label group on a narrow row — caps at the leftover width and
//           truncates, never pushes the label.
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
   * Points shown a space after the label. `null` = nothing settled → grey
   * en-dash. OMIT the prop entirely for a module with no number (Contests,
   * Leagues, HotPick).
   */
  value?: number | null;
  /** Render the value in neutral textPrimary regardless of sign, instead of the
   *  default green/red-by-sign. The HISTORY eyebrow's SEASON total sets this so
   *  it reads like IdentityBar's neutral "PTS THRU WK n" header — a running
   *  season total is not a win/loss, so it should never green. Week-level values
   *  (WEEK, RECAP) leave it off and keep the sign colour. */
  valueNeutral?: boolean;
  /** Right-aligned heavy-italic status. WEEK eyebrow only. */
  status?: ModuleSectionStatus | null;
  /** Right-aligned node — the Contest carousel's page dots. */
  accessory?: React.ReactNode;
  /** Small node rendered immediately AFTER the label word (the HOTPICK flame). */
  labelTrailing?: React.ReactNode;
  /** Adds the chevron and makes the whole row a toggle. Collapsed by default. */
  collapsible?: boolean;
  /** The WEEK eyebrow's label renders in textPrimary; every other one tertiary. */
  emphasis?: boolean;
  children?: React.ReactNode;
}

export function ModuleSection({
  label,
  value,
  valueNeutral = false,
  status,
  accessory,
  labelTrailing,
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
  // valueNeutral forces textPrimary for any non-null value (the HISTORY season
  // total, which reads like a header figure, not a win/loss).
  const valueColor =
    value == null
      ? colors.textTertiary
      : valueNeutral
        ? colors.textPrimary
        : value > 0
          ? colors.gameWon
          : value < 0
            ? colors.gameLost
            : colors.textPrimary;

  const header = (
    <View style={styles.row}>
      {/* The row is BASELINE-aligned so the status (PICKS LOCKED …) sits on the
          same baseline as the label — the tall 29px value would otherwise pull
          the label's baseline low while the status floated at the row's centre.
          The non-text items (dots, chevron) can't baseline-align — they'd hang
          off their bottom edge — so each is wrapped in a self-centred View. */}
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

        {/* Trailing node — the HOTPICK flame, right after the word. */}
        {labelTrailing != null && (
          <View style={styles.labelTrailing}>{labelTrailing}</View>
        )}

        {showValue && (
          <>
            <Text style={[displayType.display, styles.value, {color: valueColor}]}>
              {/* U+2013 en-dash: nothing has settled. Not a zero. */}
              {value == null ? '–' : fmtPoints(value)}
            </Text>
            {/* No unit on the en-dash — "– pts" reads like a broken number.
                Otherwise it takes the NUMBER's colour so the two read as one
                unit (green with a gain, red with a miss). */}
            {value != null && (
              <Text style={[bodyType.bold, styles.valueUnit, {color: valueColor}]}>
                pts
              </Text>
            )}
          </>
        )}
      </View>

      <View style={styles.spacer} />

      {accessory != null && <View style={styles.rightItem}>{accessory}</View>}

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

      {collapsible && (
        <View style={styles.rightItem}>
          {open ? (
            <ChevronUp size={CHEVRON} color={colors.textTertiary} strokeWidth={2.5} />
          ) : (
            <ChevronDown size={CHEVRON} color={colors.textTertiary} strokeWidth={2.5} />
          )}
        </View>
      )}
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
    alignItems: 'baseline',
    paddingHorizontal: spacing.lg,
    marginBottom: 10,
    gap: 6,
  },
  // Dots / chevron opt OUT of the row's baseline and centre on it instead.
  rightItem: {
    alignSelf: 'center',
  },
  // Label value pts, sharing one baseline so the 22px label and the 29px number
  // read as a single line rather than two stacked things. No uniform `gap` —
  // the spaces are deliberately unequal (a word-space before the value, a tight
  // hair before pts), so each rides on its own marginLeft.
  //
  // flexShrink: 0 — the LABEL GROUP WINS THE ROW. When a wide status (PICKS
  // LOCKED at 2×) can't fit beside it on a narrow screen, the status caps and
  // truncates (see `status`); the label never gives up space. Real labels
  // (WEEK n, WEEK n RECAP) fit within the row on the smallest device, so this
  // group never needs to shrink for its own sake.
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexShrink: 0,
  },
  label: {
    ...sectionHeaderType,
    fontSize: LABEL_SIZE,
    // sectionHeaderType's 1.8 tracking was tuned for an 11px caps label; at
    // twice the size it opens into a gap. Scaled down proportionally.
    letterSpacing: 0.9,
    flexShrink: 1,
  },
  // The flame sits just past the last glyph of the word.
  labelTrailing: {
    marginLeft: 6,
  },
  value: {
    ...monoType.regular,
    fontSize: VALUE_SIZE,
    // A word-space after the label — the separator, now that the bullet is gone.
    marginLeft: 8,
  },
  // Rides tight to the number, small, in the number's colour — a unit ON that
  // number, not a second thing to read.
  valueUnit: {
    fontSize: 11,
    letterSpacing: 0.8,
    marginLeft: 2,
  },
  // Pushes status + chevron to the right edge. flex:1 (basis 0) so it only
  // eats FREE space; when the row is tight it collapses to minWidth and the
  // status absorbs the shrink, never the label group.
  spacer: {
    flex: 1,
    minWidth: spacing.sm,
  },
  // 2× the old 11px. Heavy italic. flexShrink lets it give way on a narrow row
  // — it caps at the width the label group leaves and truncates (numberOfLines
  // 1), rather than pushing into the label or off the screen. Deliberately NOT
  // adjustsFontSizeToFit: this codebase has a documented iOS bug where it
  // mis-measures inside a flex row and shrinks to the minimum even when the text
  // fits, which would render the status tiny on roomy screens.
  status: {
    fontSize: 22,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
});
