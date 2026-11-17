import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

export type IconName =
  | 'bluetooth'
  | 'nearby'
  | 'globe'
  | 'chat'
  | 'user'
  | 'heart'
  | 'x'
  | 'send'
  | 'back'
  | 'check'
  | 'clock'
  | 'cloud'
  | 'eye'
  | 'eyeOff'
  | 'shield'
  | 'flag'
  | 'more'
  | 'camera'
  | 'pin'
  | 'home'
  | 'chevron';

/** Hand-drawn 24px line icons (stroke 2, round caps) — no icon font to ship. */
export function Icon({ name, size = 24, color = '#fff', fill }: { name: IconName; size?: number; color?: string; fill?: string }) {
  const p = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  let body: React.ReactNode;
  switch (name) {
    case 'bluetooth':
      body = <Path {...p} d="M7 7l10 10-5 5V2l5 5L7 17" />;
      break;
    case 'nearby':
      // you, and the people around you: a dot with two soft rings
      body = (
        <>
          <Circle cx={12} cy={12} r={2.2} fill={color} />
          <Circle {...p} cx={12} cy={12} r={6} />
          <Circle {...p} cx={12} cy={12} r={10} strokeOpacity={0.55} />
        </>
      );
      break;
    case 'pin':
      body = (
        <>
          <Path {...p} d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
          <Circle {...p} cx={12} cy={9.5} r={2.5} />
        </>
      );
      break;
    case 'home':
      body = <Path {...p} d="M3 11l9-7 9 7M5.5 9.5V20h13V9.5M10 20v-5h4v5" />;
      break;
    case 'globe':
      body = (
        <>
          <Circle {...p} cx={12} cy={12} r={9} />
          <Path {...p} d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
        </>
      );
      break;
    case 'chat':
      body = <Path {...p} d="M21 12c0 4.4-4 8-9 8-1.4 0-2.7-.3-3.9-.8L3 20l1.4-4C3.5 14.8 3 13.4 3 12c0-4.4 4-8 9-8s9 3.6 9 8z" />;
      break;
    case 'user':
      body = (
        <>
          <Circle {...p} cx={12} cy={8} r={4} />
          <Path {...p} d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </>
      );
      break;
    case 'heart':
      body = (
        <Path
          {...p}
          fill={fill ?? 'none'}
          d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.3 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"
        />
      );
      break;
    case 'x':
      body = <Path {...p} d="M6 6l12 12M18 6L6 18" />;
      break;
    case 'send':
      body = <Path {...p} d="M4 12l16-8-6 16-2.5-6.5L4 12z" />;
      break;
    case 'back':
      body = <Path {...p} d="M15 5l-7 7 7 7" />;
      break;
    case 'chevron':
      body = <Path {...p} d="M9 5l7 7-7 7" />;
      break;
    case 'check':
      body = <Path {...p} d="M5 12.5l4.5 4.5L19 7" />;
      break;
    case 'clock':
      body = (
        <>
          <Circle {...p} cx={12} cy={12} r={9} />
          <Path {...p} d="M12 7v5l3 2" />
        </>
      );
      break;
    case 'cloud':
      body = <Path {...p} d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" />;
      break;
    case 'eye':
      body = (
        <>
          <Path {...p} d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <Circle {...p} cx={12} cy={12} r={3} />
        </>
      );
      break;
    case 'eyeOff':
      body = <Path {...p} d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" />;
      break;
    case 'shield':
      body = <Path {...p} d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z" />;
      break;
    case 'flag':
      body = <Path {...p} d="M5 21V4m0 0h11l-2 4 2 4H5" />;
      break;
    case 'more':
      body = (
        <>
          <Circle cx={5} cy={12} r={1.8} fill={color} />
          <Circle cx={12} cy={12} r={1.8} fill={color} />
          <Circle cx={19} cy={12} r={1.8} fill={color} />
        </>
      );
      break;
    case 'camera':
      body = (
        <>
          <Path {...p} d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <Circle {...p} cx={12} cy={13} r={3.5} />
        </>
      );
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}
