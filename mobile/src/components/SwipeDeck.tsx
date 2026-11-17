import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import { C } from '../theme';
import { Icon } from './Icon';

export type SwipeDir = 'left' | 'right';
export interface SwipeDeckHandle {
  swipe(dir: SwipeDir): void;
}

/**
 * Plain Animated + PanResponder: no native gesture libraries, so it behaves the same on cheap
 * Android phones and on the web preview.
 */
function Deck<T>(
  {
    items,
    keyOf,
    renderCard,
    onSwipe,
  }: {
    items: T[];
    keyOf: (t: T) => string;
    renderCard: (t: T, top: boolean) => React.ReactNode;
    onSwipe: (t: T, dir: SwipeDir) => void;
  },
  ref: React.Ref<SwipeDeckHandle>,
) {
  const { width } = useWindowDimensions();
  const pan = useRef(new Animated.ValueXY()).current;
  const busy = useRef(false);
  const top = items[0];
  const next = items[1];
  const topRef = useRef(top);
  topRef.current = top;
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  const fling = (dir: SwipeDir, dy = 0) => {
    const item = topRef.current;
    if (!item || busy.current) return;
    busy.current = true;
    Animated.timing(pan, { toValue: { x: (dir === 'right' ? 1 : -1) * width * 1.4, y: dy }, duration: 220, useNativeDriver: false }).start(() => {
      pan.setValue({ x: 0, y: 0 });
      busy.current = false;
      onSwipeRef.current(item, dir);
    });
  };

  useImperativeHandle(ref, () => ({ swipe: (dir) => fling(dir) }));

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => pan.setValue({ x: g.dx, y: g.dy * 0.3 }),
        onPanResponderRelease: (_, g) => {
          const threshold = width * 0.28;
          if (g.dx > threshold || g.vx > 0.9) fling('right', g.dy);
          else if (g.dx < -threshold || g.vx < -0.9) fling('left', g.dy);
          else Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () => Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width],
  );

  const rotate = pan.x.interpolate({ inputRange: [-width, 0, width], outputRange: ['-10deg', '0deg', '10deg'] });
  const likeOpacity = pan.x.interpolate({ inputRange: [0, width * 0.25], outputRange: [0, 1], extrapolate: 'clamp' });
  const passOpacity = pan.x.interpolate({ inputRange: [-width * 0.25, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const nextScale = pan.x.interpolate({ inputRange: [-width, 0, width], outputRange: [1, 0.95, 1], extrapolate: 'clamp' });

  return (
    <View style={{ flex: 1 }}>
      {next ? (
        <Animated.View key={keyOf(next)} style={[StyleSheet.absoluteFill, { transform: [{ scale: nextScale }], opacity: 0.85 }]} pointerEvents="none">
          {renderCard(next, false)}
        </Animated.View>
      ) : null}
      {top ? (
        <Animated.View
          key={keyOf(top)}
          {...responder.panHandlers}
          style={[StyleSheet.absoluteFill, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]}
        >
          {renderCard(top, true)}
          <Animated.View style={[st.stamp, st.stampRight, { opacity: likeOpacity }]} pointerEvents="none">
            <Icon name="heart" size={44} color={C.hibiscus} fill={C.hibiscus} />
          </Animated.View>
          <Animated.View style={[st.stamp, st.stampLeft, { opacity: passOpacity }]} pointerEvents="none">
            <Icon name="x" size={44} color={C.cream} />
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

export const SwipeDeck = forwardRef(Deck) as <T>(
  p: {
    items: T[];
    keyOf: (t: T) => string;
    renderCard: (t: T, top: boolean) => React.ReactNode;
    onSwipe: (t: T, dir: SwipeDir) => void;
  } & { ref?: React.Ref<SwipeDeckHandle> },
) => React.ReactElement;

const st = StyleSheet.create({
  stamp: {
    position: 'absolute',
    top: 70,
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(23,15,51,0.7)',
  },
  stampRight: { left: 24 },
  stampLeft: { right: 24 },
});
