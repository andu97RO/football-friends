import { RefreshControlProps, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { IconButton } from './IconButton';
import { Txt } from './Text';

/** Space reserved under content for the floating tab bar. */
export const TAB_BAR_SPACE = 110;

export function ScreenHeader({
  title,
  subtitle,
  back,
  right,
  titleVariant = 'display',
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  titleVariant?: 'display' | 'title';
}) {
  const router = useRouter();
  const t = useT();
  return (
    <View style={styles.header}>
      {back && (
        <IconButton
          icon="chevron-back"
          accessibilityLabel={t('common.back')}
          testID="back-button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/matches'))}
        />
      )}
      <View style={{ flex: 1 }}>
        {title && <Txt variant={titleVariant} accessibilityRole="header" numberOfLines={2}>{title}</Txt>}
        {subtitle && <Txt variant="caption" tone="secondary" numberOfLines={2}>{subtitle}</Txt>}
      </View>
      {right && <View style={styles.right}>{right}</View>}
    </View>
  );
}

/**
 * Page shell: safe-area aware, scrollable, with an optional footer that sits
 * below the content instead of overlapping the last row (M18).
 */
export function Screen({
  children,
  header,
  footer,
  scroll = true,
  refreshControl,
  tabBar = false,
  contentStyle,
  testID,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  tabBar?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const bottom = tabBar ? TAB_BAR_SPACE + insets.bottom : footer ? theme.spacing.m : insets.bottom + theme.spacing.xl;
  return (
    <View style={[styles.page, { paddingTop: insets.top }]} testID={testID}>
      <View style={styles.inner}>
        {header}
        {scroll ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.content, { paddingBottom: bottom }, contentStyle]}
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
        )}
        {footer && <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.m }]}>{footer}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background },
  inner: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: theme.spacing.m + 4,
    paddingTop: theme.spacing.m,
    paddingBottom: theme.spacing.s,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  content: { paddingHorizontal: theme.spacing.m + 4, paddingTop: theme.spacing.s, gap: theme.spacing.m },
  footer: {
    paddingHorizontal: theme.spacing.m + 4,
    paddingTop: theme.spacing.m,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    gap: theme.spacing.s,
  },
});
