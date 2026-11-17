import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { GENDERS, INTENTS, LIMITS, MAX_VIBES, MIN_AGE, VIBES, ageFromDob, utf8 } from '@bluesight/protocol';
import { formatBytes } from '../lib/format';
import { pickProfilePhoto } from '../lib/photo';
import type { Photo } from '../lib/store';
import { C, R, T } from '../theme';
import { Icon } from './Icon';
import { Chip, Txt, s as ui } from './ui';

export function Birthday({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [parts, setParts] = useState(() =>
    value ? { d: value.slice(8, 10), m: value.slice(5, 7), y: value.slice(0, 4) } : { d: '', m: '', y: '' },
  );
  const refs = {
    d: useRef<React.ComponentRef<typeof TextInput>>(null),
    m: useRef<React.ComponentRef<typeof TextInput>>(null),
    y: useRef<React.ComponentRef<typeof TextInput>>(null),
  };
  const fields = [
    { key: 'd' as const, ph: 'DD', max: 2, width: 72, label: 'Day', next: 'm' as const },
    { key: 'm' as const, ph: 'MM', max: 2, width: 72, label: 'Month', next: 'y' as const },
    { key: 'y' as const, ph: 'YYYY', max: 4, width: 110, label: 'Year', next: undefined },
  ];
  const change = (key: 'd' | 'm' | 'y', text: string, max: number, next?: 'd' | 'm' | 'y') => {
    const v = text.replace(/\D/g, '').slice(0, max);
    const p = { ...parts, [key]: v };
    setParts(p);
    if (v.length === max && next) refs[next].current?.focus();
    onChange(p.d && p.m && p.y.length === 4 ? `${p.y}-${p.m.padStart(2, '0')}-${p.d.padStart(2, '0')}` : '');
  };
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {fields.map((f) => (
        <TextInput
          key={f.key}
          ref={refs[f.key]}
          value={parts[f.key]}
          accessibilityLabel={f.label}
          onChangeText={(t) => change(f.key, t, f.max, f.next)}
          placeholder={f.ph}
          placeholderTextColor={C.dim}
          keyboardType="number-pad"
          maxLength={f.max}
          style={[ui.input, { width: f.width, textAlign: 'center', fontSize: 22, fontWeight: '700' }]}
        />
      ))}
    </View>
  );
}

export function birthdayError(iso: string): string | null {
  if (!iso) return null;
  const age = ageFromDob(iso);
  if (age === null) return 'That date doesn’t exist. Check the day and month.';
  if (age < MIN_AGE) return 'Bluesight is for adults 18 and over.';
  return null;
}

export function GenderPicker({ value, onChange }: { value: number; onChange: (g: number) => void }) {
  return (
    <View style={st.wrap}>
      {[1, 2, 3, 0].map((g) => (
        <Chip key={g} label={g === 0 ? 'Prefer not to say' : GENDERS[g]} selected={value === g} onPress={() => onChange(g)} />
      ))}
    </View>
  );
}

const SHOW = [
  { label: 'Women', mask: 0b001 },
  { label: 'Men', mask: 0b010 },
  { label: 'Everyone', mask: 0b111 },
];

export function ShowMePicker({ value, onChange }: { value: number; onChange: (mask: number) => void }) {
  return (
    <View style={st.wrap}>
      {SHOW.map((o) => (
        <Chip key={o.label} label={o.label} selected={value === o.mask} onPress={() => onChange(o.mask)} tone="blue" />
      ))}
    </View>
  );
}

export function IntentPicker({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  return (
    <View style={st.wrap}>
      {[1, 2, 3, 4].map((i) => (
        <Chip key={i} label={INTENTS[i]} selected={value === i} onPress={() => onChange(value === i ? 0 : i)} />
      ))}
    </View>
  );
}

export function VibesPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <View style={st.wrap}>
      {VIBES.map((v, i) => {
        const on = value.includes(i);
        return (
          <Chip
            key={v.label}
            label={`${v.emoji} ${v.label}`}
            selected={on}
            tone="plain"
            onPress={() => {
              if (on) onChange(value.filter((x) => x !== i));
              else if (value.length < MAX_VIBES) onChange([...value, i]);
            }}
          />
        );
      })}
    </View>
  );
}

export function BioInput({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const used = utf8.byteLength(value);
  return (
    <View style={{ gap: 6 }}>
      <TextInput
        value={value}
        onChangeText={(t) => {
          if (utf8.byteLength(t) <= LIMITS.bioBytes) onChange(t);
        }}
        placeholder="Something people can open with. A song, a dare, your go-to order."
        placeholderTextColor={C.dim}
        multiline
        style={[ui.input, { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' }]}
        accessibilityLabel="Bio"
      />
      <Txt size={T.tiny} color={used > LIMITS.bioBytes - 20 ? C.amber : C.dim} style={{ alignSelf: 'flex-end' }}>
        {LIMITS.bioBytes - used} left
      </Txt>
    </View>
  );
}

export function PhotoPicker({ value, onChange }: { value?: Photo; onChange: (p: Photo | undefined) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async () => {
    setErr(null);
    setBusy(true);
    try {
      const p = await pickProfilePhoto();
      if (p) onChange(p);
    } catch (e) {
      console.warn('photo processing failed', e);
      setErr("Couldn't use that photo. Try another one.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10, alignItems: 'center' }}>
      <Pressable onPress={pick} style={st.photo} accessibilityRole="button" accessibilityLabel={value ? 'Change photo' : 'Choose a photo'}>
        {value ? (
          <Image source={{ uri: `data:image/jpeg;base64,${value.s}` }} placeholder={{ thumbhash: value.th }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Icon name="camera" size={36} color={C.lavender} />
            <Txt color={C.lavender} weight="600">
              {busy ? 'Shrinking…' : 'Choose a photo'}
            </Txt>
          </View>
        )}
      </Pressable>
      {value ? (
        <Txt size={T.small} color={C.blue} style={{ textAlign: 'center' }}>
          {`Shrunk to ${formatBytes(value.sBytes)} so it loads fast and saves data.`}
        </Txt>
      ) : null}
      {err ? (
        <Txt size={T.small} color={C.hibiscus}>
          {err}
        </Txt>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: {
    width: 220,
    height: 275,
    borderRadius: R.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.haze,
    backgroundColor: C.dusk,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
