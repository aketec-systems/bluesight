import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './components/Icon';
import { Txt } from './components/ui';
import { useApp, useUi } from './lib/store';
import { C, T } from './theme';

export type RootStack = {
  Onboarding: undefined;
  Tabs: undefined;
  Chat: { id: string };
  EditProfile: undefined;
  Settings: undefined;
  Account: undefined;
  Person: { sid: string };
  Report: { sid?: string; matchId?: string };
  Location: undefined;
};

export type Tabs = { Nearby: undefined; Around: undefined; Chats: undefined; Me: undefined };

export const useNav = () => useNavigation<NativeStackNavigationProp<RootStack>>();

const TAB_META: Record<keyof Tabs, { icon: IconName; label: string; tint: string }> = {
  Nearby: { icon: 'nearby', label: 'Nearby', tint: C.blue },
  Around: { icon: 'globe', label: 'Around', tint: C.amber },
  Chats: { icon: 'chat', label: 'Chats', tint: C.hibiscus },
  Me: { icon: 'user', label: 'Me', tint: C.cream },
};

/** Each tab lights up in the colour of what it costs: blue for Bluetooth, amber for internet. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const unread = useApp((s) => Object.values(s.matches).reduce((n, m) => n + (m.closed ? 0 : m.unread), 0));
  const nearbyCount = useUi((u) => Object.keys(u.peers).length);
  return (
    <View style={[st.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, i) => {
        const meta = TAB_META[route.name as keyof Tabs];
        const focused = state.index === i;
        const color = focused ? meta.tint : C.dim;
        const badge = route.name === 'Chats' ? unread : route.name === 'Nearby' ? nearbyCount : 0;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={meta.label}
            onPress={() => {
              if (!focused) navigation.navigate(route.name);
            }}
            style={st.tab}
          >
            <View>
              <Icon name={meta.icon} size={24} color={color} />
              {badge > 0 ? (
                <View style={[st.badge, { backgroundColor: route.name === 'Nearby' ? C.blue : C.hibiscus }]}>
                  <Txt size={10} weight="800" color={route.name === 'Nearby' ? C.ink : C.cream}>
                    {badge > 99 ? '99' : badge}
                  </Txt>
                </View>
              ) : null}
            </View>
            <Txt size={T.tiny} weight={focused ? '700' : '500'} color={color}>
              {meta.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: C.midnight,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,241,224,0.08)',
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, minHeight: 48, justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
