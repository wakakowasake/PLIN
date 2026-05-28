import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import {
    deepLinkToSubscriptions,
    fetchProducts,
    finishTransaction,
    getAvailablePurchases,
    initConnection,
    purchaseErrorListener,
    purchaseUpdatedListener,
    requestPurchase,
    type ProductOrSubscription,
    type ProductSubscriptionAndroid,
    type Purchase
} from 'expo-iap';

import { getMobileEnv } from '@/config/mobile-runtime-config';
import { fetchBackendJson } from '@/services/backend-client';
import { getNativeStoreLabel } from '@/utils/native-store-copy';

type PurchaseSyncResponse = {
    purchase?: {
        postId?: string;
        productId?: string;
        status?: string;
    };
    subscription?: {
        status?: string;
        productId?: string;
        entitlementId?: string;
        trialEndsAt?: string | null;
        expiresAt?: string | null;
    };
};

type StoreProductKind = 'subscription' | 'in-app';

type StorePurchasePayload = {
    platform: 'ios' | 'android';
    productId: string;
    kind: StoreProductKind;
    transactionId?: string | null;
    purchaseToken?: string | null;
    originalTransactionId?: string | null;
    packageName?: string | null;
    purchaseState?: string | null;
    isAutoRenewing?: boolean | null;
    isAcknowledged?: boolean | null;
    transactionDate?: number | null;
    rawPurchase?: Record<string, unknown>;
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

let connectionRequest: Promise<void> | null = null;

function isDevelopmentRuntime() {
    return typeof __DEV__ !== 'undefined' && __DEV__;
}

function logIapPhase(phase: string, details?: Record<string, unknown>) {
    if (!isDevelopmentRuntime()) {
        return;
    }

    console.info(`[IAP] ${phase}`, details || {});
}

function logIapWarning(phase: string, error: unknown) {
    if (!isDevelopmentRuntime()) {
        return;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[IAP] ${phase}`, { message });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
            reject(new Error(message));
        }, timeoutMs);
    });

    return Promise.race([
        promise.finally(() => {
            if (timeout) {
                clearTimeout(timeout);
            }
        }),
        timeoutPromise
    ]);
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value: unknown) {
    const text = readString(value);
    return text || null;
}

function readMonthlyProductId() {
    return getMobileEnv('iapMonthlyProductId', 'monthly');
}

function readYearlyProductId() {
    return getMobileEnv('iapYearlyProductId', 'yearly');
}

function readLifetimeProductId() {
    return getMobileEnv('iapLifetimeProductId', 'lifetime');
}

function readSubscriptionProductIds() {
    return [readMonthlyProductId(), readYearlyProductId()].filter(Boolean);
}

function readInAppProductIds() {
    return [readLifetimeProductId()].filter(Boolean);
}

function readAllProductIds() {
    return [...readSubscriptionProductIds(), ...readInAppProductIds()];
}

function readDefaultPurchaseProductId(inputProductId?: string) {
    return readString(inputProductId) || readMonthlyProductId();
}

function isLifetimeProductId(productId: string) {
    return productId === readLifetimeProductId();
}

async function buildAppleAppAccountToken(userId: string) {
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, userId);
    const variant = ((parseInt(digest.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');

    return [
        digest.slice(0, 8),
        digest.slice(8, 12),
        `4${digest.slice(13, 16)}`,
        `${variant}${digest.slice(18, 20)}`,
        digest.slice(20, 32)
    ].join('-');
}

function buildCancelledPurchaseError() {
    return Object.assign(new Error('구독을 취소했어요.'), {
        userCancelled: true,
        code: 'PURCHASE_CANCELLED'
    });
}

function isCancelledPurchaseCode(code: unknown) {
    const normalized = readString(code).toLowerCase();
    return normalized === 'user_cancelled'
        || normalized === 'e_user_cancelled'
        || normalized === 'purchase_cancelled'
        || normalized.includes('cancel');
}

function assertPurchasesSupported() {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        throw new Error('앱에서만 구독할 수 있어요.');
    }

    if (readAllProductIds().length === 0) {
        throw new Error('구독 화면을 아직 열 수 없어요. 잠시 후 다시 시도해 주세요.');
    }
}

async function ensureConnected() {
    assertPurchasesSupported();

    if (!connectionRequest) {
        logIapPhase('connection:start', { platform: Platform.OS });
        connectionRequest = withTimeout(
            initConnection(),
            15000,
            `${getNativeStoreLabel()} 연결이 지연되고 있어요. 앱을 다시 열고 시도해 주세요.`
        )
            .then(() => undefined)
            .catch((error) => {
                logIapWarning('connection:error', error);
                connectionRequest = null;
                throw error;
            });
    }

    await connectionRequest;
    logIapPhase('connection:ready', { platform: Platform.OS });
}

function normalizeStoreProduct(product: ProductOrSubscription): PlanMarketplaceProduct {
    const record = product as unknown as Record<string, unknown>;
    return {
        productId: readString(record.id) || readString(record.productId),
        title: readString(record.title) || readString(record.displayName) || 'PLIN Plus',
        description: readString(record.description),
        priceLabel: readString(record.displayPrice) || `${getNativeStoreLabel()}에서 가격 확인`,
        currencyCode: readNullableString(record.currency)
    };
}

function productMatchesId(product: ProductOrSubscription, productId: string) {
    const record = product as unknown as Record<string, unknown>;
    return readString(record.id) === productId || readString(record.productId) === productId;
}

function readAndroidSubscriptionOffer(product: ProductOrSubscription, productId: string) {
    if (Platform.OS !== 'android' || product.type !== 'subs') {
        return null;
    }

    const subscription = product as ProductSubscriptionAndroid;
    const availableOffers = [
        ...(subscription.subscriptionOffers || []),
        ...(subscription.subscriptionOfferDetailsAndroid || [])
    ];
    const preferredOffer = availableOffers.find((offer) => (
        readString((offer as unknown as Record<string, unknown>).paymentMode) === 'free-trial'
    )) || availableOffers[0]
        || null;
    const offerRecord = preferredOffer as unknown as Record<string, unknown> | null;
    const offerToken = readString(offerRecord?.offerTokenAndroid) || readString(offerRecord?.offerToken);

    return offerToken ? { sku: productId, offerToken } : null;
}

function serializePurchase(purchase: Purchase, kind: StoreProductKind): StorePurchasePayload {
    const record = purchase as unknown as Record<string, unknown>;
    const platform = Platform.OS === 'android' ? 'android' : 'ios';

    return {
        platform,
        kind,
        productId: readPurchaseProductId(purchase),
        transactionId: readNullableString(record.transactionId),
        purchaseToken: readNullableString(record.purchaseToken),
        originalTransactionId: readNullableString(record.originalTransactionIdentifierIOS),
        packageName: readNullableString(record.packageNameAndroid),
        purchaseState: readNullableString(record.purchaseState),
        isAutoRenewing: typeof record.isAutoRenewing === 'boolean' ? record.isAutoRenewing : null,
        isAcknowledged: typeof record.isAcknowledgedAndroid === 'boolean' ? record.isAcknowledgedAndroid : null,
        transactionDate: typeof record.transactionDate === 'number' ? record.transactionDate : null,
        rawPurchase: record
    };
}

function readPurchaseProductId(purchase: Purchase) {
    const record = purchase as unknown as Record<string, unknown>;
    return readString(record.productId)
        || readString(record.currentPlanId)
        || readString(record.id);
}

function purchaseMatchesProductId(purchase: Purchase, productId: string) {
    const record = purchase as unknown as Record<string, unknown>;
    const ids = Array.isArray(record.ids)
        ? record.ids.map((value) => readString(value)).filter(Boolean)
        : [];

    return readPurchaseProductId(purchase) === productId || ids.includes(productId);
}

function findMatchingPurchase(
    result: Purchase | Purchase[] | null | undefined,
    productId: string
) {
    const purchases = Array.isArray(result)
        ? result
        : result
            ? [result]
            : [];

    return purchases.find((purchase) => purchaseMatchesProductId(purchase, productId)) || null;
}

function normalizeNativePurchaseMessage(message: string) {
    const normalized = message.toLowerCase();

    if (
        normalized.includes('network')
        || normalized.includes('timeout')
        || normalized.includes('timed out')
        || normalized.includes('connection')
        || normalized.includes('연결')
        || normalized.includes('지연')
    ) {
        return '연결이 불안정해 구독을 완료하지 못했어요. 연결이 돌아오면 다시 시도해 주세요.';
    }

    if (
        normalized.includes('googleplay')
        || normalized.includes('play billing')
        || normalized.includes('billing')
        || normalized.includes('store')
        || normalized.includes('sku')
        || normalized.includes('product')
        || normalized.includes('item unavailable')
        || normalized.includes('not available')
        || normalized.includes('not found')
        || normalized.includes('상품')
    ) {
        return `${getNativeStoreLabel()} 구독을 시작하지 못했어요. 스토어 계정을 확인한 뒤 다시 시도해 주세요.`;
    }

    if (
        normalized.includes('token')
        || normalized.includes('transaction')
        || normalized.includes('developer')
        || normalized.includes('package')
        || normalized.includes('signature')
    ) {
        return '구독을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
    }

    return message;
}

function createPurchaseError(error: unknown) {
    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        if (isCancelledPurchaseCode(record.code)) {
            return buildCancelledPurchaseError();
        }

        const message = readString(record.message) || readString(record.debugMessage);
        if (message) {
            return new Error(normalizeNativePurchaseMessage(message));
        }
    }

    return new Error('구독을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.');
}

export function isPlanMarketplacePurchaseConfigured() {
    return (Platform.OS === 'ios' || Platform.OS === 'android') && readAllProductIds().length > 0;
}

export function isPurchaseCancelledError(error: unknown) {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const record = error as Record<string, unknown>;
    return record.userCancelled === true || isCancelledPurchaseCode(record.code);
}

export async function getPlanMarketplaceProduct(userId: string, productId: string) {
    const safeProductId = readDefaultPurchaseProductId(productId);
    if (!readString(userId)) {
        throw new Error('로그인이 필요해요.');
    }

    await ensureConnected();
    const kind: StoreProductKind = isLifetimeProductId(safeProductId) ? 'in-app' : 'subscription';
    logIapPhase('products:fetch:start', { productId: safeProductId, kind });
    const products = await withTimeout(
        fetchProducts({
            skus: [safeProductId],
            type: kind === 'subscription' ? 'subs' : 'in-app'
        }),
        15000,
        `${getNativeStoreLabel()} 구독 화면을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.`
    ) || [];
    logIapPhase('products:fetch:done', { productId: safeProductId, count: products.length });
    const product = products.find((entry) => productMatchesId(entry, safeProductId));

    if (!product) {
        throw new Error(`${getNativeStoreLabel()}에서 구독 플랜을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.`);
    }

    return {
        raw: product,
        normalized: normalizeStoreProduct(product)
    };
}

export async function getPlanMarketplaceProducts(userId: string) {
    if (!readString(userId)) {
        throw new Error('로그인이 필요해요.');
    }

    await ensureConnected();

    const [subscriptions, inApps] = await Promise.all([
        readSubscriptionProductIds().length > 0
            ? withTimeout(
                fetchProducts({ skus: readSubscriptionProductIds(), type: 'subs' }),
                15000,
                `${getNativeStoreLabel()} 구독 화면을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.`
            )
            : Promise.resolve([]),
        readInAppProductIds().length > 0
            ? withTimeout(
                fetchProducts({ skus: readInAppProductIds(), type: 'in-app' }),
                15000,
                `${getNativeStoreLabel()} 결제 화면을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.`
            )
            : Promise.resolve([])
    ]);
    const products = [...(subscriptions || []), ...(inApps || [])];

    return {
        offeringId: 'native-store',
        products: {
            lifetime: products.find((entry) => productMatchesId(entry, readLifetimeProductId()))
                ? normalizeStoreProduct(products.find((entry) => productMatchesId(entry, readLifetimeProductId())) as ProductOrSubscription)
                : null,
            yearly: products.find((entry) => productMatchesId(entry, readYearlyProductId()))
                ? normalizeStoreProduct(products.find((entry) => productMatchesId(entry, readYearlyProductId())) as ProductOrSubscription)
                : null,
            monthly: products.find((entry) => productMatchesId(entry, readMonthlyProductId()))
                ? normalizeStoreProduct(products.find((entry) => productMatchesId(entry, readMonthlyProductId())) as ProductOrSubscription)
                : null
        },
        packages: products.map((entry) => ({
            identifier: normalizeStoreProduct(entry).productId,
            packageType: entry.type,
            product: normalizeStoreProduct(entry)
        }))
    };
}

export async function syncPlanMarketplaceSubscription(
    input: Pick<PlanMarketplacePurchaseInput, 'userId'> & { purchase?: StorePurchasePayload }
) {
    if (!readString(input.userId)) {
        throw new Error('로그인이 필요해요.');
    }

    return fetchBackendJson<PurchaseSyncResponse>('/marketplace/subscription/sync', {
        method: 'POST',
        body: input.purchase ? { purchase: input.purchase } : {}
    });
}

async function syncAndFinishPurchase(userId: string, purchase: Purchase, kind: StoreProductKind) {
    logIapPhase('purchase:sync:start', { productId: readPurchaseProductId(purchase), kind });
    const subscription = await withTimeout(
        syncPlanMarketplaceSubscription({
            userId,
            purchase: serializePurchase(purchase, kind)
        }),
        20000,
        '구독 확인이 지연되고 있어요. 잠시 후 구독 복원을 눌러 다시 확인해 주세요.'
    );
    await withTimeout(
        finishTransaction({ purchase, isConsumable: false }),
        10000,
        '결제 마무리가 지연되고 있어요. 잠시 후 다시 확인해 주세요.'
    );
    logIapPhase('purchase:sync:done', { productId: readPurchaseProductId(purchase), kind });
    return subscription;
}

async function requestStorePurchase(userId: string, productId: string, kind: StoreProductKind) {
    await ensureConnected();

    logIapPhase('purchase:start', { productId, kind, platform: Platform.OS });
    const selectedProduct = await getPlanMarketplaceProduct(userId, productId);
    const rawProduct = selectedProduct.raw;

    return new Promise<PurchaseSyncResponse>((resolve, reject) => {
        let settled = false;
        const clear = () => {
            updateSubscription.remove();
            errorSubscription.remove();
            clearTimeout(timeout);
        };
        const settle = (fn: () => void) => {
            if (settled) {
                return;
            }

            settled = true;
            clear();
            fn();
        };
        const updateSubscription = purchaseUpdatedListener((purchase) => {
            if (!purchaseMatchesProductId(purchase, productId)) {
                return;
            }

            logIapPhase('purchase:update', { productId: readPurchaseProductId(purchase), kind });
            syncAndFinishPurchase(userId, purchase, kind)
                .then((result) => settle(() => resolve(result)))
                .catch((error) => {
                    logIapWarning('purchase:sync:error', error);
                    settle(() => reject(error));
                });
        });
        const errorSubscription = purchaseErrorListener((error) => {
            logIapWarning('purchase:native:error', error);
            settle(() => reject(createPurchaseError(error)));
        });
        const timeout = setTimeout(() => {
            logIapPhase('purchase:timeout', { productId, kind });
            settle(() => reject(new Error(`${getNativeStoreLabel()} 결제 확인이 지연되고 있어요. 결제 화면이 열려 있다면 완료하거나 닫은 뒤 다시 시도해 주세요.`)));
        }, 120000);

        const androidOffer = readAndroidSubscriptionOffer(rawProduct, productId);
        buildAppleAppAccountToken(userId).then((appAccountToken) => {
            logIapPhase('purchase:request', { productId, kind });
            const purchaseRequest = kind === 'subscription'
                ? requestPurchase({
                    type: 'subs',
                    request: {
                        apple: { sku: productId, appAccountToken },
                        google: {
                            skus: [productId],
                            subscriptionOffers: androidOffer ? [androidOffer] : undefined,
                            obfuscatedAccountId: userId
                        }
                    }
                })
                : requestPurchase({
                    type: 'in-app',
                    request: {
                        apple: { sku: productId, appAccountToken },
                        google: {
                            skus: [productId],
                            obfuscatedAccountId: userId
                        }
                    }
                });

            purchaseRequest
                .then((result) => {
                    logIapPhase('purchase:request:resolved', { productId, kind, hasResult: Boolean(result) });
                    const purchase = findMatchingPurchase(result, productId);
                    if (!purchase) {
                        return;
                    }

                    syncAndFinishPurchase(userId, purchase, kind)
                        .then((syncResult) => settle(() => resolve(syncResult)))
                        .catch((error) => {
                            logIapWarning('purchase:direct-sync:error', error);
                            settle(() => reject(error));
                        });
                })
                .catch((error) => {
                    logIapWarning('purchase:request:error', error);
                    settle(() => reject(createPurchaseError(error)));
                });
        }).catch((error) => {
            logIapWarning('purchase:token:error', error);
            settle(() => reject(createPurchaseError(error)));
        });
    });
}

export async function presentPlanMarketplacePaywall(input: Pick<PlanMarketplacePurchaseInput, 'userId'>) {
    return requestStorePurchase(input.userId, readMonthlyProductId(), 'subscription');
}

export async function purchasePlanMarketplacePost(input: PlanMarketplacePurchaseInput) {
    const productId = readDefaultPurchaseProductId(input.productId);
    const kind: StoreProductKind = isLifetimeProductId(productId) ? 'in-app' : 'subscription';
    return requestStorePurchase(input.userId, productId, kind);
}

export async function purchasePlanMarketplacePackage(
    input: PlanMarketplacePurchaseInput & { packageIdentifier?: 'lifetime' | 'yearly' | 'monthly' | string }
) {
    const productByPackage: Record<string, string> = {
        lifetime: readLifetimeProductId(),
        yearly: readYearlyProductId(),
        annual: readYearlyProductId(),
        monthly: readMonthlyProductId()
    };
    const requestedPackage = readString(input.packageIdentifier).toLowerCase();
    const productId = productByPackage[requestedPackage] || readDefaultPurchaseProductId(input.productId);
    const kind: StoreProductKind = isLifetimeProductId(productId) ? 'in-app' : 'subscription';

    return requestStorePurchase(input.userId, productId, kind);
}

export async function restorePlanMarketplacePostPurchase(input: PlanMarketplacePurchaseInput) {
    await ensureConnected();

    const availablePurchases = await withTimeout(
        getAvailablePurchases({
            includeSuspendedAndroid: false,
            onlyIncludeActiveItemsIOS: true
        }),
        15000,
        '구독 내역 확인이 지연되고 있어요. 잠시 후 다시 시도해 주세요.'
    ) || [];
    const productIds = new Set(readAllProductIds());
    const purchase = availablePurchases.find((entry) => productIds.has(entry.productId));

    if (!purchase) {
        throw new Error('복원할 구독 내역을 찾지 못했어요.');
    }

    const kind: StoreProductKind = isLifetimeProductId(purchase.productId) ? 'in-app' : 'subscription';
    return syncAndFinishPurchase(input.userId, purchase, kind);
}

export async function refreshActivePlanMarketplaceSubscription(input: Pick<PlanMarketplacePurchaseInput, 'userId'>) {
    await ensureConnected();

    const availablePurchases = await withTimeout(
        getAvailablePurchases({
            includeSuspendedAndroid: false,
            onlyIncludeActiveItemsIOS: true
        }),
        15000,
        '구독 내역 확인이 지연되고 있어요. 잠시 후 다시 시도해 주세요.'
    ) || [];
    const productIds = new Set(readAllProductIds());
    const purchase = availablePurchases.find((entry) => productIds.has(entry.productId));

    if (!purchase) {
        return syncPlanMarketplaceSubscription(input);
    }

    const kind: StoreProductKind = isLifetimeProductId(purchase.productId) ? 'in-app' : 'subscription';
    return syncAndFinishPurchase(input.userId, purchase, kind);
}

export async function getActivePlanMarketplaceSubscriptionProductId() {
    await ensureConnected();

    const availablePurchases = await withTimeout(
        getAvailablePurchases({
            includeSuspendedAndroid: false,
            onlyIncludeActiveItemsIOS: true
        }),
        15000,
        '구독 내역 확인이 지연되고 있어요. 잠시 후 다시 시도해 주세요.'
    ) || [];
    const subscriptionProductIds = new Set(readSubscriptionProductIds());
    const purchase = availablePurchases.find((entry) => subscriptionProductIds.has(entry.productId));

    return purchase?.productId || null;
}

export async function presentPlanMarketplaceCustomerCenter(input: Pick<PlanMarketplacePurchaseInput, 'userId'>) {
    await ensureConnected();
    const activeSubscriptionProductId = await getActivePlanMarketplaceSubscriptionProductId();

    await deepLinkToSubscriptions({
        skuAndroid: activeSubscriptionProductId || undefined,
        packageNameAndroid: 'ink.plin.mobile'
    });

    refreshActivePlanMarketplaceSubscription(input).catch(() => undefined);
    return null;
}
