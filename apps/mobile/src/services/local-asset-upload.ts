import * as FileSystem from 'expo-file-system/legacy';

type ReadLocalAssetUploadDataInput = {
    uri: string;
    base64?: string | null;
    maxBytes?: number;
    readUriAsBase64?: boolean;
    readErrorMessage?: string;
    sizeErrorMessage?: string;
};

export type LocalAssetUploadPayload =
    | {
        kind: 'base64';
        data: string;
        size: number;
    }
    | {
        kind: 'blob';
        data: Blob;
        size: number;
    };

function normalizeBase64Value(base64Value: string) {
    return base64Value
        .replace(/^data:[^;]+;base64,/i, '')
        .replace(/\s/g, '');
}

function getBase64DecodedByteLength(base64Value: string) {
    const cleanValue = normalizeBase64Value(base64Value);
    if (!cleanValue) {
        return 0;
    }

    const padding = cleanValue.endsWith('==') ? 2 : cleanValue.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((cleanValue.length * 3) / 4) - padding);
}

async function readLocalAssetBlobFromUri(uri: string, readErrorMessage: string) {
    return new Promise<Blob>((resolve, reject) => {
        const request = new XMLHttpRequest();

        request.onload = () => {
            const isSuccess = request.status === 0 || (request.status >= 200 && request.status < 300);
            if (!isSuccess || !request.response) {
                reject(new Error(readErrorMessage));
                return;
            }

            resolve(request.response as Blob);
        };
        request.onerror = () => {
            reject(new Error(readErrorMessage));
        };
        request.responseType = 'blob';
        request.open('GET', uri);
        request.send();
    });
}

async function readLocalAssetBase64FromUri(uri: string, readErrorMessage: string) {
    try {
        const value = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64
        });
        return normalizeBase64Value(value);
    } catch {
        throw new Error(readErrorMessage);
    }
}

export async function readLocalAssetUploadData({
    uri,
    base64,
    maxBytes,
    readUriAsBase64 = false,
    readErrorMessage = '선택한 파일을 읽지 못했어요.',
    sizeErrorMessage
}: ReadLocalAssetUploadDataInput): Promise<LocalAssetUploadPayload> {
    if (!uri) {
        throw new Error(readErrorMessage);
    }

    const safeBase64 = typeof base64 === 'string' ? base64.trim() : '';
    if (safeBase64) {
        const cleanBase64 = normalizeBase64Value(safeBase64);
        const byteLength = getBase64DecodedByteLength(cleanBase64);

        if (typeof maxBytes === 'number' && byteLength > maxBytes) {
            throw new Error(sizeErrorMessage || readErrorMessage);
        }

        return {
            kind: 'base64',
            data: cleanBase64,
            size: byteLength
        };
    }

    if (readUriAsBase64) {
        const uriBase64 = await readLocalAssetBase64FromUri(uri, readErrorMessage);
        const byteLength = getBase64DecodedByteLength(uriBase64);

        if (!uriBase64 || byteLength === 0) {
            throw new Error(readErrorMessage);
        }

        if (typeof maxBytes === 'number' && byteLength > maxBytes) {
            throw new Error(sizeErrorMessage || readErrorMessage);
        }

        return {
            kind: 'base64',
            data: uriBase64,
            size: byteLength
        };
    }

    const blob = await readLocalAssetBlobFromUri(uri, readErrorMessage);

    if (typeof maxBytes === 'number' && blob.size > maxBytes) {
        throw new Error(sizeErrorMessage || readErrorMessage);
    }

    return {
        kind: 'blob',
        data: blob,
        size: blob.size
    };
}
