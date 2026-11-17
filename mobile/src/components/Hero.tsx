import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { base64 } from '@bluesight/protocol';
import { jpegDataUri, portraitJpeg } from '../lib/demo/world';
import { gradientThumbhash } from '../lib/thumbs';
import { C, R, T, fill } from '../theme';
import { Icon } from './Icon';
import { Txt } from './ui';

interface HeroPerson {
  name: string;
  age: number;
  tag: { label: string; tone: 'near' | 'home' };
}

// One person nearby, one back home: the two ways people meet on Bluesight. The side cards are
// mostly hidden behind the middle one, so their names and tags are short and sit on the outer edge.
const PEOPLE: HeroPerson[] = [
  { name: 'Kofi', age: 27, tag: { label: 'Nearby', tone: 'near' } },
  { name: 'Ama', age: 24, tag: { label: 'Here for dating', tone: 'near' } },
  { name: 'Yah', age: 25, tag: { label: 'Home', tone: 'home' } },
];

const thumbs = PEOPLE.map((p) => base64.encode(gradientThumbhash(`hero-${p.name}`)));

/**
 * The welcome hero: three profile cards fanning out, the middle one already liked.
 * People first; how it works comes later. The portraits are illustrations, generated on the phone.
 */
export function HeroCards() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The logo, copy and buttons need about 400 px; the cards get what's left, up to 176 px wide.
  const byWidth = (Math.min(width, 480) - 48) * 0.46;
  const byHeight = (height - insets.top - insets.bottom - 400 - 52) / 1.28;
  const cardW = Math.max(100, Math.min(176, byWidth, byHeight));
  const cardH = cardW * 1.28;
  // Fan the side cards out as far as the screen allows (a tilted card is ~0.53 of its width either
  // side of its centre), so more of their names and tags show past the middle card.
  const spread = Math.min(cardW * 0.8, Math.min(width, 480) / 2 - 10 - cardW * 0.534);
  const [uris, setUris] = useState<string[]>([]);
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Draw the portraits after the first frame so the screen appears instantly.
    const id = setTimeout(() => setUris(PEOPLE.map((p) => jpegDataUri(portraitJpeg(`hero-${p.name}`, 220)))), 30);
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (cancelled) return;
        if (reduced) t.setValue(1);
        else Animated.timing(t, { toValue: 1, duration: 750, delay: 150, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start();
      })
      .catch(() => t.setValue(1));
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [t]);

  const side = (dir: -1 | 1) => ({
    transform: [
      { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dir * spread] }) },
      { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, 24] }) },
      { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${dir * 9}deg`] }) },
      { scale: 0.9 },
    ],
  });

  return (
    <View style={{ height: cardH + 52, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Profiles of people near you and back home" accessible>
      <Animated.View style={[{ position: 'absolute' }, side(-1)]}>
        <MiniCard person={PEOPLE[0]} thumb={thumbs[0]} uri={uris[0]} w={cardW} h={cardH} align="left" />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute' }, side(1)]}>
        <MiniCard person={PEOPLE[2]} thumb={thumbs[2]} uri={uris[2]} w={cardW} h={cardH} align="right" />
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute',
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [10, -6] }) }],
        }}
      >
        <MiniCard person={PEOPLE[1]} thumb={thumbs[1]} uri={uris[1]} w={cardW} h={cardH} />
        <Animated.View style={[st.like, { opacity: t, transform: [{ scale: t }] }]}>
          <Icon name="heart" size={22} color={C.cream} fill={C.cream} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function MiniCard({
  person,
  thumb,
  uri,
  w,
  h,
  align = 'left',
}: {
  person: HeroPerson;
  thumb: string;
  uri?: string;
  w: number;
  h: number;
  align?: 'left' | 'right';
}) {
  const near = person.tag.tone === 'near';
  return (
    <View style={[st.card, { width: w, height: h }]}>
      <Image source={{ thumbhash: thumb }} style={fill} contentFit="cover" />
      {uri ? <Image source={{ uri }} style={fill} contentFit="cover" transition={300} /> : null}
      <LinearGradient
        colors={['rgba(23,15,51,0)', 'rgba(23,15,51,0.92)']}
        locations={[0.45, 1]}
        style={[st.shade, { alignItems: align === 'right' ? 'flex-end' : 'flex-start', padding: w < 130 ? 9 : 12 }]}
      >
        <Txt display size={w < 130 ? 15 : 18}>
          {person.name}
          <Txt display size={15} color={C.lavender}>
            {`  ${person.age}`}
          </Txt>
        </Txt>
        <View style={[st.tag, { alignSelf: align === 'right' ? 'flex-end' : 'flex-start' }]}>
          {near ? <View style={[st.dot, { backgroundColor: C.blue }]} /> : <Icon name="home" size={12} color={C.amber} />}
          <Txt size={T.tiny} weight="700" color={near ? C.blue : C.amber}>
            {person.tag.label}
          </Txt>
        </View>
      </LinearGradient>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    borderRadius: R.panel + 2,
    overflow: 'hidden',
    backgroundColor: C.dusk,
    borderWidth: 1,
    borderColor: 'rgba(255,241,224,0.12)',
  },
  shade: { ...fill, justifyContent: 'flex-end', padding: 12, gap: 6 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(23,15,51,0.72)',
    borderRadius: R.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  like: {
    position: 'absolute',
    top: -14,
    right: -14,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.hibiscus,
    borderWidth: 3,
    borderColor: C.midnight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
