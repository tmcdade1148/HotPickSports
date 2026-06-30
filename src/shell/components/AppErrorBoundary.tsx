// ---------------------------------------------------------------------------
// AppErrorBoundary
//
// The white-screen safety net (No Silent Failures spec, register 1.1). A render
// or lifecycle crash anywhere below this boundary is caught and shown as a
// visible, recoverable fallback instead of a blank session.
//
// Reporting funnel: componentDidCatch calls the standalone logError() ONLY.
// There is no Sentry surface anywhere in the app — a crash is reported exactly
// once, to client_error_log.
//
// NOTE: this catches render/lifecycle errors only. Async/fetch failures are NOT
// caught by any error boundary — those are surfaced explicitly at the call site
// (the "surface-don't-swallow" rule; see fetchLeaderboard).
//
// Styling exception (Hard Rule #9): a class component can't use hooks, and the
// fallback must survive a broken provider tree, so it reads static brand
// constants from hotpickDefaults directly rather than useTheme()/useBrand().
// ---------------------------------------------------------------------------
import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {HOTPICK_BRAND_COLORS, HOTPICK_BRAND} from '@shell/theme/hotpickDefaults';
import {logError} from '@shared/logging/logError';

interface Props {
  children: React.ReactNode;
  /** Optional label so a per-tab boundary can tag where the crash happened. */
  boundary?: string;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = {hasError: false};

  static getDerivedStateFromError(): State {
    return {hasError: true};
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logError(error, {
      screen: this.props.boundary ?? 'AppErrorBoundary',
      action: 'render',
      componentStack: info.componentStack?.slice(0, 2000),
    });
  }

  private goHome = () => {
    // Clearing the error re-mounts the subtree. At the top level that subtree IS
    // the NavigationContainer, which has no persisted nav state, so it remounts
    // at its initialRoute ("Loading") — the boot route that re-derives auth and
    // routes the user to Home (or the correct screen). That is the "back to a
    // known-good route" recovery, without this class needing navigation context.
    this.setState({hasError: false});
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The app hit an unexpected error. Your data is safe — head back home and
          try again.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={this.goHome}
          accessibilityRole="button"
          accessibilityLabel="Back to Home">
          <Text style={styles.buttonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: HOTPICK_BRAND_COLORS.background,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: HOTPICK_BRAND.text_primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: HOTPICK_BRAND.text_secondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: HOTPICK_BRAND_COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
