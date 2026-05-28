import { Alert } from '@/feedback';
import {
    isPlanMarketplacePurchaseConfigured,
    isPurchaseCancelledError,
    presentPlanMarketplacePaywall
} from '@/services/plan-marketplace-purchases';
import { getNativeStoreLabel } from '@/utils/native-store-copy';

type PromptSubscriptionUpgradeOptions = {
    userId: string | null | undefined;
    message: string;
    onActivated?: () => void | Promise<void>;
    onError?: (message: string) => void;
};

export function promptSubscriptionUpgradeForMemoryLimit({
    userId,
    message,
    onActivated,
    onError
}: PromptSubscriptionUpgradeOptions) {
    const nativeStoreLabel = getNativeStoreLabel();

    if (!userId) {
        Alert.alert('로그인이 필요해요', 'PLIN Plus는 로그인 후 이용할 수 있어요.');
        return;
    }

    if (!isPlanMarketplacePurchaseConfigured()) {
        Alert.alert('구독 화면을 열 수 없어요', '잠시 후 다시 시도해 주세요.');
        return;
    }

    Alert.alert(
        '추억 사진을 더 남기려면',
        `${message}\n\n첫 달 무료 후 월 3,900원으로 자동 갱신돼요. 해지는 ${nativeStoreLabel} 구독 관리에서 할 수 있어요.`,
        [
            {
                text: '나중에',
                style: 'cancel'
            },
            {
                text: '1개월 무료로 시작',
                onPress: () => {
                    void (async () => {
                        try {
                            await presentPlanMarketplacePaywall({ userId });
                            await onActivated?.();
                            Alert.alert('PLIN Plus 활성화', '이제 추억 사진을 더 추가할 수 있어요.');
                        } catch (error) {
                            if (isPurchaseCancelledError(error)) {
                                return;
                            }

                            const errorMessage = error instanceof Error && error.message
                                ? error.message
                                : '구독을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.';
                            onError?.(errorMessage);
                            Alert.alert('구독을 시작하지 못했어요', errorMessage, undefined, { presentation: 'native' });
                        }
                    })();
                }
            }
        ],
        { cancelable: true }
    );
}
