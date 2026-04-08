import React from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ArrowLeft} from 'lucide-react-native';
import {spacing} from '@shared/theme';
import {useTheme} from '@shell/theme';

/* ─── tiny helper components ─── */

const H1 = ({children, s}: {children: string; s: any}) => (
  <Text style={s.h1}>{children}</Text>
);
const H2 = ({children, s}: {children: string; s: any}) => (
  <Text style={s.h2}>{children}</Text>
);
const H3 = ({children, s}: {children: string; s: any}) => (
  <Text style={s.h3}>{children}</Text>
);
const P = ({children, s}: {children: string; s: any}) => (
  <Text style={s.p}>{children}</Text>
);
const Bullet = ({children, s}: {children: string; s: any}) => (
  <View style={s.bulletRow}>
    <Text style={s.bulletDot}>•</Text>
    <Text style={[s.p, {flex: 1}]}>{children}</Text>
  </View>
);
const Row = ({label, value, s}: {label: string; value: string; s: any}) => (
  <View style={s.tableRow}>
    <Text style={[s.tableCell, s.tableCellLabel]}>{label}</Text>
    <Text style={[s.tableCell, s.tableCellValue]}>{value}</Text>
  </View>
);

export function PrivacyPolicyScreen({navigation}: any) {
  const {colors} = useTheme();
  const s = createStyles(colors);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Privacy Policy</Text>
        <View style={s.backButton} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Title block */}
        <H1 s={s}>HOTPICK SPORTS</H1>
        <H2 s={s}>Privacy Policy</H2>
        <P s={s}>{'Effective Date: March 15, 2026  \u2022  Version 1.0'}</P>
        <P s={s}>Last Updated: March 15, 2026</P>

        {/* 1 */}
        <H2 s={s}>SECTION 1. WHO WE ARE</H2>
        <P s={s}>
          {'HotPick Sports, Inc. ("HotPick," "we," "us," or "our") is a Delaware corporation with its principal place of business at 1148 Michigan Ave., Buffalo, NY 14209. We operate the HotPick Sports mobile application (the "App" or "Platform"), a sports prediction platform where users make picks on game outcomes, designate a HotPick, and compete within social groups called Pools.'}
        </P>
        <P s={s}>
          This Privacy Policy describes what personal information we collect when you use the App, how we use and protect that information, who we share it with, and the rights you have over your data. By creating an account and checking the acceptance checkbox, you agree to the practices described in this Policy. That checkbox requires you to affirmatively confirm that you are 18 or older and agree to our Terms of Service and this Privacy Policy. The timestamp and version of your acceptance are recorded in our systems.
        </P>
        <P s={s}>
          HotPick is not a gambling product. No real money is wagered between users. We do not collect payment card information from end users.
        </P>

        <H3 s={s}>Privacy Officer</H3>
        <P s={s}>
          {'HotPick Sports, Inc.\u2019s designated Privacy Officer is Thomas P. McDade, Founder and CEO. The Privacy Officer is responsible for overseeing compliance with this Privacy Policy and applicable privacy law. The Privacy Officer can be reached at privacy@hotpicksports.com.'}
        </P>

        {/* 2 */}
        <H2 s={s}>SECTION 2. INFORMATION WE COLLECT</H2>

        <H3 s={s}>2.1 Information You Provide at Sign-Up</H3>
        <P s={s}>When you create an account, you provide the following information:</P>
        <Bullet s={s}>Email address: Required. Used for account authentication, transactional notifications, and account recovery. If you use Apple Hide My Email, we receive and store the Apple-generated relay address only.</Bullet>
        <Bullet s={s}>First name: Required. Displayed on Leaderboards and in SmackTalk unless you switch to your Poolie Name.</Bullet>
        <Bullet s={s}>{'Last name: Optional. If provided, displayed only as an initial (e.g., "Tom M.") and never in full to other users.'}</Bullet>
        <Bullet s={s}>Poolie Name: Optional. A persona or nickname used in Pools.</Bullet>
        <Bullet s={s}>Profile avatar: Optional. Either a system avatar you select or a photo you upload.</Bullet>

        <H3 s={s}>2.2 Information Collected Automatically During App Use</H3>
        <Bullet s={s}>Picks and HotPick designations: Your game predictions and high-conviction picks. Stored at the account level (not tied to any specific Pool).</Bullet>
        <Bullet s={s}>Frozen Ranks: The competitiveness rank assigned to a game at the Pick deadline. Stored immutably.</Bullet>
        <Bullet s={s}>{'Scores and point totals: Computed server-side by HotPick\u2019s scoring engine.'}</Bullet>
        <Bullet s={s}>Timezone: Auto-detected from your device at sign-up. Used only to display Pick deadlines and game times in your local time.</Bullet>
        <Bullet s={s}>Device push notification token: Generated by your device when you grant push notification permission. Deactivated on logout or delivery failure.</Bullet>
        <Bullet s={s}>Device platform (iOS / Android): Used to route notifications to the correct provider.</Bullet>
        <Bullet s={s}>App interaction events: Actions such as Picks submitted, Pools joined, screens visited, and SmackTalk messages sent. Raw event logs are retained for 90 days and then deleted.</Bullet>
        <Bullet s={s}>TOS acceptance timestamp and version: Written to our database immediately after your acceptance.</Bullet>
        <Bullet s={s}>Referral code: Auto-generated at sign-up. Used internally to track referral attribution.</Bullet>

        <H3 s={s}>2.3 Information From Third-Party Sign-In</H3>
        <P s={s}>
          {'If you sign in with Apple or Google, those services may share your name and email address with us. If you use Apple\u2019s Hide My Email feature, we receive and store only the Apple-generated relay address. We do not receive or store your Apple or Google password.'}
        </P>

        <H3 s={s}>2.4 SmackTalk Messages</H3>
        <P s={s}>
          SmackTalk is our in-app social messaging feature. Messages you post in a Pool are visible to all Members of that Pool. Messages older than 14 days are automatically moved to a permanent archive. Archived messages are retained indefinitely as part of our Aggregate Data corpus. Upon account deletion, your identity is removed from archived messages, but the messages themselves are retained in anonymized form.
        </P>

        <H3 s={s}>2.5 What We Do Not Collect</H3>
        <P s={s}>HotPick does not collect:</P>
        <Bullet s={s}>Payment card numbers, bank account information, or any financial credentials.</Bullet>
        <Bullet s={s}>Precise device location or GPS coordinates.</Bullet>
        <Bullet s={s}>Contacts, address book, or social graph data from your device.</Bullet>
        <Bullet s={s}>Health, fitness, or biometric data of any kind.</Bullet>
        <Bullet s={s}>Government-issued identification or Social Security numbers.</Bullet>
        <Bullet s={s}>Data from other apps on your device.</Bullet>

        {/* 3 */}
        <H2 s={s}>SECTION 3. HOW WE USE YOUR INFORMATION</H2>
        <P s={s}>We use the information we collect to:</P>
        <Bullet s={s}>Create, authenticate, and maintain your account.</Bullet>
        <Bullet s={s}>Process your Picks, compute your scores server-side, and display your results on Leaderboards.</Bullet>
        <Bullet s={s}>Enable SmackTalk messaging within your Pools.</Bullet>
        <Bullet s={s}>Send push notifications for Pick deadlines, game outcomes, score updates, Drama Digest summaries, and Pool activity.</Bullet>
        <Bullet s={s}>Display Pick deadlines and game times in your local timezone.</Bullet>
        <Bullet s={s}>Generate Drama Digest pool and season narrative summaries using your performance data.</Bullet>
        <Bullet s={s}>Detect and prevent fraud, abuse, and violations of our Terms of Service.</Bullet>
        <Bullet s={s}>Analyze platform usage to improve the App and develop new features.</Bullet>
        <Bullet s={s}>Create and commercialize Aggregate Data as described in Section 7.</Bullet>
        <Bullet s={s}>Comply with legal obligations and enforce our Terms of Service.</Bullet>
        <P s={s}>
          We do not use your personal information to build advertising profiles, serve targeted advertising, or sell your personal information to third parties.
        </P>

        {/* 4 */}
        <H2 s={s}>{'SECTION 4. HOW PICKS AND SCORES WORK \u2014 AND WHY IT MATTERS FOR PRIVACY'}</H2>
        <P s={s}>
          {'HotPick\u2019s core architecture is account-level scoring: your Picks and scores are stored at your account level, not inside any specific Pool. A Pool is a social lens on your account-level data. This architecture has the following privacy implications:'}
        </P>
        <Bullet s={s}>If you belong to multiple Pools, the same Pick and score data appears on all relevant Leaderboards.</Bullet>
        <Bullet s={s}>When you delete your account, your identity is removed from all Pools simultaneously.</Bullet>
        <Bullet s={s}>Pool members can see your Leaderboard position, Picks (after the Pick deadline passes), and score within any shared Pool.</Bullet>
        <Bullet s={s}>The Global Pool is a platform-wide Pool that all users are automatically enrolled in upon account creation.</Bullet>

        {/* 5 */}
        <H2 s={s}>SECTION 5. HOW WE SHARE YOUR INFORMATION</H2>
        <P s={s}>
          HotPick does not sell your personal information. We share it only as described below.
        </P>

        <H3 s={s}>5.1 Within Pools</H3>
        <P s={s}>
          Your display name, avatar, Picks (after the Pick deadline), scores, and Leaderboard rank are visible to Members of any Pool you belong to.
        </P>

        <H3 s={s}>5.2 Service Providers (Data Processors)</H3>
        <P s={s}>We share data with the following third-party service providers:</P>
        <Bullet s={s}>Supabase (via AWS): Cloud database, authentication, file storage, and real-time messaging infrastructure.</Bullet>
        <Bullet s={s}>Apple (Sign In with Apple): OAuth authentication.</Bullet>
        <Bullet s={s}>Google (Sign In with Google): OAuth authentication.</Bullet>
        <Bullet s={s}>Expo / Expo Push Notifications: Push notification delivery infrastructure.</Bullet>

        <H3 s={s}>{'5.3 Sports Data APIs \u2014 No User Data Shared'}</H3>
        <P s={s}>
          The App uses the ESPN API and The Odds API. We do not transmit any personal information to these providers. Data flows one direction only: from these APIs to our servers.
        </P>

        <H3 s={s}>5.4 White Label Partners</H3>
        <P s={s}>
          White Label Partners do not receive access to your personal account data, individual Picks, or scores. All data within White Label Partner Pools continues to be governed exclusively by this Privacy Policy.
        </P>

        <H3 s={s}>5.5 Legal Requirements</H3>
        <P s={s}>
          We may disclose your information if required by applicable law, subpoena, court order, or government demand.
        </P>

        <H3 s={s}>5.6 Business Transfers</H3>
        <P s={s}>
          If HotPick Sports, Inc. is acquired by, merged with, or sells substantially all of its assets to another entity, your personal information and Aggregate Data may be transferred to the acquiring entity as a business asset.
        </P>

        {/* 6 */}
        <H2 s={s}>SECTION 6. DATA RETENTION</H2>
        <Row s={s} label="Account data" value="Retained while account is active. Anonymized immediately upon account deletion." />
        <Row s={s} label="Picks and scores" value="Retained indefinitely in anonymized form after account deletion." />
        <Row s={s} label="SmackTalk messages (active feed)" value="14 days in active feed, then archived." />
        <Row s={s} label="SmackTalk messages (archive)" value="Retained indefinitely in anonymized form." />
        <Row s={s} label="Push notification tokens" value="Per active device. Deactivated on logout. Removed on account deletion." />
        <Row s={s} label="App interaction events (raw)" value="90 days, then deleted." />
        <Row s={s} label="Aggregated metrics" value="Retained indefinitely as Aggregate Data." />
        <Row s={s} label="TOS acceptance records" value="Retained indefinitely." />
        <Row s={s} label="Auth logs (Supabase)" value="90 days." />
        <Row s={s} label="Aggregate Data" value="Retained indefinitely." />

        {/* 7 */}
        <H2 s={s}>SECTION 7. AGGREGATE DATA</H2>

        <H3 s={s}>7.1 What Aggregate Data Is</H3>
        <P s={s}>
          {'When data from many users is combined, anonymized, and processed statistically, it produces "Aggregate Data." Aggregate Data describes patterns across the Platform, not any individual user. Examples include:'}
        </P>
        <Bullet s={s}>The percentage of users who picked a particular team in a given week.</Bullet>
        <Bullet s={s}>Distribution of HotPick designations across game rank levels.</Bullet>
        <Bullet s={s}>Prediction accuracy trends by game type, week, or season.</Bullet>
        <Bullet s={s}>Platform engagement patterns.</Bullet>
        <Bullet s={s}>SmackTalk sentiment trends related to sporting events.</Bullet>
        <Bullet s={s}>Pool formation and growth patterns across the Platform.</Bullet>

        <H3 s={s}>7.2 How We Use and License Aggregate Data</H3>
        <P s={s}>
          HotPick Sports, Inc. owns all Aggregate Data derived from Platform activity. We use and may license Aggregate Data for:
        </P>
        <Bullet s={s}>Operating, maintaining, and improving the Platform.</Bullet>
        <Bullet s={s}>Training, developing, and improving AI and machine learning models.</Bullet>
        <Bullet s={s}>Research and internal analytics.</Bullet>
        <Bullet s={s}>Licensing to third parties, including sports media companies, broadcasters, data analytics providers, and research organizations.</Bullet>
        <Bullet s={s}>Any other commercial or non-commercial purpose consistent with our Terms of Service.</Bullet>

        <H3 s={s}>7.3 SmackTalk Archive as Aggregate Data</H3>
        <P s={s}>
          {'SmackTalk messages archived pursuant to Section 2.4 form part of HotPick\u2019s Aggregate Data corpus.'}
        </P>

        <H3 s={s}>7.4 Anonymization and Non-Identification</H3>
        <P s={s}>
          Before any Aggregate Data is used externally or commercially, it is processed to remove all information that could reasonably identify an individual user.
        </P>

        <H3 s={s}>7.5 Aggregate Data Is Not a Sale of Personal Information</H3>
        <P s={s}>
          {'The commercial licensing of Aggregate Data does not constitute a "sale" of personal information as defined under the CCPA.'}
        </P>

        <H3 s={s}>7.6 What Happens to Your Data When You Delete Your Account</H3>
        <P s={s}>
          When you delete your account, your name, email address, Poolie Name, avatar, and all other identifying information are permanently and irreversibly removed. Your Picks, scores, and SmackTalk messages are anonymized and retained as part of the historical record and Aggregate Data corpus.
        </P>

        {/* 8 */}
        <H2 s={s}>SECTION 8. YOUR RIGHTS AND CHOICES</H2>

        <H3 s={s}>8.1 Access and Correction</H3>
        <P s={s}>
          You can view and update most of your account information at any time in Profile Settings within the App.
        </P>

        <H3 s={s}>8.2 Push Notifications</H3>
        <P s={s}>
          You can enable or disable individual push notification categories in Settings within the App.
        </P>

        <H3 s={s}>8.3 Account Deletion</H3>
        <P s={s}>
          {'You can permanently delete your account at any time through Profile Settings > Account > Delete Account. When you delete your account:'}
        </P>
        <Bullet s={s}>Your name, email, Poolie Name, and profile photo are permanently removed;</Bullet>
        <Bullet s={s}>Your account is anonymized;</Bullet>
        <Bullet s={s}>Your Picks and scores are retained in anonymized form;</Bullet>
        <Bullet s={s}>Your SmackTalk messages are dissociated from your identity;</Bullet>
        <Bullet s={s}>Your push notification tokens are deactivated; and</Bullet>
        <Bullet s={s}>Aggregate Data derived from your activity is retained as described in Section 7.</Bullet>
        <P s={s}>Account deletion cannot be undone.</P>

        <H3 s={s}>8.4 Data Export</H3>
        <P s={s}>
          Contact us at privacy@hotpicksports.com. We will respond within 45 days.
        </P>

        {/* 9 */}
        <H2 s={s}>SECTION 9. ADDITIONAL RIGHTS FOR CALIFORNIA RESIDENTS (CCPA)</H2>
        <P s={s}>
          California residents have the following rights under the CCPA and CPRA:
        </P>
        <Bullet s={s}>Right to Know: Request information about personal information collected.</Bullet>
        <Bullet s={s}>Right to Delete: Request deletion via the App or privacy@hotpicksports.com.</Bullet>
        <Bullet s={s}>Right to Correct: Correct information in Profile Settings or contact us.</Bullet>
        <Bullet s={s}>{'Right to Opt Out of Sale or Sharing: HotPick does not sell personal information.'}</Bullet>
        <Bullet s={s}>{'Right to Limit Use of Sensitive Personal Information: Not applicable \u2014 we do not collect sensitive personal information.'}</Bullet>
        <Bullet s={s}>Right to Non-Discrimination: We will not discriminate against you for exercising your rights.</Bullet>
        <P s={s}>
          Contact privacy@hotpicksports.com to exercise your California privacy rights. We will respond within 45 days.
        </P>

        {/* 10 */}
        <H2 s={s}>SECTION 10. ADDITIONAL INFORMATION FOR CANADIAN USERS</H2>
        <P s={s}>
          HotPick is available to residents of Canada. By using the App, you consent to your personal information being transferred to and processed in the United States.
        </P>

        <H3 s={s}>10.1 Federal Rights (PIPEDA)</H3>
        <P s={s}>
          Canadian users have rights under PIPEDA. Contact privacy@hotpicksports.com.
        </P>

        <H3 s={s}>{'10.2 Quebec Residents \u2014 Loi 25 (Law 25)'}</H3>
        <Bullet s={s}>Privacy Officer: Thomas P. McDade. Contact privacy@hotpicksports.com.</Bullet>
        <Bullet s={s}>Right of Access and Correction: Requests responded to within 30 days.</Bullet>
        <Bullet s={s}>Right to Withdraw Consent: Delete your account as described in Section 8.3.</Bullet>
        <Bullet s={s}>Cross-Border Data Transfers: Data processed in the United States with contractual safeguards.</Bullet>
        <Bullet s={s}>Privacy Impact Assessments: Conducted for core data processing infrastructure.</Bullet>
        <Bullet s={s}>Privacy Incidents: Notification to CAI and affected individuals as required by Law 25.</Bullet>
        <Bullet s={s}>Language: French version available upon request to privacy@hotpicksports.com.</Bullet>

        <H3 s={s}>10.3 Commercial Email (CASL)</H3>
        <P s={s}>
          We comply with CASL for commercial electronic messages sent to Canadian users.
        </P>

        {/* 11 */}
        <H2 s={s}>SECTION 11. DATA SECURITY</H2>
        <P s={s}>We implement technical and organizational measures including:</P>
        <Bullet s={s}>Authentication via Supabase Auth with persistent session management and OAuth integration.</Bullet>
        <Bullet s={s}>Row-Level Security (RLS) enforced at the database level.</Bullet>
        <Bullet s={s}>All scoring computation runs server-side in Edge Functions.</Bullet>
        <Bullet s={s}>Push notification tokens deactivated on logout or delivery failure.</Bullet>
        <Bullet s={s}>Data stored on AWS-managed infrastructure with encryption in transit and at rest.</Bullet>
        <P s={s}>
          No method of transmission over the internet is 100% secure. Contact privacy@hotpicksports.com if you believe your account has been compromised.
        </P>

        {/* 12 */}
        <H2 s={s}>{'SECTION 12. CHILDREN\u2019S PRIVACY'}</H2>
        <P s={s}>
          The Platform is intended exclusively for users who are 18 years of age or older. We do not knowingly collect personal information from anyone under 18. If we discover a user is under 18, we will terminate that account immediately. Contact privacy@hotpicksports.com if you believe we have collected information from a minor.
        </P>

        {/* 13 */}
        <H2 s={s}>SECTION 13. CHANGES TO THIS PRIVACY POLICY</H2>
        <P s={s}>
          When we make material changes, we will update the version number and effective date and notify you through the App on your next login, requiring affirmative re-acceptance.
        </P>

        {/* 14 */}
        <H2 s={s}>SECTION 14. PLANNED FUTURE CHANGES AFFECTING THIS POLICY</H2>
        <P s={s}>The following planned changes will require updates:</P>
        <Bullet s={s}>Stripe billing for Organizer Access: Stripe will be added as a data processor.</Bullet>
        <Bullet s={s}>Drama Digest AI commentary: Section 3 and Section 7 will be updated.</Bullet>
        <Bullet s={s}>Expansion to EU or international markets: A full GDPR section will be required.</Bullet>
        <Bullet s={s}>Global Leaderboard or public profile features: Section 4 and Section 8 will be updated.</Bullet>
        <Bullet s={s}>White Label Partner data access: Section 5.4 will be updated.</Bullet>

        {/* 15 */}
        <H2 s={s}>SECTION 15. CONTACT US</H2>
        <P s={s}>
          HotPick Sports, Inc.{'\n'}
          Attn: Privacy Officer{'\n'}
          1148 Michigan Ave.{'\n'}
          Buffalo, NY 14209
        </P>
        <P s={s}>Email: privacy@hotpicksports.com</P>
        <P s={s}>
          California residents may also contact the CPPA at cppa.ca.gov. Quebec residents may contact the CAI at cai.gouv.qc.ca.
        </P>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            {'HotPick Sports Privacy Policy \u2014 Version 1.0 \u2014 Effective March 15, 2026'}
          </Text>
          <Text style={s.footerText}>
            {'\u00A9 2026 HotPick Sports, Inc. All rights reserved.'}
          </Text>
          <Text style={s.footerText}>
            https://hotpicksports.com/privacy
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 40,
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: spacing.lg,
      paddingBottom: 60,
    },
    h1: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    h2: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 28,
      marginBottom: 12,
    },
    h3: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 20,
      marginBottom: 8,
    },
    p: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.textPrimary,
      marginBottom: 12,
    },
    bulletRow: {
      flexDirection: 'row',
      paddingLeft: 8,
      marginBottom: 8,
    },
    bulletDot: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.textSecondary,
      marginRight: 10,
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      paddingVertical: 10,
      marginBottom: 2,
    },
    tableCell: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.textPrimary,
    },
    tableCellLabel: {
      flex: 1,
      fontWeight: '600',
      paddingRight: 12,
    },
    tableCellValue: {
      flex: 2,
      color: colors.textSecondary,
    },
    footer: {
      marginTop: 32,
      paddingTop: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      alignItems: 'center',
    },
    footerText: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 4,
    },
  });
