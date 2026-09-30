import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import RNDateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { formatDate, intlLocale, useLocaleStore, useT } from '@/lib/i18n';
import { Txt } from '@/components/ui';

let ReactDatePicker: any;
if (Platform.OS === 'web') {
  ReactDatePicker = require('react-datepicker').default;
  // The theme rules below only override colors; the library stylesheet supplies
  // the calendar grid, navigation controls, and time list layout.
  require('react-datepicker/dist/react-datepicker.css');
}

type Part = 'date' | 'time';

/**
 * D2: one date + time row used by New match and Edit match alike.
 * The date is on the left, the time on the right; each half opens its own picker.
 */
export default function DateTimeRow({
  label,
  value,
  onChange,
  minimumDate,
  icon = 'calendar-outline',
  testID,
}: {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
}) {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const [open, setOpen] = useState<Part | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' && !document.getElementById('datepicker-portal')) {
      const portalDiv = document.createElement('div');
      portalDiv.id = 'datepicker-portal';
      document.body.appendChild(portalDiv);
    }
  }, []);

  // Keep the other half of the value when one half changes.
  const merge = (part: Part, picked: Date) => {
    const next = new Date(value);
    if (part === 'date') next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    onChange(next);
  };

  const handleNative = (part: Part) => (event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') setOpen(null);
    if (event.type === 'set' && picked) merge(part, picked);
  };

  const dateText = formatDate.long(value, locale);
  const timeText = formatDate.time(value, locale);

  const webInput = (text: string, style: object) => (
    <div style={{ cursor: 'pointer', color: theme.colors.text, fontFamily: theme.fonts.semibold, fontSize: 16, ...style }}>{text}</div>
  );

  return (
    <View style={{ gap: 8 }} testID={testID}>
      <Txt variant="label" tone="secondary">{label}</Txt>
      <View style={styles.row}>
        <Ionicons name={icon} size={20} color={theme.colors.primaryText} />
        {Platform.OS === 'web' ? (
          <>
            <View style={{ flex: 1 }}>
              <ReactDatePicker
                selected={value}
                onChange={(d: Date) => d && merge('date', d)}
                minDate={minimumDate}
                locale={intlLocale(locale)}
                portalId="datepicker-portal"
                popperProps={{ strategy: 'fixed' }}
                customInput={webInput(dateText, {})}
              />
            </View>
            <ReactDatePicker
              selected={value}
              onChange={(d: Date) => d && merge('time', d)}
              showTimeSelect
              showTimeSelectOnly
              timeIntervals={15}
              timeCaption={t('match.time')}
              timeFormat="HH:mm"
              portalId="datepicker-portal"
              popperProps={{ strategy: 'fixed' }}
              customInput={webInput(timeText, { fontFamily: theme.fonts.display, fontSize: 22 })}
            />
          </>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${dateText}`}
              style={styles.half}
              onPress={() => setOpen(open === 'date' ? null : 'date')}
            >
              <Txt variant="bodyStrong" numberOfLines={1}>{dateText}</Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${timeText}`}
              style={styles.timeHalf}
              onPress={() => setOpen(open === 'time' ? null : 'time')}
            >
              <Txt variant="number" style={{ fontSize: 22 }}>{timeText}</Txt>
            </Pressable>
          </>
        )}
      </View>
      {Platform.OS !== 'web' && open && (
        Platform.OS === 'ios' ? (
          <View style={styles.iosPicker}>
            <RNDateTimePicker
              value={value}
              mode={open}
              display="spinner"
              minuteInterval={5}
              onChange={handleNative(open)}
              minimumDate={open === 'date' ? minimumDate : undefined}
              textColor={theme.colors.text}
              themeVariant="dark"
              locale={intlLocale(locale)}
            />
            <Pressable accessibilityRole="button" onPress={() => setOpen(null)} style={styles.done}>
              <Txt variant="bodyStrong" tone="primary">{t('common.done')}</Txt>
            </Pressable>
          </View>
        ) : (
          <RNDateTimePicker
            value={value}
            mode={open}
            is24Hour
            onChange={handleNative(open)}
            minimumDate={open === 'date' ? minimumDate : undefined}
          />
        )
      )}
      {Platform.OS === 'web' && (
        <style>{`
          #datepicker-portal { position: relative; z-index: 9999; }
          .react-datepicker-popper { z-index: 9999 !important; position: fixed !important; }
          .react-datepicker { font-family: ${theme.fonts.body}, system-ui, sans-serif !important; background: ${theme.colors.surface} !important;
            color: ${theme.colors.text} !important; border: 1px solid ${theme.colors.borderStrong} !important; border-radius: 14px !important; overflow: hidden; }
          .react-datepicker__header, .react-datepicker__month-container, .react-datepicker__time-container,
          .react-datepicker__time-container .react-datepicker__time { background: ${theme.colors.surface} !important; border-color: ${theme.colors.border} !important; }
          .react-datepicker__current-month, .react-datepicker-time__header, .react-datepicker__day-name,
          .react-datepicker__day, .react-datepicker__time-list-item { color: ${theme.colors.text} !important; }
          .react-datepicker__day { border-radius: 8px !important; }
          .react-datepicker__day:hover, .react-datepicker__time-list-item:hover { background: ${theme.colors.surfaceRaised} !important; }
          .react-datepicker__day--selected, .react-datepicker__day--keyboard-selected,
          .react-datepicker__time-list-item--selected { background: ${theme.colors.primary} !important; color: ${theme.colors.onPrimary} !important; }
          .react-datepicker__day--disabled { color: ${theme.colors.textMuted} !important; opacity: 0.5; }
          .react-datepicker__navigation-icon::before { border-color: ${theme.colors.text} !important; }
          .react-datepicker__triangle { display: none !important; }
        `}</style>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: theme.spacing.m,
    borderRadius: theme.borderRadius.m,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  half: { flex: 1, minHeight: 52, justifyContent: 'center' },
  timeHalf: { minHeight: 52, minWidth: 64, alignItems: 'flex-end', justifyContent: 'center' },
  iosPicker: { borderRadius: theme.borderRadius.m, backgroundColor: theme.colors.surfaceRaised, overflow: 'hidden' },
  done: { alignSelf: 'flex-end', minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
});
