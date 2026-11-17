import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { INTENTS, VIBES, vibesFromMask } from '@bluesight/protocol';
import { formatBytes, initials } from '../lib/format';
import { C, fill, PROXIMITY, R, T } from '../theme';
import { Icon } from './Icon';
import { Txt } from './ui';

export interface CardPerson {
  name: string;
  age: number;
  intent: number;
  vibes: number;
  bio: string;
  thumbhash?: string;
  photoUri?: string;
  verified?: boolean;
  livesIn?: string;
}

/**
 * The swipe card. The badge in the corner says how this person reached you:
 * blue = Bluetooth, close by, free; amber = internet, with the distance bucket.
 */
export function ProfileCard({
  person,
  proximity,
  distance,
  photoCost,
  onLoadPhoto,
  photoLoading,
  onPhotoLoad,
}: {
  person: CardPerson;
  proximity?: 0 | 1 | 2;
  distance?: string;
  /** set when a photo exists but hasn't been downloaded (Lite mode) */
  photoCost?: number;
  onLoadPhoto?: () => void;
  photoLoading?: boolean;
  /** fires when the photo finishes loading; cacheType 'none' means it came over the network */
  onPhotoLoad?: (cacheType: 'none' | 'disk' | 'memory') => void;
}) {
  const vibes = vibesFromMask(person.vibes).slice(0, 4);
  const near = proximity !== undefined ? PROXIMITY[proximity] : null;
  return (
    <View style={st.card}>
      {person.thumbhash ? <Image source={{ thumbhash: person.thumbhash }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      {person.photoUri ? (
        <Image
          source={{ uri: person.photoUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          cachePolicy="disk"
          onLoad={(e) => onPhotoLoad?.(e.cacheType)}
        />
      ) : photoCost !== undefined ? null : (
        <View style={st.initialsWrap} pointerEvents="none">
          <Txt display size={84} color="rgba(255,241,224,0.88)">
            {initials(person.name)}
          </Txt>
        </View>
      )}

      <View style={st.topRow}>
        {near ? (
          <View style={[st.badge, { backgroundColor: 'rgba(23,15,51,0.72)' }]}>
            <View style={[st.dot, { backgroundColor: near.color }]} />
            <Txt size={T.small} weight="700" color={near.color}>
              {near.label}
            </Txt>
          </View>
        ) : distance ? (
          <View style={[st.badge, { backgroundColor: 'rgba(23,15,51,0.72)' }]}>
            <Icon name="globe" size={14} color={C.amber} />
            <Txt size={T.small} weight="700" color={C.amber}>
              {distance}
            </Txt>
          </View>
        ) : (
          <View />
        )}
        {person.verified ? (
          <View style={[st.badge, { backgroundColor: 'rgba(23,15,51,0.72)' }]} accessibilityLabel="Verified phone number">
            <Icon name="shield" size={14} color={C.cream} />
            <Txt size={T.small} weight="700">
              Verified
            </Txt>
          </View>
        ) : null}
      </View>

      {photoCost !== undefined && !person.photoUri ? (
        <Pressable onPress={onLoadPhoto} style={st.loadPhoto} accessibilityRole="button" accessibilityLabel={`Load photo, ${formatBytes(photoCost)}`}>
          <Icon name="camera" size={16} color={C.amber} />
          <Txt size={T.small} weight="700" color={C.amber}>
            {photoLoading ? 'Loading photo…' : `Load photo (${formatBytes(photoCost)})`}
          </Txt>
        </Pressable>
      ) : null}

      <LinearGradient colors={['rgba(23,15,51,0)', 'rgba(23,15,51,0.86)', 'rgba(23,15,51,0.98)']} locations={[0, 0.45, 1]} style={st.shade}>
        <Txt display size={28}>
          {person.name}
          <Txt display size={22} color={C.lavender}>
            {`  ${person.age}`}
          </Txt>
        </Txt>
        {person.intent || person.livesIn ? (
          <Txt size={T.small} color={C.lavender} weight="600">
            {[person.intent ? `Here for ${INTENTS[person.intent].toLowerCase()}` : '', person.livesIn ? `Lives in ${person.livesIn}` : '']
              .filter(Boolean)
              .join('. ')}
          </Txt>
        ) : null}
        {vibes.length ? (
          <View style={st.vibes}>
            {vibes.map((v) => (
              <View key={v} style={st.vibe}>
                <Txt size={T.small}>{`${VIBES[v].emoji} ${VIBES[v].label}`}</Txt>
              </View>
            ))}
          </View>
        ) : null}
        {person.bio ? (
          <Txt numberOfLines={2} color={C.cream}>
            {person.bio}
          </Txt>
        ) : null}
      </LinearGradient>
    </View>
  );
}

const st = StyleSheet.create({
  card: { flex: 1, borderRadius: R.card, overflow: 'hidden', backgroundColor: C.dusk, borderWidth: 1, borderColor: 'rgba(255,241,224,0.08)' },
  initialsWrap: { ...fill, alignItems: 'center', justifyContent: 'center', paddingBottom: 120 },
  topRow: { position: 'absolute', top: 14, left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill },
  dot: { width: 8, height: 8, borderRadius: 4 },
  loadPhoto: {
    position: 'absolute',
    top: '38%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: R.pill,
    borderWidth: 1.5,
    borderColor: C.amber,
    backgroundColor: 'rgba(23,15,51,0.8)',
  },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 70, paddingHorizontal: 20, paddingBottom: 20, gap: 8 },
  vibes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  vibe: { backgroundColor: 'rgba(255,241,224,0.12)', borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
});
