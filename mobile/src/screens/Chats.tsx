import React, { useMemo } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { Txt } from '../components/ui';
import { timeAgo } from '../lib/format';
import { matchPhoto } from '../lib/media';
import { useApp, useUi, type Match } from '../lib/store';
import { useNav } from '../navigation';
import { C, T } from '../theme';

export function ChatsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const matches = useApp((s) => s.matches);
  const messages = useApp((s) => s.messages);
  const peers = useUi((u) => u.peers);

  const list = useMemo(() => Object.values(matches).filter((m) => !m.closed).sort((a, b) => b.lastAt - a.lastAt), [matches]);
  const here = useMemo(() => {
    const ids = new Set(Object.values(peers).map((p) => p.matchId).filter(Boolean));
    return list.filter((m) => ids.has(m.id));
  }, [peers, list]);

  return (
    <View style={{ flex: 1, backgroundColor: C.midnight }}>
      <Header title="Chats" />
      {list.length === 0 ? (
        <View style={st.empty}>
          <Icon name="heart" size={44} color={C.hibiscus} />
          <Txt display size={T.head} style={{ textAlign: 'center' }}>
            No matches yet
          </Txt>
          <Txt color={C.lavender} style={{ textAlign: 'center', maxWidth: 300 }}>
            Like someone in Nearby. If they like you back, your chat shows up here.
          </Txt>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            here.length ? (
              <View style={{ paddingBottom: 8 }}>
                <Txt weight="700" color={C.blue} style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
                  Nearby now
                </Txt>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 16 }}>
                  {here.map((m) => (
                    <Pressable key={m.id} onPress={() => nav.navigate('Chat', { id: m.id })} style={{ alignItems: 'center', width: 64 }} accessibilityLabel={`${m.name} is nearby`}>
                      <Avatar name={m.name} thumbhash={m.thumbhash} uri={matchPhoto(m)} size={60} ring={C.blue} />
                      <Txt size={T.tiny} color={C.lavender} numberOfLines={1} style={{ marginTop: 4 }}>
                        {m.name}
                      </Txt>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : undefined
          }
          renderItem={({ item }) => <ChatRow m={item} last={messages[item.id]?.[messages[item.id].length - 1]?.text} nearby={here.includes(item)} onPress={() => nav.navigate('Chat', { id: item.id })} />}
        />
      )}
    </View>
  );
}

function ChatRow({ m, last, nearby, onPress }: { m: Match; last?: string; nearby: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.dusk }]} accessibilityRole="button" accessibilityLabel={`Chat with ${m.name}`}>
      <Avatar name={m.name} thumbhash={m.thumbhash} uri={matchPhoto(m)} size={56} ring={nearby ? C.blue : undefined} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt weight="700" style={{ flex: 1 }} numberOfLines={1}>
            {m.name}
          </Txt>
          <Txt size={T.tiny} color={C.dim}>
            {timeAgo(m.lastAt)}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={nearby ? 'bluetooth' : m.serverId ? 'cloud' : 'clock'} size={14} color={nearby ? C.blue : m.serverId ? C.amber : C.dim} />
          <Txt size={T.small} color={m.unread ? C.cream : C.lavender} weight={m.unread ? '700' : '400'} numberOfLines={1} style={{ flex: 1 }}>
            {last ?? (m.source === 'nearby' ? 'Matched nearby. Say hi.' : 'New match. Say hi.')}
          </Txt>
          {m.unread ? (
            <View style={st.unread}>
              <Txt size={T.tiny} weight="800">
                {m.unread}
              </Txt>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  unread: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.hibiscus, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
