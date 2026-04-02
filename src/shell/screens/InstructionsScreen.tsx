import React, {useState} from 'react';
import {
  View,
  Text,
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
          Everything you need to know about playing, managing pools, and pricing.
        </Text>

        <AccordionSection title="Making Picks & Game Locks" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            Each week, pick the winner of every NFL game. Your picks are made once and
            count across all your pools simultaneously.
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Picks open a few days before the first game of the week. Games lock in two waves:
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Any game before the Sunday 1pm ET window (Thursday night, Saturday, early Sunday) locks at its own kickoff.
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} All remaining games lock together at the Sunday 1pm ET kickoff.
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            You can edit any unlocked pick as many times as you want right up until it locks.
          </Text>
        </AccordionSection>

        <AccordionSection title="The HotPick" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            Every week, designate one of your picks as your HotPick. Each game has a
            rank (1-10) based on how competitive it is.
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Correct HotPick: earn +rank points (e.g., rank 8 = +8 pts)
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Wrong HotPick: lose -rank points (e.g., rank 8 = -8 pts)
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} All other picks: +1 for correct, 0 for incorrect
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Bold calls on high-ranked games can vault you up the leaderboard — or
            send you tumbling. That's the fun.
          </Text>
        </AccordionSection>

        <AccordionSection title="Pools" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            Pools are groups of people competing against each other. You can be in
            multiple pools at once — your picks are shared, but each pool has its
            own leaderboard.
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Pools can start at any point in the season. A pool created in Week 6
            only counts scores from Week 6 forward — everyone starts at zero.
          </Text>
        </AccordionSection>

        <AccordionSection title="Creating a Pool" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            Anyone can create a pool. Tap "Create a pool" in Settings, give it a
            name, and share the invite code with your group.
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            As the organizer, you can:
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Manage members (promote, demote, remove)
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Send broadcasts to your pool (up to 3/day)
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Edit pool name and settings
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Archive the pool when the season ends
          </Text>
        </AccordionSection>

        <AccordionSection title="Joining a Pool" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            To join a pool, you need an invite code from the organizer. Enter it in
            Settings under "Have an invite code?" or tap a shared invite link.
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Once you join, you immediately start competing from the pool's start
            date. No waiting, no approval needed.
          </Text>
        </AccordionSection>

        <AccordionSection title="SmackTalk" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            Every pool has a SmackTalk feed — a chat for trash talk, reactions, and
            bragging rights. Messages from the last 14 days are visible.
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            SmackTalk is what makes HotPick social. Use it. Your future self will
            thank you when you called that upset in Week 4.
          </Text>
        </AccordionSection>

        <AccordionSection title="Scoring & Leaderboards" colors={colors}>
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
            {'\u2022'} Pool leaderboard: your rank within each pool
          </Text>
          <Text style={[styles.body, {color: colors.textSecondary, marginTop: spacing.sm}]}>
            Each pool's leaderboard has two views — a weekly breakdown and a
            season-long race. Both are always available.
          </Text>
        </AccordionSection>

        <AccordionSection title="Pricing" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            HotPick is free to play. Organizers pay based on pool size:
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
            Only the pool organizer pays. Everyone else plays for free. Pricing is
            per pool, per season.
          </Text>
          <Text style={[styles.body, {color: colors.primary, marginTop: spacing.sm, fontWeight: '600'}]}>
            Founding 100 pools are free forever, regardless of size.
          </Text>
        </AccordionSection>

        <AccordionSection title="Season Phases" colors={colors}>
          <Text style={[styles.body, {color: colors.textSecondary}]}>
            The NFL season moves through phases:
          </Text>
          <Text style={[styles.bulletItem, {color: colors.textSecondary}]}>
            {'\u2022'} Pre-Season: set up your profile and pools
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
