import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ageFromDob, base64, maskFromVibes } from '@bluesight/protocol';
import { Header } from '../components/Header';
import { ProfileCard } from '../components/ProfileCard';
import { Button, Chip, Row, Toggle, Txt } from '../components/ui';
import { cellTotal } from '../lib/data';
import { formatBytes } from '../lib/format';
import { myThumbhash } from '../lib/identity';
import { config } from '../lib/config';
import { restartNearby, services } from '../lib/services';
import { getApp, resetApp, setApp, useApp, useUi, type Category, type DataMode } from '../lib/store';
import { useNav } from '../navigation';
import { C, R, T } from '../theme';

const MODES: { id: DataMode; title: string; body: string }[] = [
  { id: 'zero', title: 'Zero', body: 'Bluetooth only. Nothing uses mobile data.' },
  { id: 'lite', title: 'Lite', body: 'Matches and chats sync a few times an hour. Photos load when you tap.' },
  { id: 'full', title: 'Full', body: 'Syncs every couple of minutes and loads photos for you. Big photos still wait for Wi-Fi.' },
];

const CATEGORY_LABEL: Record<Category, string> = {
  sync: 'Matches and chats',
  deck: 'Around profiles',
  photos: 'Photos',
  upload: 'Your photo upload',
  account: 'Sign-in',
};

const BUDGETS = [5, 10, 20, 50, 100];

export function MeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const profile = useApp((s) => s.profile)!;
  const settings = useApp((s) => s.settings);
  const usage = useApp((s) => s.usage);
  const account = useApp((s) => s.account);
  useUi((u) => u.metered);

  const total = cellTotal(usage);
  const budget = settings.budgetMB * 1024 * 1024;
  const pct = Math.min(1, total / budget);
  const verified = !!account;
  const set = (patch: Partial<typeof settings>) => setApp((s) => ({ settings: { ...s.settings, ...patch } }));

  return (
    <View style={{ flex: 1, backgroundColor: C.midnight }}>
      <Header title="Me" right={<Button label="Edit" small variant="ghost" onPress={() => nav.navigate('EditProfile')} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32, gap: 24 }}>
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <View style={{ height: 380 }}>
            <ProfileCard
              person={{
                name: profile.name,
                age: ageFromDob(profile.dob) ?? 18,
                intent: profile.intent,
                vibes: maskFromVibes(profile.vibes),
                bio: profile.bio,
                thumbhash: base64.encode(myThumbhash()),
                photoUri: profile.photo ? `data:image/jpeg;base64,${profile.photo.s}` : undefined,
                verified,
                livesIn: profile.livesIn,
              }}
              proximity={0}
            />
          </View>
          <Txt size={T.small} color={C.lavender}>
            This is your card. People near you see it while you're visible.
          </Txt>
          <Row
            title="Visible to people nearby"
            detail={settings.visible ? 'People in range can see you and like you.' : 'You can look, but nobody can see you.'}
            right={<Toggle label="Visible to people nearby" value={settings.visible} onChange={(v) => void services.nearby.setVisible(v)} />}
          />
        </View>

        <View style={st.section}>
          <Txt display size={T.head}>
            Mobile data this month
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Txt display size={40} color={C.amber}>
              {formatBytes(total)}
            </Txt>
            <Txt color={C.lavender}>{`of ${settings.budgetMB} MB`}</Txt>
          </View>
          <View style={st.meter} accessibilityLabel={`${Math.round(pct * 100)} percent of your monthly limit`}>
            <View style={[st.meterFill, { width: `${Math.max(1.5, pct * 100)}%`, backgroundColor: pct >= 0.9 ? C.hibiscus : C.amber }]} />
          </View>
          <View style={st.receipt}>
            {(Object.keys(CATEGORY_LABEL) as Category[]).map((k) => (
              <View key={k} style={st.line}>
                <Txt color={C.lavender} style={{ flex: 1 }}>
                  {CATEGORY_LABEL[k]}
                </Txt>
                <Txt weight="600" style={{ fontVariant: ['tabular-nums'] }}>
                  {formatBytes(usage.cell[k])}
                </Txt>
              </View>
            ))}
            <View style={[st.line, st.freeLine]}>
              <Txt color={C.blue} weight="700" style={{ flex: 1 }}>
                Carried free over Bluetooth
              </Txt>
              <Txt color={C.blue} weight="700" style={{ fontVariant: ['tabular-nums'] }}>
                {formatBytes(usage.ble)}
              </Txt>
            </View>
            {usage.wifi ? (
              <View style={st.line}>
                <Txt color={C.dim} style={{ flex: 1 }}>
                  On Wi-Fi (not counted)
                </Txt>
                <Txt color={C.dim}>{formatBytes(usage.wifi)}</Txt>
              </View>
            ) : null}
          </View>
        </View>

        <View style={st.section}>
          <Txt display size={T.head}>
            Data mode
          </Txt>
          {MODES.map((m) => {
            const on = settings.dataMode === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => set({ dataMode: m.id })}
                style={[st.mode, on && { borderColor: m.id === 'zero' ? C.blue : C.amber, backgroundColor: C.dusk2 }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <View style={[st.radio, on && { borderColor: m.id === 'zero' ? C.blue : C.amber }]}>
                  {on ? <View style={[st.radioDot, { backgroundColor: m.id === 'zero' ? C.blue : C.amber }]} /> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt weight="700">{m.title}</Txt>
                  <Txt size={T.small} color={C.lavender}>
                    {m.body}
                  </Txt>
                </View>
              </Pressable>
            );
          })}
          <Txt weight="700" style={{ marginTop: 6 }}>
            Monthly limit
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {BUDGETS.map((b) => (
              <Chip key={b} label={`${b} MB`} tone="amber" selected={settings.budgetMB === b} onPress={() => set({ budgetMB: b })} />
            ))}
          </View>
          <Txt size={T.small} color={C.dim}>
            When you reach it, Bluesight switches to Bluetooth only. Messages still go through.
          </Txt>
        </View>

        <View style={{ marginHorizontal: 16, borderRadius: R.panel, backgroundColor: C.dusk, overflow: 'hidden' }}>
          <Row
            icon="shield"
            title={account ? 'Number verified' : 'Verify your number'}
            detail={account ? account.phone : 'Get a verified badge and keep chatting with matches from anywhere.'}
            onPress={() => nav.navigate('Account')}
          />
          <Row
            icon={settings.searchCity ? 'home' : 'pin'}
            title="Search location"
            detail={settings.searchCity ? `${settings.searchCity.name}, ${settings.searchCity.country}` : 'Near me'}
            onPress={() => nav.navigate('Location')}
          />
          <Row icon="eye" title="Privacy and safety" detail="Who sees what, blocking, photos over Bluetooth" onPress={() => nav.navigate('Settings')} />
          {Platform.OS !== 'web' && !config.demo ? (
            <Row
              icon="bluetooth"
              title="Practice mode"
              detail="Adds simulated people nearby so you can try Bluesight alone."
              right={
                <Toggle
                  label="Practice mode"
                  value={settings.simulate}
                  onChange={(v) => {
                    set({ simulate: v });
                    void restartNearby();
                  }}
                />
              }
            />
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <Button
            label={config.demo ? 'Start the demo over' : 'Delete my data on this phone'}
            variant="ghost"
            onPress={async () => {
              await services.nearby.stop();
              resetApp();
              if (getApp().profile) await restartNearby();
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  section: { marginHorizontal: 16, padding: 18, borderRadius: R.panel, backgroundColor: C.dusk, gap: 12 },
  meter: { height: 10, borderRadius: 5, backgroundColor: C.haze, overflow: 'hidden' },
  meterFill: { height: 10, borderRadius: 5 },
  receipt: { gap: 8, marginTop: 4 },
  line: { flexDirection: 'row', alignItems: 'center' },
  freeLine: { borderTopWidth: 1, borderTopColor: C.haze, borderStyle: 'dashed', paddingTop: 10, marginTop: 4 },
  mode: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: C.haze, alignItems: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.dim, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
