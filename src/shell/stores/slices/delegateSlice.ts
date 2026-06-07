// Pool-board and partner-board (League) delegate-management actions for the
// global store. Extracted verbatim from globalStore.ts. These are pure
// SECURITY DEFINER RPC wrappers — they touch neither set nor get, so the
// factory takes no store handles. The Pick<> return type makes tsc verify the
// slice provides exactly these GlobalState members with matching signatures.
import {supabase} from '@shared/config/supabase';
import type {GlobalState, PoolDelegate} from '../globalStore.types';

type DelegateSlice = Pick<
  GlobalState,
  | 'grantPoolDelegate'
  | 'revokePoolDelegate'
  | 'listPoolDelegates'
  | 'setLeagueChairman'
  | 'setClubPoolGaffer'
  | 'grantPartnerDirector'
  | 'revokePartnerMember'
  | 'listPartnerMembers'
>;

export const createDelegateSlice = (): DelegateSlice => ({
  grantPoolDelegate: async (poolId, email) => {
    const {data, error} = await supabase.rpc('grant_pool_delegate_by_email', {
      p_pool_id: poolId,
      p_email: email,
    });
    if (error) return {success: false, error: error.message};
    if (data?.error) return {success: false, error: data.error};
    return {success: true, pending: data?.assigned === 'pending'};
  },

  revokePoolDelegate: async (poolId, target) => {
    const {data, error} = await supabase.rpc('revoke_pool_delegate', {
      p_pool_id: poolId,
      p_user_id: target.userId ?? null,
      p_email: target.email ?? null,
    });
    if (error) return {success: false, error: error.message};
    if (data?.error) return {success: false, error: data.error};
    return {success: true};
  },

  listPoolDelegates: async poolId => {
    const {data, error} = await supabase.rpc('list_pool_delegates', {
      p_pool_id: poolId,
    });
    if (error || !Array.isArray(data)) return [];
    return (data as {user_id: string | null; email: string | null; role: string; status: string}[])
      .map(r => ({
        userId: r.user_id,
        email: r.email,
        role: r.role as PoolDelegate['role'],
        status: r.status as PoolDelegate['status'],
      }));
  },

  setLeagueChairman: async (partnerId, email) => {
    const {data, error} = await supabase.rpc('admin_set_league_chairman', {
      p_partner_id: partnerId,
      p_email: email,
    });
    if (error) return {success: false, error: error.message};
    if (data?.error) return {success: false, error: data.error};
    return {success: true, pending: data?.assigned === 'pending'};
  },

  setClubPoolGaffer: async (partnerId, email) => {
    const {data, error} = await supabase.rpc('admin_set_club_pool_gaffer', {
      p_partner_id: partnerId,
      p_email: email,
    });
    if (error) return {success: false, error: error.message};
    if (data?.error) return {success: false, error: data.error};
    return {success: true, pending: data?.assigned === 'pending'};
  },

  grantPartnerDirector: async (partnerId, email) => {
    const {data, error} = await supabase.rpc('grant_partner_director_by_email', {
      p_partner_id: partnerId,
      p_email: email,
    });
    if (error) return {success: false, error: error.message};
    if (data?.error) return {success: false, error: data.error};
    return {success: true, pending: data?.assigned === 'pending'};
  },

  revokePartnerMember: async (partnerId, target) => {
    const {data, error} = await supabase.rpc('revoke_partner_member', {
      p_partner_id: partnerId,
      p_user_id: target.userId ?? null,
      p_email: target.email ?? null,
    });
    if (error) return {success: false, error: error.message};
    if (data?.error) return {success: false, error: data.error};
    return {success: true};
  },

  listPartnerMembers: async partnerId => {
    const {data, error} = await supabase.rpc('list_partner_members', {
      p_partner_id: partnerId,
    });
    if (error || !Array.isArray(data)) return [];
    return (data as {user_id: string | null; email: string | null; role: string; status: string}[])
      .map(r => ({
        userId: r.user_id,
        email: r.email,
        role: r.role as PoolDelegate['role'],
        status: r.status as PoolDelegate['status'],
      }));
  },
});
