import { create } from 'zustand';
import { fetchBackendJson } from '@/services/backend-client';
import { isNetworkLikeError } from '@/utils/network-error';

type PlanType = 'monthly' | 'annual';

type SubscriptionState = {
  isPremium: boolean;
  currentPlan: PlanType | null;
  expiryDate: Date | null;
  isLoading: boolean;
  error: string | null;
};

type SubscriptionActions = {
  setPremium: (isPremium: boolean, currentPlan: PlanType | null, expiryDate: Date | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
  syncFromBackend: () => Promise<void>;
};

type SubscriptionStore = SubscriptionState & SubscriptionActions;

const initialState: SubscriptionState = {
  isPremium: false,
  currentPlan: null,
  expiryDate: null,
  isLoading: false,
  error: null
};

export const useSubscriptionStore = create<SubscriptionStore>((set) => ({
  ...initialState,

  setPremium: (isPremium, currentPlan, expiryDate) => {
    set({
      isPremium,
      currentPlan,
      expiryDate,
      error: null
    });
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },

  setError: (error) => {
    set({ error });
  },

  reset: () => {
    set(initialState);
  },

  syncFromBackend: async () => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetchBackendJson<{
        isPremium: boolean;
        currentPlan: PlanType | null;
        expiryDate: string | null;
      }>('/user/subscription');

      const expiryDate = response.expiryDate ? new Date(response.expiryDate) : null;
      const now = new Date();
      const isPremium: boolean = Boolean(response.isPremium && expiryDate && expiryDate > now);

      set((state) => ({
        ...state,
        isPremium,
        currentPlan: response.currentPlan,
        expiryDate,
        isLoading: false,
        error: null
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : '구독 정보를 불러올 수 없습니다.';

      if (isNetworkLikeError(err)) {
        set((state) => ({ ...state, isLoading: false, error: null }));
      } else {
        set((state) => ({ ...state, isLoading: false, error: message }));
      }
    }
  }
}));
