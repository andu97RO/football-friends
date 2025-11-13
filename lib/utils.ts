import { Match } from './types';

const TIMEZONE = 'Europe/Bucharest';

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

export function getMatchStatus(
  match: Match,
  now: Date
): 'waiting' | 'open' | 'locked' | 'completed' | 'cancelled' {
  if (match.status === 'cancelled') return 'cancelled';
  if (match.status === 'completed') return 'completed';
  if (match.status === 'locked') return 'locked';

  const signupOpenTime = new Date(match.signup_open_at).getTime();
  const kickOffTime = new Date(match.kick_off).getTime();
  const nowTime = now.getTime();
  const lockTime = kickOffTime - 60 * 60 * 1000; // T-60 minutes

  if (nowTime < signupOpenTime) return 'waiting';
  if (nowTime >= lockTime) return 'locked';
  return 'open';
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
