import React from 'react';
import {Text} from '@shared/components/AppText';
import {
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';

/**
 * Default photo-upload handler. Real upload flow is deferred until the
 * image-picker dependency ships — showing this alert keeps the affordance
 * visible and sets user expectation.
 */
function defaultUploadPress() {
  Alert.alert(
    'Coming Soon',
    'Photo upload will be available soon. Choose a system avatar for now!',
  );
}

/** System avatars — colored abstract shapes with initials fallback.
 *
 * No flame here, deliberately. The flame means exactly one thing in this
 * product — "this is my HotPick" — and it renders on the HotPick card and
 * nowhere else (HOME_MODULE_MAP rule 1, which bans it on Ladder rows
 * specifically). avatar_flame used to be entry [0], so it was both the default
 * and the most-picked avatar; a third of every Ladder was flames meaning
 * "I'm a user" sitting next to one flame meaning "this is my call". Spend the
 * symbol on avatars and it can't mean anything else. Do not re-add it.
 *
 * Legacy: profiles written before 2026-07-16 may still hold avatar_key
 * 'avatar_flame'. Every read path degrades gracefully (AvatarBadge falls back
 * to the initial circle; SettingsScreen to a User icon) and self-heals when the
 * Player next picks an avatar.
 */
const SYSTEM_AVATARS = [
  {key: 'avatar_bolt', color: '#FFD166', emoji: '\u{26A1}'},
  {key: 'avatar_trophy', color: '#1DC24C', emoji: '\u{1F3C6}'},
  {key: 'avatar_star', color: '#004E89', emoji: '\u{2B50}'},
  {key: 'avatar_rocket', color: '#C21D1D', emoji: '\u{1F680}'},
  {key: 'avatar_football', color: '#8B5E3C', emoji: '\u{1F3C8}'},
  {key: 'avatar_crown', color: '#9B59B6', emoji: '\u{1F451}'},
  {key: 'avatar_diamond', color: '#3498DB', emoji: '\u{1F48E}'},
] as const;

interface AvatarSelectorProps {
  selectedKey: string | null;
  onSelect: (avatar: {key: string; color: string; emoji: string}) => void;
  /** Optional. Defaults to a "Coming Soon" alert until photo upload ships. */
  onUploadPress?: () => void;
}

export function AvatarSelector({
  selectedKey,
  onSelect,
  onUploadPress = defaultUploadPress,
}: AvatarSelectorProps) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {SYSTEM_AVATARS.map(avatar => {
          const isSelected = selectedKey === avatar.key;
          return (
            <TouchableOpacity
              key={avatar.key}
              style={[
                styles.avatarCircle,
                {backgroundColor: avatar.color},
                isSelected && styles.avatarSelected,
              ]}
              onPress={() => onSelect(avatar)}>
              <Text style={styles.avatarEmoji}>{avatar.emoji}</Text>
            </TouchableOpacity>
          );
        })}

        {/* Upload photo option */}
        <TouchableOpacity
          style={[styles.avatarCircle, styles.uploadCircle]}
          onPress={onUploadPress}>
          <Text style={styles.uploadIcon}>+</Text>
          <Text style={styles.uploadLabel}>Photo</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

export {SYSTEM_AVATARS};

const createStyles = (colors: any) => StyleSheet.create({
  scrollContent: {
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  avatarSelected: {
    borderColor: colors.textPrimary,
  },
  avatarEmoji: {
    fontSize: 24,
  },
  uploadCircle: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  uploadIcon: {
    fontSize: 20,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: -2,
  },
  uploadLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: -2,
  },
});
