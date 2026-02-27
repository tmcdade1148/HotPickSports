import {useState, useEffect, useRef} from 'react';

interface CountdownResult {
  /** Formatted time string: "2d 5h", "3h 22m", "14m 30s", or "Deadline passed" */
  timeLeft: string | null;
  /** True when < 2 hours remain — drives visual urgency (red styling) */
  isUrgent: boolean;
  /** True when the deadline has passed */
  hasExpired: boolean;
}

/**
 * useCountdown — Ticking countdown hook for deadline-driven UI.
 *
 * Ticks every 60s normally, every 1s when under 1 hour.
 * Returns null for timeLeft when deadline is null.
 * Reusable across any card that needs a deadline countdown.
 */
export function useCountdown(deadline: Date | null): CountdownResult {
  const [now, setNow] = useState(() => Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!deadline) {
      return;
    }

    const tick = () => setNow(Date.now());

    // Determine tick interval based on remaining time
    const scheduleInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      const remaining = deadline.getTime() - Date.now();

      if (remaining <= 0) {
        // Deadline passed — no need to tick
        tick();
        return;
      }

      // Tick every second when under 1 hour, every 60s otherwise
      const interval = remaining < 60 * 60 * 1000 ? 1000 : 60_000;
      intervalRef.current = setInterval(() => {
        tick();

        // Re-evaluate interval when crossing the 1-hour threshold
        const newRemaining = deadline.getTime() - Date.now();
        if (newRemaining <= 0) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
        } else if (newRemaining < 60 * 60 * 1000 && interval !== 1000) {
          // Switch to 1s ticks
          scheduleInterval();
        }
      }, interval);
    };

    scheduleInterval();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [deadline]);

  if (!deadline) {
    return {timeLeft: null, isUrgent: false, hasExpired: false};
  }

  const diff = deadline.getTime() - now;

  if (diff <= 0) {
    return {timeLeft: 'Deadline passed', isUrgent: true, hasExpired: true};
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  let timeLeft: string;
  if (days > 0) {
    timeLeft = `${days}d ${hours}h`;
  } else if (hours > 0) {
    timeLeft = `${hours}h ${minutes}m`;
  } else {
    timeLeft = `${minutes}m ${seconds}s`;
  }

  // Urgent when less than 2 hours remain
  const isUrgent = diff < 2 * 60 * 60 * 1000;

  return {timeLeft, isUrgent, hasExpired: false};
}
