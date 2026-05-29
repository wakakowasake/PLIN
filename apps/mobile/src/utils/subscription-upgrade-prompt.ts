import { Alert } from '@/feedback';
import {
    isPlanMarketplacePurchaseConfigured
} from '@/services/plan-marketplace-purchases';

type PromptSubscriptionUpgradeOptions = {
    userId: string | null | undefined;
    message: string;
    onOpenSubscription?: () => void;
    onError?: (message: string) => void;
};

export function promptSubscriptionUpgradeForMemoryLimit({
    userId,
    message,
    onOpenSubscription,
    onError
}: PromptSubscriptionUpgradeOptions) {
    if (!userId) {
        Alert.alert('로그인이 필요해요', 'PLIN Plus는 로그인 후 이용해요.');
        return;
    }

    if (!isPlanMarketplacePurchaseConfigured()) {
        Alert.alert('구독 화면을 열 수 없어요', '잠시 후 다시 시도해 주세요.');
        return;
    }

    onError?.(message);
    onOpenSubscription?.();
}
