/** Icônes SVG de la maquette, trait pour trait. */
import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { LIME, OBSIDIAN } from '@/theme/tokens';

type P = { size?: number; color?: string };

export function CoinIcon({ size = 15 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} fill={LIME} />
      <Path d="M14.8 8.6A4.2 4.2 0 1 0 14.8 15.4" fill="none" stroke={OBSIDIAN} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

export function GoldIcon({ size = 16 }: P) {
  return (
    <Svg width={size} height={size * (22 / 24)} viewBox="0 0 24 22">
      <Path d="M6 6h12l4 12H2z" fill="#E5B53A" />
      <Path d="M6 6h12l-1.5 4.5h-9z" fill="#F7D774" />
    </Svg>
  );
}

export function HomeIcon({ size = 22, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z" />
    </Svg>
  );
}

export function PulseIcon({ size = 22, color = '#000', strokeWidth = 1.9 }: P & { strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 15.5h3.5l3.5-6 4 4 2.5-3.5H21" />
    </Svg>
  );
}

export function ScanIcon({ size = 26, color = LIME }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.1} strokeLinecap="round">
      <Path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5" />
      <Circle cx={12} cy={12} r={3.2} />
    </Svg>
  );
}

export function ShopIcon({ size = 22, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinejoin="round">
      <Path d="M8.5 4 12 6.5 15.5 4l5 3.5-2.8 3.2V20H6.3v-9.3L3.5 7.5z" />
    </Svg>
  );
}

export function PersoIcon({ size = 22, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9}>
      <Circle cx={12} cy={7.5} r={3.8} />
      <Path d="M4.5 20.5c1-4.3 4.2-6.8 7.5-6.8s6.5 2.5 7.5 6.8" strokeLinecap="round" />
    </Svg>
  );
}

export function CloseIcon({ size = 16, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round">
      <Path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function SendIcon({ size = 20, color = OBSIDIAN }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
    </Svg>
  );
}

export function CheckIcon({ size = 11, color = OBSIDIAN, cross = false }: P & { cross?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d={cross ? 'M7 7l10 10M17 7 7 17' : 'M5 12.5l4.5 4.5L19 7.5'} />
    </Svg>
  );
}

export function SilhouetteIcon({ width = 46, height = 104, color = '#D6D3CD' }: { width?: number; height?: number; color?: string }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 24 52" fill={color}>
      <Circle cx={12} cy={6} r={5} />
      <Path d="M5 13h14l1 18h-4l-1 20h-2.5l-.5-15-.5 15H9L8 31H4z" />
    </Svg>
  );
}

export function FaceIcon({ size = 80, color = '#3A3D43' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.4}>
      <Circle cx={12} cy={8} r={4.5} />
      <Path d="M4 21c1-4.5 4.5-7 8-7s7 2.5 8 7" />
    </Svg>
  );
}
