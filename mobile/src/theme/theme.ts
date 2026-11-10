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
  bg: '#F5F7F6',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF3F0',
  text: '#0E1E16',
  textMuted: '#56665E',
  border: '#E1E8E4',
  primary: '#0B6E4F',
  primaryPressed: '#085A40',
  onPrimary: '#FFFFFF',
  primarySoft: '#DDF1E8',
  success: '#127A4B',
  successSoft: '#DCF3E7',
  warning: '#A15C00',
  warningSoft: '#FFF1D6',
  danger: '#B42318',
  dangerSoft: '#FDE4E1',
  overlay: 'rgba(0,0,0,0.4)',
  chart: '#047857',
};

export const dark: Palette = {
  bg: '#0A110E',
  surface: '#121C18',
  surfaceAlt: '#1A2621',
  text: '#E9F1ED',
  textMuted: '#97A79F',
  border: '#24332C',
  primary: '#3CBF8B',
  primaryPressed: '#2FA577',
  onPrimary: '#04130D',
  primarySoft: '#173A2D',
  success: '#4BD39A',
  successSoft: '#143327',
  warning: '#F2B24C',
  warningSoft: '#3A2C12',
  danger: '#FF7A6E',
  dangerSoft: '#3D1A17',
  overlay: 'rgba(0,0,0,0.6)',
  chart: '#3CBF8B',
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

const AVATAR_COLORS = ['#0B6E4F', '#2563EB', '#C2410C', '#7C3AED', '#BE185D', '#0E7490', '#A16207', '#4D7C0F'];
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
