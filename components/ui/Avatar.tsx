import { Image, StyleSheet, View } from 'react-native';
import { avatarPalette, theme } from '@/constants/theme';
import { initials } from '@/lib/utils';
import { Txt } from './Text';

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return avatarPalette[Math.abs(hash) % avatarPalette.length];
}

export function Avatar({ name, url, size = 36, ring, seed }: { name?: string | null; url?: string | null; size?: number; ring?: boolean; seed?: string }) {
  const dim = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[dim, styles.wrap, ring && styles.ring, { backgroundColor: colorFor(seed ?? name ?? '') }]} accessibilityElementsHidden importantForAccessibility="no">
      {url ? (
        <Image source={{ uri: url }} style={dim} />
      ) : (
        <Txt style={{ fontFamily: theme.fonts.heavy, fontSize: Math.max(10, size * 0.36), color: '#0A0E0B' }}>{initials(name)}</Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ring: { borderWidth: 2, borderColor: theme.colors.background },
});
