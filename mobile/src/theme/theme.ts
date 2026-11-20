export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primarySoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  overlay: string;
  chart: string; // single-series bar fill, validated with the dataviz validator
}

export const light: Palette = {
  bg: '#F6F7FB',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F7',
  text: '#111327',
  textMuted: '#5B6075',
  border: '#E2E5EF',
  primary: '#4F46E5',
  primaryPressed: '#4338CA',
  onPrimary: '#FFFFFF',
  primarySoft: '#E0E7FF',
  success: '#127A4B',
  successSoft: '#DCF3E7',
  warning: '#A15C00',
  warningSoft: '#FFF1D6',
  danger: '#B42318',
  dangerSoft: '#FDE4E1',
  overlay: 'rgba(0,0,0,0.4)',
  chart: '#4F46E5',
};

export const dark: Palette = {
  bg: '#0B0D17',
  surface: '#141726',
  surfaceAlt: '#1C2033',
  text: '#ECEDF6',
  textMuted: '#9EA3B8',
  border: '#272B40',
  primary: '#818CF8',
  primaryPressed: '#6366F1',
  onPrimary: '#0B0A1F',
  primarySoft: '#25234D',
  success: '#4BD39A',
  successSoft: '#143327',
  warning: '#F2B24C',
  warningSoft: '#3A2C12',
  danger: '#FF7A6E',
  dangerSoft: '#3D1A17',
  overlay: 'rgba(0,0,0,0.6)',
  chart: '#818CF8',
};

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };
export const space = (n: number) => n * 4;

export const type = {
  display: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.3 },
  heading: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, fontWeight: '600' as const },
  small: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.4 },
  amount: { fontSize: 20, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
};

const AVATAR_COLORS = ['#4F46E5', '#2563EB', '#C2410C', '#7C3AED', '#BE185D', '#0E7490', '#A16207', '#4D7C0F'];
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
