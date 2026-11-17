import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import { ProfileCard } from '../components/ProfileCard';
import { Button, Txt } from '../components/ui';
import { services } from '../lib/services';
import { toast, useApp, useUi } from '../lib/store';
import type { RootStack } from '../navigation';
import { C, PROXIMITY, T } from '../theme';

/** Someone tapped in the proximity strip: their full card, and like / pass / report. */
export function PersonScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Person'>) {
  const insets = useSafeAreaInsets();
  const peer = useUi((u) => u.peers[route.params.sid]);
  const swipe = useApp((s) => s.nearbySwipes[route.params.sid]);
  const [busy, setBusy] = useState(false);

  if (!peer) {
    return (
      <View style={{ flex: 1, backgroundColor: C.midnight }}>
        <Header title="Out of range" back />
        <View style={{ padding: 24 }}>
          <Txt color={C.lavender}>They've walked out of Bluetooth range. If they come back, they'll show up again.</Txt>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.midnight }}>
      <Header title={peer.name} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}>
        <View style={{ height: 460 }}>
          <ProfileCard person={{ ...peer, photoUri: peer.photoData }} proximity={peer.proximity} />
        </View>
        <Txt size={T.small} color={C.lavender}>
          {`${PROXIMITY[peer.proximity].label}. ${peer.verified ? 'Verified phone number.' : 'Not verified yet.'}`}
        </Txt>
        {peer.matchId ? (
          <Button label={`Message ${peer.name}`} icon="chat" onPress={() => navigation.replace('Chat', { id: peer.matchId! })} />
        ) : swipe ? (
          <Txt color={C.lavender}>{swipe.liked ? 'You liked them. If they like you back, it’s a match.' : 'You passed on them.'}</Txt>
        ) : (
          <View style={st.row}>
            <Button
              label="Pass"
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => {
                services.nearby.pass(peer.sid);
                navigation.goBack();
              }}
            />
            <Button
              label="Like"
              icon="heart"
              busy={busy}
              style={{ flex: 1 }}
              onPress={async () => {
                setBusy(true);
                const r = await services.nearby.like(peer.sid);
                setBusy(false);
                if (r === 'invisible') toast('Turn on "Visible" to like people.');
                else navigation.goBack();
              }}
            />
          </View>
        )}
        <Button label="Report or block" variant="ghost" icon="flag" small onPress={() => navigation.navigate('Report', { sid: peer.sid })} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({ row: { flexDirection: 'row', gap: 12 } });
