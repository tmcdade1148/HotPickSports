import React from 'react';
import {Text} from '@shared/components/AppText';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import {MessageCircle} from 'lucide-react-native';
import {useTheme} from '@shell/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {spacing} from '@shared/theme';

/**
 * ContestSwitchModal — the single "Switch Contest" picker.
 *
 * Extracted from PoolSwitcherBar so the Ladder/Chirp header chevron and the
 * EventDetail switcher share ONE modal + switchTo() + setActivePoolId — no
 * duplicate implementation. Reads all pool data from globalStore internally;
 * the caller only owns the open/close state.
 */
export function ContestSwitchModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const {colors} = useTheme();
  const userPools = useGlobalStore(s => s.visiblePools);
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const smackUnreadCounts = useGlobalStore(s => s.smackUnreadCounts);
  const flaggedCounts = useGlobalStore(s => s.flaggedCounts);

  const switchTo = (poolId: string) => {
    setActivePoolId(poolId);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.modal, {backgroundColor: colors.surface}]}>
          <Text style={[styles.modalTitle, {color: colors.textPrimary}]}>
            Switch Contest
          </Text>
          <ScrollView bounces={false}>
            {[
              ...userPools.filter(p => !!(p.brand_config as any)?.is_branded),
              ...userPools.filter(p => !(p.brand_config as any)?.is_branded),
            ].map(item => {
              const unread = smackUnreadCounts[item.id] ?? 0;
              const flagged = flaggedCounts[item.id] ?? 0;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.poolOption, {borderBottomColor: colors.border}]}
                  onPress={() => switchTo(item.id)}>
                  <View style={styles.poolOptionRow}>
                    <Text
                      style={[
                        styles.poolOptionText,
                        {color: colors.textPrimary},
                        item.id === activePoolId && {color: colors.primary},
                      ]}>
                      {item.name}
                    </Text>
                    {flagged > 0 && (
                      <View style={[styles.flaggedDot, {backgroundColor: colors.error}]}>
                        <Text style={[styles.flaggedDotText, {color: colors.onPrimary}]}>{flagged}</Text>
                      </View>
                    )}
                    {unread > 0 && (
                      <MessageCircle
                        size={14}
                        color={colors.primary}
                        fill={colors.primary}
                      />
                    )}
                  </View>
                  {item.id === activePoolId && (
                    <Text style={{color: colors.primary, fontSize: 16}}>
                      {'✓'}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modal: {
    width: '80%',
    maxHeight: '60%',
    borderRadius: 12,
    padding: spacing.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  poolOption: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  poolOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  poolOptionText: {
    fontSize: 16,
  },
  flaggedDot: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  flaggedDotText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
