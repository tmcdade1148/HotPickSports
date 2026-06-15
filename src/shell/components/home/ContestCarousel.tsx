// ContestCarousel — horizontal swipe through the user's contests on Home
// (per Tom, 2026-06-15). Replaces the vertical PoolModule stack in the in-cycle
// YOUR CONTESTS section:
//   • one full-width contest card per swipe (paging snap)
//   • a dot per contest to the right of the section title; the active/visible
//     contest's dot is orange
//   • swiping to a card makes it the GLOBALLY active contest (Board + Chirps
//     follow it too) per Hard Rule #20 — the visible card IS the active one
//
// HotPick-themed (Hard Rule #9); the Join/Create affordance stays below the
// carousel in HomeScreen, not here.

import React, {useEffect, useMemo, useRef} from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {bodyType, spacing} from '@shared/theme';
import {LEXICON} from '@shared/lexicon';
import type {DbPool} from '@shared/types/database';
import {PoolModule} from './PoolModule';

interface ContestCarouselProps {
  pools: DbPool[];
  /** Apply the carousel's own top margin. False when it's already inside a
   *  section that provides the gap (avoids doubling the space). */
  topMargin?: boolean;
}

export function ContestCarousel({pools, topMargin = true}: ContestCarouselProps) {
  const {colors} = useTheme();
  const {width} = useWindowDimensions();
  const activePoolId = useGlobalStore(s => s.activePoolId);
  const setActivePoolId = useGlobalStore(s => s.setActivePoolId);
  const listRef = useRef<FlatList<DbPool>>(null);

  // The active card's index drives both the snap position and the orange dot.
  const activeIndex = useMemo(() => {
    const i = pools.findIndex(p => p.id === activePoolId);
    return i >= 0 ? i : 0;
  }, [pools, activePoolId]);

  // Tracks where the list is actually settled so an external active-pool change
  // (e.g. from the switcher) scrolls the carousel without fighting a user swipe.
  const settledIndex = useRef(activeIndex);

  useEffect(() => {
    if (activeIndex !== settledIndex.current && pools.length > 0) {
      settledIndex.current = activeIndex;
      listRef.current?.scrollToIndex({index: activeIndex, animated: true});
    }
  }, [activeIndex, pools.length]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    settledIndex.current = i;
    const landed = pools[i];
    if (landed && landed.id !== activePoolId) {
      setActivePoolId(landed.id); // global: Board + Chirps follow
    }
  };

  return (
    <View style={[styles.wrap, topMargin && {marginTop: spacing.lg}]}>
      <View style={styles.titleRow}>
        <Text style={[bodyType.bold, styles.title, {color: colors.textTertiary}]}>
          YOUR {LEXICON.contest.plural.toUpperCase()}
        </Text>
        {pools.length > 1 && (
          <View
            style={styles.dots}
            accessibilityLabel={`Contest ${activeIndex + 1} of ${pools.length}`}>
            {pools.map((p, i) => (
              <View
                key={p.id}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      i === activeIndex ? colors.primary : colors.border,
                    width: i === activeIndex ? 8 : 6,
                    height: i === activeIndex ? 8 : 6,
                  },
                ]}
              />
            ))}
          </View>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={pools}
        keyExtractor={p => p.id}
        renderItem={({item}) => (
          <View style={{width}}>
            <PoolModule pool={item} />
          </View>
        )}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={width}
        snapToAlignment="start"
        disableIntervalMomentum
        initialScrollIndex={activeIndex}
        getItemLayout={(_d, index) => ({length: width, offset: width * index, index})}
        onMomentumScrollEnd={onMomentumEnd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: 10,
  },
  title: {
    fontSize: 11,
    letterSpacing: 1.8,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    borderRadius: 4,
  },
});
