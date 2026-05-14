import { useEffect } from 'react';
import { useSubscriptionStore } from '@/state/subscription-store';
import { useForegroundResumeRefresh } from '@/hooks/useForegroundResumeRefresh';

type UseSubscriptionInitOptions = {
  enabled?: boolean;
};

export function useSubscriptionInit({ enabled = true }: UseSubscriptionInitOptions = {}) {
  const syncFromBackend = useSubscriptionStore((state) => state.syncFromBackend);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    syncFromBackend().catch(() => {});
  }, [enabled, syncFromBackend]);

  useForegroundResumeRefresh({
    enabled,
    onRefresh: () => syncFromBackend(),
    throttleMs: 15000
  });
}

export function useSubscription() {
  return useSubscriptionStore((state) => ({
    isPremium: state.isPremium,
    currentPlan: state.currentPlan,
    expiryDate: state.expiryDate,
    isLoading: state.isLoading,
    error: state.error
  }));
}

export function useSubscriptionActions() {
  return useSubscriptionStore((state) => ({
    setPremium: state.setPremium,
    setLoading: state.setLoading,
    setError: state.setError,
    reset: state.reset,
    syncFromBackend: state.syncFromBackend
  }));
}
