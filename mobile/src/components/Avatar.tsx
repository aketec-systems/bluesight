import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { initials } from '../lib/format';
import { C } from '../theme';
import { Txt } from './ui';

/**
 * Photo if we have one, otherwise the thumbhash blur with initials. The blur costs ~25 bytes and is
 * always there instantly, so nothing ever looks "loading".
 */
export function Avatar({
  name,
  thumbhash,
  uri,
  size = 52,
  ring,
  ringWidth = 3,
}: {
  name: string;
  thumbhash?: string;
  uri?: string;
  size?: number;
  ring?: string;
  ringWidth?: number;
}) {
  const inner = ring ? size - ringWidth * 2 - 4 : size;
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' },
        ring ? { borderWidth: ringWidth, borderColor: ring } : null,
      ]}
    >
      <View style={{ width: inner, height: inner, borderRadius: inner / 2, overflow: 'hidden', backgroundColor: C.haze }}>
        {thumbhash ? <Image source={{ thumbhash }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <Txt display size={Math.round(inner * 0.34)} color={C.cream} style={{ textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 }}>
              {initials(name)}
            </Txt>
          </View>
        )}
      </View>
    </View>
  );
}
