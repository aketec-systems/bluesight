import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { C, F, R, T } from '../theme';
import { Icon, type IconName } from './Icon';

export function Txt({
  display,
  size = T.body,
  color = C.cream,
  weight,
  style,
  ...rest
}: TextProps & { display?: boolean; size?: number; color?: string; weight?: TextStyle['fontWeight'] }) {
  return (
    <Text
      {...rest}
      style={[
        { color, fontSize: size, lineHeight: Math.round(size * (display ? 1.2 : 1.4)) },
        display ? { fontFamily: F.display, letterSpacing: -0.2 } : { fontFamily: F.body, fontWeight: weight ?? '400' },
        style,
      ]}
    />
  );
}

type Variant = 'primary' | 'ghost' | 'blue' | 'amber' | 'quiet';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  busy,
  style,
  small,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const bg: Record<Variant, string> = {
    primary: C.hibiscus,
    blue: C.blue,
    amber: 'transparent',
    ghost: 'transparent',
    quiet: C.dusk2,
  };
  const fg: Record<Variant, string> = {
    primary: C.cream,
    blue: C.ink,
    amber: C.amber,
    ghost: C.cream,
    quiet: C.cream,
  };
  const border = variant === 'amber' ? C.amber : variant === 'ghost' ? C.haze : 'transparent';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        { backgroundColor: bg[variant], borderColor: border, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <>
          {icon && <Icon name={icon} size={small ? 16 : 20} color={fg[variant]} />}
          <Txt size={small ? T.small : T.body} weight="700" color={fg[variant]}>
            {label}
          </Txt>
        </>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  tone = 'hibiscus',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'hibiscus' | 'blue' | 'amber' | 'plain';
}) {
  const color = tone === 'blue' ? C.blue : tone === 'amber' ? C.amber : tone === 'plain' ? C.cream : C.hibiscus;
  const body = (
    <View style={[s.chip, selected ? { backgroundColor: color, borderColor: color } : { borderColor: C.haze }]}>
      <Txt size={T.small} weight={selected ? '700' : '500'} color={selected ? (tone === 'hibiscus' ? C.cream : C.ink) : C.cream}>
        {label}
      </Txt>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!selected }} onPress={onPress} hitSlop={4}>
      {body}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
  const { label, hint, error, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Txt size={T.small} color={C.lavender} weight="600">
          {label}
        </Txt>
      ) : null}
      <TextInput
        placeholderTextColor={C.dim}
        selectionColor={C.hibiscus}
        accessibilityLabel={rest.accessibilityLabel ?? label}
        {...rest}
        style={[s.input, error ? { borderColor: C.hibiscus } : null, style]}
      />
      {error ? (
        <Txt size={T.small} color={C.hibiscus}>
          {error}
        </Txt>
      ) : hint ? (
        <Txt size={T.small} color={C.dim}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export function Row({
  title,
  detail,
  onPress,
  right,
  icon,
  iconColor = C.lavender,
}: {
  title: string;
  detail?: string;
  onPress?: PressableProps['onPress'];
  right?: React.ReactNode;
  icon?: IconName;
  iconColor?: string;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.row, pressed && onPress ? { backgroundColor: C.dusk2 } : null]}>
      {icon && <Icon name={icon} size={20} color={iconColor} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="600">{title}</Txt>
        {detail ? (
          <Txt size={T.small} color={C.lavender}>
            {detail}
          </Txt>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron" size={18} color={C.dim} /> : null)}
    </Pressable>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={[s.toggle, { backgroundColor: value ? C.blue : C.haze }]}
    >
      <View style={[s.knob, { transform: [{ translateX: value ? 20 : 0 }] }]} />
    </Pressable>
  );
}

export const s = StyleSheet.create({
  btn: {
    minHeight: 52,
    borderRadius: R.pill,
    borderWidth: 1.5,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnSmall: { minHeight: 40, paddingHorizontal: 16 },
  chip: { borderRadius: R.pill, borderWidth: 1.5, paddingVertical: 7, paddingHorizontal: 13 },
  input: {
    minHeight: 52,
    borderRadius: R.input,
    borderWidth: 1.5,
    borderColor: C.haze,
    backgroundColor: C.dusk,
    color: C.cream,
    paddingHorizontal: 16,
    fontSize: T.body,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, minHeight: 56 },
  toggle: { width: 48, height: 28, borderRadius: 14, padding: 3 },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.cream },
});
