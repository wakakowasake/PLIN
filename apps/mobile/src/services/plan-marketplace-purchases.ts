import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

import { getMobileEnv } from '@/config/mobile-runtime-config';
import { fetchBackendJson } from '@/services/backend-client';

type RevenueCatProduct = Awaited<ReturnType<typeof Purchases.getProducts>>[number];

type PurchaseSyncResponse = {
    purchase?: {
        postId?: string;
        productId?: string;
        status?: string;
    };
};

export type PlanMarketplaceProduct = {
    productId: string;
    title: string;
    description: string;
    priceLabel: string;
    currencyCode: string | null;
};

export type PlanMarketplacePurchaseInput = {
    userId: string;
    postId: string;
    productId: string;
};

let configuredAppUserId: string | null = null;
let configureRequest: Promise<void> | null = null;

function readRevenueCatApiKey() {
    if (Platform.OS === 'ios') {
        return getMobileEnv('revenueCatIosApiKey');
    }

    if (Platform.OS === 'android') {
        return getMobileEnv('revenueCatAndroidApiKey');
    }

    return '';
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value: unknown) {
    const text = readString(value);
    return text || null;
}

function readProductField(product: RevenueCatProduct, key: string) {
    return readNullableString((product as unknown as Record<string, unknown>)[key]);
}

function normalizeRevenueCatProduct(product: RevenueCatProduct): PlanMarketplaceProduct {
    const productId = readProductField(product, 'identifier')
        || readProductField(product, 'productIdentifier')
        || '';
    const title = readProductField(product, 'title')
        || readProductField(product, 'localizedTitle')
        || 'PLIN 큐레이션 플랜';
    const description = readProductField(product, 'description')
        || readProductField(product, 'localizedDescription')
        || '';
    const priceLabel = readProductField(product, 'priceString')
        || readProductField(product, 'localizedPriceString')
        || readProductField(product, 'localizedPrice')
        || '가격 확인 필요';
    const currencyCode = readProductField(product, 'currencyCode')
        || readProductField(product, 'currency')
        || null;

    return {
        productId,
        title,
        description,
        priceLabel,
        currencyCode
    };
}

function assertPurchasesSupported() {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        throw new Error('앱에서만 구매할 수 있어요.');
    }

    if (!readRevenueCatApiKey()) {
        throw new Error('결제 설정이 아직 준비되지 않았어요. 관리자에게 문의해 주세요.');
    }
}

async function ensureConfigured(userId: string) {
    const appUserId = readString(userId);
    if (!appUserId) {
        throw new Error('로그인이 필요합니다.');
    }

    assertPurchasesSupported();

    if (configuredAppUserId === appUserId) {
        return;
    }

    // 최초 configure가 진행 중이면 완료를 기다린다
    if (configureRequest) {
        await configureRequest;
    }

    // configure 완료 후 이미 같은 사용자면 종료
    if (configuredAppUserId === appUserId) {
        return;
    }

    if (!configuredAppUserId) {
        const apiKey = readRevenueCatApiKey();
        configureRequest = Promise.resolve().then(() => {
            Purchases.configure({
                apiKey,
                appUserID: appUserId
            });
            configuredAppUserId = appUserId;
        });

        await configureRequest;
        return;
    }

    await Purchases.logIn(appUserId);
    configuredAppUserId = appUserId;
}

export function isPlanMarketplacePurchaseConfigured() {
    return Boolean(readRevenueCatApiKey()) && (Platform.OS === 'ios' || Platform.OS === 'android');
}

export function isPurchaseCancelledError(error: unknown) {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const record = error as Record<string, unknown>;
    return record.userCancelled === true || record.code === 'PURCHASE_CANCELLED';
}

export async function getPlanMarketplaceProduct(userId: string, productId: string) {
    const safeProductId = readString(productId);
    if (!safeProductId) {
        throw new Error('구매할 플랜을 찾지 못했어요.');
    }

    await ensureConfigured(userId);
    const products = await Purchases.getProducts(
        [safeProductId],
        Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION
    );
    const product = products[0];

    if (!product) {
        throw new Error('스토어에 등록된 플랜을 찾지 못했어요.');
    }

    return {
        raw: product,
        normalized: normalizeRevenueCatProduct(product)
    };
}

export async function syncPlanMarketplacePurchase(input: PlanMarketplacePurchaseInput) {
    const postId = readString(input.postId);
    const productId = readString(input.productId);

    if (!postId || !productId) {
        throw new Error('구매한 플랜 정보를 확인하지 못했어요.');
    }

    return fetchBackendJson<PurchaseSyncResponse>('/marketplace/purchases/sync', {
        method: 'POST',
        body: {
            postId,
            productId
        }
    });
}

export async function purchasePlanMarketplacePost(input: PlanMarketplacePurchaseInput) {
    const product = await getPlanMarketplaceProduct(input.userId, input.productId);
    const purchaseResult = await Purchases.purchaseStoreProduct(product.raw);
    const purchasedProductId = readString(purchaseResult.productIdentifier) || input.productId;

    await syncPlanMarketplacePurchase({
        ...input,
        productId: purchasedProductId
    });

    return purchaseResult;
}

export async function restorePlanMarketplacePostPurchase(input: PlanMarketplacePurchaseInput) {
    await ensureConfigured(input.userId);

    try {
        await Purchases.restorePurchases();
    } catch (error) {
        throw new Error('스토어에서 이전 구매 내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    }

    return syncPlanMarketplacePurchase(input);
}
