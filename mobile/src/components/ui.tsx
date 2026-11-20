import React from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { avatarColor, radius, space, type } from '../theme/theme';
import { Icon, IconName } from './Icon';

type Variant = keyof typeof type;

export function T({ v = 'body', muted, color, style, children, ...rest }: {
  v?: Variant; muted?: boolean; color?: string; style?: StyleProp<TextStyle>; children?: React.ReactNode; numberOfLines?: number; selectable?: boolean;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  return (
    <Text style={[type[v], { color: color ?? (muted ? c.textMuted : c.text) }, style]} accessibilityRole={rest.onPress ? 'link' : undefined} {...rest}>
      {children}
    </Text>
  );
}

/** Scrollable screen with an optional sticky footer for the primary action. */
export function Screen({ children, footer, scroll = true, padded = true, style }: {
  children: React.ReactNode; footer?: React.ReactNode; scroll?: boolean; padded?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const content = [{ padding: padded ? space(4) : 0, paddingBottom: space(footer ? 6 : 10), gap: space(3) }, style];
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {scroll ? (
        <ScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      ) : (
        <View style={[{ flex: 1 }, content]}>{children}</View>
      )}
      {footer ? (
        <View style={{ padding: space(4), paddingBottom: Math.max(insets.bottom, space(4)), borderTopWidth: 1, borderColor: c.border, backgroundColor: c.surface, gap: space(2) }}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const base = [{ backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: space(4) }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Btn({ title, onPress, variant = 'primary', icon, disabled, loading, small, style, accessibilityHint }: {
  title: string; onPress?: () => void; variant?: BtnVariant; icon?: IconName; disabled?: boolean; loading?: boolean; small?: boolean;
  style?: StyleProp<ViewStyle>; accessibilityHint?: string;
}) {
  const { c } = useTheme();
  const colors: Record<BtnVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: c.primary, fg: c.onPrimary, border: c.primary },
    secondary: { bg: c.surface, fg: c.primary, border: c.border },
    ghost: { bg: 'transparent', fg: c.primary, border: 'transparent' },
    danger: { bg: c.dangerSoft, fg: c.danger, border: c.dangerSoft },
  };
  const col = colors[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      disabled={!!off} aria-disabled={!!off} aria-busy={!!loading}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        {
          minHeight: small ? 40 : 52, paddingHorizontal: small ? space(3) : space(5), borderRadius: radius.md,
          backgroundColor: variant === 'primary' && pressed ? c.primaryPressed : col.bg, borderWidth: 1, borderColor: col.border,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2), opacity: off ? 0.5 : pressed ? 0.9 : 1,
        },
        style,
      ]}>
      {loading ? <ActivityIndicator color={col.fg} /> : icon ? <Icon name={icon} color={col.fg} size={small ? 18 : 20} /> : null}
      <Text style={[small ? type.small : type.bodyStrong, { color: col.fg, fontWeight: '700' }]}>{title}</Text>
    </Pressable>
  );
}

export function IconBtn({ icon, onPress, label, color, size = 20, tone }: {
  icon: IconName; onPress: () => void; label: string; color?: string; size?: number; tone?: 'danger' | 'primary';
}) {
  const { c } = useTheme();
  const col = color ?? (tone === 'danger' ? c.danger : tone === 'primary' ? c.primary : c.textMuted);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.surfaceAlt : 'transparent' })}>
      <Icon name={icon} color={col} size={size} />
    </Pressable>
  );
}

export function Avatar({ name, id, size = 40, selected, photo }: { name: string; id?: string; size?: number; selected?: boolean; photo?: string }) {
  const { c } = useTheme();
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
  if (photo) {
    return (
      <Image source={{ uri: photo }} accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: size / 2, borderWidth: selected ? 3 : 2, borderColor: selected ? c.primary : c.surface }} />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(id ?? name), alignItems: 'center', justifyContent: 'center',
      borderWidth: selected ? 3 : 0, borderColor: c.primary,
    }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress, icon, avatarId }: {
  label: string; selected?: boolean; onPress?: () => void; icon?: IconName; avatarId?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" aria-checked={!!selected} accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: space(1.5), minHeight: 40, paddingHorizontal: space(3), paddingVertical: space(1),
        borderRadius: radius.pill, borderWidth: 1.5, borderColor: selected ? c.primary : c.border,
        backgroundColor: selected ? c.primarySoft : c.surface, opacity: pressed ? 0.8 : 1,
      })}>
      {avatarId !== undefined ? <Avatar name={label} id={avatarId} size={24} /> : null}
      {icon ? <Icon name={icon} size={16} color={selected ? c.primary : c.textMuted} /> : null}
      <Text style={[type.small, { color: selected ? c.primary : c.text, fontWeight: '600' }]}>{label}</Text>
      {selected && avatarId !== undefined ? <Icon name="check" size={14} color={c.primary} strokeWidth={3} /> : null}
    </Pressable>
  );
}

export function Field({ label, hint, error, warn, right, style, ...input }: TextInputProps & {
  label?: string; hint?: string; error?: string; warn?: boolean; right?: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space(1.5), flex: style ? undefined : undefined }}>
      {label ? <T v="caption" muted>{label.toUpperCase()}</T> : null}
      <View style={{
        flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: radius.md, backgroundColor: c.surface,
        borderColor: error ? c.danger : warn ? c.warning : c.border, paddingHorizontal: space(3),
      }}>
        <TextInput
          placeholderTextColor={c.textMuted}
          accessibilityLabel={label}
          {...input}
          style={[type.body, { flex: 1, color: c.text, minHeight: 48, paddingVertical: space(2) }, style]}
        />
        {right}
      </View>
      {error ? <T v="small" color={c.danger}>{error}</T> : hint ? <T v="small" muted>{hint}</T> : null}
    </View>
  );
}

export type Status = 'ok' | 'verify' | 'missing';
export function StatusPill({ status, label }: { status: Status; label?: string }) {
  const { c } = useTheme();
  const map = {
    ok: { bg: c.successSoft, fg: c.success, icon: 'check' as IconName, text: 'Verified' },
    verify: { bg: c.warningSoft, fg: c.warning, icon: 'alert' as IconName, text: 'Check' },
    missing: { bg: c.dangerSoft, fg: c.danger, icon: 'help' as IconName, text: 'Missing' },
  }[status];
  return (
    <View accessibilityLabel={label ?? map.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: map.bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Icon name={map.icon} size={12} color={map.fg} strokeWidth={2.5} />
      <Text style={{ color: map.fg, fontSize: 12, fontWeight: '700' }}>{label ?? map.text}</Text>
    </View>
  );
}

export function Banner({ tone, title, children, icon }: { tone: 'warning' | 'danger' | 'info' | 'success'; title?: string; children?: React.ReactNode; icon?: IconName }) {
  const { c } = useTheme();
  const map = {
    warning: [c.warningSoft, c.warning, 'alert'],
    danger: [c.dangerSoft, c.danger, 'alert'],
    info: [c.primarySoft, c.primary, 'help'],
    success: [c.successSoft, c.success, 'check'],
  } as const;
  const [bg, fg, ic] = map[tone];
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: space(3), backgroundColor: bg, borderRadius: radius.md, padding: space(3) }}>
      <Icon name={icon ?? (ic as IconName)} size={20} color={fg} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <T v="bodyStrong" color={fg}>{title}</T> : null}
        {typeof children === 'string' ? <T v="small" color={c.text}>{children}</T> : children}
      </View>
    </View>
  );
}

export function Segmented<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 3 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="radio" aria-checked={on}
            style={{ flex: 1, minHeight: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.surface : 'transparent', paddingHorizontal: 4 }}>
            <Text style={[type.small, { fontWeight: '700', color: on ? c.primary : c.textMuted }]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ children, style, gap = 3 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space(gap) }, style]}>{children}</View>;
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.border, marginVertical: space(1) }} />;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space(2) }}>
      <T v="heading">{children}</T>
      {right}
    </Row>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: space(8), gap: space(2) }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={30} color={c.primary} />
      </View>
      <T v="heading" style={{ textAlign: 'center' }}>{title}</T>
      {body ? <T muted style={{ textAlign: 'center' }}>{body}</T> : null}
      {action}
    </View>
  );
}

/** Progress dots for the bill flow: Review → People → Assign → Charges → Summary. */
export function Steps({ current }: { current: number }) {
  const { c } = useTheme();
  const labels = ['Review', 'People', 'Assign', 'Charges', 'Summary'];
  return (
    <View accessibilityLabel={`Step ${current + 1} of ${labels.length}: ${labels[current]}`} style={{ flexDirection: 'row', gap: 6 }}>
      {labels.map((l, i) => (
        <View key={l} style={{ flex: 1, gap: 4 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= current ? c.primary : c.border }} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: i === current ? c.primary : c.textMuted }}>{l}</Text>
        </View>
      ))}
    </View>
  );
}
