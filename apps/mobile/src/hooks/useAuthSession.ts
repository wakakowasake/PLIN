import { useSessionStore } from '@/state/session-store';

export function useAuthSession() {
    return useSessionStore();
}
