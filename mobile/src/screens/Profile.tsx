import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LIMITS, utf8 } from '@bluesight/protocol';
import { Header } from '../components/Header';
import { BioInput, GenderPicker, IntentPicker, PhotoPicker, ShowMePicker, VibesPicker } from '../components/ProfileForm';
import { Button, Chip, Field, Txt } from '../components/ui';
import { profileChanged } from '../lib/account';
import { setApp, useApp, type Photo } from '../lib/store';
import type { RootStack } from '../navigation';
import { C, T } from '../theme';

const AGE_RANGES: [number, number][] = [
  [18, 25],
  [21, 30],
  [25, 35],
  [30, 45],
  [18, 60],
];

export function EditProfileScreen({ navigation }: NativeStackScreenProps<RootStack, 'EditProfile'>) {
  const insets = useSafeAreaInsets();
  const p = useApp((s) => s.profile)!;
  const [name, setName] = useState(p.name);
  const [gender, setGender] = useState(p.gender);
  const [showMe, setShowMe] = useState(p.showMe);
  const [photo, setPhoto] = useState<Photo | undefined>(p.photo);
  const [vibes, setVibes] = useState(p.vibes);
  const [intent, setIntent] = useState(p.intent);
  const [bio, setBio] = useState(p.bio);
  const [ages, setAges] = useState<[number, number]>([p.ageMin, p.ageMax]);
  const [livesIn, setLivesIn] = useState(p.livesIn ?? '');

  const valid = name.trim().length > 0 && utf8.byteLength(name.trim()) <= LIMITS.nameBytes;
  const save = () => {
    const photoChanged = photo?.hash !== p.photo?.hash;
    setApp({
      profile: { ...p, name: name.trim(), gender, showMe, photo, vibes, intent, bio: bio.trim(), ageMin: ages[0], ageMax: ages[1], livesIn: livesIn.trim() },
    });
    profileChanged(photoChanged);
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.midnight }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Edit profile" back right={<Button label="Save" small onPress={save} disabled={!valid} />} />
      <ScrollView contentContainerStyle={[st.body, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        <PhotoPicker value={photo} onChange={setPhoto} />
        <Field label="First name" value={name} onChangeText={setName} maxLength={30} />
        <Field label="Lives in (optional)" value={livesIn} onChangeText={setLivesIn} maxLength={30} placeholder="e.g. Maryland, USA" hint="Shown on your card when you browse another city." />
        <Txt weight="700">I am</Txt>
        <GenderPicker value={gender} onChange={setGender} />
        <Txt weight="700">Show me</Txt>
        <ShowMePicker value={showMe} onChange={setShowMe} />
        <Txt weight="700">Ages</Txt>
        <View style={st.wrap}>
          {AGE_RANGES.map(([a, b]) => (
            <Chip key={`${a}-${b}`} label={`${a}–${b}`} tone="blue" selected={ages[0] === a && ages[1] === b} onPress={() => setAges([a, b])} />
          ))}
        </View>
        <Txt size={T.small} color={C.dim}>
          Who you want to see is never shown on your profile or to people nearby.
        </Txt>
        <Txt weight="700">Vibes</Txt>
        <VibesPicker value={vibes} onChange={setVibes} />
        <Txt weight="700">Here for</Txt>
        <IntentPicker value={intent} onChange={setIntent} />
        <Txt weight="700">Bio</Txt>
        <BioInput value={bio} onChange={setBio} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  body: { padding: 20, gap: 14 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
