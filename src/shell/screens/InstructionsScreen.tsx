import React, {useState} from 'react';
import {Text} from '@shared/components/AppText';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ChevronLeft, ChevronDown, ChevronUp} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';
import type {ThemeColors} from '@shell/theme';

/**
 * Is the Pricing section shown? FALSE — Gaffers are free this season.
 *
 * HIDDEN, NOT DELETED. The whole AccordionSection (the tiers, the "only the
 * Gaffer pays" note, the Founding 100 line) is intact below; flip this to true
 * when pricing restarts mid-September and it comes back exactly as it was.
 *
 * The `: boolean` annotation is deliberate: without it TypeScript narrows the
 * type to `false`, which makes the guard below a provably-constant condition
 * that lint rules flag and readers "tidy away". Leave it. Same pattern as
 * SHOW_WELCOME_MESSAGE in PoolSettingsScreen.
 */
const SHOW_PRICING: boolean = false;

interface SectionProps {
  title: string;
  children: React.ReactNode;
  colors: ThemeColors;
}

function AccordionSection({title, children, colors}: SectionProps) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  return (
    <View style={[sectionStyles.container, {backgroundColor: colors.surface}]}>
      <TouchableOpacity
        style={sectionStyles.header}
        onPress={toggle}
        activeOpacity={0.7}>
        <Text style={[sectionStyles.title, {color: colors.textPrimary}]}>{title}</Text>
        {expanded ? (
          <ChevronUp size={20} color={colors.textSecondary} />
        ) : (
          <ChevronDown size={20} color={colors.textSecondary} />
        )}
      </TouchableOpacity>
      {expanded && <View style={sectionStyles.body}>{children}</View>}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
});

export function InstructionsScreen() {
  const navigation = useNavigation<any>();
  const {colors} = useTheme();

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <ChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: colors.textPrimary}]}>How HotPick Works</Text>
        <View style={{width: 24}} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}>

        {/* Quick overview */}
        <Text style={[styles.intro, {color: colors.textSecondary}]}>
          Everything you need to know about playing, managing Contests, and pricing.
        </Text>

        <AccordionSection title="Making Picks & Game Locks" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            Each week, pick the winner of every NFL game. Your picks are made once and
            count across all your Contests simultaneously.
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Picks open a few days before the first game of the week.
          </Text>
          {/* WHOLE-WEEK lock. The single source is
              @templates/season/utils/weekLock.ts \u2014 read-only once
              now >= MIN(kickoff_at), mirroring the server's enforce_pick_lock
              and get_week_lock_time. "Never a per-game lock_at." This copy
              previously described a per-game lock, which was the opposite of
              what the app and the server actually do. */}
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} The entire week locks the moment the first game kicks off {'\u2014'} usually Thursday night.
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Sunday and Monday games lock at that same moment, not at their own kickoff.
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Your exact deadline is always on the Home screen.
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Until the lock, change your picks as often as you like. After it, the week is set.
          </Text>
        </AccordionSection>

        <AccordionSection title="The HotPick" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            Every week, designate one of your picks as your HotPick. Each game has a
            rank from 1 to 16, based on how competitive it is.
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Correct HotPick: earn rank points (e.g., rank 8 = 8 pts)
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Wrong HotPick: subtract rank points (e.g., rank 8 = {'\u2212'}8 pts)
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} All other picks: 1 for correct, 0 for incorrect
          </Text>
          {/* Compliance: the previous line ("compounds your weekly movement —
              up or down") dramatised the point deduction, which the legal
              guardrails flag. States the mechanic plainly instead. */}
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Your HotPick is your highest-conviction call of the week. Higher-ranked
            games are worth more.
          </Text>
        </AccordionSection>

        <AccordionSection title="Contests" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            Contests are groups of people competing against each other. You can be in
            multiple Contests at once — your picks are shared, but each Contest has its
            own Ladder.
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Contests can start at any point in the season. A Contest created in Week 6
            only counts scores from Week 6 forward — everyone starts at zero.
          </Text>
        </AccordionSection>

        <AccordionSection title="Creating a Contest" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            Anyone can start a Contest. Tap "Start a Contest" in Settings, give it a
            name, and share the invite code with your group.
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            As the Gaffer, you can:
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Manage members (promote, demote, remove)
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Send broadcasts to your Contest (up to 3/day)
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Edit Contest name and settings
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Archive the Contest when the season ends
          </Text>
        </AccordionSection>

        <AccordionSection title="Joining a Contest" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            To join a Contest, you need an invite code from the Gaffer. Enter it in
            Settings under "Have an invite code?" or tap a shared invite link.
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Once you join, you immediately start competing from the Contest's start
            date. No waiting, no approval needed.
          </Text>
        </AccordionSection>

        <AccordionSection title="Chirps" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            Every Contest has a Chirps feed — a chat for trash talk, reactions, and
            bragging rights. Messages from the last 14 days are visible.
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Chirps are what makes HotPick social. Use them. Your future self will
            thank you when you called that upset in Week 4.
          </Text>
        </AccordionSection>

        <AccordionSection title="Scoring & the Ladder" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            Your score is calculated server-side after games finish. You'll see:
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Weekly score: how you did this week
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Season total: cumulative points across the season
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Contest Ladder: your rank within each Contest
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Each Contest's Ladder has two views — a weekly breakdown and a
            season-long race. Both are always available.
          </Text>
        </AccordionSection>

        {/* Hyphens here are PLAIN ASCII, matching what the Ladder actually
            renders: SeasonBoardScreen:322 builds its badge as `T-${rank}`. The
            examples in this copy have to be the same character as the badge
            they describe, so don't "typographically improve" them to U+2011. */}
        <AccordionSection title="Ties" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            All season long, in both weekly and season standings, players on the same
            total share a place. The Ladder marks it with a T — T-2, T-7.
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Ties are only broken for the top three. If two or more players finish level
            on points and that tie decides first, second or third, it comes down to
            HotPick points: the net total each player earned from their HotPicks across
            the season. Same total, but one of them used their HotPick conviction to
            greater effect. That one takes it.
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            If they're still level after that, they finish together. Co-champions,
            co-runners-up. A tie that survives a whole season has earned it.
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Everyone below the top three stays co-ranked, all the way down.
          </Text>
        </AccordionSection>

        {/* Pricing — HIDDEN, not deleted. See SHOW_PRICING. */}
        {SHOW_PRICING && (
        <AccordionSection title="Pricing" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            HotPick is free to play. Gaffers pay based on Contest size:
          </Text>
          <View style={[styles.priceRow, {borderBottomColor: colors.background}]}>
            <Text style={[styles.priceLabel, {color: colors.textPrimary}]}>Free</Text>
            <Text style={[styles.priceDetail, {color: colors.textSecondary}]}>Up to 10 members</Text>
          </View>
          <View style={[styles.priceRow, {borderBottomColor: colors.background}]}>
            <Text style={[styles.priceLabel, {color: colors.textPrimary}]}>$19</Text>
            <Text style={[styles.priceDetail, {color: colors.textSecondary}]}>11 - 25 members</Text>
          </View>
          <View style={[styles.priceRow, {borderBottomColor: colors.background}]}>
            <Text style={[styles.priceLabel, {color: colors.textPrimary}]}>$39</Text>
            <Text style={[styles.priceDetail, {color: colors.textSecondary}]}>26 - 50 members</Text>
          </View>
          <View style={[styles.priceRow, {borderBottomColor: colors.background}]}>
            <Text style={[styles.priceLabel, {color: colors.textPrimary}]}>$69</Text>
            <Text style={[styles.priceDetail, {color: colors.textSecondary}]}>51+ members (unlimited)</Text>
          </View>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Only the Gaffer pays. Everyone else plays for free. Pricing is
            per Contest, per season.
          </Text>
          <Text style={[styles.body, {color: colors.primary, marginTop: spacing.sm, fontWeight: '600'}]}>
            Founding 100 Contests are free forever, regardless of size.
          </Text>
        </AccordionSection>
        )}

        <AccordionSection title="Season Phases" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            The NFL season moves through phases:
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Pre-Season: set up your profile and Contests
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Regular Season (Weeks 1-18): weekly pick cycle
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Playoffs: fresh leaderboard, same pools
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Super Bowl: special enhanced scoring
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Playoff scoring starts fresh — regular season standings are preserved
            in a historical view, and everyone competes from zero in the playoffs.
          </Text>
        </AccordionSection>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
  },
  bulletItem: {
    fontSize: 14,
    lineHeight: 24,
    paddingLeft: spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  priceLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  priceDetail: {
    fontSize: 14,
  },
});
