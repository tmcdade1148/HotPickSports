// src/shell/components/home/useCountdown.ts
// Lightweight countdown hook used by PicksOpenHero, PreSeasonHero,
// SuperBowlIntroHero, OffSeasonHero. Ticks every 30 seconds; idle when no
// target is set.
//
// App-wide display rule (single largest meaningful unit):
//   ≥ 1 day   → show days   ("92 days")
//   < 1 day   → show hours  ("8 hours")   — covers the whole 1h–24h band
//   < 1 hour  → show minutes ("45 minutes", down to "<60")
// Consumers should render `unitText` (or `unitValue` + `unit`) rather than the
// raw days/hours/minutes (those remain only for any legacy multi-unit use).

import {useEffect, useState} from 'react';

export type CountdownUnit = 'day' | 'hour' | 'minute';

export interface CountdownParts {
  days: string;
  hours: string;
  minutes: string;
  /** Largest meaningful unit per the app-wide rule. */
  unitValue: number;
  unit: CountdownUnit;
  /** Pre-formatted, e.g. "92 days", "1 hour", "45 minutes". */
  unitText: string;
  /** True when the deadline has passed (or no deadline is set). */
  isExpired: boolean;
}

/**
 * Pure: pick the single largest meaningful unit from day/hour/minute counts.
 *   days ≥ 1 → days; else hours ≥ 1 → hours; else minutes.
 */
export function singleUnit(
  days: number,
  hours: number,
  minutes: number,
): {value: number; unit: CountdownUnit; text: string} {
  let value: number;
  let unit: CountdownUnit;
  if (days >= 1) {
    value = days; unit = 'day';
  } else if (hours >= 1) {
    value = hours; unit = 'hour';
  } else {
    value = Math.max(0, minutes); unit = 'minute';
  }
  return {value, unit, text: `${value} ${unit}${value === 1 ? '' : 's'}`};
}

export function useCountdown(deadline: Date | null): CountdownParts {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) {
    return {days: '--', hours: '--', minutes: '--', unitValue: 0, unit: 'day', unitText: '—', isExpired: true};
  }

  const diff = deadline.getTime() - now;
  if (diff <= 0) {
    return {days: '00', hours: '00', minutes: '00', unitValue: 0, unit: 'minute', unitText: '0 minutes', isExpired: true};
  }

  const totalMinutes = Math.floor(diff / 60_000);
  const days    = Math.floor(totalMinutes / (60 * 24));
  const hours   = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const su = singleUnit(days, hours, minutes);

  return {
    days:    String(days).padStart(2, '0'),
    hours:   String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    unitValue: su.value,
    unit: su.unit,
    unitText: su.text,
    isExpired: false,
  };
}
