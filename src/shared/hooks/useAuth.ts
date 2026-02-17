/**
 * useAuth hook — convenient access to auth state from any component.
 */
import { useGlobalStore } from '../../shell/stores/globalStore';

export function useAuth() {
  const session = useGlobalStore(s => s.session);
  const profile = useGlobalStore(s => s.profile);
  const isLoading = useGlobalStore(s => s.isLoading);

  return {
    session,
    profile,
    isLoading,
    isAuthenticated: !!session,
    userId: session?.user?.id ?? null,
  };
}
