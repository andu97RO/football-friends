import { Match } from './types';

const TIMEZONE = 'Europe/Bucharest';
const SOFT_LOCK_MS = 60 * 60 * 1000; // T-60 minutes before kickoff

export function formatMatchTime(isoString: string): string {
  const date = new Date(isoString);
  const options: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  return date.toLocaleString('en-US', options);
}

export function formatMatchTimeShort(isoString: string): string {
  const date = new Date(isoString);
  const dateOptions: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE,
    month: 'short',
    day: 'numeric',
  };
  const timeOptions: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  };
  const datePart = date.toLocaleString('en-US', dateOptions);
  const timePart = date.toLocaleString('en-US', timeOptions);
  return `${datePart}, ${timePart}`;
}

/**
 * Display status from DB + signup window timing.
 * Soft-lock (T-60) is NOT treated as locked — that only happens when
 * match.status is 'locked' after Lock & Generate. Soft-lock only closes
 * new joins via isSignupWindowOpen().
 */
export function getMatchStatus(
  match: Match,
  now: Date
): 'waiting' | 'open' | 'locked' | 'completed' | 'cancelled' {
  if (match.status === 'cancelled') return 'cancelled';
  if (match.status === 'completed') return 'completed';
  if (match.status === 'locked') return 'locked';

  const signupOpenTime = new Date(match.signup_open_at).getTime();
  if (now.getTime() < signupOpenTime) return 'waiting';
  return 'open';
}

/**
 * Whether new players can still join (or enter the waitlist).
 * Closes at T-60 soft-lock even if the match has not been DB-locked yet.
 */
export function isSignupWindowOpen(match: Match, now: Date): boolean {
  if (
    match.status === 'cancelled' ||
    match.status === 'locked' ||
    match.status === 'completed'
  ) {
    return false;
  }

  const nowTime = now.getTime();
  const signupOpenTime = new Date(match.signup_open_at).getTime();
  const softLockTime = new Date(match.kick_off).getTime() - SOFT_LOCK_MS;

  return nowTime >= signupOpenTime && nowTime < softLockTime;
}

export function formatCountdown(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function getTimeUntil(targetDate: string, now: Date): number {
  return new Date(targetDate).getTime() - now.getTime();
}
