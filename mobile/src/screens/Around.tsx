import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CostPill } from '../components/Header';
import { Icon } from '../components/Icon';
import { ProfileCard } from '../components/ProfileCard';
import { SwipeDeck, type SwipeDeckHandle } from '../components/SwipeDeck';
import { Button, Txt } from '../components/ui';
import { loadAroundDeck, swipeAround } from '../lib/account';
import { canUse, networkBlockReason, recordBytes } from '../lib/data';
import { formatBytes } from '../lib/format';
import { remotePhoto, revealPhoto } from '../lib/media';
import { services } from '../lib/services';
import { setApp, toast, useApp, useUi, type AroundCard } from '../lib/store';
import { useNav } from '../navigation';
import { C, T } from '../theme';

const counted = new Set<string>();

/** People around town, over the internet. Amber = this costs data, and every cost is shown. */
export function AroundScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const deckRef = useRef<SwipeDeckHandle>(null);
  const account = useApp((s) => s.account);
  const deckAll = useApp((s) => s.aroundDeck);
  const swiped = useApp((s) => s.aroundSwipes);
  const revealed = useApp((s) => s.revealedPhotos);
  const usage = useApp((s) => s.usage);
  const mode = useApp((s) => s.settings.dataMode);
  const city = useApp((s) => s.settings.searchCity);
  useUi((u) => u.online); // re-render on connectivity changes
  const needsLocation = useUi((u) => !!u.aroundNeedsLocation);
  const [loading, setLoading] = useState<string | null>(null);

  const deck = useMemo(() => deckAll.filter((c) => !(c.u in swiped)), [deckAll, swiped]);
  const spent = usage.cell.deck + usage.cell.photos;
  const blocked = networkBlockReason();

  useEffect(() => {
    if (account) void loadAroundDeck();
  }, [account]);

  if (!services.api) {
    return (
      <Empty insets={insets.top} title="Bluetooth-only build" body="This build isn't connected to a server. Nearby works fully offline." />
    );
  }

  const where = (
    <Pressable onPress={() => nav.navigate('Location')} style={st.where} accessibilityRole="button" accessibilityLabel="Change search location">
      <Icon name={city ? 'globe' : 'pin'} size={16} color={C.lavender} />
      <Txt size={T.small} weight="700" style={{ flex: 1 }} numberOfLines={1}>
        {city ? `Searching ${city.name}, ${city.country}` : 'Searching near you'}
      </Txt>
      <Txt size={T.small} weight="700" color={C.hibiscus}>
        Change
      </Txt>
    </Pressable>
  );

  if (!account) {
    return (
      <Empty
        insets={insets.top}
        title={city ? `See who's in ${city.name}` : 'See people near you,\nor back home'}
        body={
          city
            ? `Verify your number to start matching in ${city.name}. Loading 20 people uses about 4 KB.`
            : 'Verify your number to browse people near you, or pick any city, like home before a visit. Loading 20 people uses about 4 KB.'
        }
        where={where}
        heading={city?.name}
      >
        <Button label="Verify my number" onPress={() => nav.navigate('Account')} />
      </Empty>
    );
  }

  const photoFor = (c: AroundCard) => remotePhoto(c.p, c.u);

  return (
    <View style={[st.screen, { paddingTop: insets.top + 6 }]}>
      <View style={st.header}>
        <Txt display size={T.title} numberOfLines={1} style={{ flexShrink: 1 }}>
          {city ? city.name : 'Around you'}
        </Txt>
        <CostPill tone="data" label={`${formatBytes(spent)} this month`} />
      </View>
      {where}
      {blocked && deck.length === 0 ? (
        <View style={st.center}>
          <Txt color={C.lavender} style={{ textAlign: 'center' }}>
            {blocked}
          </Txt>
          {mode === 'zero' ? (
            <Button label="Switch to Lite" variant="amber" onPress={() => setApp((s) => ({ settings: { ...s.settings, dataMode: 'lite' } }))} />
          ) : null}
        </View>
      ) : deck.length ? (
        <>
          <View style={st.deck}>
            <SwipeDeck
              ref={deckRef}
              items={deck}
              keyOf={(c) => c.u}
              onSwipe={(c, dir) => swipeAround(c, dir === 'right')}
              renderCard={(c, top) => {
                const uri = photoFor(c);
                return (
                  <ProfileCard
                    person={{ name: c.n, age: c.a, intent: c.i, vibes: c.v, bio: c.b, thumbhash: c.th, photoUri: uri, livesIn: c.li }}
                    distance={c.d}
                    photoCost={top && c.p && !uri ? c.ps?.[0] ?? 12000 : undefined}
                    photoLoading={loading === c.u}
                    onLoadPhoto={() => {
                      if (!canUse('photoTap')) return toast(networkBlockReason() ?? 'Photos are off right now.');
                      setLoading(c.u);
                      revealPhoto(c.u);
                    }}
                    onPhotoLoad={(cacheType) => {
                      setLoading(null);
                      if (cacheType === 'none' && !counted.has(c.u)) {
                        counted.add(c.u);
                        recordBytes('photos', c.ps?.[0] ?? 12000);
                      }
                    }}
                  />
                );
              }}
            />
          </View>
          <View style={st.actions}>
            <Pressable onPress={() => deckRef.current?.swipe('left')} style={[st.round, st.pass]} accessibilityRole="button" accessibilityLabel="Pass">
              <Icon name="x" size={30} color={C.cream} />
            </Pressable>
            <Pressable onPress={() => deckRef.current?.swipe('right')} style={[st.round, st.like]} accessibilityRole="button" accessibilityLabel="Like">
              <Icon name="heart" size={34} color={C.cream} fill={C.cream} />
            </Pressable>
          </View>
        </>
      ) : needsLocation && !city ? (
        <View style={st.center}>
          <Icon name="pin" size={48} color={C.lavender} />
          <Txt display size={T.head} style={{ textAlign: 'center' }}>
            Where are you?
          </Txt>
          <Txt color={C.lavender} style={{ textAlign: 'center', maxWidth: 300 }}>
            Allow location to see people near you. It's rounded to about 2 km first. Or pick a city to search.
          </Txt>
          <Button label="Try again" variant="amber" onPress={() => void loadAroundDeck(true)} />
          <Button label="Pick a city" variant="ghost" onPress={() => nav.navigate('Location')} />
        </View>
      ) : (
        <View style={st.center}>
          <Icon name="globe" size={48} color={C.amber} />
          <Txt display size={T.head} style={{ textAlign: 'center' }}>
            {city ? `That's everyone in ${city.name} for now` : "That's everyone for now"}
          </Txt>
          <Txt color={C.lavender} style={{ textAlign: 'center', maxWidth: 300 }}>
            New people join all the time. Checking again costs about 4 KB.
          </Txt>
          <Button label="Check again" variant="amber" onPress={() => void loadAroundDeck(true)} />
        </View>
      )}
    </View>
  );
}

function Empty({
  insets,
  title,
  body,
  where,
  heading,
  children,
}: {
  insets: number;
  title: string;
  body: string;
  where?: React.ReactNode;
  heading?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={[st.screen, { paddingTop: insets + 6 }]}>
      <View style={st.header}>
        <Txt display size={T.title} numberOfLines={1}>
          {heading ?? 'Around you'}
        </Txt>
      </View>
      {where}
      <View style={st.center}>
        <Icon name="globe" size={48} color={C.amber} />
        <Txt display size={T.head} style={{ textAlign: 'center' }}>
          {title}
        </Txt>
        <Txt color={C.lavender} style={{ textAlign: 'center', maxWidth: 300 }}>
          {body}
        </Txt>
        {children}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.midnight },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  where: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: C.dusk,
  },
  deck: { flex: 1, marginHorizontal: 12, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 36, paddingVertical: 14 },
  round: { alignItems: 'center', justifyContent: 'center' },
  pass: { width: 62, height: 62, borderRadius: 31, backgroundColor: C.dusk2, borderWidth: 1.5, borderColor: C.haze },
  like: { width: 74, height: 74, borderRadius: 37, backgroundColor: C.hibiscus },
});
