import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Peer } from '../lib/store';
import { C, PROXIMITY, T } from '../theme';
import { Avatar } from './Avatar';
import { BrandMark } from './BrandMark';
import { Icon } from './Icon';
import { Txt } from './ui';

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduced)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

/**
 * Blue rings spreading out from the Bluesight mark while the app looks for people nearby.
 */
export function Radar({ size = 240, label }: { size?: number; label?: string }) {
  const reduced = useReducedMotion();
  const waves = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (reduced) return;
    const loops = waves.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 900),
          Animated.timing(v, { toValue: 1, duration: 2700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduced, waves]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={label}>
      {[1, 0.66, 0.33].map((f) => (
        <View
          key={f}
          style={{
            position: 'absolute',
            width: size * f,
            height: size * f,
            borderRadius: (size * f) / 2,
            borderWidth: 1,
            borderColor: 'rgba(90,180,255,0.22)',
          }}
        />
      ))}
      {!reduced &&
        waves.map((v, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 2,
              borderColor: C.blue,
              opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.6, 0] }),
              transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }) }],
            }}
          />
        ))}
      <View style={st.core}>
        <BrandMark size={44} />
      </View>
    </View>
  );
}

/** Everyone in range, closest first. The ring colour is the proximity bucket; a heart marks your matches. */
export function ProximityStrip({ peers, onPress }: { peers: Peer[]; onPress: (p: Peer) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}>
      {peers.map((p) => (
        <Pressable
          key={p.sid}
          onPress={() => onPress(p)}
          style={{ alignItems: 'center', width: 62 }}
          accessibilityLabel={`${p.name}, ${PROXIMITY[p.proximity].label}${p.matchId ? ', your match' : ''}`}
        >
          <View>
            <Avatar name={p.name} thumbhash={p.thumbhash} uri={p.photoData} size={58} ring={PROXIMITY[p.proximity].color} />
            {p.matchId ? (
              <View style={st.heart}>
                <Icon name="heart" size={12} color={C.cream} fill={C.cream} />
              </View>
            ) : null}
          </View>
          <Txt size={T.tiny} numberOfLines={1} color={C.lavender} style={{ marginTop: 4 }}>
            {p.name}
          </Txt>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  core: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.dusk,
    borderWidth: 1.5,
    borderColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heart: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.hibiscus,
    borderWidth: 2,
    borderColor: C.midnight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
