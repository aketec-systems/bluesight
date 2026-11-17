import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { C } from '../theme';

const LENS = 'M4 32 C16 8 48 8 60 32 C48 56 16 56 4 32 Z';
const HEART =
  'M32.00 30.25 L32.02 30.09 L32.13 29.63 L32.42 28.98 L32.94 28.25 L33.70 27.59 L34.66 27.14 L35.76 27.00 L36.88 27.20 L37.93 27.73 L38.78 28.55 L39.33 29.58 L39.52 30.72 L39.33 31.89 L38.78 33.05 L37.93 34.14 L36.88 35.19 L35.76 36.17 L34.66 37.12 L33.70 38.01 L32.94 38.83 L32.42 39.55 L32.13 40.11 L32.02 40.47 L32.00 40.59 L31.98 40.47 L31.87 40.11 L31.58 39.55 L31.06 38.83 L30.30 38.01 L29.34 37.12 L28.24 36.17 L27.12 35.19 L26.07 34.14 L25.22 33.05 L24.67 31.89 L24.48 30.72 L24.67 29.58 L25.22 28.55 L26.07 27.73 L27.12 27.20 L28.24 27.00 L29.34 27.14 L30.30 27.59 L31.06 28.25 L31.58 28.98 L31.87 29.63 L31.98 30.09 Z';

/**
 * The Bluesight mark: a blue eye with a heart for an iris ("heart eyes"), with a small catch-light.
 * Same geometry as the app icon (tools/mark.py draws it for the icon set).
 */
export function BrandMark({ size = 40, mono }: { size?: number; mono?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Bluesight">
      <Path d={LENS} fill={mono ?? C.blue} />
      <Circle cx={32} cy={32} r={12.5} fill={C.midnight} />
      <Path d={HEART} fill={mono ?? C.hibiscus} />
      {mono ? null : <Circle cx={36.3} cy={28.6} r={1.9} fill={C.cream} />}
    </Svg>
  );
}
