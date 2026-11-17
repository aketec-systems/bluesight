import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LIMITS } from '@bluesight/protocol';
import { Avatar } from '../components/Avatar';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { Button, Txt } from '../components/ui';
import { block } from '../lib/account';
import { canSend, sendText, setOpenChat, unmatch } from '../lib/chat';
import { clock } from '../lib/format';
import { matchPhoto } from '../lib/media';
import { queueOp } from '../lib/outbox';
import { services } from '../lib/services';
import { toast, useApp, useUi, type ChatMsg } from '../lib/store';
import type { RootStack } from '../navigation';
import { C, R, T } from '../theme';

const STATUS: Record<ChatMsg['status'], { text: string; color: string }> = {
  sending: { text: 'Sending…', color: C.dim },
  ble: { text: 'Sent over Bluetooth', color: C.blue },
  queued: { text: 'Sends on the next sync', color: C.amber },
  sent: { text: 'Sent', color: C.lavender },
  waiting: { text: 'Waiting until you’re nearby again', color: C.dim },
  received: { text: '', color: C.dim },
};

export function ChatScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Chat'>) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const match = useApp((s) => s.matches[id]);
  const messages = useApp((s) => s.messages[id]);
  const peers = useUi((u) => u.peers);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    setOpenChat(id);
    return () => setOpenChat(null);
  }, [id]);

  const nearby = useMemo(() => Object.values(peers).some((p) => p.matchId === id), [peers, id]);
  const list = useMemo(() => [...(messages ?? [])].reverse(), [messages]);
  const lastMine = messages?.filter((m) => m.mine).slice(-1)[0]?.id;

  if (!match) return null;

  const sub = nearby
    ? { text: 'Nearby. Messages are free right now.', color: C.blue, icon: 'nearby' as const }
    : match.serverId
      ? { text: 'Messages use about 0.1 KB each.', color: C.amber, icon: 'cloud' as const }
      : { text: 'Not online yet. Messages wait until you’re nearby.', color: C.dim, icon: 'clock' as const };

  const send = () => {
    if (!canSend(text)) return;
    void sendText(id, text);
    setText('');
  };
  const chars = [...text].length;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.midnight }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header
        title={match.name}
        back
        sub={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name={sub.icon} size={13} color={sub.color} />
            <Txt size={T.tiny} color={sub.color} weight="600">
              {sub.text}
            </Txt>
          </View>
        }
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={match.name} thumbhash={match.thumbhash} uri={matchPhoto(match)} size={40} ring={nearby ? C.blue : undefined} ringWidth={2} />
            <Pressable onPress={() => setMenu(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="More options" style={{ padding: 6 }}>
              <Icon name="more" size={22} color={C.cream} />
            </Pressable>
          </View>
        }
      />

      <FlatList
        inverted
        data={list}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 6 }}
        ListFooterComponent={
          <View style={st.intro}>
            <Txt size={T.small} color={C.lavender} style={{ textAlign: 'center' }}>
              {match.source === 'nearby' ? `You matched with ${match.name} nearby.` : `You matched with ${match.name} on Around.`}
              {match.livesIn ? ` ${match.name} lives in ${match.livesIn}.` : ''} Chats are end-to-end encrypted.
            </Txt>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ alignItems: item.mine ? 'flex-end' : 'flex-start', gap: 3 }}>
            <View style={[st.bubble, item.mine ? st.mine : st.theirs]}>
              <Txt color={C.cream}>{item.text}</Txt>
            </View>
            {item.mine && (item.id === lastMine || item.status === 'waiting' || item.status === 'queued') ? (
              <Txt size={T.tiny} color={STATUS[item.status].color}>
                {`${STATUS[item.status].text}  ${clock(item.at)}`}
              </Txt>
            ) : null}
          </View>
        )}
      />

      {match.closed ? (
        <View style={[st.closed, { paddingBottom: insets.bottom + 16 }]}>
          <Txt color={C.lavender}>This match has ended.</Txt>
        </View>
      ) : (
        <View style={[st.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            value={text}
            onChangeText={(t) => setText([...t].slice(0, LIMITS.msgChars).join(''))}
            placeholder={`Message ${match.name}`}
            placeholderTextColor={C.dim}
            multiline
            style={st.input}
            accessibilityLabel="Message"
          />
          <Pressable onPress={send} disabled={!canSend(text)} style={[st.send, { opacity: canSend(text) ? 1 : 0.4 }]} accessibilityRole="button" accessibilityLabel="Send">
            <Icon name="send" size={20} color={C.cream} />
          </Pressable>
          {chars > LIMITS.msgChars - 60 ? (
            <Txt size={T.tiny} color={C.amber} style={st.count}>
              {LIMITS.msgChars - chars}
            </Txt>
          ) : null}
        </View>
      )}

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={st.scrim} onPress={() => setMenu(false)}>
          <View style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Button
              label="Unmatch"
              variant="quiet"
              onPress={() => {
                setMenu(false);
                void unmatch(id);
                navigation.goBack();
              }}
            />
            <Button
              label={`Block ${match.name}`}
              variant="quiet"
              onPress={() => {
                setMenu(false);
                if (match.peerUid) {
                  block({ uid: match.peerUid });
                  queueOp({ k: 'blk', to: match.peerUid });
                }
                void unmatch(id);
                toast(`${match.name} is blocked.`);
                services.sync.kick('manual');
                navigation.goBack();
              }}
            />
            <Button
              label="Report"
              variant="quiet"
              icon="flag"
              onPress={() => {
                setMenu(false);
                navigation.navigate('Report', { matchId: id });
              }}
            />
            <Button label="Cancel" variant="ghost" onPress={() => setMenu(false)} />
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  intro: { paddingVertical: 20, paddingHorizontal: 24 },
  bubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  mine: { backgroundColor: C.hibiscus, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: C.dusk2, borderBottomLeftRadius: 6 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,241,224,0.08)' },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: R.input + 8,
    backgroundColor: C.dusk,
    color: C.cream,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: T.body,
  },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.hibiscus, alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', right: 74, top: -4 },
  closed: { alignItems: 'center', paddingTop: 16 },
  scrim: { flex: 1, backgroundColor: 'rgba(10,6,24,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.dusk, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 10 },
});
