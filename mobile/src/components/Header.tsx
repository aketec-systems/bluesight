import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, T } from '../theme';
import { Icon } from './Icon';
import { Txt } from './ui';

export function Header({ title, back, right, sub }: { title: string; back?: boolean; right?: React.ReactNode; sub?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  return (
    <View style={[st.wrap, { paddingTop: insets.top + 6 }]}>
      {back ? (
        <Pressable onPress={() => nav.goBack()} hitSlop={12} style={st.back} accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="back" size={24} color={C.cream} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt display size={back ? T.head : T.title} numberOfLines={1}>
          {title}
        </Txt>
        {sub}
      </View>
      {right}
    </View>
  );
}

/** A small pill showing what the current screen costs: blue when free, amber when it uses data. */
export function CostPill({ tone, label }: { tone: 'free' | 'data'; label: string }) {
  const color = tone === 'free' ? C.blue : C.amber;
  return (
    <View style={[st.pill, { borderColor: color }]}>
      <Icon name={tone === 'free' ? 'nearby' : 'globe'} size={14} color={color} />
      <Txt size={T.tiny} weight="700" color={color}>
        {label}
      </Txt>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
});
