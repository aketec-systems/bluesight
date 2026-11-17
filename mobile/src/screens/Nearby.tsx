import React, { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { wantsToSee } from '@bluesight/protocol';
import { CostPill } from '../components/Header';
import { BrandMark } from '../components/BrandMark';
import { Icon } from '../components/Icon';
import { ProximityStrip, Radar } from '../components/Nearby';
import { ProfileCard } from '../components/ProfileCard';
import { SwipeDeck, type SwipeDeckHandle } from '../components/SwipeDeck';
import { Button, Txt } from '../components/ui';
import { restartNearby, services } from '../lib/services';
import { toast, useApp, useUi, type Peer } from '../lib/store';
import { useNav } from '../navigation';
import { C, T } from '../theme';

export function NearbyScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const deckRef = useRef<SwipeDeckHandle>(null);
  const peers = useUi((u) => u.peers);
  const status = useUi((u) => u.nearby);
  const statusDetail = useUi((u) => u.nearbyError);
  const profile = useApp((s) => s.profile)!;
  const swipes = useApp((s) => s.nearbySwipes);
  const settings = useApp((s) => s.settings);
  const blockedSids = useApp((s) => s.blocked.sids);

  const all = useMemo(() => Object.values(peers).sort((a, b) => a.proximity - b.proximity || b.rssi - a.rssi), [peers]);
  // Arrival order keeps the top card still while signal strengths wobble.
  const deck = useMemo(
    () =>
      Object.values(peers)
        .filter(
          (p) =>
            !p.matchId &&
            !(p.sid in swipes) &&
            !blockedSids.includes(p.sid) &&
            wantsToSee(profile.showMe, p.gender) &&
            p.age >= profile.ageMin &&
            p.age <= profile.ageMax &&
            (!settings.verifiedOnly || p.verified),
        )
        .sort((a, b) => a.firstSeen - b.firstSeen),
    [peers, swipes, blockedSids, profile, settings.verifiedOnly],
  );

  const onSwipe = async (p: Peer, dir: 'left' | 'right') => {
    if (dir === 'left') return services.nearby.pass(p.sid);
    const r = await services.nearby.like(p.sid);
    if (r === 'invisible') toast('Turn on "Visible" to like people. They need to be able to reach you.');
    if (r === 'gone') toast(`${p.name} just walked out of range.`);
  };

  const visible = settings.visible;
  const problem =
    status === 'bt-off'
      ? 'Bluetooth is off. Turn it on to see who’s around.'
      : status === 'denied'
        ? statusDetail ?? 'Allow Nearby devices so Bluesight can find people around you.'
        : status === 'unsupported' || status === 'error'
          ? statusDetail ?? 'Bluetooth isn’t available on this phone.'
          : null;

  return (
    <View style={[st.screen, { paddingTop: insets.top + 6 }]}>
      <View style={st.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BrandMark size={30} />
          <Txt display size={22}>
            Bluesight
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <CostPill tone="free" label="No data used" />
          <Pressable
            onPress={() => {
              void services.nearby.setVisible(!visible);
              toast(visible ? 'Invisible. You can look, but nobody nearby can see you.' : 'Visible to people nearby.');
            }}
            style={[st.eye, { borderColor: visible ? C.blue : C.haze }]}
            accessibilityRole="switch"
            accessibilityState={{ checked: visible }}
            accessibilityLabel="Visible to people nearby"
          >
            <Icon name={visible ? 'eye' : 'eyeOff'} size={18} color={visible ? C.blue : C.lavender} />
          </Pressable>
        </View>
      </View>

      {problem ? (
        <View style={st.center}>
          <Radar size={200} />
          <Txt style={{ textAlign: 'center', maxWidth: 300 }} color={C.lavender}>
            {problem}
          </Txt>
          <Button label="Try again" variant="blue" onPress={() => void restartNearby()} />
        </View>
      ) : (
        <>
          <View style={st.countRow}>
            <Txt weight="700">{all.length === 0 ? 'Looking for people nearby' : all.length === 1 ? '1 person in range' : `${all.length} people in range`}</Txt>
            {!visible ? (
              <Txt size={T.small} color={C.amber}>
                You're invisible
              </Txt>
            ) : null}
          </View>
          {all.length > 0 ? (
            <View style={{ height: 86 }}>
              <ProximityStrip peers={all} onPress={(p) => nav.navigate('Person', { sid: p.sid })} />
            </View>
          ) : null}

          <View style={st.deck}>
            {deck.length ? (
              <SwipeDeck
                ref={deckRef}
                items={deck}
                keyOf={(p) => p.sid}
                onSwipe={onSwipe}
                renderCard={(p) => (
                  <ProfileCard
                    person={{ ...p, photoUri: p.photoData }}
                    proximity={p.proximity}
                  />
                )}
              />
            ) : (
              <View style={st.center}>
                <Radar size={220} />
                <Txt display size={T.head} style={{ textAlign: 'center' }}>
                  {all.length ? 'You’ve seen everyone nearby' : 'Looking around you'}
                </Txt>
                <Txt color={C.lavender} style={{ textAlign: 'center', maxWidth: 300 }}>
                  {all.length
                    ? 'New people show up as they arrive. Your matches are in Chats.'
                    : 'Keep the app open. People using Bluesight within about 30 metres show up here.'}
                </Txt>
              </View>
            )}
          </View>

          {deck.length ? (
            <View style={st.actions}>
              <Pressable onPress={() => deckRef.current?.swipe('left')} style={[st.round, st.pass]} accessibilityRole="button" accessibilityLabel="Pass">
                <Icon name="x" size={30} color={C.cream} />
              </Pressable>
              <Pressable onPress={() => deckRef.current?.swipe('right')} style={[st.round, st.like]} accessibilityRole="button" accessibilityLabel="Like">
                <Icon name="heart" size={34} color={C.cream} fill={C.cream} />
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.midnight },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  eye: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 16, paddingVertical: 8 },
  deck: { flex: 1, marginHorizontal: 12, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 36, paddingVertical: 14 },
  round: { alignItems: 'center', justifyContent: 'center' },
  pass: { width: 62, height: 62, borderRadius: 31, backgroundColor: C.dusk2, borderWidth: 1.5, borderColor: C.haze },
  like: { width: 74, height: 74, borderRadius: 37, backgroundColor: C.hibiscus },
});
