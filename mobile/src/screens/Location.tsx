import React, { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LIMITS, utf8 } from '@bluesight/protocol';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { Field, Txt } from '../components/ui';
import { profileChanged, setSearchCity } from '../lib/account';
import { searchCities, type City } from '../lib/cities';
import { setApp, useApp } from '../lib/store';
import type { RootStack } from '../navigation';
import { C, T } from '../theme';

/** Where Around looks: near you, or any city, e.g. back home before you travel. */
export function LocationScreen({ navigation }: NativeStackScreenProps<RootStack, 'Location'>) {
  const insets = useSafeAreaInsets();
  const current = useApp((s) => s.settings.searchCity);
  const profile = useApp((s) => s.profile)!;
  const [query, setQuery] = useState('');
  const [livesIn, setLivesIn] = useState(profile.livesIn ?? '');
  const sections = useMemo(() => searchCities(query).map((r) => ({ title: r.region, data: r.cities })), [query]);

  const saveLivesIn = () => {
    const v = livesIn.trim();
    if (v === (profile.livesIn ?? '') || utf8.byteLength(v) > LIMITS.nameBytes) return;
    setApp({ profile: { ...profile, livesIn: v } });
    profileChanged(false);
  };
  const pick = (city: City | null) => {
    saveLivesIn();
    setSearchCity(city);
    navigation.goBack();
  };
  const isCurrent = (c: City) => current?.name === c.name && current?.country === c.country;

  return (
    <View style={{ flex: 1, backgroundColor: C.midnight }}>
      <Header title="Search location" back />
      <SectionList
        sections={sections}
        keyExtractor={(c) => `${c.name}-${c.country}`}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        ListHeaderComponent={
          <View style={{ padding: 16, gap: 16 }}>
            <Txt color={C.lavender}>
              Browse people where you are, or pick a city, like home before a visit. People there see that you're not in town yet.
            </Txt>
            <Field
              label="You live in"
              value={livesIn}
              onChangeText={setLivesIn}
              onBlur={saveLivesIn}
              placeholder="e.g. Maryland, USA"
              maxLength={30}
              hint="Optional. Shown on your card so people know where you're coming from."
            />
            <Field label="Search cities" value={query} onChangeText={setQuery} placeholder="Monrovia, Accra, Lagos…" autoCorrect={false} />
            {!query ? (
              <Pressable onPress={() => pick(null)} style={st.row} accessibilityRole="radio" accessibilityState={{ selected: !current }}>
                <Icon name="pin" size={20} color={C.lavender} />
                <View style={{ flex: 1 }}>
                  <Txt weight="700">Near me</Txt>
                  <Txt size={T.small} color={C.lavender}>
                    Wherever you are right now
                  </Txt>
                </View>
                {!current ? <Icon name="check" size={20} color={C.hibiscus} /> : null}
              </Pressable>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Txt size={T.small} weight="700" color={C.dim} style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            {section.title}
          </Txt>
        )}
        renderItem={({ item }) => (
          <Pressable onPress={() => pick(item)} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.dusk }]} accessibilityRole="radio" accessibilityState={{ selected: isCurrent(item) }}>
            <View style={{ flex: 1 }}>
              <Txt weight="600">{item.name}</Txt>
              <Txt size={T.small} color={C.lavender}>
                {item.country}
              </Txt>
            </View>
            {isCurrent(item) ? <Icon name="check" size={20} color={C.hibiscus} /> : null}
          </Pressable>
        )}
        ListEmptyComponent={
          <Txt color={C.lavender} style={{ paddingHorizontal: 16 }}>
            No city by that name yet. Try a nearby larger city.
          </Txt>
        }
      />
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
});
