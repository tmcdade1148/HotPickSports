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
        <H1 s={s}>HotPick Sports, Inc.</H1>
        <H2 s={s}>Privacy Policy</H2>
        <P s={s}>Effective Date: 10/10/25</P>
        <P s={s}>Version 1.0 | DRAFT FOR ATTORNEY REVIEW</P>

        {/* 1 */}
        <H2 s={s}>1. Who We Are</H2>
        <P s={s}>
          HotPick Sports, Inc. ("HotPick," "we," "us," or "our") is a Delaware
          corporation with principal operations in Buffalo, NY. We operate the
          HotPick Sports mobile application (the "App" or "Platform"), a sports
          prediction platform where users make picks on game outcomes, designate
          a HotPick, and compete within social groups called pools.
        </P>
        <P s={s}>
          This Privacy Policy describes what personal information we collect when
          you use the App, how we use and protect that information, who we share
          it with, and the rights you have over your data. By creating an account
          and checking the acceptance checkbox, you agree to the practices
          described in this Policy. That checkbox requires you to affirmatively
          confirm that you are 18 or older and agree to our Terms of Service and
          this Privacy Policy. The time and version of your acceptance are
          recorded in our systems.
        </P>
        <P s={s}>
          HotPick is not a gambling product. No real money is wagered between
          users. We do not collect payment information from users.
        </P>

        {/* 2 */}
        <H2 s={s}>2. Information We Collect</H2>

        <H3 s={s}>2.1 Information You Provide Directly</H3>
        <P s={s}>When you create an account, you provide:</P>
        <Row s={s} label="Email address" value="Required. Used for account authentication (magic link or OAuth relay address), transactional notifications, and account recovery. If you use Apple Hide My Email, we receive and store the Apple relay address only." />
        <Row s={s} label="First name" value="Required. Displayed on leaderboards and in SmackTalk (unless you switch to your Poolie Name)." />
        <Row s={s} label="Last name" value="Optional. If provided, displayed only as an initial (e.g., Tom M.) and never in full." />
        <Row s={s} label="Poolie Name" value="Optional. A persona or nickname used in pools. Duplicates are permitted — it is a display name, not a unique identifier." />
        <Row s={s} label="Profile avatar" value="Optional. Either a system avatar you select or a photo you upload. Stored in our file storage and displayed to pool members." />

        <H3 s={s}>2.2 Information We Collect Automatically</H3>
        <P s={s}>When you use the App, we collect:</P>
        <Row s={s} label="Picks and HotPick designations" value="Your game predictions and high-conviction picks. Stored at the account level, not tied to any specific pool. Used to compute your scores and display your leaderboard position." />
        <Row s={s} label="Frozen Ranks" value="The competitiveness rank assigned to a game at the pick deadline. Stored immutably alongside your pick and used to compute point multipliers. You cannot alter a Frozen Rank." />
        <Row s={s} label="Scores" value="Computed server-side by HotPick's scoring engine based on your picks and actual game outcomes. The client app displays scores; it never computes them." />
        <Row s={s} label="Timezone" value="Auto-detected from your device at sign-up. Used only to display pick deadlines and game times in your local time. Never shown as a configurable setting." />
        <Row s={s} label="Device push notification token" value="Generated by your device when you grant push notification permission. Stored in our systems (one token per device). Used to send pick deadline reminders, score updates, and pool notifications. Deactivated when you log out or if delivery fails." />
        <Row s={s} label="App interaction events" value="Actions such as picks submitted, pools joined, screens visited, and SmackTalk messages sent. Used for product analytics and to improve the App. No advertising profiles are built from this data." />
        <Row s={s} label="Platform identifier" value="iOS or Android. Used to analyze platform-specific behavior patterns." />

        <H3 s={s}>2.3 Information From Third-Party Sign-In</H3>
        <P s={s}>
          If you sign in with Apple or Google, those services may share your name
          and email address with us. If you use Apple's Hide My Email feature, we
          receive and store only the Apple-generated relay address — we never see
          or store your real Apple ID email. We do not receive or store your Apple
          or Google password. Your use of these sign-in services is governed by
          Apple's and Google's respective privacy policies.
        </P>

        <H3 s={s}>2.4 SmackTalk Messages</H3>
        <P s={s}>
          SmackTalk is our in-app social messaging feature. Messages you post in
          a pool are visible to all members of that pool. SmackTalk messages are
          pool-scoped — they are never visible across pools. We collect and store
          your messages to operate this feature.
        </P>
        <P s={s}>
          Messages older than 14 days are moved to an archive. Archived messages
          are retained by HotPick for analytics, platform improvement, and as
          part of our aggregate data corpus (see Section 7). They are not
          displayed to users through the App after archiving.
        </P>

        <H3 s={s}>2.5 What We Do Not Collect</H3>
        <P s={s}>HotPick does not collect:</P>
        <Bullet s={s}>Payment card numbers, bank account information, or any financial account credentials. Organizer subscription fees (where applicable) are processed by our payment processor; we do not handle or store raw payment card data.</Bullet>
        <Bullet s={s}>Precise device location (GPS). We infer your approximate region from timezone data only.</Bullet>
        <Bullet s={s}>Contacts, address book, or social graph data.</Bullet>
        <Bullet s={s}>Health or fitness information.</Bullet>
        <Bullet s={s}>Biometric data of any kind.</Bullet>
        <Bullet s={s}>Any data from other apps on your device.</Bullet>

        {/* 3 */}
        <H2 s={s}>3. How We Use Your Information</H2>
        <P s={s}>We use the information we collect to:</P>
        <Bullet s={s}>Create, authenticate, and maintain your account.</Bullet>
        <Bullet s={s}>Process your picks, compute your scores server-side, and display your results on leaderboards.</Bullet>
        <Bullet s={s}>Enable SmackTalk messaging within your pools.</Bullet>
        <Bullet s={s}>Send push notifications for pick deadlines, game outcomes, score updates, Drama Digest summaries, and pool activity. You can manage notification preferences in Settings.</Bullet>
        <Bullet s={s}>Display pick deadlines and game times in your local timezone.</Bullet>
        <Bullet s={s}>Generate pool and season narrative summaries (Drama Digest) using your performance data, computed server-side using deterministic templates.</Bullet>
        <Bullet s={s}>Detect and prevent fraud, abuse, and violations of our Terms of Service.</Bullet>
        <Bullet s={s}>Analyze platform usage to improve the App and develop new features.</Bullet>
        <Bullet s={s}>Create and commercialize Aggregate Data as described in Section 7.</Bullet>
        <Bullet s={s}>Comply with legal obligations and enforce our Terms of Service.</Bullet>
        <P s={s}>
          We do not use your personal information to build advertising profiles,
          serve targeted advertising, or sell your personal information to third
          parties.
        </P>

        {/* 4 */}
        <H2 s={s}>4. How Picks and Scores Work (and Why It Matters for Privacy)</H2>
        <P s={s}>
          HotPick's core architecture is pool-independent scoring: your picks and
          scores are stored at your account level, not inside any specific pool.
          A pool is a social lens on your account-level data. This means:
        </P>
        <Bullet s={s}>If you belong to multiple pools, the same pick and score data appears on all relevant leaderboards.</Bullet>
        <Bullet s={s}>When you delete your account, your identity is removed from all pools simultaneously.</Bullet>
        <Bullet s={s}>Pool members can see your leaderboard position, picks (after the pick deadline passes), and score within any shared pool. They cannot see your picks in other pools they do not belong to.</Bullet>
        <Bullet s={s}>The Global Pool is a platform-wide pool all users are enrolled in automatically. Your leaderboard position in the Global Pool is visible to all HotPick users.</Bullet>

        {/* 5 */}
        <H2 s={s}>5. How We Share Your Information</H2>
        <P s={s}>
          HotPick does not sell your personal information. We share it only as
          described below.
        </P>

        <H3 s={s}>5.1 Within Pools</H3>
        <P s={s}>
          Your display name (first name or Poolie Name, per your preference),
          avatar, picks (after the pick deadline), scores, and leaderboard rank
          are visible to members of any pool you belong to. This visibility is a
          core function of the App. Your picks are not visible to pool members
          until after the pick deadline for that round has passed.
        </P>

        <H3 s={s}>5.2 Service Providers (Data Processors)</H3>
        <P s={s}>
          We share data with the following third-party providers who process it
          on our behalf:
        </P>
        <Row s={s} label="Supabase (via AWS)" value="Cloud database, authentication, file storage, and real-time messaging. Your account data, picks, scores, and SmackTalk messages are stored on Supabase-managed infrastructure hosted on AWS in the United States." />
        <Row s={s} label="Branch.io" value="Deep link and invite link management. When you share or tap a pool invite link, Branch.io processes metadata (device type, link clicked, install attribution) to ensure the invite is correctly credited. Branch.io does not receive your pick or score data." />
        <Row s={s} label="Apple (Sign In with Apple)" value="Authentication. Governed by Apple's privacy policy." />
        <Row s={s} label="Google (Sign In with Google)" value="Authentication. Governed by Google's privacy policy." />
        <Row s={s} label="Expo (React Native)" value="Push notification delivery infrastructure. Your push notification token is used to route notifications to your device. Expo does not receive your pick or score data." />

        <H3 s={s}>5.3 Sports Data APIs (No User Data Shared)</H3>
        <P s={s}>
          The App uses the ESPN API to retrieve game schedules and scores, and
          The Odds API to obtain publicly available betting-line data used to
          calculate game ranks. We do not transmit any personal information or
          pick data to these providers. Data flows one direction: from these APIs
          to our servers.
        </P>

        <H3 s={s}>5.4 White Label Partners</H3>
        <P s={s}>
          HotPick supports branded pool experiences for organizational partners
          (e.g., sports clubs or media companies). If you join a pool operated by
          a partner, that partner's branding will appear in your pool experience.
          Partners do not receive access to your personal account data, picks, or
          scores. They may see aggregate pool-level statistics. All data
          continues to be governed by this Privacy Policy.
        </P>

        <H3 s={s}>5.5 Legal Requirements</H3>
        <P s={s}>
          We may disclose your information if required by law, subpoena, court
          order, or government demand, or if we believe disclosure is necessary
          to protect the rights, property, or safety of HotPick, our users, or
          others, or to enforce our Terms of Service.
        </P>

        <H3 s={s}>5.6 Business Transfers</H3>
        <P s={s}>
          If HotPick Sports, Inc. is acquired by, merged with, or sells
          substantially all of its assets to another entity, your personal
          information and Aggregate Data may be transferred to the acquiring
          entity as a business asset. We will notify you via the App or email
          before your information becomes subject to a materially different
          privacy policy, and you will have the opportunity to delete your
          account at that time.
        </P>

        {/* 6 */}
        <H2 s={s}>6. Data Retention</H2>
        <Row s={s} label="Account data (name, email, avatar)" value="Retained while your account is active. Anonymized when you delete your account." />
        <Row s={s} label="Picks and scores" value="Retained indefinitely in anonymized form after account deletion to preserve pool and leaderboard integrity." />
        <Row s={s} label="SmackTalk messages (active feed)" value="Visible in active pool feed for 14 days. Messages associated with your identity are removed on account deletion." />
        <Row s={s} label="SmackTalk messages (archive)" value="Archived messages older than 14 days are retained as part of our data corpus. Anonymized on account deletion." />
        <Row s={s} label="Push notification tokens" value="Retained per active device. Deactivated on logout or delivery failure. Removed on account deletion." />
        <Row s={s} label="App interaction events" value="Retained in aggregate form for product analytics. Individual event logs reviewed periodically for retention." />
        <Row s={s} label="Aggregate Data" value="Retained indefinitely as described in Section 7." />

        {/* 7 */}
        <H2 s={s}>7. Aggregate Data</H2>

        <H3 s={s}>7.1 What Aggregate Data Is</H3>
        <P s={s}>
          When data from many users is combined, anonymized, and processed
          statistically, it produces a category of information that HotPick
          calls Aggregate Data. Aggregate Data describes patterns across the
          platform, not any individual user.
        </P>
        <P s={s}>Examples of Aggregate Data include:</P>
        <Bullet s={s}>The percentage of users who picked a particular team in a given week.</Bullet>
        <Bullet s={s}>Distribution of HotPick designations across game rank levels.</Bullet>
        <Bullet s={s}>Prediction accuracy trends by game type, week, or season.</Bullet>
        <Bullet s={s}>Platform engagement patterns (weekly pick submission rates, SmackTalk activity levels).</Bullet>
        <Bullet s={s}>Pool formation and growth patterns.</Bullet>
        <Bullet s={s}>SmackTalk sentiment trends related to sporting events.</Bullet>
        <P s={s}>
          Aggregate Data cannot reasonably be used to identify any individual
          user. It is not your personal information.
        </P>

        <H3 s={s}>7.2 How We Use and License Aggregate Data</H3>
        <P s={s}>
          HotPick owns Aggregate Data derived from platform activity. We use and
          may license Aggregate Data for:
        </P>
        <Bullet s={s}>Operating, maintaining, and improving the Platform.</Bullet>
        <Bullet s={s}>Research and analytics.</Bullet>
        <Bullet s={s}>Licensing to third parties including sports media companies, broadcasters, data analytics providers, and research organizations.</Bullet>
        <Bullet s={s}>Training and improving internal data models and algorithms.</Bullet>
        <Bullet s={s}>Any other commercial or non-commercial purpose consistent with our Terms of Service.</Bullet>
        <P s={s}>
          Our Terms of Service (Section 9) contain the contractual provisions
          governing Aggregate Data ownership, licensing, and survival. By using
          the Platform, you agree to those terms.
        </P>

        <H3 s={s}>7.3 What Happens to Your Data When You Delete Your Account</H3>
        <P s={s}>
          When you delete your account, your name, email address, Poolie Name,
          avatar, and all other identifying information are permanently removed.
          Your picks, scores, and SmackTalk messages are anonymized — they are
          stripped of your identity and retained as part of the historical record
          and Aggregate Data corpus. Anonymized data cannot be linked back to
          you.
        </P>

        {/* 8 */}
        <H2 s={s}>8. Your Rights and Choices</H2>

        <H3 s={s}>8.1 Access and Correction</H3>
        <P s={s}>
          You can view and update most of your account information at any time in
          Profile Settings within the App. This includes your first name, last
          name, Poolie Name, avatar, display name preference, and notification
          preferences.
        </P>

        <H3 s={s}>8.2 Push Notifications</H3>
        <P s={s}>
          You can enable or disable push notification categories individually in
          Settings. You can also disable all push notifications through your
          device operating system settings. Disabling notifications does not
          affect your ability to use the App; you will simply not receive push
          alerts.
        </P>

        <H3 s={s}>8.3 Account Deletion</H3>
        <P s={s}>
          You can permanently delete your account at any time through Profile
          Settings {'>'} Account {'>'} Delete Account. Account deletion is a two-step
          process requiring explicit confirmation. When you delete your account:
        </P>
        <Bullet s={s}>Your name, email address, Poolie Name, and profile photo are permanently removed.</Bullet>
        <Bullet s={s}>Your account is anonymized — your identity is replaced with a generic identifier.</Bullet>
        <Bullet s={s}>Your picks and scores are retained in anonymized form to preserve the integrity of historical leaderboards and pool records for other users.</Bullet>
        <Bullet s={s}>Your SmackTalk messages in the active feed are dissociated from your identity.</Bullet>
        <Bullet s={s}>SmackTalk messages in the archive are retained in anonymized form.</Bullet>
        <Bullet s={s}>Your push notification tokens are deactivated.</Bullet>
        <Bullet s={s}>Aggregate Data derived from your activity is retained as described in Section 7.</Bullet>
        <P s={s}>
          Account deletion cannot be undone. HotPick reserves the right to
          retain anonymized data as described above even after account deletion.
        </P>

        <H3 s={s}>8.4 Data Export</H3>
        <P s={s}>
          If you would like a copy of the personal information we hold about you,
          please contact us at privacy@hotpicksports.com. We will respond within
          45 days.
        </P>

        {/* 9 */}
        <H2 s={s}>9. Additional Rights for California Residents (CCPA)</H2>
        <P s={s}>
          If you are a California resident, the California Consumer Privacy Act
          (CCPA) grants you the following rights:
        </P>

        <H3 s={s}>Right to Know</H3>
        <P s={s}>
          You have the right to request information about the categories and
          specific pieces of personal information we have collected about you,
          the sources of that information, our business or commercial purpose for
          collecting it, and the categories of third parties with whom we share
          it. Submit requests to privacy@hotpicksports.com. We will respond
          within 45 days of a verifiable request.
        </P>

        <H3 s={s}>Right to Delete</H3>
        <P s={s}>
          You have the right to request deletion of personal information we have
          collected about you, subject to certain exceptions. You can exercise
          this right directly in the App through Profile Settings {'>'} Account {'>'}{' '}
          Delete Account, or by contacting privacy@hotpicksports.com. See
          Section 8.3 for a full description of what is and is not deleted.
        </P>

        <H3 s={s}>Right to Opt Out of Sale</H3>
        <P s={s}>
          HotPick does not sell personal information as defined under the CCPA.
          The licensing of Aggregate Data described in Section 7 does not
          constitute a sale of personal information because Aggregate Data is
          anonymized and cannot be used to identify any individual.
        </P>

        <H3 s={s}>Right to Non-Discrimination</H3>
        <P s={s}>
          We will not discriminate against you for exercising any of your CCPA
          rights.
        </P>

        <H3 s={s}>How to Submit a Request</H3>
        <P s={s}>
          To exercise your California privacy rights, contact us at
          privacy@hotpicksports.com or write to us at the address in Section 15.
          We will verify your identity before processing your request and will
          respond within 45 days as required by law.
        </P>

        {/* 10 */}
        <H2 s={s}>10. Additional Information for Canadian Users</H2>
        <P s={s}>
          HotPick is available to residents of Canada. By using the App, you
          consent to your information being transferred to and processed in the
          United States, where our servers are located. US privacy law may differ
          from the law in your province.
        </P>
        <P s={s}>
          Canadian users have the right to access the personal information we
          hold about them and to request corrections. Contact
          privacy@hotpicksports.com to exercise these rights.
        </P>

        <H3 s={s}>Commercial Email (CASL)</H3>
        <P s={s}>
          We comply with Canada's Anti-Spam Legislation (CASL) for any commercial
          electronic messages. Transactional messages sent through the App —
          including authentication emails (magic links), pick deadline reminders,
          and score notifications — are exempt from CASL as they are sent in the
          context of your use of the Platform. If we send promotional or
          marketing emails, we will obtain your express consent as required by
          CASL.
        </P>

        <H3 s={s}>Language</H3>
        <P s={s}>
          These Terms are written in English. To the extent applicable law in
          Quebec requires a French version, HotPick Sports, Inc. will provide
          one upon request.
        </P>

        {/* 11 */}
        <H2 s={s}>11. Data Security</H2>
        <P s={s}>
          We implement technical and organizational measures to protect your
          personal information against unauthorized access, alteration,
          disclosure, or destruction. These measures include:
        </P>
        <Bullet s={s}>Authentication via Supabase Auth with persistent session management and OAuth integration.</Bullet>
        <Bullet s={s}>Row-Level Security (RLS) enforced at the database level: each user can only read and write their own data. Leaderboard reads are governed by pool membership, not direct table access.</Bullet>
        <Bullet s={s}>All scoring computation runs server-side in Edge Functions using a service role. The client app never has access to raw scoring logic or other users' unprocessed data.</Bullet>
        <Bullet s={s}>Push notification tokens stored per device and deactivated on logout.</Bullet>
        <Bullet s={s}>Data stored on AWS-managed infrastructure via Supabase.</Bullet>
        <P s={s}>
          No method of transmission over the internet or electronic storage is
          100% secure. While we strive to use commercially acceptable means to
          protect your personal information, we cannot guarantee absolute
          security. If you believe your account has been compromised, contact us
          immediately at privacy@hotpicksports.com.
        </P>

        {/* 12 */}
        <H2 s={s}>12. Children's Privacy</H2>
        <P s={s}>
          The Platform is intended for users who are 18 years of age or older.
          We do not knowingly collect personal information from anyone under 18.
          By creating an account, you affirmatively represent that you are 18 or
          older.
        </P>
        <P s={s}>
          If we discover or have reason to believe that a user is under 18, we
          will terminate that account immediately and delete associated personal
          information. If you believe we have inadvertently collected information
          from a minor, please contact us at privacy@hotpicksports.com and we
          will take prompt action.
        </P>
        <P s={s}>
          Because the Platform is directed at adults 18 and older and we do not
          knowingly collect data from children under 13, the Children's Online
          Privacy Protection Act (COPPA) does not apply to our Platform.
        </P>

        {/* 13 */}
        <H2 s={s}>13. Changes to This Privacy Policy</H2>
        <P s={s}>
          We may update this Privacy Policy from time to time. When we make
          material changes, we will update the version number and effective date
          at the top of this document. For material changes, we will notify you
          through the App on your next login and may also notify you by email.
        </P>
        <P s={s}>
          If we make changes that affect how we use or share your personal
          information in a materially different way, we will provide more
          prominent notice and, where required by law, obtain your consent.
        </P>
        <P s={s}>
          Your continued use of the App after we post updated Privacy Policy
          terms constitutes your acceptance of the updated Policy. If you do not
          agree to the updated Policy, you must stop using the App and may delete
          your account.
        </P>

        {/* 14 */}
        <H2 s={s}>14. Planned Future Changes Affecting This Policy</H2>
        <P s={s}>
          The following future changes will require updates to this Privacy
          Policy. Counsel should be aware of them when drafting the initial
          version.
        </P>
        <Row s={s} label="Stripe billing for organizer subscriptions" value="Add Stripe as a data processor in Section 5. Add billing data description in Section 2." />
        <Row s={s} label="Expansion to EU/international markets" value="Full GDPR section required. Legal basis for processing must be specified per data type." />
        <Row s={s} label="Global leaderboard / public profiles" value="Update Section 4 and Section 8 to disclose public visibility of leaderboard position." />
        <Row s={s} label="AI features (SmackTalk observations, predictions)" value="Update Section 3 (How We Use Data) and Section 7 (Aggregate Data) to reflect AI training use cases more explicitly." />
        <Row s={s} label="White label expansion" value="May require disclosure of partner data access. Review Section 5.4." />

        {/* 15 */}
        <H2 s={s}>15. Contact Us</H2>
        <P s={s}>
          If you have questions about this Privacy Policy or how we handle your
          personal information, please contact us:
        </P>
        <P s={s}>
          HotPick Sports, Inc.{'\n'}
          Attn: Privacy{'\n'}
          1148 Michigan Ave.{'\n'}
          Buffalo, NY 14209
        </P>
        <P s={s}>Email: privacy@hotpicksports.com</P>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            HotPick Sports Privacy Policy — Version 1.0
          </Text>
          <Text style={s.footerText}>
            Copyright 2026 HotPick Sports, Inc. All rights reserved.
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
