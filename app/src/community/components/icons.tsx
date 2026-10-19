/**
 * Icônes de la Communauté : trait 24 px, même graisse que src/components/Icons.tsx. Jamais d'emoji en guise d'icône.
 */
import React from 'react';
import { Platform } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { NeedId, StatusId } from '../models/intentions';
import type { GarmentSlot } from '../models/outfit';

export type IconName =
  | 'back' | 'flame' | 'heart' | 'target' | 'lock' | 'chat' | 'spark' | 'shield' | 'chevron' | 'chevronDown' | 'plus' | 'info'
  | 'more' | 'userPlus' | 'users' | 'globe' | 'ban' | 'bolt' | 'fork' | 'dumbbell' | 'cloud' | 'repeat' | 'moon' | 'shirt'
  | 'jacket' | 'pants' | 'shoe' | 'watch' | 'circles' | 'check' | 'close' | 'arrowUp' | 'user' | 'wave' | 'eye';

const PATHS: Record<IconName, React.ReactNode> = {
  flame: <Path d="M12 2.8c.7 3-.8 4.9-2.3 6.6C8.3 11 7 12.6 7 15a5 5 0 0 0 10 0c0-2.3-1.2-3.8-2.2-4.8-.2 1.4-.9 2.4-1.9 2.9.4-3.5-.2-6.6-.9-10.3z" strokeLinejoin="round" />,
  heart: <Path d="M12 19.5s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.1c0 5.1-7 9.4-7 9.4z" strokeLinejoin="round" />,
  target: (
    <>
      <Circle cx={12} cy={12} r={8} />
      <Circle cx={12} cy={12} r={4.2} />
      <Circle cx={12} cy={12} r={0.9} fill="currentColor" />
    </>
  ),
  lock: (
    <>
      <Rect x={5} y={10.5} width={14} height={9.5} rx={2.6} />
      <Path d="M8.3 10.5V8a3.7 3.7 0 0 1 7.4 0v2.5" />
    </>
  ),
  chat: <Path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6.5a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.6v-3.6H7.5A2.5 2.5 0 0 1 5 13z" strokeLinejoin="round" />,
  spark: <Path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z" strokeLinejoin="round" />,
  shield: <Path d="M12 3.5l6.5 2.4v5.4c0 4.2-2.8 7.4-6.5 9.2-3.7-1.8-6.5-5-6.5-9.2V5.9z" strokeLinejoin="round" />,
  back: <Path d="M14.5 5.5L8 12l6.5 6.5" />,
  chevron: <Path d="M9.5 6l6 6-6 6" />,
  chevronDown: <Path d="M6 9.5l6 6 6-6" />,
  plus: <Path d="M12 5.5v13M5.5 12h13" />,
  info: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 11v5.2" />
      <Circle cx={12} cy={7.8} r={0.6} fill="currentColor" />
    </>
  ),
  more: (
    <>
      <Circle cx={6} cy={12} r={1.1} fill="currentColor" />
      <Circle cx={12} cy={12} r={1.1} fill="currentColor" />
      <Circle cx={18} cy={12} r={1.1} fill="currentColor" />
    </>
  ),
  userPlus: (
    <>
      <Circle cx={10} cy={8} r={3.6} />
      <Path d="M3.5 19.5c.9-3.7 3.6-5.8 6.5-5.8s4.6 1.1 5.6 2.9M18.5 12v6M15.5 15h6" />
    </>
  ),
  users: (
    <>
      <Circle cx={9} cy={8.5} r={3.3} />
      <Path d="M3 19c.8-3.4 3.2-5.3 6-5.3s5.2 1.9 6 5.3" />
      <Path d="M15.5 5.6a3.3 3.3 0 0 1 0 6M17.6 13.9c1.7.7 3 2.4 3.4 5.1" />
    </>
  ),
  globe: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M3.5 12h17M12 3.5c2.3 2.3 3.4 5.2 3.4 8.5s-1.1 6.2-3.4 8.5c-2.3-2.3-3.4-5.2-3.4-8.5S9.7 5.8 12 3.5z" />
    </>
  ),
  ban: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M6 6l12 12" />
    </>
  ),
  bolt: <Path d="M13 3L5.5 13.5H12L11 21l7.5-10.5H12z" strokeLinejoin="round" />,
  fork: <Path d="M7 3.5v6.3a2.2 2.2 0 0 0 4.4 0V3.5M9.2 3.5v17M16.5 20.5V3.8c-2 .9-3 3.4-3 6.4 0 2.3 1.3 3.3 3 3.3" />,
  dumbbell: <Path d="M3.5 9.5v5M6.5 7v10M17.5 7v10M20.5 9.5v5M6.5 12h11" />,
  cloud: <Path d="M7.5 18.5h9a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.4 9.8 4.4 4.4 0 0 0 7.5 18.5z" strokeLinejoin="round" />,
  repeat: <Path d="M17.5 4.5l2.5 2.5-2.5 2.5M4 11.5V10a3 3 0 0 1 3-3h13M6.5 19.5L4 17l2.5-2.5M20 12.5V14a3 3 0 0 1-3 3H4" />,
  moon: <Path d="M19 14.6A7.5 7.5 0 0 1 9.4 5a7.5 7.5 0 1 0 9.6 9.6z" strokeLinejoin="round" />,
  shirt: <Path d="M9 3.5L4 6l1.8 4.2 2.2-.9v11.2h8V9.3l2.2.9L20 6l-5-2.5a3 3 0 0 1-6 0z" strokeLinejoin="round" />,
  jacket: <Path d="M9 3.5L4.5 6v14.5h6V8.5M15 3.5L19.5 6v14.5h-6V8.5M9 3.5l3 4 3-4M12 7.5v13" strokeLinejoin="round" />,
  pants: <Path d="M6.5 3.5h11l1 17h-4.3L12 10l-2.2 10.5H5.5z" strokeLinejoin="round" />,
  shoe: <Path d="M3.5 16.5V9.5h4.5l1.5 2.5h2.5c3.5 0 6.6 1.6 8.5 4.5v1.5H3.5zM3.5 15.5h17" strokeLinejoin="round" />,
  watch: (
    <>
      <Circle cx={12} cy={12} r={5} />
      <Path d="M9.5 7.6L10 3.5h4l.5 4.1M9.5 16.4l.5 4.1h4l.5-4.1M12 10v2.2l1.4 1" />
    </>
  ),
  circles: (
    <>
      <Circle cx={12} cy={7.5} r={3} />
      <Circle cx={6.8} cy={15.5} r={3} />
      <Circle cx={17.2} cy={15.5} r={3} />
    </>
  ),
  check: <Path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  arrowUp: <Path d="M12 19V5.5M5.8 11.5L12 5.3l6.2 6.2" />,
  user: (
    <>
      <Circle cx={12} cy={8} r={3.8} />
      <Path d="M4.5 20c1-4.3 4.2-6.6 7.5-6.6s6.5 2.3 7.5 6.6" />
    </>
  ),
  wave: <Path d="M8 13.5V6.8a1.4 1.4 0 0 1 2.8 0v5.2M10.8 11V5.4a1.4 1.4 0 0 1 2.8 0V11M13.6 11V6.6a1.4 1.4 0 0 1 2.8 0v6.9c0 4-2.5 7-6 7-2.6 0-4-1.4-5.5-4l-1.9-3.3a1.4 1.4 0 0 1 2.4-1.4L8 13.5" strokeLinejoin="round" />,
  eye: (
    <>
      <Path d="M2.8 12S6 5.8 12 5.8 21.2 12 21.2 12 18 18.2 12 18.2 2.8 12 2.8 12z" strokeLinejoin="round" />
      <Circle cx={12} cy={12} r={2.8} />
    </>
  ),
};

export function Icon({ name, size = 20, color = '#1C1D1F', strokeWidth = 1.9 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} color={color} strokeWidth={strokeWidth} strokeLinecap="round" accessible={Platform.OS === 'web' ? undefined : false}>
      {PATHS[name]}
    </Svg>
  );
}

export const NEED_ICON: Record<NeedId, IconName> = {
  motivation: 'bolt',
  repas: 'fork',
  entrainement: 'dumbbell',
  moral: 'cloud',
  regularite: 'repeat',
  ecoute: 'chat',
  aider: 'heart',
};

export const STATUS_ICON: Record<StatusId, IconName | null> = {
  dispo: null, // pastille « en ligne »
  motive: 'flame',
  entrainement: 'dumbbell',
  repas: 'fork',
  nuit: 'moon',
  aide: 'heart',
};

export const SLOT_ICON: Record<GarmentSlot, IconName> = {
  haut: 'shirt',
  veste: 'jacket',
  bas: 'pants',
  chaussures: 'shoe',
  accessoire: 'watch',
};
