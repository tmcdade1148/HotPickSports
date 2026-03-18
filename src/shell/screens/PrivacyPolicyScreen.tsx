import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ArrowLeft} from 'lucide-react-native';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

const PRIVACY_URL =
  'https://mzqtrpdiqhopjmxjccwy.supabase.co/storage/v1/object/public/public-data/legal/privacy-policy.html';

/** Strip HTML tags and decode common entities for plain-text rendering */
function htmlToPlainText(html: string): string {
  // Remove style/script blocks
  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // Convert block elements to newlines
  text = text.replace(/<\/?(h[1-6]|p|div|br|li|tr)[^>]*>/gi, '\n');
  text = text.replace(/<\/?(ul|ol|table|thead|tbody)[^>]*>/gi, '\n');

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&ndash;/g, '–');
  text = text.replace(/&mdash;/g, '—');

  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

export function PrivacyPolicyScreen({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(PRIVACY_URL)
      .then(res => res.text())
      .then(html => {
        setContent(htmlToPlainText(html));
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Privacy Policy</Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Unable to load privacy policy.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
        >
          <Text style={styles.bodyText}>{content}</Text>
        </ScrollView>
      )}
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
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorText: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    bodyText: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.textPrimary,
    },
  });
