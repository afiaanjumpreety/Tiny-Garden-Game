export type ItemType = 'water' | 'sun' | 'bug';

export interface GrowthStage {
  name: string;
  threshold: number;
}

export const GROWTH_STAGES: GrowthStage[] = [
  { name: 'Little Seed', threshold: 0 },
  { name: 'Curious Sprout', threshold: 50 },
  { name: 'Leafy Friend', threshold: 130 },
  { name: 'Budding Beauty', threshold: 240 },
  { name: 'Full Bloom!', threshold: 400 },
];

export const COLORS = {
  ink: 0x806356,
  leaf: 0x65a968,
  leafLight: 0x86c777,
  leafDark: 0x3f7e58,
  pot: 0xdf9470,
  potDark: 0xb96f5d,
  potLight: 0xf1af83,
  soil: 0x725747,
  water: 0x66b8dc,
  waterLight: 0xc9f2f4,
  sun: 0xf4c759,
  sunLight: 0xffef9a,
  bug: 0xc96f71,
  bugDark: 0x6e4a53,
  flower: 0xed9f87,
  flowerLight: 0xffd7ae,
  cream: 0xfffae9,
} as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

export function random(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
