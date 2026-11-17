import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import { Button, Field, Txt } from '../components/ui';
import { requestCode, verifyCode } from '../lib/account';
import { apiErrorText } from '../lib/api/types';
import { config } from '../lib/config';
import { services } from '../lib/services';
import { useApp } from '../lib/store';
import { C, T } from '../theme';

/** Phone + 6-digit code. Two small requests (~1 KB in total), then nothing until you use it. */
export function VerifyNumber({ onDone }: { onDone?: () => void }) {
  const [phone, setPhone] = useState('+231');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await requestCode(phone);
      setSent(true);
      setDevCode(r.dev);
    } catch (e) {
      setErr(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setErr(null);
    setBusy(true);
    try {
      await verifyCode(phone, code);
      onDone?.();
    } catch (e) {
      setErr(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <Field
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        editable={!sent}
        hint="With country code. We text you a 6-digit code."
        error={!sent ? err : null}
      />
      {sent ? (
        <>
          <Field
            label="Code"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            placeholder="123456"
            error={err}
            hint={devCode ? `${config.demo ? 'Demo' : 'Dev server'} code: ${devCode}` : undefined}
          />
          <Button label="Verify" onPress={verify} busy={busy} disabled={code.length !== 6} />
          <Button
            label="Use a different number"
            variant="ghost"
            small
            onPress={() => {
              setSent(false);
              setCode('');
              setErr(null);
            }}
          />
        </>
      ) : (
        <Button label="Text me a code" onPress={send} busy={busy} disabled={phone.replace(/\D/g, '').length < 8} />
      )}
    </View>
  );
}

export function AccountScreen() {
  const insets = useSafeAreaInsets();
  const account = useApp((s) => s.account);
  return (
    <View style={{ flex: 1, backgroundColor: C.midnight }}>
      <Header title="Your number" back />
      <ScrollView contentContainerStyle={[st.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        {account ? (
          <>
            <Txt display size={T.title}>
              Verified
            </Txt>
            <Txt color={C.lavender}>{`Signed in as ${account.phone}. People see a verified badge on your card, and your matches can reach you from anywhere.`}</Txt>
          </>
        ) : services.api ? (
          <>
            <Txt color={C.lavender}>Verified people get a badge, can browse people around town or back home, and can keep chatting with matches from anywhere.</Txt>
            <VerifyNumber />
          </>
        ) : (
          <Txt color={C.lavender}>This build isn't connected to a server. Set EXPO_PUBLIC_API_URL to turn on accounts.</Txt>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({ body: { padding: 24, gap: 16 } });
