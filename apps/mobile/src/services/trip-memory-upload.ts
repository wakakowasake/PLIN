import * as ImagePicker from 'expo-image-picker';
import {
    buildMemoryFileName,
    FREE_TRIP_MEMORY_PHOTO_LIMIT,
    getTripMemoryPhotoLimitMessage
} from '@shared/features/memories/memory-helpers.js';

import { BackendRequestError, fetchBackendJson } from '@/services/backend-client';
import { readLocalAssetUploadData } from '@/services/local-asset-upload';

export { FREE_TRIP_MEMORY_PHOTO_LIMIT, getTripMemoryPhotoLimitMessage };

const TRIP_MEMORY_PHOTO_LIMIT_ERROR = 'Trip Memory Photo Limit Exceeded';
const TRIP_MEMORY_PHOTO_LIMIT_MESSAGE_FRAGMENT = `추억 사진을 ${FREE_TRIP_MEMORY_PHOTO_LIMIT}장까지`;

export type PickedTripMemoryAsset = {
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
    base64?: string | null;
};

export type UploadedTripMemoryAsset = {
    photoUrl: string;
    previewUrl?: string | null;
    thumbnailUrl?: string | null;
};

type ImagePickerAsset = Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>> extends {
    assets: infer T;
}
    ? T extends Array<infer U>
        ? U
        : never
    : never;

type TripMemoryPickerSource = 'library' | 'camera';

function resolvePermissionMessage(source: TripMemoryPickerSource) {
    return source === 'camera'
        ? '추억 사진을 찍으려면 카메라 권한이 필요해요.'
        : '추억 사진을 고르려면 사진 접근 권한이 필요해요.';
}

function resolveFallbackMessage(source: TripMemoryPickerSource) {
    return source === 'camera'
        ? '추억 사진을 찍지 못했어요.'
        : '추억 사진을 고르지 못했어요.';
}

function mapTripMemoryPickerError(error: unknown, source: TripMemoryPickerSource = 'library') {
    const message = error instanceof Error ? error.message : String(error || '');
    const normalizedMessage = message.toLowerCase();

    if (
        normalizedMessage.includes('expoimagepicker')
        || normalizedMessage.includes('native module')
        || normalizedMessage.includes('require native module')
    ) {
        return '추억 사진 기능을 사용할 수 없어요. 앱을 업데이트한 뒤 다시 시도해 주세요.';
    }

    if (normalizedMessage.includes('permission')) {
        return resolvePermissionMessage(source);
    }

    return message || resolveFallbackMessage(source);
}

function getErrorCode(error: unknown) {
    return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : '';
}

function isTripMemoryPhotoLimitBackendError(error: unknown) {
    if (!(error instanceof BackendRequestError)) {
        return false;
    }

    const payload = error.payload;
    if (!payload || typeof payload !== 'object') {
        return false;
    }

    const record = payload as Record<string, unknown>;
    return error.status === 402
        && (
            String(record.error || '') === TRIP_MEMORY_PHOTO_LIMIT_ERROR
            || Number(record.limit) === FREE_TRIP_MEMORY_PHOTO_LIMIT
        );
}

export function isTripMemoryPhotoLimitMessage(value: unknown) {
    return String(value || '').includes(TRIP_MEMORY_PHOTO_LIMIT_MESSAGE_FRAGMENT);
}

function mapTripMemoryUploadError(error: unknown) {
    const code = getErrorCode(error);
    const message = error instanceof Error ? error.message : String(error || '');
    const normalizedMessage = `${code} ${message}`.toLowerCase();

    if (isTripMemoryPhotoLimitBackendError(error) || isTripMemoryPhotoLimitMessage(message)) {
        return getTripMemoryPhotoLimitMessage();
    }

    if (
        code === 'storage/unauthorized'
        || normalizedMessage.includes('storage/unauthorized')
        || normalizedMessage.includes('does not have permission')
        || normalizedMessage.includes('unauthorized')
    ) {
        return '이 일정은 열람만 가능해요. 편집 멤버에게 수정을 요청해 주세요.';
    }

    if (
        code === 'storage/quota-exceeded'
        || normalizedMessage.includes('quota')
        || normalizedMessage.includes('too large')
    ) {
        return '추억 사진 용량이 너무 커요. 더 작은 사진으로 다시 시도해 주세요.';
    }

    if (
        code === 'storage/retry-limit-exceeded'
        || code === 'storage/canceled'
        || normalizedMessage.includes('network')
        || normalizedMessage.includes('네트워크')
        || normalizedMessage.includes('연결')
    ) {
        return '네트워크 연결이 불안정해 추억 사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.';
    }

    return message || '추억 사진을 업로드하지 못했어요.';
}

function normalizePickedAsset(asset: ImagePickerAsset): PickedTripMemoryAsset {
    return {
        uri: asset.uri,
        fileName: 'fileName' in asset ? asset.fileName ?? null : null,
        mimeType: 'mimeType' in asset ? asset.mimeType ?? null : null,
        base64: 'base64' in asset ? asset.base64 ?? null : null
    };
}

async function uploadTripMemoryAssetViaBackend({
    tripId,
    fileName,
    contentType,
    base64,
    requestedMemoryCount
}: {
    tripId: string;
    fileName: string;
    contentType: string;
    base64: string;
    requestedMemoryCount: number;
}) {
    const response = await fetchBackendJson<{
        url?: string;
        previewUrl?: string | null;
        thumbnailUrl?: string | null;
    }>('/storage/upload-trip-image', {
        method: 'POST',
        body: {
            kind: 'memory',
            tripId,
            fileName,
            contentType,
            base64,
            requestedMemoryCount
        }
    });
    const url = String(response?.url || '').trim();
    if (!url) {
        throw new Error('추억 사진을 업로드하지 못했어요.');
    }
    const thumbnailUrl = String(response?.thumbnailUrl || response?.previewUrl || '').trim() || null;
    return {
        photoUrl: url,
        previewUrl: thumbnailUrl,
        thumbnailUrl
    };
}

export async function pickTripMemoryAssets(): Promise<PickedTripMemoryAsset[]> {
    try {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            throw new Error(resolvePermissionMessage('library'));
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            selectionLimit: 8,
            orderedSelection: true,
            quality: 0.72,
            base64: true
        });

        if (result.canceled) {
            return [];
        }

        return Array.isArray(result.assets)
            ? result.assets.map((asset) => normalizePickedAsset(asset))
            : [];
    } catch (error) {
        throw new Error(mapTripMemoryPickerError(error, 'library'));
    }
}

export async function takeTripMemoryPhotoAsset(): Promise<PickedTripMemoryAsset | null> {
    try {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            throw new Error(resolvePermissionMessage('camera'));
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.72,
            base64: true
        });

        if (result.canceled || !Array.isArray(result.assets) || result.assets.length === 0) {
            return null;
        }

        return normalizePickedAsset(result.assets[0] as ImagePickerAsset);
    } catch (error) {
        throw new Error(mapTripMemoryPickerError(error, 'camera'));
    }
}

export async function uploadTripMemoryAssets({
    tripId,
    dayIndex,
    itemIndex,
    assets
}: {
    tripId: string;
    dayIndex: number;
    itemIndex: number;
    assets: PickedTripMemoryAsset[];
}) {
    const safeAssets = Array.isArray(assets) ? assets.filter((asset) => Boolean(asset?.uri)) : [];
    if (!tripId || safeAssets.length === 0) {
        return [];
    }

    const timestamp = Date.now();
    const requestedMemoryCount = safeAssets.length;
    const uploadedEntries: UploadedTripMemoryAsset[] = [];

    try {
        for (let index = 0; index < safeAssets.length; index += 1) {
            const asset = safeAssets[index];
            const uploadPayload = await readLocalAssetUploadData({
                uri: asset.uri,
                base64: asset.base64,
                maxBytes: 10 * 1024 * 1024,
                readUriAsBase64: true,
                readErrorMessage: '선택한 사진 파일을 읽지 못했어요.',
                sizeErrorMessage: '추억 사진은 파일당 10MB 이하만 추가할 수 있어요.'
            });
            const fileName = buildMemoryFileName({
                dayIndex,
                itemIndex,
                timestamp,
                fileIndex: index
            });
            const metadata = {
                contentType: asset.mimeType || 'image/jpeg'
            };

            if (uploadPayload.kind !== 'base64') {
                throw new Error('선택한 사진 파일을 읽지 못했어요.');
            }

            uploadedEntries.push(await uploadTripMemoryAssetViaBackend({
                tripId,
                fileName,
                contentType: metadata.contentType,
                base64: uploadPayload.data,
                requestedMemoryCount
            }));
        }
    } catch (error) {
        throw new Error(mapTripMemoryUploadError(error));
    }

    return uploadedEntries;
}
