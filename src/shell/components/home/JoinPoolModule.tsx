/**
 * JoinPoolModule — Self-hiding join/create CTA for users with no private pool.
 *
 * Renders when user has no private pool AND phase !== SEASON_COMPLETE.
 * Self-hides on successful join or pool creation (hasPrivatePool becomes true).
 * No dismiss/close button — this IS the CTA for new users.
 *
 * All colors via useTheme(). All join logic delegates to rpc_join_pool_by_code.
 * Error messages render inline — never as Alert/modal.
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Plus} from 'lucide-react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme';
import {spacing, borderRadius, typography} from '@shared/theme';

/** Map RPC error codes to user-readable messages */
function getErrorMessage(errorMessage: string): string {
  if (errorMessage.includes('NOT_FOUND')) {
    return "That code doesn't match any pool. Double-check and try again.";
  }
  if (errorMessage.includes('WRONG_SEASON')) {
    return 'That pool is for a different season. Ask your organizer for the current code.';
  }
  if (errorMessage.includes('POOL_FULL')) {
    return "This pool is full. Let your organizer know — they may be able to upgrade.";
  }
  if (errorMessage.includes('ALREADY_MEMBER')) {
    return "You're already in this pool! Check the leaderboard tab.";
  }
  if (errorMessage.includes('POOL_INACTIVE')) {
    return 'This pool is no longer active. Contact your organizer.';
  }
  return 'Something went wrong. Please try again.';
}

export function JoinPoolModule() {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const navigation = useNavigation<any>();

  const user = useGlobalStore(s => s.user);
  const joinPool = useGlobalStore(s => s.joinPool);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);

  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [successName, setSuccessName] = useState('');

  const handleJoin = async () => {
    if (!code.trim() || !user?.id) return;

    setJoining(true);
    setError('');
    setSuccessName('');

    const result = await joinPool(user.id, code.trim());

    if (result.pool) {
      setCode('');
      setSuccessName(result.pool.name);
      // Delay pool activation slightly so the success state renders
      // before this module unmounts (prevents Fabric ShadowView crash)
      setTimeout(() => setActivePoolId(result.pool!.id), 150);
    } else if (result.poolFull) {
      setError("This pool is full. Let your organizer know — they may be able to upgrade.");
    } else {
      setError(getErrorMessage(result.error ?? ''));
    }

    setJoining(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Have an invite code?</Text>

      <View style={styles.codeRow}>
        <TextInput
          style={styles.input}
          placeholder="Enter invite code"
          placeholderTextColor={colors.textSecondary}
          value={code}
          onChangeText={text => {
            setCode(text.toUpperCase());
            if (error) setError('');
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          returnKeyType="go"
          onSubmitEditing={handleJoin}
        />
        <TouchableOpacity
          style={[
            styles.joinButton,
            (!code.trim() || joining) && styles.joinButtonDisabled,
          ]}
          onPress={handleJoin}
          disabled={!code.trim() || joining}>
          {joining ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.joinButtonText}>Join</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Inline error */}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Success toast */}
      {successName ? (
        <Text style={styles.successText}>
          You're in! Welcome to {successName}.
        </Text>
      ) : null}

      {/* Divider */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Create a Pool */}
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => navigation.navigate('CreatePool')}>
        <Plus size={18} color={colors.primary} />
        <View>
          <Text style={styles.createButtonText}>Create a Pool</Text>
          <Text style={styles.createButtonSub}>and invite friends</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    label: {
      ...typography.body,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    codeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      fontSize: 16,
      letterSpacing: 2,
      fontWeight: '600',
      color: colors.textPrimary,
      backgroundColor: colors.background,
    },
    joinButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    joinButtonDisabled: {
      opacity: 0.4,
    },
    joinButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    errorText: {
      ...typography.small,
      color: colors.error,
      marginTop: spacing.xs,
    },
    successText: {
      ...typography.small,
      color: colors.success,
      fontWeight: '600',
      marginTop: spacing.xs,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: spacing.md,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    dividerText: {
      ...typography.small,
      color: colors.textSecondary,
      marginHorizontal: spacing.md,
    },
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.primary,
      backgroundColor: colors.background,
      padding: spacing.md,
    },
    createButtonText: {
      ...typography.body,
      fontWeight: '600',
      color: colors.primary,
    },
    createButtonSub: {
      ...typography.small,
      color: colors.primary,
      opacity: 0.7,
      marginTop: 1,
    },
  });
