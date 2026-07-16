import React from 'react';
import {View, ScrollView, StyleSheet, TouchableOpacity} from 'react-native';
// Legal carve-out: this screen KEEPS OS font scaling on (accessibility for
// dense legal copy). LegalText is aliased to Text so every `<Text>` here —
// helpers, header, footer — scales; the ScrollView absorbs the extra height.
import {LegalText as Text} from '@shared/components/AppText';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ArrowLeft} from 'lucide-react-native';
import {spacing} from '@shared/theme';
import {useTheme} from '@shell/theme';

/* ─── tiny helper components ─── */

const H1 = ({children, s}: {children: React.ReactNode; s: any}) => (
  <Text style={s.h1}>{children}</Text>
);
const H2 = ({children, s}: {children: React.ReactNode; s: any}) => (
  <Text style={s.h2}>{children}</Text>
);
const H3 = ({children, s}: {children: React.ReactNode; s: any}) => (
  <Text style={s.h3}>{children}</Text>
);
const P = ({children, s}: {children: React.ReactNode; s: any}) => (
  <Text style={s.p}>{children}</Text>
);
const Bold = ({children, s}: {children: React.ReactNode; s: any}) => (
  <Text style={[s.p, {fontWeight: '700'}]}>{children}</Text>
);
const Bullet = ({children, s}: {children: React.ReactNode; s: any}) => (
  <View style={s.bulletRow}>
    <Text style={s.bulletDot}>•</Text>
    <Text style={[s.p, {flex: 1}]}>{children}</Text>
  </View>
);
// Two-column table (Data / Purpose and Notes). THead renders the bold header
// row; Row renders each data row side-by-side (label flex 1, value flex 2).
const THead = ({left, right, s}: {left: string; right: string; s: any}) => (
  <View style={s.tableHeadRow}>
    <Text style={[s.tableCell, s.tableHeadCell, s.tableCellLabel]}>{left}</Text>
    <Text style={[s.tableCell, s.tableHeadCell, s.tableCellValue]}>{right}</Text>
  </View>
);
const Row = ({label, value, s}: {label: string; value: string; s: any}) => (
  <View style={s.tableRow}>
    <Text style={[s.tableCell, s.tableCellLabel]}>{label}</Text>
    <Text style={[s.tableCell, s.tableCellValue]}>{value}</Text>
  </View>
);
// Section 6 retention table is 3-column (Data Type / Retention Period /
// Rationale). Three long sentences side-by-side are unreadable at phone width,
// so each row stacks: bold Data Type, then the source's own column headers
// ("Retention Period:", "Rationale:") as inline labels. Every cell verbatim.
const RetentionRow = ({
  dataType,
  retention,
  rationale,
  s,
}: {
  dataType: string;
  retention: string;
  rationale: string;
  s: any;
}) => (
  <View style={s.retentionRow}>
    <Text style={s.retentionType}>{dataType}</Text>
    <Text style={s.retentionLine}>
      <Text style={s.retentionLabel}>Retention Period: </Text>
      {retention}
    </Text>
    <Text style={s.retentionLine}>
      <Text style={s.retentionLabel}>Rationale: </Text>
      {rationale}
    </Text>
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
        <P s={s}>Effective Date: July 20, 2026 • Version 1.0.3</P>
        <P s={s}>Last Updated: July 20, 2026 — Supersedes Version 1.0.2 (July 14, 2026)</P>

        {/* 1 */}
        <H2 s={s}>SECTION 1. WHO WE ARE</H2>
        <P s={s}>
          HotPick Sports, Inc. ("HotPick," "we," "us," or "our") is a Delaware corporation with its principal place of business at 1148 Michigan Ave., Buffalo, NY 14209. We operate the HotPick Sports mobile application (the "App" or "Platform"), a sports prediction platform where users make picks on game outcomes, designate a HotPick, and compete within social groups called Pools. In this Policy, a "Pool" is shown in the App as a "Contest," an "Organizer" as the "Gaffer," a "Member" as a "Player," the "Leaderboard" as the "Ladder," and "SmackTalk" as "Chirps."
        </P>
        <P s={s}>
          This Privacy Policy describes what personal information we collect when you use the App, how we use and protect that information, who we share it with, and the rights you have over your data. By creating an account and checking the acceptance checkbox, you agree to the practices described in this Policy. That checkbox requires you to affirmatively confirm that you are 18 or older and agree to our Terms of Service and this Privacy Policy. The timestamp and version of your acceptance are recorded in our systems.
        </P>
        <P s={s}>
          HotPick is not a gambling product. No real money is wagered between users. We do not collect payment card information from end users.
        </P>

        <H3 s={s}>Privacy Officer</H3>
        <P s={s}>
          HotPick Sports, Inc.'s designated Privacy Officer is Thomas P. McDade, Founder and CEO. The Privacy Officer is responsible for overseeing compliance with this Privacy Policy and applicable privacy law. The Privacy Officer can be reached at privacy@hotpicksports.com.
        </P>

        {/* 2 */}
        <H2 s={s}>SECTION 2. INFORMATION WE COLLECT</H2>

        <H3 s={s}>2.1 Information You Provide at Sign-Up</H3>
        <P s={s}>When you create an account, you provide the following information:</P>
        <THead s={s} left="Data" right="Purpose and Notes" />
        <Row s={s} label="Email address" value="Required. Used for account authentication (magic link or OAuth relay address), transactional notifications, and account recovery. If you use Apple Hide My Email, we receive and store the Apple-generated relay address only — we never see or store your real Apple ID email." />
        <Row s={s} label="First name" value="Required. Displayed on Leaderboards and in SmackTalk unless you switch to your Poolie Name." />
        <Row s={s} label="Last name" value={'Optional. If provided, displayed only as an initial (e.g., "Tom M.") and never in full to other users.'} />
        <Row s={s} label="Poolie Name" value="Optional. A persona or nickname used in Pools. Used as your display identity if you prefer not to display your real name." />
        <Row s={s} label="Profile avatar" value="Optional. Either a system avatar you select or a photo you upload. Stored in our file storage and displayed to Pool members." />

        <H3 s={s}>2.2 Information Collected Automatically During App Use</H3>
        <P s={s}>When you use the App, we collect the following information:</P>
        <THead s={s} left="Data" right="Purpose and Notes" />
        <Row s={s} label="Picks and HotPick designations" value="Your game predictions and high-conviction picks. Stored at the account level (not tied to any specific Pool). Used to compute your scores and display your Leaderboard position." />
        <Row s={s} label="Frozen Ranks" value="The competitiveness rank assigned to a game at the Pick deadline. Stored immutably alongside your Pick and used to compute point multipliers. You cannot alter a Frozen Rank." />
        <Row s={s} label="Scores and point totals" value="Computed server-side by HotPick's scoring engine based on your Picks and actual game outcomes. The client app displays scores; it never computes them." />
        <Row s={s} label="Timezone" value="Auto-detected from your device at sign-up. Stored silently. Used only to display Pick deadlines and game times in your local time. Never shown as a configurable field." />
        <Row s={s} label="Device push notification token" value="Generated by your device when you grant push notification permission. Stored per device. Used to send Pick deadline reminders, score updates, and Pool notifications. Deactivated on logout or delivery failure." />
        <Row s={s} label="Device platform (iOS / Android)" value="Detected at push token registration. Used to route notifications to the correct provider and to analyze platform-specific behavior patterns." />
        <Row s={s} label="App interaction events" value="Actions such as Picks submitted, Pools joined, screens visited, and SmackTalk messages sent. Used for product analytics and to improve the App. Raw event logs are retained for 90 days and then deleted. Aggregated metrics derived from event logs are retained indefinitely as Aggregate Data. No advertising profiles are built from this data." />
        <Row s={s} label="TOS acceptance timestamp and version" value="Written to our database immediately after your acceptance. The permanent legal record of your consent." />
        <Row s={s} label="Referral code" value="Auto-generated at sign-up. Used internally to track referral attribution. Never collected from you directly." />

        <H3 s={s}>2.3 Information From Third-Party Sign-In</H3>
        <P s={s}>
          If you sign in with Apple or Google, those services may share your name and email address with us. If you use Apple's Hide My Email feature, we receive and store only the Apple-generated relay address. We do not receive or store your Apple or Google password. Your use of these sign-in services is governed by Apple's and Google's respective privacy policies.
        </P>

        <H3 s={s}>2.4 SmackTalk Messages</H3>
        <P s={s}>
          SmackTalk is our in-app social messaging feature. Messages you post in a Pool are visible to all Members of that Pool. SmackTalk messages are Pool-scoped — they are never visible across Pools you do not share with another user.
        </P>
        <P s={s}>
          Messages older than 14 days are automatically moved to a permanent archive maintained by HotPick. Archived messages are retained indefinitely as part of our Aggregate Data corpus for analytics, platform improvement, and potential commercial data licensing as described in Section 7. Archived messages are not displayed to users through the App after archiving. Upon account deletion, your identity is removed from archived messages, but the messages themselves are retained in anonymized form.
        </P>

        <H3 s={s}>2.5 What We Do Not Collect</H3>
        <P s={s}>HotPick does not collect:</P>
        <Bullet s={s}>Payment card numbers, bank account information, or any financial credentials. Organizer access fees (where applicable) are processed through the Apple App Store or Google Play Store; HotPick does not handle or store raw payment data.</Bullet>
        <Bullet s={s}>Precise device location or GPS coordinates. We infer your approximate region from timezone data only.</Bullet>
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
        <Bullet s={s}>Send push notifications for Pick deadlines, game outcomes, score updates, Drama Digest summaries, and Pool activity. You can manage notification preferences in Settings.</Bullet>
        <Bullet s={s}>Display Pick deadlines and game times in your local timezone.</Bullet>
        <Bullet s={s}>Generate Drama Digest pool and season narrative summaries using your performance data. Drama Digest currently uses server-side deterministic templates that insert your pick and score data into pre-written narrative structures. Future versions of Drama Digest may use artificial intelligence to generate personalized commentary; this Privacy Policy will be updated to reflect any such change before it is deployed.</Bullet>
        <Bullet s={s}>Detect and prevent fraud, abuse, and violations of our Terms of Service.</Bullet>
        <Bullet s={s}>Analyze platform usage to improve the App and develop new features.</Bullet>
        <Bullet s={s}>Create and commercialize Aggregate Data as described in Section 7.</Bullet>
        <Bullet s={s}>Comply with legal obligations and enforce our Terms of Service.</Bullet>
        <P s={s}>
          We do not use your personal information to build advertising profiles, serve targeted advertising, or sell your personal information to third parties.
        </P>

        {/* 4 */}
        <H2 s={s}>SECTION 4. HOW PICKS AND SCORES WORK — AND WHY IT MATTERS FOR PRIVACY</H2>
        <P s={s}>
          HotPick's core architecture is account-level scoring: your Picks and scores are stored at your account level, not inside any specific Pool. A Pool is a social lens on your account-level data. This architecture has the following privacy implications:
        </P>
        <Bullet s={s}>If you belong to multiple Pools, the same Pick and score data appears on all relevant Leaderboards within those Pools.</Bullet>
        <Bullet s={s}>When you delete your account, your identity is removed from all Pools simultaneously — there is no need to delete Pool by Pool.</Bullet>
        <Bullet s={s}>Pool members can see your Leaderboard position, Picks (after the Pick deadline passes for that round), and score within any shared Pool. They cannot see your Picks in Pools they do not belong to.</Bullet>
        <Bullet s={s}>You are automatically enrolled in a platform-wide Pool (the "Global Pool") upon account creation. The Global Pool is not currently visible in the App: your position in it is not displayed to you or to any other user, and no platform-wide Leaderboard is shown. If Global Pool visibility is enabled in a future release, Sections 4 and 8 will be updated and you will be notified and required to re-accept this Policy before that feature goes live.</Bullet>

        {/* 5 */}
        <H2 s={s}>SECTION 5. HOW WE SHARE YOUR INFORMATION</H2>
        <P s={s}>
          HotPick does not sell your personal information. We share it only as described below.
        </P>

        <H3 s={s}>5.1 Within Pools</H3>
        <P s={s}>
          Your display name (first name or Poolie Name, per your preference), avatar, Picks (after the Pick deadline for each round), scores, and Leaderboard rank are visible to Members of any Pool you belong to. This visibility is a core function of the App. Your Picks are not visible to Pool members until after the Pick deadline for that round has passed.
        </P>
        <P s={s}>
          Organizers and administrators of a Pool can see information about that Pool's Members, including each Member's display name, last initial, avatar, Picks (after each Pick deadline), score and Leaderboard position, and whether they have submitted the current round's Picks. Organizers may also record private administrative notes about individual Members ("Organizer Notes"). Organizer Notes are visible only to that Pool's administrators, are not shown to the Member they concern, are retained only in connection with that Pool, and are removed when the Pool is deleted or when the Member deletes their account.
        </P>

        <H3 s={s}>5.2 Service Providers (Data Processors)</H3>
        <P s={s}>
          We share data with the following third-party service providers who process it on our behalf under data processing agreements. These providers are not permitted to use your data for their own independent purposes.
        </P>
        <THead s={s} left="Data" right="Purpose and Notes" />
        <Row s={s} label="Supabase (via AWS)" value="Cloud database, authentication, file storage, and real-time messaging infrastructure. Your account data, Picks, scores, and SmackTalk messages are stored on Supabase-managed infrastructure hosted on AWS in the United States. Supabase processes data on our behalf under a Data Processing Agreement." />
        <Row s={s} label="Apple (Sign In with Apple)" value="OAuth authentication. Apple manages authentication and may share your name and email (or a relay address) with us. Governed by Apple's Privacy Policy." />
        <Row s={s} label="Google (Sign In with Google)" value="OAuth authentication. Google manages authentication and shares your email and name from your Google profile. Governed by Google's Privacy Policy." />
        <Row s={s} label="Expo / Expo Push Notifications" value="Push notification delivery infrastructure. Your device push notification token is used to route notifications to your device. Expo does not receive your Pick or score data." />
        <Row s={s} label="Sentry (planned)" value="Error monitoring and crash reporting. App errors and stack traces may include device type and OS version. No personal data included in error reports by design." />
        <Row s={s} label="Resend (planned)" value="Transactional email delivery. Email address and email content (magic links, notifications). No Pick or score data." />
        <Row s={s} label="Stripe (future — not active at launch)" value="Payment processing for Organizer Access. When active, Stripe will process Organizer payment information. HotPick will not store raw payment card data. This table will be updated when Stripe billing is activated." />

        <H3 s={s}>5.3 Sports Data APIs — No User Data Shared</H3>
        <P s={s}>
          The App uses the ESPN API to retrieve game schedules and scores, and The Odds API to obtain publicly available betting-line data used solely to calculate game competitiveness ranks. We do not transmit any personal information or Pick data to these providers. Data flows one direction only: from these APIs to our servers. Betting-line data is used for internal game ranking purposes and is not displayed to users as odds.
        </P>

        <H3 s={s}>5.4 White Label Partners</H3>
        <P s={s}>
          HotPick supports branded Pool experiences for organizational partners. If you join a Pool operated by a White Label Partner, that partner's branding will appear in your Pool experience. White Label Partners do not receive access to your personal account data, individual Picks, scores, or display name. A partner may receive aggregate, anonymized engagement and participation trends across its affiliated Pools that do not identify any individual user and cannot reasonably be used to identify you; any such aggregate reporting constitutes Aggregate Data as defined in Section 7. Partners do not receive any user-level data export or reporting from HotPick. All data within White Label Partner Pools continues to be governed exclusively by this Privacy Policy.
        </P>
        <P s={s}>
          A White Label Partner (shown in the App as a "League") may make Perks available to Members of an affiliated Pool. Perks are offered and fulfilled by the League, not by HotPick; they are made available to participants on a participation basis and are not prizes awarded by HotPick or based on competition standings. Organizers and Leagues may also send broadcast messages and notifications to Members of a Pool; you can control these in your notification Settings. These broadcasts do not give the Organizer or League access to your personal account data, Picks, or scores.
        </P>

        <H3 s={s}>5.5 Legal Requirements</H3>
        <P s={s}>
          We may disclose your information if required by applicable law, subpoena, court order, or government demand, or if we believe in good faith that disclosure is necessary to protect the rights, property, or safety of HotPick, our users, or others, or to enforce our Terms of Service.
        </P>

        <H3 s={s}>5.6 Business Transfers</H3>
        <P s={s}>
          If HotPick Sports, Inc. is acquired by, merged with, or sells substantially all of its assets to another entity, your personal information and Aggregate Data may be transferred to the acquiring entity as a business asset. We will notify you via the App or email before your information becomes subject to a materially different privacy policy, and you will have the opportunity to delete your account at that time. Aggregate Data, as defined in Section 7, is an owned asset of HotPick Sports, Inc. and transfers to any acquirer without restriction.
        </P>

        {/* 6 */}
        <H2 s={s}>SECTION 6. DATA RETENTION</H2>
        <P s={s}>
          We retain personal information only as long as necessary to provide the Platform and fulfill the purposes described in this Policy. The following table describes our retention practices by data type:
        </P>
        <RetentionRow s={s} dataType="Account data (name, email, avatar)" retention="Retained while account is active. Anonymized immediately upon account deletion." rationale="User controls this through account deletion." />
        <RetentionRow s={s} dataType="Picks and scores" retention="Retained indefinitely in anonymized form after account deletion." rationale="Pool and Leaderboard integrity. Historical analytics and Aggregate Data value." />
        <RetentionRow s={s} dataType="SmackTalk messages (active feed)" retention="14 days in active feed, then archived. Messages associated with your identity removed on account deletion." rationale="Product performance and user experience." />
        <RetentionRow s={s} dataType="SmackTalk messages (archive)" retention="Retained indefinitely in anonymized form." rationale="AI model training, analytics, data licensing. See Section 7." />
        <RetentionRow s={s} dataType="Push notification tokens" retention="Per active device. Deactivated on logout, reinstall, or delivery failure. Removed on account deletion." rationale="Operational requirement for notification delivery." />
        <RetentionRow s={s} dataType="App interaction events (raw event logs)" retention="90 days, then deleted." rationale="Product debugging and analytics. Individual logs are not needed beyond this window." />
        <RetentionRow s={s} dataType="Aggregated metrics (derived from event logs)" retention="Retained indefinitely as Aggregate Data." rationale="Platform analytics and product improvement. No personal data." />
        <RetentionRow s={s} dataType="TOS acceptance records" retention="Retained indefinitely." rationale="Legal compliance record." />
        <RetentionRow s={s} dataType="Organizer Notes" retention="Retained while the Pool exists; removed on Pool deletion or when the Member deletes their account." rationale="Organizer administration; visible only to Pool administrators." />
        <RetentionRow s={s} dataType="Auth logs (Supabase)" retention="90 days (Supabase default)." rationale="Security and fraud detection." />
        <RetentionRow s={s} dataType="Aggregate Data" retention="Retained indefinitely. Owned by HotPick Sports, Inc." rationale="Commercial value, AI training, data licensing. See Section 7." />

        {/* 7 */}
        <H2 s={s}>SECTION 7. AGGREGATE DATA</H2>
        <Bold s={s}>
          This section is important. It explains how HotPick Sports, Inc. uses anonymized and aggregated data derived from Platform activity for commercial purposes, including data licensing and AI model training. Please read it carefully.
        </Bold>

        <H3 s={s}>7.1 What Aggregate Data Is</H3>
        <P s={s}>
          When data from many users is combined, anonymized, and processed statistically, it produces a category of information that HotPick calls "Aggregate Data." Aggregate Data describes patterns across the Platform, not any individual user. Aggregate Data cannot reasonably be used to identify any individual — it is not your personal information.
        </P>
        <P s={s}>Examples of Aggregate Data include, without limitation:</P>
        <Bullet s={s}>The percentage of users who picked a particular team in a given week.</Bullet>
        <Bullet s={s}>Distribution of HotPick designations across game rank levels.</Bullet>
        <Bullet s={s}>Prediction accuracy trends by game type, week, or season.</Bullet>
        <Bullet s={s}>Platform engagement patterns (weekly Pick submission rates, SmackTalk activity levels).</Bullet>
        <Bullet s={s}>SmackTalk sentiment trends related to sporting events.</Bullet>
        <Bullet s={s}>Pool formation and growth patterns across the Platform.</Bullet>

        <H3 s={s}>7.2 How We Use and License Aggregate Data</H3>
        <P s={s}>
          HotPick Sports, Inc. owns all Aggregate Data derived from Platform activity. We use and may license Aggregate Data for:
        </P>
        <Bullet s={s}>Operating, maintaining, and improving the Platform.</Bullet>
        <Bullet s={s}>Training, developing, and improving artificial intelligence and machine learning models, including models used in future Platform features such as Drama Digest AI commentary and SmackTalk personalization.</Bullet>
        <Bullet s={s}>Research and internal analytics.</Bullet>
        <Bullet s={s}>Licensing to third parties, including sports media companies, broadcasters, data analytics providers, and research organizations.</Bullet>
        <Bullet s={s}>Any other commercial or non-commercial purpose consistent with our Terms of Service.</Bullet>
        <P s={s}>
          Our Terms of Service (Section 9) contain the contractual provisions governing Aggregate Data ownership, licensing, and survival. By using the Platform and accepting our Terms of Service, you assign and license to HotPick Sports, Inc. all rights in Aggregate Data derived from your Platform activity on a perpetual, irrevocable basis that survives account deletion.
        </P>

        <H3 s={s}>7.3 SmackTalk Archive as Aggregate Data</H3>
        <P s={s}>
          SmackTalk messages archived pursuant to Section 2.4 form part of HotPick's Aggregate Data corpus. The archive is retained permanently and is used for Platform analytics, AI model training for future conversational features, and potential third-party data licensing. Individual messages in the archive are not attributable to you following account deletion.
        </P>

        <H3 s={s}>7.4 Anonymization and Non-Identification</H3>
        <P s={s}>
          Before any Aggregate Data is used externally or commercially, it is processed to remove all information that could reasonably identify an individual user. Aggregate Data is derived from collective activity patterns, not from individual user records. HotPick does not license individual user data to any third party.
        </P>

        <H3 s={s}>7.5 Aggregate Data Is Not a Sale of Personal Information</H3>
        <P s={s}>
          The commercial licensing of Aggregate Data described in this Section does not constitute a "sale" of personal information as defined under the California Consumer Privacy Act (CCPA) or other applicable law, because Aggregate Data is anonymized and cannot be used to identify you. See Section 9 for California-specific rights.
        </P>

        <H3 s={s}>7.6 What Happens to Your Data When You Delete Your Account</H3>
        <P s={s}>
          When you delete your account, your name, email address, Poolie Name, avatar, and all other identifying information are permanently and irreversibly removed from our systems. Your Picks, scores, and SmackTalk messages are anonymized — stripped of your identity — and retained as part of the historical record and Aggregate Data corpus. Anonymized data cannot be linked back to you.
        </P>

        {/* 8 */}
        <H2 s={s}>SECTION 8. YOUR RIGHTS AND CHOICES</H2>

        <H3 s={s}>8.1 Access and Correction</H3>
        <P s={s}>
          You can view and update most of your account information at any time in Profile Settings within the App. This includes your first name, last name, Poolie Name, avatar, display name preference, and notification preferences.
        </P>

        <H3 s={s}>8.2 Push Notifications</H3>
        <P s={s}>
          You can enable or disable individual push notification categories in Settings within the App. You can also disable all push notifications through your device's operating system settings. Disabling notifications does not affect your ability to use the App.
        </P>

        <H3 s={s}>8.3 Account Deletion</H3>
        <P s={s}>
          {'You can permanently delete your account at any time through Profile Settings > Account > Delete Account. Account deletion is a two-step process requiring explicit confirmation. When you delete your account:'}
        </P>
        <Bullet s={s}>Your name, email address, Poolie Name, and profile photo are permanently removed from our systems;</Bullet>
        <Bullet s={s}>Your account is anonymized — your identity is replaced with a generic, non-reversible identifier;</Bullet>
        <Bullet s={s}>Your Picks and scores are retained in anonymized form to preserve the integrity of historical Leaderboards and Pool records for other users;</Bullet>
        <Bullet s={s}>Your SmackTalk messages in the active feed are dissociated from your identity;</Bullet>
        <Bullet s={s}>SmackTalk messages in the archive are retained in permanently anonymized form;</Bullet>
        <Bullet s={s}>Your push notification tokens are deactivated; and</Bullet>
        <Bullet s={s}>Aggregate Data derived from your activity is retained as described in Section 7.</Bullet>
        <P s={s}>
          Account deletion cannot be undone. Once your account is deleted, your identity will no longer be attributable to any remaining records.
        </P>

        <H3 s={s}>8.4 Data Export</H3>
        <P s={s}>
          If you would like a copy of the personal information we hold about you, please contact us at privacy@hotpicksports.com. We will respond within 45 days. Export requests may include your profile data, Pick history, and score history associated with your account.
        </P>

        {/* 9 */}
        <H2 s={s}>SECTION 9. ADDITIONAL RIGHTS FOR CALIFORNIA RESIDENTS (CCPA)</H2>
        <P s={s}>
          If you are a California resident, the California Consumer Privacy Act (CCPA) and the California Privacy Rights Act (CPRA) grant you the following rights:
        </P>

        <H3 s={s}>Right to Know</H3>
        <P s={s}>
          You have the right to request information about the categories and specific pieces of personal information we have collected about you, the sources of that information, our business or commercial purpose for collecting it, and the categories of third parties with whom we share it. Submit requests to privacy@hotpicksports.com.
        </P>

        <H3 s={s}>Right to Delete</H3>
        <P s={s}>
          {'You have the right to request deletion of personal information we have collected about you, subject to certain exceptions permitted by law. You can exercise this right directly in the App through Profile Settings > Account > Delete Account, or by contacting privacy@hotpicksports.com. See Section 8.3 for a full description of what is and is not deleted.'}
        </P>

        <H3 s={s}>Right to Correct</H3>
        <P s={s}>
          You have the right to request correction of inaccurate personal information we maintain about you. You can correct most information directly in Profile Settings, or by contacting privacy@hotpicksports.com.
        </P>

        <H3 s={s}>Right to Opt Out of Sale or Sharing</H3>
        <P s={s}>
          HotPick does not sell personal information as defined under the CCPA or CPRA. We also do not share personal information for cross-context behavioral advertising. The commercial licensing of Aggregate Data described in Section 7 does not constitute a sale or sharing of personal information because Aggregate Data is anonymized and cannot be used to identify any individual.
        </P>

        <H3 s={s}>Right to Limit Use of Sensitive Personal Information</H3>
        <P s={s}>
          HotPick does not collect sensitive personal information as defined under the CPRA (including Social Security numbers, financial account information, geolocation data, health data, or biometric data). This right is not applicable to our Platform.
        </P>

        <H3 s={s}>Right to Non-Discrimination</H3>
        <P s={s}>
          We will not discriminate against you for exercising any of your CCPA or CPRA rights.
        </P>

        <H3 s={s}>How to Submit a Request</H3>
        <P s={s}>
          To exercise your California privacy rights, contact us at privacy@hotpicksports.com or write to us at the address in Section 15. We will verify your identity before processing your request and will respond within 45 days as required by law, with a possible extension of an additional 45 days where reasonably necessary.
        </P>

        {/* 10 */}
        <H2 s={s}>SECTION 10. ADDITIONAL INFORMATION FOR CANADIAN USERS</H2>
        <P s={s}>
          HotPick is available to residents of Canada. By using the App, you consent to your personal information being transferred to and processed in the United States, where our servers are hosted. United States privacy law may differ from the privacy law in your province or territory.
        </P>

        <H3 s={s}>10.1 Federal Rights (PIPEDA)</H3>
        <P s={s}>
          Canadian users have rights under Canada's Personal Information Protection and Electronic Documents Act (PIPEDA), including the right to access the personal information we hold about them and to request corrections. Contact privacy@hotpicksports.com to exercise these rights.
        </P>

        <H3 s={s}>10.2 Quebec Residents — Loi 25 (Law 25)</H3>
        <Bold s={s}>
          Quebec's Act Respecting the Protection of Personal Information in the Private Sector (Law 25 / Loi 25) imposes obligations on organizations that collect personal information from Quebec residents. The following provisions apply specifically to Quebec residents.
        </Bold>

        <Bold s={s}>Privacy Officer</Bold>
        <P s={s}>
          HotPick Sports, Inc.'s designated Privacy Officer is Thomas P. McDade, Founder and CEO. Quebec residents may direct privacy inquiries, access requests, and complaints to the Privacy Officer at privacy@hotpicksports.com.
        </P>

        <Bold s={s}>Right of Access and Correction</Bold>
        <P s={s}>
          Quebec residents have the right to access personal information we hold about them and to request correction of inaccurate or incomplete information. Requests must be submitted in writing to privacy@hotpicksports.com. We will respond within 30 days.
        </P>

        <Bold s={s}>Right to Withdraw Consent</Bold>
        <P s={s}>
          Where our collection of your personal information is based on consent, you may withdraw that consent at any time by deleting your account as described in Section 8.3. Withdrawal of consent does not affect the lawfulness of processing conducted prior to withdrawal, and does not affect HotPick's rights in Aggregate Data as described in Section 7.
        </P>

        <Bold s={s}>Cross-Border Data Transfers</Bold>
        <P s={s}>
          Your personal information is transferred to and processed in the United States. HotPick has implemented contractual and technical safeguards with its service providers to protect personal information transferred outside Quebec, including data processing agreements with Supabase (hosted on AWS, United States).
        </P>

        <Bold s={s}>Privacy Impact Assessments</Bold>
        <P s={s}>
          HotPick conducts Privacy Impact Assessments (PIAs) for new technologies and processing activities that involve personal information, consistent with the requirements of Law 25. PIAs have been or will be conducted for our core data processing infrastructure, including Supabase database and authentication services and Expo push notification infrastructure.
        </P>

        <Bold s={s}>Privacy Incidents</Bold>
        <P s={s}>
          In the event of a privacy incident involving personal information of Quebec residents that presents a risk of serious injury, HotPick will notify the Commission d'accès à l'information (CAI) and affected individuals as required by Law 25, within the timelines prescribed by applicable regulation.
        </P>

        <Bold s={s}>Language</Bold>
        <P s={s}>
          This Privacy Policy is written in English. To the extent applicable Quebec law requires a French-language version, HotPick Sports, Inc. will provide one upon written request to privacy@hotpicksports.com. Une version française de cette Politique de confidentialité est disponible sur demande à l'adresse privacy@hotpicksports.com.
        </P>

        <H3 s={s}>10.3 Commercial Email (CASL)</H3>
        <P s={s}>
          We comply with Canada's Anti-Spam Legislation (CASL) for any commercial electronic messages we send to Canadian users. Transactional messages sent through the App — including authentication emails (magic links), Pick deadline reminders, and score notifications — are exempt from CASL's express consent requirements as they are sent in connection with your existing relationship with the Platform. If we send promotional or marketing emails unrelated to your direct use of the Platform, we will obtain your express consent as required by CASL.
        </P>

        {/* 11 */}
        <H2 s={s}>SECTION 11. DATA SECURITY</H2>
        <P s={s}>
          We implement technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. These measures include:
        </P>
        <Bullet s={s}>Authentication via Supabase Auth with persistent session management and OAuth integration with Apple and Google.</Bullet>
        <Bullet s={s}>Row-Level Security (RLS) enforced at the database level: each user can read and write only their own data. Leaderboard reads are governed by Pool membership, not direct table access.</Bullet>
        <Bullet s={s}>All scoring computation runs server-side in Edge Functions using a service role. The client app never has access to raw scoring logic or other users' unprocessed data.</Bullet>
        <Bullet s={s}>Push notification tokens stored per device and deactivated on logout or delivery failure.</Bullet>
        <Bullet s={s}>Data stored on AWS-managed infrastructure via Supabase, with encryption in transit (TLS) and at rest.</Bullet>
        <P s={s}>
          No method of transmission over the internet or electronic storage is 100% secure. While we use commercially reasonable security measures, we cannot guarantee absolute security. If you believe your account has been compromised, contact us immediately at privacy@hotpicksports.com.
        </P>

        {/* 12 */}
        <H2 s={s}>SECTION 12. CHILDREN'S PRIVACY</H2>
        <P s={s}>
          The Platform is intended exclusively for users who are 18 years of age or older. We do not knowingly collect personal information from anyone under 18. By creating an account, you affirmatively represent that you are 18 or older. The acceptance checkbox and our versioned consent record are the mechanisms by which we document this representation.
        </P>
        <P s={s}>
          If we discover or have reason to believe that a user is under 18, we will terminate that account immediately and delete associated personal information. If you believe we have inadvertently collected information from a minor, please contact us promptly at privacy@hotpicksports.com and we will take immediate action.
        </P>
        <P s={s}>
          Because the Platform is directed exclusively at adults 18 and older and we do not knowingly collect data from children under 13, the Children's Online Privacy Protection Act (COPPA) does not apply to our Platform.
        </P>

        {/* 13 */}
        <H2 s={s}>SECTION 13. CHANGES TO THIS PRIVACY POLICY</H2>
        <P s={s}>
          We may update this Privacy Policy from time to time. When we make material changes, we will update the version number and effective date at the top of this document and notify you through the App on your next login, requiring affirmative re-acceptance before you can continue using the Platform. We may also notify you by email at the address associated with your account.
        </P>
        <P s={s}>
          If we make changes that affect how we use or share your personal information in a materially different way from what is described in this Policy, we will provide prominent notice and, where required by applicable law, obtain your consent before implementing those changes.
        </P>
        <P s={s}>
          Your continued use of the App after accepting an updated Privacy Policy constitutes your agreement to the updated Policy. If you do not agree to an updated Policy, you must stop using the App and may delete your account.
        </P>

        {/* 14 */}
        <H2 s={s}>SECTION 14. PLANNED FUTURE CHANGES AFFECTING THIS POLICY</H2>
        <P s={s}>
          The following planned changes will require updates to this Privacy Policy before they are deployed. Users will be notified and required to re-accept the updated Policy before those features go live:
        </P>
        <Bullet s={s}>Stripe billing for Organizer Access (NFL Season 2026 launch): Stripe will be added as a data processor in Section 5. Billing data description will be added to Section 2.</Bullet>
        <Bullet s={s}>Drama Digest AI commentary (future): When Drama Digest transitions from deterministic templates to AI-generated personalization, Section 3 and Section 7 will be updated to reflect the AI processing use case and any new data processors involved.</Bullet>
        <Bullet s={s}>Expansion to EU or international markets: A full GDPR section will be required, including legal basis for processing specified per data type.</Bullet>
        <Bullet s={s}>Global Pool visibility (future): All users are currently enrolled in a platform-wide Pool that is not displayed in the App, as described in Section 4. If HotPick enables visibility of Global Pool standings or Leaderboard positions, Sections 4 and 8 will be updated to disclose the scope of that visibility, and users will be notified and required to re-accept this Policy before the feature goes live.</Bullet>

        {/* 15 */}
        <H2 s={s}>SECTION 15. CONTACT US</H2>
        <P s={s}>
          If you have questions about this Privacy Policy, wish to exercise any of your privacy rights, or need to report a privacy concern, please contact us:
        </P>
        <Bold s={s}>HotPick Sports, Inc.</Bold>
        <P s={s}>
          Attn: Privacy Officer{'\n'}
          1148 Michigan Ave.{'\n'}
          Buffalo, NY 14209
        </P>
        <P s={s}>Email: privacy@hotpicksports.com</P>
        <P s={s}>
          California residents may also contact the California Privacy Protection Agency (CPPA) at cppa.ca.gov. Quebec residents may contact the Commission d'accès à l'information (CAI) at cai.gouv.qc.ca.
        </P>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            HotPick Sports Privacy Policy — Version 1.0.3 — Effective July 20, 2026
          </Text>
          <Text style={s.footerText}>
            Copyright © 2026 HotPick Sports, Inc. All rights reserved.
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
    tableHeadRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingVertical: 8,
      marginTop: 4,
      marginBottom: 2,
    },
    tableCell: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.textPrimary,
    },
    tableHeadCell: {
      fontWeight: '700',
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
    retentionRow: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      paddingVertical: 10,
      marginBottom: 2,
    },
    retentionType: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    retentionLine: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    retentionLabel: {
      fontWeight: '600',
      color: colors.textPrimary,
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
