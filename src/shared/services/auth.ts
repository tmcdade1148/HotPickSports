/**
 * Authentication service — wraps Supabase auth for sign up, sign in, sign out.
 * Also handles profile creation in the users table on sign-up.
 */
import { supabase } from '../config/supabase';
import type { User } from '../types/database';

interface SignUpParams {
  email: string;
  password: string;
  fullName: string;
  poolieName: string;
}

interface SignInParams {
  email: string;
  password: string;
}

/** Sign up a new user and create their profile row */
export async function signUp({ email, password, fullName, poolieName }: SignUpParams) {
  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        poolie_name: poolieName,
      },
    },
  });

  if (authError) throw authError;
  if (!authData.user) throw new Error('Sign-up succeeded but no user returned');

  // 2. Create profile row in users table
  const { error: profileError } = await supabase.from('users').insert({
    id: authData.user.id,
    email,
    full_name: fullName,
    poolie_name: poolieName,
    display_mode: 'first_name',
    avatar_url: null,
    push_token: null,
  });

  if (profileError) throw profileError;

  return authData;
}

/** Sign in an existing user */
export async function signIn({ email, password }: SignInParams) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

/** Sign out the current user */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Fetch the current user's profile from the users table */
export async function fetchProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw error;
  }

  return data as User;
}

/** Update the current user's profile */
export async function updateProfile(userId: string, updates: Partial<User>) {
  const { data, error } = await supabase
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data as User;
}

/** Check if a poolie name is already taken */
export async function isPoolieNameTaken(poolieName: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .ilike('poolie_name', poolieName);

  if (error) throw error;
  return (count ?? 0) > 0;
}
