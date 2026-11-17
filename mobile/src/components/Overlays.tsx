import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { services } from '../lib/services';
import { useApp, useUi } from '../lib/store';
import { myThumbhash } from '../lib/identity';
import { matchPhoto } from '../lib/media';
import { base64 } from '@bluesight/protocol';
import { C, fill, T } from '../theme';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Button, Txt } from './ui';

/** The one orchestrated moment in the app: two avatars slide together. */
export function MatchOverlay({ onChat }: { onChat: (matchId: string) => void }) {
  const id = useUi((u) => u.matchSplash);
  const match = useApp((s) => (id ? s.matches[id] : undefined));
  const profile = useApp((s) => s.profile);
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!match) return;
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 650, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
  }, [match, t]);

  if (!match || !profile) return null;
  const close = () => useUi.setState({ matchSplash: undefined });
  const nearby = !!services.nearby.peerForMatch(match.id);
  const myThumb = base64.encode(myThumbhash());
  const myPhoto = profile.photo ? `data:image/jpeg;base64,${profile.photo.s}` : undefined;
  const theirPhoto = matchPhoto(match);

  return (
    <View style={st.backdrop} accessibilityViewIsModal>
      <View style={st.pair}>
        <Animated.View style={{ transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-120, 18] }) }, { rotate: '-6deg' }] }}>
          <Avatar name={profile.name} thumbhash={myThumb} uri={myPhoto} size={128} ring={C.blue} ringWidth={4} />
        </Animated.View>
        <Animated.View style={{ transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [120, -18] }) }, { rotate: '6deg' }] }}>
          <Avatar name={match.name} thumbhash={match.thumbhash} uri={theirPhoto} size={128} ring={C.hibiscus} ringWidth={4} />
        </Animated.View>
        <Animated.View style={[st.heart, { opacity: t, transform: [{ scale: t }] }]}>
          <Icon name="heart" size={26} color={C.cream} fill={C.cream} />
        </Animated.View>
      </View>
      <Txt display size={T.hero} style={{ textAlign: 'center' }}>
        It's a match
      </Txt>
      <Txt color={C.lavender} style={{ textAlign: 'center', maxWidth: 320 }}>
        {nearby
          ? `You and ${match.name} liked each other, and you're close by, so chatting is free right now.`
          : `You and ${match.name} liked each other. Messages use about 0.1 KB each.`}
      </Txt>
      <View style={{ gap: 12, alignSelf: 'stretch', marginTop: 12 }}>
        <Button
          label={`Message ${match.name}`}
          icon="chat"
          onPress={() => {
            close();
            onChat(match.id);
          }}
        />
        <Button label="Keep looking" variant="ghost" onPress={close} />
      </View>
    </View>
  );
}

export function Toast() {
  const toast = useUi((u) => u.toast);
  const insets = useSafeAreaInsets();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!toast) return;
    a.setValue(0);
    Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(a, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [toast, a]);
  if (!toast) return null;
  return (
    <Animated.View pointerEvents="none" style={[st.toast, { bottom: insets.bottom + 92, opacity: a }]} accessibilityLiveRegion="polite">
      <Txt size={T.small} weight="600" style={{ textAlign: 'center' }}>
        {toast.text}
      </Txt>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  backdrop: {
    ...fill,
    backgroundColor: 'rgba(23,15,51,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 14,
  },
  pair: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  heart: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.hibiscus,
    borderWidth: 3,
    borderColor: C.midnight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toast: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignSelf: 'center',
    backgroundColor: C.dusk2,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: C.haze,
  },
});
