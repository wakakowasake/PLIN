import { fetchBackendJson } from '@/services/backend-client';
import { readLocalAssetUploadData } from '@/services/local-asset-upload';
import type { RawAttachmentEntry } from '@/types/trip';

export const MAX_TRIP_ATTACHMENT_COUNT = 7;
export const MAX_TRIP_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TRIP_ATTACHMENT_SIZE_LABEL = '10MB';

export type PickedTripAttachmentAsset = {
    uri: string;
    name: string;
    mimeType: string;
    size?: number | null;
};

type DocumentPickerModule = typeof import('expo-document-picker');
type DocumentPickerAsset = Awaited<ReturnType<DocumentPickerModule['getDocumentAsync']>> extends {
    assets: infer T;
}
    ? T extends Array<infer U>
        ? U
        : never
    : never;

function mapTripAttachmentPickerError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '');
    const normalizedMessage = message.toLowerCase();

    if (
        normalizedMessage.includes('documentpicker')
        || normalizedMessage.includes('native module')
        || normalizedMessage.includes('require native module')
    ) {
        return '첨부파일 기능을 쓰려면 앱을 한 번 다시 빌드해 주세요.';
    }

    if (normalizedMessage.includes('permission')) {
        return '첨부파일을 고르려면 파일 접근 권한이 필요해요.';
    }

    return message || '첨부파일을 고르지 못했어요.';
}

async function loadDocumentPickerModule(): Promise<DocumentPickerModule> {
    try {
        return await import('expo-document-picker');
    } catch (error) {
        throw new Error(mapTripAttachmentPickerError(error));
    }
}

function inferMimeTypeFromName(name: string, fallback?: string | null) {
    const normalizedFallback = String(fallback || '').trim().toLowerCase();
    if (normalizedFallback) {
        return normalizedFallback;
    }

    const normalizedName = String(name || '').trim().toLowerCase();
    if (/\.(png)$/.test(normalizedName)) {
        return 'image/png';
    }
    if (/\.(jpe?g)$/.test(normalizedName)) {
        return 'image/jpeg';
    }
    if (/\.(gif)$/.test(normalizedName)) {
        return 'image/gif';
    }
    if (/\.(webp)$/.test(normalizedName)) {
        return 'image/webp';
    }
    if (/\.(heic|heif)$/.test(normalizedName)) {
        return 'image/heic';
    }
    if (/\.pdf$/.test(normalizedName)) {
        return 'application/pdf';
    }

    return 'application/octet-stream';
}

function isAllowedAttachmentMimeType(mimeType: string) {
    return mimeType.startsWith('image/') || mimeType === 'application/pdf';
}

function normalizePickedAsset(asset: DocumentPickerAsset): PickedTripAttachmentAsset {
    const name = String(asset.name || '첨부파일').trim() || '첨부파일';
    const mimeType = inferMimeTypeFromName(name, 'mimeType' in asset ? asset.mimeType ?? null : null);

    return {
        uri: asset.uri,
        name,
        mimeType,
        size: 'size' in asset ? asset.size ?? null : null
    };
}

function assertAttachmentAsset(asset: PickedTripAttachmentAsset) {
    if (!asset.uri) {
        throw new Error('선택한 첨부파일을 읽지 못했어요.');
    }

    if (!isAllowedAttachmentMimeType(asset.mimeType)) {
        throw new Error('첨부파일은 이미지 또는 PDF만 추가할 수 있어요.');
    }

    if (typeof asset.size === 'number' && asset.size > MAX_TRIP_ATTACHMENT_BYTES) {
        throw new Error(`첨부파일은 파일당 ${MAX_TRIP_ATTACHMENT_SIZE_LABEL} 이하만 추가할 수 있어요.`);
    }
}

function sanitizeFileName(value: string) {
    const normalized = String(value || 'attachment')
        .normalize('NFC')
        .replace(/[\\/:*?"<>|#%{}^~[\]`]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 96);

    return normalized || 'attachment';
}

function getPreviewUrl(asset: PickedTripAttachmentAsset, url: string) {
    return asset.mimeType.startsWith('image/') ? url : null;
}

function shouldSkipUnreadableAttachment(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '');
    return message.includes('첨부파일을 읽지 못했어요.');
}

async function uploadTripAttachmentAssetViaBackend({
    tripId,
    fileName,
    contentType,
    base64
}: {
    tripId: string;
    fileName: string;
    contentType: string;
    base64: string;
}) {
    const response = await fetchBackendJson<{
        url?: string;
        size?: number;
        contentType?: string;
    }>('/storage/upload-trip-attachment', {
        method: 'POST',
        body: {
            tripId,
            fileName,
            contentType,
            base64
        }
    });
    const url = String(response?.url || '').trim();
    if (!url) {
        throw new Error('첨부파일을 업로드하지 못했어요.');
    }

    return {
        url,
        size: typeof response?.size === 'number' && Number.isFinite(response.size)
            ? response.size
            : null,
        contentType: String(response?.contentType || contentType).trim() || contentType
    };
}

export async function pickTripAttachmentAssets(remainingCount: number): Promise<PickedTripAttachmentAsset[]> {
    const safeRemainingCount = Math.max(0, Math.floor(Number(remainingCount) || 0));
    if (safeRemainingCount < 1) {
        throw new Error(`첨부파일은 여행 계획당 최대 ${MAX_TRIP_ATTACHMENT_COUNT}개까지 추가할 수 있어요.`);
    }

    try {
        const DocumentPicker = await loadDocumentPickerModule();
        const result = await DocumentPicker.getDocumentAsync({
            type: ['image/*', 'application/pdf'],
            multiple: safeRemainingCount > 1,
            copyToCacheDirectory: true
        });

        if (result.canceled) {
            return [];
        }

        const assets = Array.isArray(result.assets)
            ? result.assets.map((asset) => normalizePickedAsset(asset))
            : [];

        if (assets.length > safeRemainingCount) {
            throw new Error(`첨부파일은 여행 계획당 최대 ${MAX_TRIP_ATTACHMENT_COUNT}개까지 추가할 수 있어요.`);
        }

        assets.forEach(assertAttachmentAsset);
        return assets;
    } catch (error) {
        throw new Error(mapTripAttachmentPickerError(error));
    }
}

export async function uploadTripAttachmentAssets({
    tripId,
    dayIndex,
    itemIndex,
    assets
}: {
    tripId: string;
    dayIndex: number;
    itemIndex: number;
    assets: PickedTripAttachmentAsset[];
}): Promise<RawAttachmentEntry[]> {
    const safeAssets = Array.isArray(assets) ? assets.filter((asset) => Boolean(asset?.uri)) : [];
    if (!tripId || safeAssets.length === 0) {
        return [];
    }

    const timestamp = Date.now();
    const uploadedAttachments: RawAttachmentEntry[] = [];

    for (let index = 0; index < safeAssets.length; index += 1) {
        const asset = safeAssets[index];
        let uploadPayload: Awaited<ReturnType<typeof readLocalAssetUploadData>>;

        try {
            assertAttachmentAsset(asset);
            uploadPayload = await readLocalAssetUploadData({
                uri: asset.uri,
                maxBytes: MAX_TRIP_ATTACHMENT_BYTES,
                readUriAsBase64: true,
                readErrorMessage: '선택한 첨부파일을 읽지 못했어요.',
                sizeErrorMessage: `첨부파일은 파일당 ${MAX_TRIP_ATTACHMENT_SIZE_LABEL} 이하만 추가할 수 있어요.`
            });

            if (uploadPayload.kind !== 'base64') {
                throw new Error('선택한 첨부파일을 읽지 못했어요.');
            }
        } catch (error) {
            if (shouldSkipUnreadableAttachment(error)) {
                continue;
            }

            throw error;
        }

        const fileName = `${timestamp}_${dayIndex}_${itemIndex}_${index}_${sanitizeFileName(asset.name)}`;
        const uploadedAttachment = await uploadTripAttachmentAssetViaBackend({
            tripId,
            fileName,
            contentType: asset.mimeType,
            base64: uploadPayload.data
        });

        uploadedAttachments.push({
            name: asset.name,
            type: uploadedAttachment.contentType,
            url: uploadedAttachment.url,
            previewUrl: getPreviewUrl(asset, uploadedAttachment.url),
            size: uploadedAttachment.size ?? uploadPayload.size
        });
    }

    return uploadedAttachments;
}
