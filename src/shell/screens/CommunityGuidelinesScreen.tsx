import React from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ChevronLeft} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

const GUIDELINES = [
  {
    title: 'Keep it fun',
    body: 'SmackTalk is for friendly trash talk, bold predictions, and celebrating great picks. Keep the energy competitive — not hostile.',
  },
  {
    title: 'Respect everyone',
    body: 'No harassment, personal attacks, hate speech, or discriminatory language of any kind. Attack the pick, not the person.',
  },
  {
    title: 'No real-money talk',
    body: 'HotPick is for bragging rights only. Do not use SmackTalk or any pool feature to organize, promote, or facilitate financial arrangements between users.',
  },
  {
    title: 'No spam or self-promotion',
    body: 'No advertisements, links to external sites, or repeated messages. Keep conversations relevant to your pool.',
  },
  {
    title: 'Protect privacy',
    body: 'Do not share other people\'s personal information. What happens in the pool stays in the pool.',
  },
  {
    title: 'Report, don\'t retaliate',
    body: 'If you see something that violates these guidelines, use the Report option (long-press any message). Pool organizers and admins review all reports. You can also block users to hide their messages.',
  },
];

export function CommunityGuidelinesScreen() {
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
        <Text style={[styles.headerTitle, {color: colors.textPrimary}]}>Community Guidelines</Text>
        <View style={{width: 24}} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}>
        <Text style={[styles.intro, {color: colors.textSecondary}]}>
          HotPick pools are communities built on friendly competition. These guidelines keep SmackTalk fun for everyone.
        </Text>

        {GUIDELINES.map((g, i) => (
          <View key={i} style={[styles.card, {backgroundColor: colors.surface}]}>
            <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{g.title}</Text>
            <Text style={[styles.cardBody, {color: colors.textSecondary}]}>{g.body}</Text>
          </View>
        ))}

        <Text style={[styles.footer, {color: colors.textSecondary}]}>
          Violations may result in message removal, temporary muting, or removal from a pool at the organizer's discretion. Repeated violations may result in account suspension.
        </Text>
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
    fontSize: 17,
    fontWeight: '600',
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
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
});
