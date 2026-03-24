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
const Bold = ({children, s}: {children: string; s: any}) => (
  <Text style={[s.p, {fontWeight: '700'}]}>{children}</Text>
);
const Bullet = ({children, s}: {children: string; s: any}) => (
  <View style={s.bulletRow}>
    <Text style={s.bulletDot}>•</Text>
    <Text style={[s.p, {flex: 1}]}>{children}</Text>
  </View>
);

export function TermsOfServiceScreen({navigation}: any) {
  const {colors} = useTheme();
  const s = createStyles(colors);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Terms of Service</Text>
        <View style={s.backButton} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Title block */}
        <H1 s={s}>HotPick Sports</H1>
        <H1 s={s}>Terms of Service</H1>
        <P s={s}>Effective Date: March 19, 2026</P>
        <P s={s}>Version 1.0</P>
        <P s={s}>Last Updated: March 19, 2026</P>

        <P s={s}>
          Please read these Terms of Service carefully before using the HotPick Sports mobile application or any related services. These Terms constitute a legally binding agreement between you and HotPick Sports, Inc., a Delaware corporation.
        </P>
        <P s={s}>
          By checking the acceptance box during registration and creating an account, you acknowledge that you have read, understood, and agree to be bound by these Terms, our Privacy Policy (incorporated herein by reference), and any additional guidelines or rules that may apply to specific features of the Platform.
        </P>
        <Bold s={s}>IF YOU DO NOT AGREE TO THESE TERMS, DO NOT USE THE PLATFORM.</Bold>

        {/* SECTION 1 */}
        <H2 s={s}>SECTION 1. DEFINITIONS</H2>
        <P s={s}>As used in these Terms, the following terms have the meanings set forth below:</P>

        <Bold s={s}>"Platform"</Bold>
        <P s={s}>
          means the HotPick Sports mobile application, website, and all related services, features, and content provided by HotPick Sports, Inc.
        </P>

        <Bold s={s}>"Company," "we," "us," or "our"</Bold>
        <P s={s}>
          means HotPick Sports, Inc., a Delaware corporation with its principal place of business at 1148 Michigan Ave., Buffalo, NY 14209.
        </P>

        <Bold s={s}>"User," "you," or "your"</Bold>
        <P s={s}>
          means any individual who accesses or uses the Platform, including Organizers and Members.
        </P>

        <Bold s={s}>"Pool"</Bold>
        <P s={s}>
          means a competition group created within the Platform in which Members make Picks on sporting event outcomes and compete against each other on a Leaderboard.
        </P>

        <Bold s={s}>"Organizer"</Bold>
        <P s={s}>means a User who creates and administers a Pool.</P>

        <Bold s={s}>"Member"</Bold>
        <P s={s}>means a User who participates in a Pool.</P>

        <Bold s={s}>"Pick"</Bold>
        <P s={s}>
          means a User's selection of an anticipated outcome for a specific sporting event or game within the Platform.
        </P>

        <Bold s={s}>"HotPick"</Bold>
        <P s={s}>
          means a User's designation of a single Pick per competition round as their highest-conviction selection, which carries a rank-based point multiplier affecting both potential point gains and losses.
        </P>

        <Bold s={s}>"Frozen Rank"</Bold>
        <P s={s}>
          means the competitiveness ranking assigned to a game by the Platform prior to the Pick deadline, which is immutable after the deadline passes and is used to calculate points.
        </P>

        <Bold s={s}>"Leaderboard"</Bold>
        <P s={s}>
          means the display of Users' cumulative scores within a Pool or across the Platform.
        </P>

        <Bold s={s}>"SmackTalk"</Bold>
        <P s={s}>
          means the in-Platform social messaging feature that allows Members within a Pool to communicate with each other.
        </P>

        <Bold s={s}>"User Content"</Bold>
        <P s={s}>
          means any content submitted, posted, or transmitted by a User through the Platform, including Picks, SmackTalk messages, profile information, and uploaded images.
        </P>

        <Bold s={s}>"Aggregate Data"</Bold>
        <P s={s}>has the meaning set forth in Section 9.</P>

        <Bold s={s}>"Global Pool"</Bold>
        <P s={s}>
          means the platform-wide Pool in which all Users are automatically enrolled upon creating an account, enabling competition across the entire Platform user base.
        </P>

        {/* SECTION 2 */}
        <H2 s={s}>SECTION 2. ELIGIBILITY</H2>

        <H3 s={s}>2.1 Age Requirement</H3>
        <P s={s}>
          You must be at least 18 years of age to create an account or use the Platform. By accepting these Terms, you represent and warrant that you are 18 years of age or older. If we discover or have reason to believe that you are under 18 years of age, we reserve the right to suspend or terminate your account immediately and without notice, and to remove any User Content associated with that account.
        </P>

        <H3 s={s}>2.2 Geographic Restrictions</H3>
        <P s={s}>
          The Platform is currently available to residents of the United States and Canada only. By using the Platform, you represent that you are a resident of the United States or Canada. We reserve the right to restrict access from other jurisdictions at any time. As we expand to additional regions, we will update these Terms accordingly.
        </P>

        <H3 s={s}>2.3 Account Registration</H3>
        <P s={s}>
          You must create an account to access most features of the Platform. You agree to provide accurate, current, and complete information during registration and to keep your account information updated. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.
        </P>

        <H3 s={s}>2.4 One Account Per Person</H3>
        <P s={s}>
          You may maintain only one account on the Platform. Creating multiple accounts to gain a competitive advantage or circumvent any suspension or ban is prohibited and may result in termination of all associated accounts.
        </P>

        {/* SECTION 3 */}
        <H2 s={s}>SECTION 3. ACCEPTANCE AND UPDATES TO THESE TERMS</H2>

        <H3 s={s}>3.1 Acceptance</H3>
        <P s={s}>
          These Terms become effective on the date you first create an account or use the Platform. Acceptance is recorded by your checking the acceptance checkbox during account registration, which requires you to affirmatively confirm that you are 18 or older and agree to these Terms and our Privacy Policy. The timestamp and version number of your acceptance are recorded in our systems and constitute the legal record of your consent.
        </P>

        <H3 s={s}>3.2 Updates to These Terms</H3>
        <P s={s}>
          We may modify these Terms at any time. When we make material changes, we will update the version number and effective date at the top of this document. On your next login following a material update, you will be required to review and affirmatively accept the updated Terms before continuing to use the Platform. This re-acceptance screen cannot be dismissed and constitutes a hard gate to continued Platform access. If you do not agree to updated Terms, you must stop using the Platform and may delete your account.
        </P>

        <H3 s={s}>3.3 Notification of Changes</H3>
        <P s={s}>
          We will notify you of material changes to these Terms by presenting the updated Terms within the Platform and requiring your affirmative acceptance before continued use. We may also notify you via the email address associated with your account; however, in-Platform notification and required re-acceptance is the primary and legally operative method of notice.
        </P>

        {/* SECTION 4 */}
        <H2 s={s}>SECTION 4. THE PLATFORM — WHAT IT IS AND IS NOT</H2>

        <H3 s={s}>4.1 Nature of the Platform</H3>
        <P s={s}>
          HotPick Sports is a sports prediction and social competition platform. Users make Picks on sporting event outcomes, earn points based on the accuracy of their Picks, and compete with friends and other Users on Leaderboards within Pools. The Platform is a game of skill and knowledge — Users who make more accurate predictions earn more points. Points have no monetary value and cannot be redeemed for cash, prizes, or any other item of value.
        </P>

        <H3 s={s}>4.2 No Money Handling — No Gambling</H3>
        <P s={s}>
          THE PLATFORM IS NOT A GAMBLING PLATFORM AND DOES NOT HANDLE MONEY.
        </P>
        <P s={s}>
          HotPick Sports, Inc. does not collect, process, hold, transfer, or have any involvement in financial transactions of any kind — between Users, between Users and HotPick Sports, Inc., or between Users and any third party. The Platform has no payment functionality between Users. No money moves through the Platform at any point in connection with competition, Picks, scores, or Pool participation.
        </P>
        <P s={s}>
          HotPick Sports, Inc. is aware that private financial arrangements among friends and social groups are common in sports competition contexts generally. The Platform is not designed to facilitate, enable, or support such arrangements. HotPick Sports, Inc. does not know of, facilitate, enable, or have any visibility into any financial arrangements that may exist between individuals outside the Platform. Any such arrangements are private matters conducted entirely outside the Platform, are not sanctioned, encouraged, or endorsed by HotPick Sports, Inc., and are solely the responsibility of the parties involved.
        </P>
        <P s={s}>
          Users who enter into private financial arrangements outside the Platform do so entirely at their own risk. HotPick Sports, Inc. expressly disclaims all responsibility and liability for any such arrangements, regardless of whether they relate to Platform activity.
        </P>

        <H3 s={s}>4.3 Organizer Pools</H3>
        <P s={s}>
          Organizers may create and administer Pools for groups of Members. The Platform does not collect fees from Members, does not process payments between Users, and has no mechanism by which money moves through the Platform in connection with Pool participation or competition outcomes.
        </P>
        <P s={s}>
          Prior to creating a Pool, Organizers are required to affirmatively acknowledge HotPick's prohibition on financial arrangements. The timestamp and version of that acknowledgment are recorded in our systems.
        </P>
        <P s={s}>
          HotPick Sports, Inc. is not a party to, and has no knowledge of, any private financial arrangements that may exist among members of any Pool. The existence of any such arrangements outside the Platform does not make HotPick Sports, Inc. a participant in, or responsible for, those arrangements.
        </P>

        <H3 s={s}>4.4 The HotPick Mechanic</H3>
        <P s={s}>
          Each competition round, Users may designate one Pick as their HotPick. The HotPick carries a multiplier based on the Frozen Rank assigned to that game by the Platform. The multiplier applies to both point gains if the Pick is correct and point losses if the Pick is incorrect. The Platform determines Frozen Ranks; Users cannot select or alter their own multipliers. Frozen Ranks are set before the Pick deadline and are immutable thereafter.
        </P>

        <H3 s={s}>4.5 Pools and Competition Rounds</H3>
        <P s={s}>
          Pools are organized around specific competitions or seasons. A Pool covers one event or season and does not automatically continue to the next. Organizers may create a new Pool for a subsequent event and invite prior Members to join. All Users are automatically enrolled in the Global Pool upon account creation, which provides a platform-wide Leaderboard.
        </P>

        <H3 s={s}>4.6 Use of Third-Party Sports Data</H3>
        <P s={s}>
          The Platform uses publicly available sports data from third-party providers, including game schedules, scores, and publicly available game competitiveness metrics, solely for the purpose of ranking games by competitiveness and determining Pick outcomes. No odds, lines, or wagering data is displayed to Users. This data is used for informational and operational purposes only and does not constitute facilitation of gambling.
        </P>

        {/* SECTION 5 */}
        <H2 s={s}>SECTION 5. USER ACCOUNTS AND IDENTITY</H2>

        <H3 s={s}>5.1 Account Information</H3>
        <P s={s}>
          You agree to provide your real first name during registration. Your last name and a "Poolie Name" (a chosen persona or nickname) are optional. Your last name, if provided, will be displayed only as an initial (e.g., "Tom M.") and will not be shown in full to other Users.
        </P>

        <H3 s={s}>5.2 Display Name</H3>
        <P s={s}>
          By default, your first name is used on Leaderboards and in SmackTalk. You may choose to display your Poolie Name instead, if you have set one. You may update your display preference at any time in your profile settings.
        </P>

        <H3 s={s}>5.3 Account Security</H3>
        <P s={s}>
          You are responsible for all activity that occurs under your account. You agree to notify us immediately at legal@hotpicksports.com if you suspect unauthorized access to your account. We are not liable for any loss or damage arising from your failure to maintain the security of your account.
        </P>

        <H3 s={s}>5.4 Accurate Information</H3>
        <P s={s}>
          You represent that all information you provide to HotPick Sports, Inc., including your name, age declaration, and email address, is accurate and truthful. Providing false information, including a false age declaration, is a material breach of these Terms and grounds for immediate account termination.
        </P>

        {/* SECTION 6 */}
        <H2 s={s}>SECTION 6. USER CONTENT</H2>

        <H3 s={s}>6.1 Your Content</H3>
        <P s={s}>
          You retain ownership of User Content you submit to the Platform, including your Picks, SmackTalk messages, and profile information. By submitting User Content, you grant HotPick Sports, Inc. a worldwide, non-exclusive, royalty-free, perpetual, irrevocable license to use, store, display, reproduce, and distribute your User Content solely in connection with operating and improving the Platform. This license does not affect HotPick Sports, Inc.'s separate and broader rights in Aggregate Data as described in Section 9.
        </P>

        <H3 s={s}>6.2 SmackTalk Messages</H3>
        <P s={s}>
          SmackTalk messages you compose are your User Content. You are solely responsible for the content of your messages. Messages are visible to other Members of your Pool. You agree not to post content that is unlawful, threatening, abusive, harassing, defamatory, obscene, or otherwise objectionable.
        </P>

        <H3 s={s}>6.3 SmackTalk Message Retention and Archive</H3>
        <P s={s}>
          SmackTalk messages are retained in an active feed for 14 days from the date of posting. After 14 days, messages are automatically moved to a permanent archive maintained by HotPick Sports, Inc. The archive is not accessible to Users through the Platform. The archive is retained indefinitely for operational purposes, Platform analytics, artificial intelligence model training, and potential commercial data licensing, as further described in Section 9.
        </P>
        <P s={s}>
          The archive is permanent and is not deleted when a Pool is discontinued. Upon account deletion, your identity is removed from archived messages, but the messages themselves remain in the archive in anonymized form. By using SmackTalk, you expressly acknowledge and consent to this retention and use of your messages in anonymized, aggregated form.
        </P>

        <H3 s={s}>6.4 Content Moderation</H3>
        <P s={s}>
          HotPick Sports, Inc. does not pre-moderate SmackTalk messages. Organizers may remove messages within their Pool. We reserve the right, but have no obligation, to remove any User Content that violates these Terms or that we determine, in our sole discretion, to be harmful, offensive, or otherwise inappropriate. We are not liable for any User Content posted by any User.
        </P>

        <H3 s={s}>6.5 Picks and Scores</H3>
        <P s={s}>
          Your individual Picks and scores are your User Content. They are associated with your account and displayed to other Members of your Pools on Leaderboards. See Section 9 for how anonymized and aggregated Pick data is used by HotPick Sports, Inc.
        </P>

        {/* SECTION 7 */}
        <H2 s={s}>SECTION 7. PROHIBITED CONDUCT</H2>
        <P s={s}>
          You agree not to engage in any of the following activities in connection with your use of the Platform:
        </P>
        <Bullet s={s}>Impersonating any person or entity, or falsely representing your affiliation with any person or entity;</Bullet>
        <Bullet s={s}>Submitting false, misleading, or inaccurate information, including a false age declaration;</Bullet>
        <Bullet s={s}>Creating or operating more than one account, or assisting any other person in doing so, for any purpose including circumventing a suspension, ban, or competitive restriction;</Bullet>
        <Bullet s={s}>Attempting to manipulate, hack, exploit, or interfere with the Platform's scoring systems, Pick submission processes, or any other feature;</Bullet>
        <Bullet s={s}>Using automated scripts, bots, or other tools to submit Picks or interact with the Platform;</Bullet>
        <Bullet s={s}>Attempting to access another User's account or any non-public areas of the Platform;</Bullet>
        <Bullet s={s}>Distributing spam, unsolicited messages, or promotional content through SmackTalk or other Platform features;</Bullet>
        <Bullet s={s}>Posting content in SmackTalk that is threatening, harassing, defamatory, obscene, or in violation of any applicable law;</Bullet>
        <Bullet s={s}>Using Pool names, Pool descriptions, or any other Platform feature to organize, promote, advertise, or facilitate financial arrangements among Users, including entry fees, prize pools, or wagering of any kind;</Bullet>
        <Bullet s={s}>Using the Platform in any manner that could damage, disable, overburden, or impair the Platform's servers or networks;</Bullet>
        <Bullet s={s}>Circumventing any access controls, technological protection measures, or usage restrictions on the Platform;</Bullet>
        <Bullet s={s}>Violating any applicable local, state, provincial, national, or international law or regulation;</Bullet>
        <Bullet s={s}>Engaging in any conduct that HotPick Sports, Inc. determines, in its sole discretion, to be harmful to Users, third parties, or HotPick Sports, Inc.</Bullet>

        {/* SECTION 8 */}
        <H2 s={s}>SECTION 8. INTELLECTUAL PROPERTY</H2>

        <H3 s={s}>8.1 Company Ownership</H3>
        <P s={s}>
          HotPick Sports, Inc. owns all right, title, and interest in and to the Platform, including its software, design, scoring engine, HotPick mechanic, branding, trademarks, logos, and all content created by HotPick Sports, Inc. These Terms do not grant you any ownership rights in the Platform.
        </P>

        <H3 s={s}>8.2 License to Use</H3>
        <P s={s}>
          Subject to your compliance with these Terms, HotPick Sports, Inc. grants you a limited, non-exclusive, non-transferable, revocable license to use the Platform for your personal, non-commercial use. This license does not include the right to sublicense, copy, modify, distribute, sell, or create derivative works based on the Platform.
        </P>

        <H3 s={s}>8.3 Feedback</H3>
        <P s={s}>
          If you submit suggestions, ideas, or feedback about the Platform to HotPick Sports, Inc., you grant HotPick Sports, Inc. a perpetual, irrevocable, worldwide, royalty-free license to use, implement, and commercialize that feedback without any obligation or compensation to you.
        </P>

        {/* SECTION 9 */}
        <H2 s={s}>SECTION 9. AGGREGATE DATA — OWNERSHIP AND LICENSE</H2>
        <P s={s}>
          IMPORTANT: This section contains material provisions regarding HotPick Sports, Inc.'s ownership and use of aggregated data derived from Platform activity. Please read it carefully before using the Platform.
        </P>

        <H3 s={s}>9.1 Individual Data vs. Aggregate Data</H3>
        <P s={s}>
          Your individual User Content — your specific Picks, scores, profile information, and SmackTalk messages — belongs to you as described in Section 6. However, when data from many Users is combined, anonymized, and aggregated, it produces a distinct category of information that HotPick Sports, Inc. refers to as "Aggregate Data."
        </P>
        <P s={s}>
          "Aggregate Data" means data derived from the collective activity of Users on the Platform that: (a) has been anonymized such that it cannot reasonably be used, directly or indirectly, to identify any individual User; (b) reflects patterns, trends, statistics, or other insights derived from Platform activity as a whole rather than from any individual User; and (c) cannot be reverse-engineered to identify any individual User.
        </P>
        <P s={s}>
          Examples of Aggregate Data include, without limitation: the percentage of Users who selected a particular team in a given week; patterns in HotPick designations across the User base; prediction accuracy trends by game type or season; engagement and retention patterns across the Platform; and SmackTalk sentiment trends related to sporting events.
        </P>

        <H3 s={s}>9.2 Ownership of Aggregate Data</H3>
        <P s={s}>
          HotPick Sports, Inc. owns all Aggregate Data. By accepting these Terms and using the Platform, you irrevocably assign to HotPick Sports, Inc. all right, title, and interest in any Aggregate Data derived from your Platform activity, to the extent any such rights would otherwise vest in you. You agree to execute any documents reasonably requested by HotPick Sports, Inc. to perfect or confirm this assignment.
        </P>

        <H3 s={s}>9.3 License to Use Aggregate Data</H3>
        <P s={s}>
          In addition to and without limiting the assignment in Section 9.2, you grant HotPick Sports, Inc. a perpetual, irrevocable, worldwide, royalty-free, fully paid-up, sublicensable license to use, reproduce, process, analyze, distribute, and commercialize Aggregate Data for any purpose whatsoever, including without limitation:
        </P>
        <Bullet s={s}>Operating, maintaining, and improving the Platform;</Bullet>
        <Bullet s={s}>Training, developing, and improving artificial intelligence and machine learning models, including models used in future Platform features;</Bullet>
        <Bullet s={s}>Conducting research and internal analytics;</Bullet>
        <Bullet s={s}>Licensing Aggregate Data to third parties, including sports media companies, broadcasters, data analytics providers, and research organizations; and</Bullet>
        <Bullet s={s}>Any other commercial or non-commercial purpose determined by HotPick Sports, Inc. in its sole discretion.</Bullet>

        <H3 s={s}>9.4 Survival</H3>
        <P s={s}>
          The assignment and licenses granted in this Section 9 are perpetual and irrevocable. They survive the termination or expiration of these Terms and the deletion of your account. When you delete your account, your personal identity is removed from all records as described in Section 12, but anonymized data derived from your Platform activity remains part of the Aggregate Data and is not deleted.
        </P>

        <H3 s={s}>9.5 SmackTalk Archive</H3>
        <P s={s}>
          SmackTalk messages archived pursuant to Section 6.3 form part of the Aggregate Data corpus and are subject to this Section 9. The archive is retained permanently and is used by HotPick Sports, Inc. for analytics, artificial intelligence model training, and potential third-party data licensing. Individual messages in the archive are not attributable to you following account deletion.
        </P>

        <H3 s={s}>9.6 No Sale of Personal Data</H3>
        <P s={s}>
          HotPick Sports, Inc. does not sell your personal information as defined under applicable law, including the California Consumer Privacy Act (CCPA). The commercial licensing of Aggregate Data described in this Section does not constitute a sale of personal information because Aggregate Data is anonymized and cannot be used to identify you.
        </P>

        {/* SECTION 10 */}
        <H2 s={s}>SECTION 10. PRIVACY</H2>
        <P s={s}>
          Your use of the Platform is also governed by our Privacy Policy, available at https://hotpicksports.com/privacy, which is incorporated into these Terms by this reference. By using the Platform, you consent to the collection, use, and disclosure of your information as described in the Privacy Policy. Please review the Privacy Policy carefully — it describes in detail what information we collect, how we use it, who we share it with, and your rights regarding your information.
        </P>

        {/* SECTION 11 */}
        <H2 s={s}>SECTION 11. THIRD-PARTY SERVICES</H2>
        <P s={s}>
          The Platform integrates with third-party services including Apple (Sign In with Apple), Google (Sign In with Google), and others identified in our Privacy Policy. Your use of third-party services is subject to their respective terms and privacy policies. HotPick Sports, Inc. is not responsible for the practices, content, or availability of any third-party services.
        </P>
        <P s={s}>
          We use publicly available data from third-party sports data providers to operate Platform features. This data is obtained for informational and operational purposes only and is not used to facilitate gambling.
        </P>

        {/* SECTION 12 */}
        <H2 s={s}>SECTION 12. ACCOUNT DELETION AND TERMINATION</H2>

        <H3 s={s}>12.1 Voluntary Account Deletion</H3>
        <P s={s}>
          You may delete your account at any time through your Profile Settings. Account deletion requires explicit confirmation. When you delete your account:
        </P>
        <Bullet s={s}>Your name, email address, Poolie Name, and profile photo are permanently removed from our systems;</Bullet>
        <Bullet s={s}>Your account is anonymized — your identity is replaced with a generic, non-reversible identifier;</Bullet>
        <Bullet s={s}>Your Picks, scores, and Pool membership records are retained in anonymized form to preserve the integrity of historical Leaderboards and competition records for other Users;</Bullet>
        <Bullet s={s}>Your SmackTalk messages in the active feed are removed; archived messages are retained in permanently anonymized form as described in Section 6.3 and Section 9;</Bullet>
        <Bullet s={s}>Your push notification tokens are deactivated; and</Bullet>
        <Bullet s={s}>Aggregate Data derived from your activity is retained as described in Section 9.</Bullet>
        <P s={s}>
          Account deletion is permanent and cannot be undone. Once your account is deleted, your identity will no longer be attributable to any remaining records, but competition records will remain intact.
        </P>

        <H3 s={s}>12.2 Termination by Company</H3>
        <P s={s}>
          HotPick Sports, Inc. reserves the right to suspend or terminate your account at any time, with or without notice, for any reason, including without limitation:
        </P>
        <Bullet s={s}>Violation of these Terms, including the age requirement or the prohibition on real-money wagering;</Bullet>
        <Bullet s={s}>Conduct that is harmful to other Users, HotPick Sports, Inc., or third parties;</Bullet>
        <Bullet s={s}>Requests from law enforcement or government authorities;</Bullet>
        <Bullet s={s}>Extended periods of inactivity; or</Bullet>
        <Bullet s={s}>Technical, security, or operational reasons.</Bullet>

        <H3 s={s}>12.3 Effect of Termination</H3>
        <P s={s}>
          Upon termination, your access to the Platform will be disabled immediately. Sections 6.3 (SmackTalk Message Retention and Archive), 8 (Intellectual Property), 9 (Aggregate Data), 13 (Disclaimers), 14 (Limitation of Liability), 15 (Dispute Resolution), 16 (Governing Law), and 19 (General Provisions) survive termination of these Terms.
        </P>

        {/* SECTION 13 */}
        <H2 s={s}>SECTION 13. DISCLAIMERS OF WARRANTIES</H2>
        <P s={s}>
          THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, HOTPICK SPORTS, INC. DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
        </P>
        <P s={s}>
          HOTPICK SPORTS, INC. DOES NOT WARRANT THAT: (A) THE PLATFORM WILL MEET YOUR REQUIREMENTS; (B) THE PLATFORM WILL BE AVAILABLE AT ANY PARTICULAR TIME OR LOCATION, UNINTERRUPTED, SECURE, OR ERROR-FREE; (C) ANY ERRORS OR DEFECTS WILL BE CORRECTED; OR (D) THE PLATFORM IS FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
        </P>
        <P s={s}>
          SPORTS DATA, SCORES, AND RELATED INFORMATION PROVIDED THROUGH THE PLATFORM ARE FOR INFORMATIONAL PURPOSES ONLY. HOTPICK SPORTS, INC. IS NOT RESPONSIBLE FOR ANY ERRORS OR OMISSIONS IN SUCH DATA.
        </P>

        {/* SECTION 14 */}
        <H2 s={s}>SECTION 14. LIMITATION OF LIABILITY</H2>
        <P s={s}>
          TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, HOTPICK SPORTS, INC. AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION DAMAGES FOR LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH: (A) YOUR ACCESS TO OR USE OF (OR INABILITY TO ACCESS OR USE) THE PLATFORM; (B) ANY CONDUCT OR CONTENT OF ANY OTHER USER OR THIRD PARTY ON THE PLATFORM; (C) ANY CONTENT OBTAINED FROM THE PLATFORM; OR (D) UNAUTHORIZED ACCESS, USE, OR ALTERATION OF YOUR TRANSMISSIONS OR CONTENT.
        </P>
        <P s={s}>
          IN NO EVENT SHALL HOTPICK SPORTS, INC.'S AGGREGATE LIABILITY TO YOU EXCEED THE GREATER OF: (A) ONE HUNDRED U.S. DOLLARS ($100); OR (B) THE AMOUNT YOU HAVE PAID TO HOTPICK SPORTS, INC. IN THE TWELVE MONTHS PRECEDING THE CLAIM.
        </P>
        <P s={s}>
          THE LIMITATIONS OF LIABILITY IN THIS SECTION APPLY WHETHER OR NOT HOTPICK SPORTS, INC. HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES AND REGARDLESS OF THE THEORY OF LIABILITY. SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN WARRANTIES OR LIABILITY. IN SUCH JURISDICTIONS, OUR LIABILITY IS LIMITED TO THE FULLEST EXTENT PERMITTED BY LAW.
        </P>

        {/* SECTION 15 */}
        <H2 s={s}>SECTION 15. DISPUTE RESOLUTION</H2>
        <P s={s}>
          PLEASE READ THIS SECTION CAREFULLY. IT AFFECTS YOUR LEGAL RIGHTS, INCLUDING YOUR RIGHT TO FILE A LAWSUIT IN COURT AND YOUR RIGHT TO A JURY TRIAL.
        </P>

        <H3 s={s}>15.1 Informal Resolution</H3>
        <P s={s}>
          Before initiating formal dispute resolution proceedings, you agree to first contact HotPick Sports, Inc. at legal@hotpicksports.com with a written description of your dispute and the relief you are seeking. HotPick Sports, Inc. will attempt to resolve the dispute within 30 days of receiving your written description. If the dispute is not resolved within 30 days, either party may initiate formal proceedings as described below. This informal resolution requirement is a condition precedent to initiating arbitration or any other formal proceeding.
        </P>

        <H3 s={s}>15.2 Binding Arbitration</H3>
        <P s={s}>
          Except as set forth in Section 15.4, any dispute, controversy, or claim arising out of or relating to these Terms or the Platform, including without limitation any question regarding the existence, validity, or termination of these Terms, shall be resolved by binding arbitration administered by JAMS pursuant to its then-current Streamlined Arbitration Rules and Procedures, available at www.jamsadr.com.
        </P>
        <P s={s}>
          The arbitration shall be conducted by a single neutral arbitrator. The seat of the arbitration shall be New York, New York, though the arbitration may be conducted remotely by video conference. The language of the arbitration shall be English. The arbitrator's award shall be final and binding and may be entered as a judgment in any court of competent jurisdiction.
        </P>

        <H3 s={s}>15.3 Class Action Waiver</H3>
        <P s={s}>
          TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, YOU AND HOTPICK SPORTS, INC. AGREE THAT EACH PARTY MAY BRING CLAIMS AGAINST THE OTHER ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS OR REPRESENTATIVE ACTION. The arbitrator may not consolidate more than one person's claims or otherwise preside over any form of class or representative proceeding. If a court of competent jurisdiction finds this class action waiver unenforceable as applied to any particular claim or in any particular jurisdiction, then the waiver shall be severed with respect to that claim or jurisdiction only, and all other claims and all other jurisdictions shall remain subject to this waiver.
        </P>

        <H3 s={s}>15.4 Exceptions to Arbitration</H3>
        <P s={s}>
          Notwithstanding the foregoing, either party may seek injunctive or other equitable relief in any court of competent jurisdiction to prevent the actual or threatened infringement, misappropriation, or violation of intellectual property rights or confidential information, without first engaging in the informal resolution process described in Section 15.1. Either party may also bring claims in small claims court if the claims qualify under the applicable small claims court rules.
        </P>

        <H3 s={s}>15.5 Arbitration Fees</H3>
        <P s={s}>
          The payment of arbitration fees shall be governed by the applicable JAMS rules. If you demonstrate that the costs of arbitration will be prohibitive compared to the costs of litigation, HotPick Sports, Inc. will pay as much of the filing and hearing fees as the arbitrator deems necessary to prevent arbitration from being cost-prohibitive for you.
        </P>

        {/* SECTION 16 */}
        <H2 s={s}>SECTION 16. GOVERNING LAW AND VENUE</H2>
        <P s={s}>
          These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law provisions. Subject to the arbitration provisions in Section 15, you and HotPick Sports, Inc. consent to the exclusive jurisdiction and venue of the state and federal courts located in New York County, New York for any disputes not subject to arbitration.
        </P>

        {/* SECTION 17 */}
        <H2 s={s}>SECTION 17. ADDITIONAL TERMS FOR CALIFORNIA RESIDENTS</H2>
        <P s={s}>
          If you are a California resident, you have the following rights under the California Consumer Privacy Act (CCPA) and other applicable California law:
        </P>

        <H3 s={s}>Right to Know</H3>
        <P s={s}>
          You have the right to request information about the categories and specific pieces of personal information we have collected about you, the sources of that information, our business purpose for collecting it, and the categories of third parties with whom we share it.
        </P>

        <H3 s={s}>Right to Delete</H3>
        <P s={s}>
          You have the right to request deletion of personal information we have collected about you, subject to certain exceptions. See Section 12 for how account deletion works on our Platform.
        </P>

        <H3 s={s}>Right to Non-Discrimination</H3>
        <P s={s}>
          We will not discriminate against you for exercising your CCPA rights.
        </P>

        <H3 s={s}>Right to Opt Out of Sale</H3>
        <P s={s}>
          HotPick Sports, Inc. does not sell personal information as defined under the CCPA. We license Aggregate Data as described in Section 9, but Aggregate Data is anonymized and does not constitute personal information under the CCPA.
        </P>

        <P s={s}>
          To exercise your California privacy rights, contact us at legal@hotpicksports.com. We will respond to verifiable consumer requests within 45 days as required by applicable law, with an extension of an additional 45 days where reasonably necessary.
        </P>

        {/* SECTION 18 */}
        <H2 s={s}>SECTION 18. ADDITIONAL TERMS FOR CANADIAN USERS</H2>
        <P s={s}>
          If you are located in Canada, the following additional terms apply:
        </P>

        <H3 s={s}>CASL Compliance</H3>
        <P s={s}>
          We will comply with Canada's Anti-Spam Legislation (CASL) with respect to any commercial electronic messages we send to you. Transactional messages, including authentication emails (magic links) and pick deadline reminders sent in connection with your use of the Platform, are exempt from CASL's express consent requirements as they are sent in the context of your existing relationship with the Platform. If we send you commercial or promotional emails unrelated to your direct use of the Platform, we will obtain your express consent as required by CASL.
        </P>

        <H3 s={s}>Language</H3>
        <P s={s}>
          These Terms are written in English. To the extent applicable law in Quebec requires a French version, HotPick Sports, Inc. will provide one upon written request to legal@hotpicksports.com.
        </P>

        {/* SECTION 19 */}
        <H2 s={s}>SECTION 19. GENERAL PROVISIONS</H2>

        <H3 s={s}>19.1 Entire Agreement</H3>
        <P s={s}>
          These Terms, together with our Privacy Policy and any other agreements or policies incorporated herein by reference, constitute the entire agreement between you and HotPick Sports, Inc. regarding the Platform and supersede all prior agreements and understandings, whether written or oral, relating to the subject matter hereof.
        </P>

        <H3 s={s}>19.2 Severability</H3>
        <P s={s}>
          If any provision of these Terms is found by a court or arbitrator of competent jurisdiction to be unenforceable or invalid, that provision will be limited or eliminated to the minimum extent necessary so that the remaining provisions of these Terms will remain in full force and effect.
        </P>

        <H3 s={s}>19.3 No Waiver</H3>
        <P s={s}>
          Our failure to exercise or enforce any right or provision of these Terms shall not constitute a waiver of such right or provision. Any waiver of any provision of these Terms will be effective only if in writing and signed by HotPick Sports, Inc.
        </P>

        <H3 s={s}>19.4 Assignment</H3>
        <P s={s}>
          You may not assign or transfer these Terms or any of your rights hereunder without our prior written consent. HotPick Sports, Inc. may freely assign these Terms, including in connection with a merger, acquisition, or sale of all or substantially all of our assets, without your consent. These Terms will inure to the benefit of and be binding upon permitted successors and assigns.
        </P>

        <H3 s={s}>19.5 Acquisition and Business Transfers</H3>
        <P s={s}>
          In the event of a merger, acquisition, reorganization, or sale of all or substantially all of HotPick Sports, Inc.'s assets, User information and Aggregate Data may be transferred to the acquiring entity as a business asset. You will be notified of any such transfer via the Platform or by email and will have the opportunity to delete your account if you do not wish your personal information to be transferred. Aggregate Data, as defined in Section 9, is an owned asset of HotPick Sports, Inc. and transfers to any acquirer without restriction.
        </P>

        <H3 s={s}>19.6 Force Majeure</H3>
        <P s={s}>
          HotPick Sports, Inc. shall not be liable for any failure or delay in performance due to causes beyond our reasonable control, including acts of God, natural disasters, pandemic, war, terrorism, civil unrest, government action, labor disputes, or failures of third-party infrastructure providers.
        </P>

        <H3 s={s}>19.7 Contact Information</H3>
        <P s={s}>
          If you have questions about these Terms or need to provide notice to HotPick Sports, Inc. for purposes of dispute resolution or any other legal matter, please contact us at:
        </P>
        <P s={s}>
          HotPick Sports, Inc.{'\n'}
          Attn: Legal{'\n'}
          1148 Michigan Ave.{'\n'}
          Buffalo, NY 14209
        </P>
        <P s={s}>Email: legal@hotpicksports.com</P>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            HotPick Sports Terms of Service — Version 1.0 — Effective March 19, 2026
          </Text>
          <Text style={s.footerText}>
            Copyright 2026 HotPick Sports, Inc. All rights reserved.
          </Text>
          <Text style={s.footerText}>
            https://hotpicksports.com/terms
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
