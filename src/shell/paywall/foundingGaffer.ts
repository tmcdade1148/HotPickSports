import {useEffect, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Founding-Gaffer cohort flag (spec §6a/§6d).
 *
 * comp_codes is admin-RLS only, so a normal user can't read back their own
 * redemption. Instead, redeemCompCode persists this local flag on success, and
 * the founding wall reads it to decide whether to show the cohort top line
 * ("Founding Gaffer — you're set."). It's a cosmetic nicety, not a gate.
 */
export const FOUNDING_GAFFER_KEY = 'hp_founding_gaffer';

export function useFoundingGafferFlag(): boolean {
  const [isFounding, setIsFounding] = useState(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(FOUNDING_GAFFER_KEY).then(v => {
      if (active) setIsFounding(v === '1');
    });
    return () => {
      active = false;
    };
  }, []);
  return isFounding;
}
