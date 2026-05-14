import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage, type CustomerInfo, type MakePurchaseResult } from 'react-native-purchases';

import { getMobileEnv } from '@/config/mobile-runtime-config';

type RevenueCatOffering = Awaited<ReturnType<typeof Purchases.getOfferings>>;
type RevenueCatPackage = PurchasesPackage;

type CustomerInfoUpdateListener = (info: CustomerInfo) => void;

export type SubscriptionProduct = {
    identifier: string;
    monthly?: RevenueCatPackage;
    annual?: RevenueCatPackage;
};

export type SubscriptionPurchase = {
    productId: string;
    planType: 'monthly' | 'annual';
};

let configuredAppUserId: string | null = null;
let subscriptionConfigureRequest: Promise<void> | null = null;
let customerInfoListenerId: string | null = null;
let customerInfoUpdateListeners: Map<string, CustomerInfoUpdateListener> = new Map();

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

function assertSubscriptionSupported() {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        throw new Error('앱에서만 구독할 수 있어요.');
    }

    if (!readRevenueCatApiKey()) {
        throw new Error('구독 설정이 아직 준비되지 않았어요. 관리자에게 문의해 주세요.');
    }
}

async function ensureSubscriptionConfigured(userId: string) {
    const appUserId = readString(userId);
    if (!appUserId) {
        throw new Error('로그인이 필요합니다.');
    }

    assertSubscriptionSupported();

    if (configuredAppUserId === appUserId) {
        return;
    }

    if (subscriptionConfigureRequest) {
        await subscriptionConfigureRequest;
    }

    if (configuredAppUserId === appUserId) {
        return;
    }

    if (!configuredAppUserId) {
        const apiKey = readRevenueCatApiKey();
        subscriptionConfigureRequest = Promise.resolve().then(() => {
            Purchases.configure({
                apiKey,
                appUserID: appUserId
            });
            configuredAppUserId = appUserId;
            setupCustomerInfoListener();
        });

        await subscriptionConfigureRequest;
        return;
    }

    await Purchases.logIn(appUserId);
    configuredAppUserId = appUserId;
}

function setupCustomerInfoListener() {
    if (customerInfoListenerId !== null) {
        return;
    }

    const listenerId = Purchases.addCustomerInfoUpdateListener((info) => {
        customerInfoUpdateListeners.forEach((listener) => {
            listener(info);
        });
    });

    if (typeof listenerId === 'string') {
        customerInfoListenerId = listenerId;
    }
}

function teardownCustomerInfoListener() {
    if (customerInfoListenerId === null) {
        return;
    }

    Purchases.removeCustomerInfoUpdateListener(customerInfoListenerId as any);
    customerInfoListenerId = null;
}

function normalizeOfferings(offerings: RevenueCatOffering | null): SubscriptionProduct[] {
    if (!offerings?.current) {
        return [];
    }

    const offeringPackages = offerings.current.availablePackages;
    if (!offeringPackages || offeringPackages.length === 0) {
        return [];
    }

    const productMap = new Map<string, SubscriptionProduct>();

    offeringPackages.forEach((pkg) => {
        const productId = readString(pkg.product?.identifier || '');
        if (!productId) {
            return;
        }

        let product = productMap.get(productId);
        if (!product) {
            product = { identifier: productId };
            productMap.set(productId, product);
        }

        const packageType = readString(pkg.packageType || '');
        if (packageType === 'MONTHLY' || packageType.includes('monthly')) {
            product.monthly = pkg;
        } else if (packageType === 'ANNUAL' || packageType.includes('annual')) {
            product.annual = pkg;
        }
    });

    return Array.from(productMap.values());
}

export function isSubscriptionConfigured() {
    return Boolean(readRevenueCatApiKey()) && (Platform.OS === 'ios' || Platform.OS === 'android');
}

export function isSubscriptionCancelledError(error: unknown) {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const record = error as Record<string, unknown>;
    return record.userCancelled === true || record.code === 'PURCHASE_CANCELLED';
}

export function registerCustomerInfoUpdateListener(
    listenerId: string,
    listener: CustomerInfoUpdateListener
) {
    customerInfoUpdateListeners.set(listenerId, listener);
}

export function unregisterCustomerInfoUpdateListener(listenerId: string) {
    customerInfoUpdateListeners.delete(listenerId);
    if (customerInfoUpdateListeners.size === 0) {
        teardownCustomerInfoListener();
    }
}

export async function initializeSubscriptionService(userId: string) {
    await ensureSubscriptionConfigured(userId);
}

export async function getSubscriptionOfferings(userId: string): Promise<SubscriptionProduct[]> {
    await ensureSubscriptionConfigured(userId);

    try {
        const offerings = await Purchases.getOfferings();
        return normalizeOfferings(offerings);
    } catch (error) {
        throw new Error('구독 상품을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
}

export async function purchaseSubscription(
    userId: string,
    purchase: SubscriptionPurchase
): Promise<MakePurchaseResult> {
    const productId = readString(purchase.productId);
    const planType = purchase.planType;

    if (!productId) {
        throw new Error('구독할 상품을 찾지 못했어요.');
    }

    await ensureSubscriptionConfigured(userId);

    try {
        const offerings = await Purchases.getOfferings();
        const packages = normalizeOfferings(offerings);
        const product = packages.find((p) => p.identifier === productId);

        if (!product) {
            throw new Error('스토어에 등록된 구독 상품을 찾지 못했어요.');
        }

        const pkg = planType === 'monthly' ? product.monthly : product.annual;
        if (!pkg) {
            throw new Error(`${planType === 'monthly' ? '월간' : '연간'} 구독 플랜을 찾지 못했어요.`);
        }

        const purchaseResult = await Purchases.purchasePackage(pkg);
        return purchaseResult;
    } catch (error) {
        if (isSubscriptionCancelledError(error)) {
            throw error;
        }
        throw new Error('구독 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.');
    }
}

export async function restoreSubscriptionPurchases(userId: string) {
    await ensureSubscriptionConfigured(userId);

    try {
        await Purchases.restorePurchases();
    } catch (error) {
        throw new Error('이전 구독 내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
}

export async function getSubscriptionStatus(userId: string): Promise<CustomerInfo> {
    await ensureSubscriptionConfigured(userId);

    try {
        const customerInfo = await Purchases.getCustomerInfo();
        return customerInfo;
    } catch (error) {
        throw new Error('구독 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
}

export function hasActiveSubscription(customerInfo: CustomerInfo): boolean {
    if (!customerInfo || !customerInfo.activeSubscriptions) {
        return false;
    }

    return customerInfo.activeSubscriptions.length > 0;
}

export function getActiveSubscriptionIdentifiers(
    customerInfo: CustomerInfo
): string[] {
    if (!customerInfo || !customerInfo.activeSubscriptions) {
        return [];
    }

    return customerInfo.activeSubscriptions;
}

export async function handleAppForeground(userId: string) {
    try {
        await initializeSubscriptionService(userId);
        await getSubscriptionStatus(userId);
    } catch (error) {
        console.warn('앱 포그라운드 복귀 시 구독 상태 업데이트 실패:', error);
    }
}
