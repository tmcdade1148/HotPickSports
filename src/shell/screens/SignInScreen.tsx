import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {colors, spacing} from '@shared/theme';

export function SignInScreen({navigation}: any) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>HotPick Sports</Text>
      <Text style={styles.subtitle}>Make your picks. Win bragging rights.</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.replace('Home')}>
        <Text style={styles.buttonText}>Sign In</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
        <Text style={styles.link}>Don't have an account? Sign Up</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    color: colors.primary,
    fontSize: 14,
    marginTop: spacing.sm,
  },
});
