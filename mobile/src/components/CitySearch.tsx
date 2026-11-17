import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { searchCities, type City } from '../lib/cities';
import { C, T } from '../theme';
import { Icon } from './Icon';
import { Field, Txt } from './ui';

const POPULAR = ['Monrovia', 'Accra', 'Lagos', 'Freetown', 'Nairobi', 'Kingston'];
const same = (a: City | null | undefined, b: City) => a?.name === b.name && a?.country === b.country;

/** A search box and up to six matches. Plain views, so it can sit inside a ScrollView. */
export function CitySearch({ value, onChange }: { value: City | null; onChange: (c: City) => void }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const all = searchCities(q).flatMap((r) => r.cities);
    if (q.trim()) return all.slice(0, 6);
    return POPULAR.map((n) => all.find((c) => c.name === n)).filter((c): c is City => !!c);
  }, [q]);

  return (
    <View style={{ gap: 8 }}>
      <Field label="Search cities" value={q} onChangeText={setQ} placeholder="Monrovia, Accra, Lagos…" autoCorrect={false} />
      <View style={st.list}>
        {results.map((c, i) => {
          const sel = same(value, c);
          return (
            <Pressable
              key={`${c.name}-${c.country}`}
              onPress={() => onChange(c)}
              style={({ pressed }) => [st.row, i > 0 && st.rule, pressed && { backgroundColor: C.dusk2 }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={`${c.name}, ${c.country}`}
            >
              <View style={{ flex: 1 }}>
                <Txt weight={sel ? '700' : '600'}>{c.name}</Txt>
                <Txt size={T.small} color={C.lavender}>
                  {c.country}
                </Txt>
              </View>
              {sel ? <Icon name="check" size={20} color={C.hibiscus} /> : null}
            </Pressable>
          );
        })}
        {results.length === 0 ? (
          <Txt color={C.lavender} style={{ padding: 14 }}>
            No city by that name yet. Try a nearby larger city.
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  list: { backgroundColor: C.dusk, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 52 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.haze },
});
