import { Platform } from 'react-native';
import { Match } from './types';
import { t as translate } from './i18n';

// Teams are picked (and joining closes) 60 minutes before kick-off.
export const SOFT_LOCK_MS = 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Timed = Pick<Match, 'status' | 'kick_off' | 'signup_open_at'>;

/**
 * Display status from DB + signup window timing.
 * Soft-lock (T-60) is NOT treated as locked — that only happens when
 * match.status is 'locked' after Lock & Generate. Soft-lock only closes
 * new joins via isSignupWindowOpen().
 */
export function getMatchStatus(
  match: Timed,
  now: Date
): 'waiting' | 'open' | 'locked' | 'started' | 'completed' | 'cancelled' {
  if (match.status === 'cancelled') return 'cancelled';
  if (match.status === 'completed') return 'completed';
  if (now.getTime() >= new Date(match.kick_off).getTime()) return 'started';
  if (match.status === 'locked') return 'locked';

  const signupOpenTime = new Date(match.signup_open_at).getTime();
  if (now.getTime() < signupOpenTime) return 'waiting';
  return 'open';
}

/**
 * Whether new players can still join (or enter the waitlist).
 * Closes at T-60 soft-lock even if the match has not been DB-locked yet.
 */
export function isSignupWindowOpen(match: Timed, now: Date): boolean {
  if (match.status !== 'scheduled') return false;
  const nowTime = now.getTime();
  const softLockTime = new Date(match.kick_off).getTime() - SOFT_LOCK_MS;
  return nowTime >= new Date(match.signup_open_at).getTime() && nowTime < softLockTime;
}

export function teamsPickedAt(kickOff: string): Date {
  return new Date(new Date(kickOff).getTime() - SOFT_LOCK_MS);
}

/**
 * M4: calm relative time. Days away reads "in 2 days"; only the last hours count
 * down ("in 3 h 12 min"), and never in seconds.
 */
export function relativeTime(target: string | Date, now: Date): string {
  const ms = new Date(target).getTime() - now.getTime();
  const abs = Math.abs(ms);
  if (abs >= 18 * HOUR) {
    const days = Math.max(1, Math.round(abs / DAY));
    return translate(ms >= 0 ? 'time.inDays' : 'time.daysAgo', { count: days });
  }
  const hours = Math.floor(abs / HOUR);
  const minutes = Math.max(ms >= 0 ? 1 : 0, Math.floor((abs % HOUR) / 60000));
  const span = hours > 0 ? translate('time.hoursMinutes', { h: hours, m: minutes }) : translate('time.minutes', { m: minutes });
  return translate(ms >= 0 ? 'time.in' : 'time.ago', { span });
}

export function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function firstName(name?: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] || '?';
}

export function formatMoney(amount: number | string, currency: string): string {
  const value = Number(amount);
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${text} ${currency}`;
}

/** Teams are stored as "Team A", "Team B"…; show them in the player's language. */
export function teamLabel(name: string): string {
  const letter = name.match(/^Team ([A-Z])$/)?.[1];
  return letter ? translate('teams.name', { letter }) : name;
}

/** A map search link when the organiser did not paste one. */
export function venueLink(name: string, url: string): string | null {
  if (url.trim()) return url.trim();
  if (!name.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name.trim())}`;
}

/** Shareable web link (invites, match links). Uses the current site on web. */
export function appUrl(path: string): string {
  const base =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : process.env.EXPO_PUBLIC_WEB_URL || 'https://football-friends-seven.vercel.app';
  return `${base.replace(/\/$/, '')}${path}`;
}
