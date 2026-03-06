import React from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  Text,
  StyleSheet,
} from 'react-native';
import {colors, spacing, borderRadius} from '@shared/theme';

/** System avatars — colored abstract shapes with initials fallback */
const SYSTEM_AVATARS = [
  {key: 'avatar_flame', color: '#FF6B35', emoji: '\u{1F525}'},
  {key: 'avatar_bolt', color: '#FFD166', emoji: '\u{26A1}'},
  {key: 'avatar_trophy', color: '#06D6A0', emoji: '\u{1F3C6}'},
  {key: 'avatar_star', color: '#004E89', emoji: '\u{2B50}'},
  {key: 'avatar_rocket', color: '#EF476F', emoji: '\u{1F680}'},
  {key: 'avatar_football', color: '#8B5E3C', emoji: '\u{1F3C8}'},
  {key: 'avatar_crown', color: '#9B59B6', emoji: '\u{1F451}'},
  {key: 'avatar_diamond', color: '#3498DB', emoji: '\u{1F48E}'},
] as const;

interface AvatarSelectorProps {
  selectedKey: string | null;
  onSelect: (avatar: {key: string; color: string; emoji: string}) => void;
  onUploadPress: () => void;
}

export function AvatarSelector({
  selectedKey,
  onSelect,
  onUploadPress,
}: AvatarSelectorProps) {
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

const styles = StyleSheet.create({
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
    borderColor: colors.text,
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
