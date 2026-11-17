import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import { Button, Chip, Field, Txt } from '../components/ui';
import { report } from '../lib/account';
import { unmatch } from '../lib/chat';
import { getApp, toast, useUi } from '../lib/store';
import type { RootStack } from '../navigation';
import { C, T } from '../theme';

const REASONS = [
  { id: 'harassment', label: 'Harassment or threats' },
  { id: 'unsafe', label: 'Made me feel unsafe' },
  { id: 'fake', label: 'Fake or impersonation' },
  { id: 'underage', label: 'Looks under 18' },
  { id: 'spam', label: 'Spam or selling' },
  { id: 'other', label: 'Something else' },
];

export function ReportScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Report'>) {
  const insets = useSafeAreaInsets();
  const { sid, matchId } = route.params;
  const peer = useUi((u) => (sid ? u.peers[sid] : undefined));
  const match = matchId ? getApp().matches[matchId] : undefined;
  const name = match?.name ?? peer?.name ?? 'this person';
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const submit = () => {
    const evidence = match ? (getApp().messages[match.id] ?? []).filter((m) => !m.mine).slice(-5).map((m) => m.text) : [];
    if (match) {
      report({ uid: match.peerUid, sid }, reason, note, evidence);
      void unmatch(match.id);
    } else if (peer) {
      // The signed card proves what they showed; its pass lets us find the account behind it.
      report({ sid: peer.sid, card: peer.card }, reason, note, []);
    }
    toast(`Reported. You won't see ${name} again.`);
    navigation.popToTop();
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.midnight }}>
      <Header title={`Report ${name}`} back />
      <ScrollView contentContainerStyle={[st.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <Txt color={C.lavender}>They're blocked as soon as you send this. If you're in danger, get somewhere safe and contact security or the police.</Txt>
        <View style={st.wrap}>
          {REASONS.map((r) => (
            <Chip key={r.id} label={r.label} selected={reason === r.id} onPress={() => setReason(r.id)} />
          ))}
        </View>
        <Field label="What happened (optional)" value={note} onChangeText={setNote} multiline maxLength={500} style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 14 }} />
        <Txt size={T.small} color={C.dim}>
          {match
            ? 'Their last few messages to you are included so we can review them.'
            : peer?.verified
              ? 'Their card is verified, so we can link this report to their account.'
              : 'Their card isn’t verified, so this report blocks them on your phone.'}
        </Txt>
        <Button label="Send report and block" disabled={!reason} onPress={submit} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  body: { padding: 20, gap: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
