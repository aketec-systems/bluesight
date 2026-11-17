import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import { Icon, type IconName } from '../components/Icon';
import { Row, Toggle, Txt } from '../components/ui';
import { services } from '../lib/services';
import { setApp, useApp } from '../lib/store';
import { C, R, T } from '../theme';

const FACTS: { icon: IconName; text: string }[] = [
  { icon: 'bluetooth', text: 'Your phone advertises one code that means "Bluesight". Your name and photo are only sent to phones that ask for your card.' },
  { icon: 'eyeOff', text: 'Who you want to see, your birthday and your phone number never go over Bluetooth. Your card shows your age in years.' },
  { icon: 'clock', text: 'Your Bluetooth ID changes every day, and nothing is sent while you’re invisible. Your matches can still recognise you.' },
  { icon: 'shield', text: 'Verified cards carry a pass from Bluesight. If someone reports a card they saw nearby, we can act on it; other people can’t see who you are.' },
  { icon: 'chat', text: 'Chats are end-to-end encrypted, over Bluetooth and over the internet.' },
  { icon: 'globe', text: 'For Around, your location is rounded to about 2 km on your phone before it’s sent. When you search another city, people there see that you’re not in town.' },
];

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const settings = useApp((s) => s.settings);
  const blocked = useApp((s) => s.blocked);
  const set = (patch: Partial<typeof settings>) => setApp((s) => ({ settings: { ...s.settings, ...patch } }));

  return (
    <View style={{ flex: 1, backgroundColor: C.midnight }}>
      <Header title="Privacy and safety" back />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32, gap: 20 }}>
        <View style={st.group}>
          <Row
            title="Only show verified people"
            detail="Hide cards without a verified phone number."
            right={<Toggle label="Only show verified people" value={settings.verifiedOnly} onChange={(v) => set({ verifiedOnly: v })} />}
          />
          <Row
            title="Photos over Bluetooth"
            detail="Share your photo with people nearby and load theirs. Free, takes a second or two."
            right={
              <Toggle
                label="Photos over Bluetooth"
                value={settings.blePhotos}
                onChange={(v) => {
                  set({ blePhotos: v });
                  void services.nearby.refreshCard();
                }}
              />
            }
          />
          <Row
            title="Wi-Fi is free"
            detail="Sync freely on Wi-Fi without counting it against your limit."
            right={<Toggle label="Wi-Fi is free" value={settings.wifiFree} onChange={(v) => set({ wifiFree: v })} />}
          />
          <Row title="Blocked" detail={`${blocked.uids.length + blocked.sids.length} people. They can't see or reach you.`} />
        </View>

        <View style={{ paddingHorizontal: 20, gap: 14 }}>
          <Txt display size={T.head}>
            What people nearby can see
          </Txt>
          {FACTS.map((f) => (
            <View key={f.text} style={{ flexDirection: 'row', gap: 12 }}>
              <Icon name={f.icon} size={20} color={C.blue} />
              <Txt color={C.lavender} style={{ flex: 1 }}>
                {f.text}
              </Txt>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  group: { marginHorizontal: 16, borderRadius: R.panel, backgroundColor: C.dusk, overflow: 'hidden', marginTop: 4 },
});
