/**
 * FootyFriends design tokens: dark pitch palette with a lime accent.
 *
 * Lime is reserved for the one primary action on a screen, the active tab and
 * "you" markers. Status, selection and chat use tints or neutral colours so the
 * accent keeps its meaning (review: "Lime does too many jobs").
 */
export const theme = {
  colors: {
    background: '#0A0E0B',
    surface: '#141A16',
    surfaceRaised: '#1C241F',
    border: '#2B352E',
    borderStrong: '#3D4A41',
    text: '#F3F6F0',
    textSecondary: '#AEB8B0',
    textMuted: '#86928A',
    primary: '#C8F04A',
    onPrimary: '#0A0E0B',
    primaryTint: 'rgba(200, 240, 74, 0.14)',
    primaryText: '#D6F57A',
    warning: '#F5B544',
    warningTint: 'rgba(245, 181, 68, 0.14)',
    error: '#FF7A7A',
    errorTint: 'rgba(255, 122, 122, 0.14)',
    success: '#5EE38F',
    successTint: 'rgba(94, 227, 143, 0.14)',
    info: '#8EC9FF',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
  // T2: bib colours live outside the UI palette and read at >3:1 on cards.
  teamColors: ['#FF8A3D', '#5AB8FF', '#C58CFF', '#FF6FAE', '#2DD4BF', '#F0F0F0'],
  fonts: {
    display: 'BarlowCondensed_800ExtraBold',
    body: 'Manrope_500Medium',
    semibold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
    heavy: 'Manrope_800ExtraBold',
  },
  spacing: { xs: 4, s: 8, m: 16, l: 24, xl: 32, xxl: 48 },
  borderRadius: { s: 10, m: 14, l: 20, xl: 28, full: 9999 },
  // Minimum touch target for every tappable control.
  hitTarget: 44,
} as const;

export const avatarPalette = ['#B8E986', '#9DE2D0', '#F2F2EE', '#FFC48C', '#A9C8FF', '#F5A3C7', '#D6C4FF'];

export function teamColor(index: number): string {
  return theme.teamColors[index % theme.teamColors.length];
}
