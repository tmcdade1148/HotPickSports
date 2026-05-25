// src/shell/components/home/useCountdown.ts
// Lightweight countdown hook used by PicksOpenHero, PreSeasonHero, and
// SuperBowlIntroHero. Ticks every 30 seconds; idle when no target is set.
// Format: zero-padded {days, hours, minutes} strings.

import {useEffect, useState} from 'react';

export interface CountdownParts {
  days: string;
  hours: string;
  minutes: string;
  /** True when the deadline has passed (or no deadline is set). */
  isExpired: boolean;
}

export function useCountdown(deadline: Date | null): CountdownParts {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return {days: '--', hours: '--', minutes: '--', isExpired: true};

  const diff = deadline.getTime() - now;
  if (diff <= 0) return {days: '00', hours: '00', minutes: '00', isExpired: true};

  const totalMinutes = Math.floor(diff / 60_000);
  const days    = Math.floor(totalMinutes / (60 * 24));
  const hours   = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  return {
    days:    String(days).padStart(2, '0'),
    hours:   String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    isExpired: false,
  };
}
