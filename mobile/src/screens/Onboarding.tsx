import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LIMITS, utf8 } from '@bluesight/protocol';
import { BrandMark } from '../components/BrandMark';
import { CitySearch } from '../components/CitySearch';
import { HeroCards } from '../components/Hero';
import { BioInput, Birthday, GenderPicker, IntentPicker, PhotoPicker, ShowMePicker, VibesPicker, birthdayError } from '../components/ProfileForm';
import { Icon, type IconName } from '../components/Icon';
import { Button, Field, Txt } from '../components/ui';
import type { City } from '../lib/cities';
import { config } from '../lib/config';
import { services, startNearby } from '../lib/services';
import { queueProfileOp } from '../lib/outbox';
import { getApp, setApp, type Photo, type Profile } from '../lib/store';
import { C, T } from '../theme';
import { VerifyNumber } from './Account';

type Step = 'welcome' | 'birthday' | 'basics' | 'photo' | 'vibe' | 'where' | 'verify';
const ORDER: Step[] = ['welcome', 'birthday', 'basics', 'photo', 'vibe', 'where', 'verify'];

const SAMPLE: Profile = {
  name: 'Kemi',
  dob: '1999-06-14',
  gender: 1,
  showMe: 0b010,
  ageMin: 21,
  ageMax: 40,
  intent: 1,
  vibes: [0, 8, 14],
  bio: 'Home for December. Ready for the jollof debate.',
  radiusKm: 25,
};

export function Onboarding() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('welcome');
  const [dob, setDob] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState(-1);
  const [showMe, setShowMe] = useState(0);
  const [photo, setPhoto] = useState<Photo | undefined>();
  const [vibes, setVibes] = useState<number[]>([]);
  const [intent, setIntent] = useState(0);
  const [bio, setBio] = useState('');
  const [away, setAway] = useState(false);
  const [city, setCity] = useState<City | null>(null);
  const [livesIn, setLivesIn] = useState('');

  const idx = ORDER.indexOf(step);
  const next = () => setStep(ORDER[Math.min(ORDER.length - 1, idx + 1)]);
  const back = () => setStep(ORDER[Math.max(0, idx - 1)]);
  const hasServer = !!services.api;

  const finish = (profile: Profile, searchCity: City | null = null) => {
    setApp((s) => ({ profile, settings: { ...s.settings, searchCity } }));
    if (getApp().account) {
      queueProfileOp();
      setApp({ pendingUploads: { s: true, f: true } });
      services.sync.kick('account');
    }
    void startNearby();
  };
  const profileNow = (): Profile => ({
    name: name.trim(),
    dob,
    gender: Math.max(0, gender),
    showMe: showMe || 0b111,
    ageMin: 18,
    ageMax: 60,
    intent,
    vibes,
    bio: bio.trim(),
    photo,
    radiusKm: 25,
    livesIn: away && livesIn.trim() ? livesIn.trim() : undefined,
  });
  const searchCity = away ? city : null;

  const dobErr = birthdayError(dob);
  const canNext: Record<Step, boolean> = {
    welcome: true,
    birthday: !!dob && !dobErr,
    basics: name.trim().length > 0 && utf8.byteLength(name.trim()) <= LIMITS.nameBytes && gender >= 0 && showMe > 0,
    photo: true,
    vibe: true,
    where: !away || (!!city && utf8.byteLength(livesIn.trim()) <= LIMITS.nameBytes),
    verify: true,
  };

  if (step === 'welcome') {
    return (
      <View style={[st.screen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        <View style={st.lockup}>
          <BrandMark size={38} />
          <Txt display size={26}>
            Bluesight
          </Txt>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <HeroCards />
        </View>
        <View style={{ gap: 12 }}>
          <Txt display size={28}>
            Meet people near you, or back home.
          </Txt>
          <Txt color={C.lavender}>
            Browse where you are, or set your location to a city back home and start matching before you land.
          </Txt>
          <Txt size={T.small} color={C.dim}>
            Light on data, wherever you are.
          </Txt>
          <Button label="Create my profile" onPress={next} style={{ marginTop: 8 }} />
          {config.demo ? (
            <Button
              label="Skip with a sample profile"
              variant="ghost"
              onPress={() => {
                finish(SAMPLE);
              }}
            />
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.midnight }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[st.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={st.back}>
          <Icon name="back" size={24} color={C.cream} />
        </Pressable>
        <View style={st.progress}>
          {ORDER.slice(1).map((s, i) => (
            <View key={s} style={[st.seg, { backgroundColor: i < idx ? C.hibiscus : C.haze }]} />
          ))}
        </View>
      </View>
      <ScrollView contentContainerStyle={[st.body, { paddingBottom: 140 }]} keyboardShouldPersistTaps="handled">
        {step === 'birthday' && (
          <>
            <Txt display size={T.title}>
              When's your birthday?
            </Txt>
            <Txt color={C.lavender}>Only your age is shown. Bluesight is for adults 18 and over.</Txt>
            <Birthday value={dob} onChange={setDob} />
            {dobErr ? <Txt color={C.hibiscus}>{dobErr}</Txt> : null}
          </>
        )}

        {step === 'basics' && (
          <>
            <Txt display size={T.title}>
              What should people call you?
            </Txt>
            <Field value={name} onChangeText={setName} placeholder="First name" autoCapitalize="words" maxLength={30} accessibilityLabel="First name" />
            <Txt weight="700" style={{ marginTop: 8 }}>
              I am
            </Txt>
            <GenderPicker value={gender} onChange={setGender} />
            <Txt weight="700" style={{ marginTop: 8 }}>
              Show me
            </Txt>
            <ShowMePicker value={showMe} onChange={setShowMe} />
            <View style={st.note}>
              <Icon name="eyeOff" size={18} color={C.blue} />
              <Txt size={T.small} color={C.lavender} style={{ flex: 1 }}>
                Only you see this. It's never shown on your profile.
              </Txt>
            </View>
          </>
        )}

        {step === 'photo' && (
          <>
            <Txt display size={T.title}>
              Add a photo
            </Txt>
            <Txt color={C.lavender}>People see it on your card. Without one, you show as a colour blur with your initials.</Txt>
            <PhotoPicker value={photo} onChange={setPhoto} />
          </>
        )}

        {step === 'vibe' && (
          <>
            <Txt display size={T.title}>
              What's your vibe?
            </Txt>
            <Txt color={C.lavender}>Pick up to 5. They show on your card.</Txt>
            <VibesPicker value={vibes} onChange={setVibes} />
            <Txt weight="700" style={{ marginTop: 8 }}>
              Here for
            </Txt>
            <IntentPicker value={intent} onChange={setIntent} />
            <Txt weight="700" style={{ marginTop: 8 }}>
              Bio
            </Txt>
            <BioInput value={bio} onChange={setBio} />
          </>
        )}

        {step === 'where' && (
          <>
            <Txt display size={T.title}>
              Where do you want to meet people?
            </Txt>
            <Txt color={C.lavender}>You can change this any time from Around.</Txt>
            <Choice icon="pin" title="Near me" sub="Wherever you are right now" selected={!away} onPress={() => setAway(false)} />
            <Choice
              icon="home"
              title="A city back home"
              sub={away && city ? `${city.name}, ${city.country}` : 'Or wherever you’re headed. Start matching before you land.'}
              selected={away}
              onPress={() => setAway(true)}
            />
            {away ? (
              <>
                <CitySearch value={city} onChange={setCity} />
                <Field
                  label="You live in"
                  value={livesIn}
                  onChangeText={setLivesIn}
                  placeholder="e.g. Maryland, USA"
                  maxLength={30}
                  hint="Optional. Shown on your card so people back home know where you’re coming from."
                />
              </>
            ) : null}
          </>
        )}

        {step === 'verify' && (
          <>
            <Txt display size={T.title}>
              Verify your number
            </Txt>
            <Txt color={C.lavender}>
              {searchCity
                ? `Browsing ${searchCity.name} needs a verified number, so everyone there knows you’re real. You also get a badge and can keep chatting with matches from anywhere.`
                : 'Optional. Verified people get a badge on their card, can browse people around town or back home, and can keep chatting with matches from anywhere.'}
            </Txt>
            {hasServer ? (
              <VerifyNumber onDone={() => finish(profileNow(), searchCity)} />
            ) : (
              <Txt color={C.dim}>This build isn't connected to a server, so Bluesight works over Bluetooth only.</Txt>
            )}
          </>
        )}
      </ScrollView>

      <View style={[st.footer, { paddingBottom: insets.bottom + 16 }]}>
        {step === 'verify' ? (
          <Button label="Skip for now" variant="ghost" onPress={() => finish(profileNow(), searchCity)} />
        ) : (
          <Button label={step === 'photo' && !photo ? 'Skip for now' : 'Continue'} variant={step === 'photo' && !photo ? 'ghost' : 'primary'} disabled={!canNext[step]} onPress={next} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Choice({ icon, title, sub, selected, onPress }: { icon: IconName; title: string; sub: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[st.choice, selected && { borderColor: C.hibiscus, backgroundColor: C.dusk2 }]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
    >
      <View style={[st.choiceIcon, selected && { backgroundColor: C.hibiscus }]}>
        <Icon name={icon} size={22} color={C.cream} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="700">{title}</Txt>
        <Txt size={T.small} color={C.lavender}>
          {sub}
        </Txt>
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 18, borderWidth: 1.5, borderColor: C.haze, backgroundColor: C.dusk },
  choiceIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.haze },
  screen: { flex: 1, backgroundColor: C.midnight, paddingHorizontal: 24 },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  progress: { flex: 1, flexDirection: 'row', gap: 6, paddingRight: 12 },
  seg: { flex: 1, height: 4, borderRadius: 2 },
  body: { padding: 24, gap: 16 },
  note: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: C.dusk, padding: 14, borderRadius: 14 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 12, backgroundColor: C.midnight },
});
