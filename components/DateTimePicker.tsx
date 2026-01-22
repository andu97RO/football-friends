import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet, TextInput } from 'react-native';
import RNDateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { theme } from '@/constants/theme';

// Web-only imports
let ReactDatePicker: any;
if (Platform.OS === 'web') {
  ReactDatePicker = require('react-datepicker').default;
  // CSS not needed - using custom inline styles below
  // require('react-datepicker/dist/react-datepicker.css');
}

interface DateTimePickerProps {
  label?: string;
  value: Date;
  mode?: 'date' | 'time' | 'datetime';
  onChange: (date: Date) => void;
  minimumDate?: Date;
}

export default function DateTimePicker({
  label,
  value,
  mode = 'datetime',
  onChange,
  minimumDate,
}: DateTimePickerProps) {
  const [show, setShow] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (!document.getElementById('datepicker-portal')) {
        const portalDiv = document.createElement('div');
        portalDiv.id = 'datepicker-portal';
        document.body.appendChild(portalDiv);
      }
    }
  }, []);

  const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    // Android: Picker shows as dialog, closes on selection/dismissal
    if (Platform.OS === 'android') {
      setShow(false);
      if (event.type === 'set' && selectedDate) {
        onChange(selectedDate);
      }
    }
    // iOS: Picker shows inline, updates continuously as user scrolls
    else if (Platform.OS === 'ios') {
      if (selectedDate) {
        onChange(selectedDate);
      }
    }
    // Web: Handle like Android - only update on confirmation
    else if (Platform.OS === 'web') {
      if (event.type === 'set' && selectedDate) {
        onChange(selectedDate);
      }
    }
  };

  const formatValue = () => {
    if (mode === 'time') return dayjs(value).format('h:mm A');
    if (mode === 'date') return dayjs(value).format('ddd, MMM D, YYYY');
    return dayjs(value).format('ddd, MMM D, YYYY h:mm A');
  };

  const getIcon = () => {
    if (mode === 'time') return 'time-outline';
    return 'calendar-outline';
  };

  // Web-specific handler
  const handleWebChange = (event: any) => {
    const newDate = new Date(event.target.value);
    if (!isNaN(newDate.getTime())) {
      onChange(newDate);
    }
  };

  // Format value for web input
  const getWebInputValue = () => {
    if (mode === 'time') return dayjs(value).format('HH:mm');
    if (mode === 'date') return dayjs(value).format('YYYY-MM-DD');
    return dayjs(value).format('YYYY-MM-DDTHH:mm');
  };

  // Get HTML input type for web
  const getWebInputType = () => {
    if (mode === 'time') return 'time';
    if (mode === 'date') return 'date';
    return 'datetime-local';
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        {label && <Text style={styles.label}>{label}</Text>}
        <View style={styles.webPickerWrapper}>
          <Ionicons name={getIcon()} size={20} color={theme.colors.success} style={{ marginRight: 12 }} />
          <ReactDatePicker
            selected={value}
            onChange={(date: Date) => onChange(date)}
            showTimeSelect={mode === 'time' || mode === 'datetime'}
            showTimeSelectOnly={mode === 'time'}
            timeIntervals={15}
            timeCaption="Time"
            dateFormat={mode === 'time' ? 'h:mm aa' : mode === 'date' ? 'EEE, MMM d, yyyy' : 'EEE, MMM d, yyyy h:mm aa'}
            minDate={minimumDate}
            portalId="datepicker-portal"
            popperProps={{
              strategy: 'fixed',
            }}
            customInput={
              <div style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: theme.colors.text,
                fontSize: 16,
                fontWeight: '500',
                outline: 'none',
                cursor: 'pointer',
                flex: 1,
                fontFamily: 'system-ui',
              }}>
                {formatValue()}
              </div>
            }
            calendarClassName="custom-datepicker"
            popperClassName="custom-datepicker-popper"
          />
        </View>
        <style>{`
          /* Portal container styles */
          #datepicker-portal {
            position: relative;
            z-index: 9999;
          }
          
          /* Global Overrides for React Datepicker */
          .react-datepicker-popper, .custom-datepicker-popper {
            z-index: 9999 !important;
            position: fixed !important;
          }
          
          .react-datepicker, .custom-datepicker {
            font-family: system-ui, -apple-system, sans-serif !important;
            background-color: ${theme.colors.surface} !important;
            color: ${theme.colors.text} !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            border-radius: 12px !important;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
            overflow: hidden !important;
          }

          .react-datepicker__header, .custom-datepicker .react-datepicker__header {
            background-color: ${theme.colors.surface} !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
          }

          .react-datepicker__month-container, .custom-datepicker .react-datepicker__month-container {
            background-color: ${theme.colors.surface} !important;
          }

          .react-datepicker__current-month, .react-datepicker-time__header, .react-datepicker__day-name,
          .custom-datepicker .react-datepicker__current-month, .custom-datepicker .react-datepicker-time__header, .custom-datepicker .react-datepicker__day-name {
            color: ${theme.colors.text} !important;
          }

          .react-datepicker__day, .custom-datepicker .react-datepicker__day {
            color: ${theme.colors.text} !important;
            border-radius: 8px !important;
          }

          .react-datepicker__day:hover, .custom-datepicker .react-datepicker__day:hover {
            background-color: rgba(255, 255, 255, 0.1) !important;
            color: ${theme.colors.text} !important;
          }

          .react-datepicker__day--selected, .react-datepicker__day--keyboard-selected,
          .custom-datepicker .react-datepicker__day--selected, .custom-datepicker .react-datepicker__day--keyboard-selected {
            background-color: ${theme.colors.success} !important;
            color: white !important;
          }

          .react-datepicker__day--disabled, .custom-datepicker .react-datepicker__day--disabled {
            color: ${theme.colors.textSecondary} !important;
            opacity: 0.5 !important;
          }

          .react-datepicker__time-container, .custom-datepicker .react-datepicker__time-container {
            border-left: 1px solid rgba(255, 255, 255, 0.1) !important;
            background-color: ${theme.colors.surface} !important;
          }

          .react-datepicker__time-container .react-datepicker__time,
          .custom-datepicker .react-datepicker__time-container .react-datepicker__time {
            background-color: ${theme.colors.surface} !important;
          }

          .react-datepicker__time-list-item, .custom-datepicker .react-datepicker__time-list-item {
            color: ${theme.colors.text} !important;
          }

          .react-datepicker__time-list-item:hover, .custom-datepicker .react-datepicker__time-list-item:hover {
            background-color: rgba(255, 255, 255, 0.1) !important;
            color: ${theme.colors.text} !important;
          }

          .react-datepicker__time-list-item--selected, .custom-datepicker .react-datepicker__time-list-item--selected {
            background-color: ${theme.colors.success} !important;
            color: white !important;
          }

          .react-datepicker__navigation-icon::before, .custom-datepicker .react-datepicker__navigation-icon::before {
            border-color: ${theme.colors.text} !important;
          }

          .react-datepicker__triangle, .custom-datepicker .react-datepicker__triangle {
            display: none !important;
          }

          .react-datepicker__navigation:hover *::before, .custom-datepicker .react-datepicker__navigation:hover *::before {
            border-color: ${theme.colors.success} !important;
          }
          
          .react-datepicker__year-read-view--down-arrow,
          .react-datepicker__month-read-view--down-arrow,
          .react-datepicker__month-year-read-view--down-arrow,
          .custom-datepicker .react-datepicker__year-read-view--down-arrow,
          .custom-datepicker .react-datepicker__month-read-view--down-arrow,
          .custom-datepicker .react-datepicker__month-year-read-view--down-arrow {
            border-color: ${theme.colors.text} !important;
          }
        `}</style>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={styles.button}
        onPress={() => setShow(!show)}
        activeOpacity={0.7}
      >
        <Ionicons name={getIcon()} size={20} color={theme.colors.success} />
        <Text style={styles.value}>{formatValue()}</Text>
      </TouchableOpacity>

      {/* Android: Renders as a dialog when 'show' is true */}
      {Platform.OS === 'android' && show && (
        <RNDateTimePicker
          testID="dateTimePicker"
          value={value}
          mode={mode}
          display="default"
          onChange={handleChange}
          minimumDate={minimumDate}
        />
      )}

      {/* iOS: Renders inline when 'show' is true */}
      {Platform.OS === 'ios' && show && (
        <View style={styles.iosPickerContainer}>
          <View style={styles.iosPickerHeader}>
            <TouchableOpacity
              onPress={() => setShow(false)}
              style={styles.doneButton}
              activeOpacity={0.7}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
          <RNDateTimePicker
            testID="dateTimePicker"
            value={value}
            mode={mode}
            display="spinner"
            onChange={handleChange}
            minimumDate={minimumDate}
            textColor={theme.colors.text}
            themeVariant="dark"
            accentColor={theme.colors.success}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 8,
    marginLeft: 4,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  webPickerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
  },
  value: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '500',
  },
  iosPickerContainer: {
    marginTop: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  doneButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: theme.colors.success,
    borderRadius: 8,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
