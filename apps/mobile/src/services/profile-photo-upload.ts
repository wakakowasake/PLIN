import { getDownloadURL, ref, uploadBytes, uploadString } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';

import { getMobileStorage } from '@/adapters/firebase/mobile-firebase';
import { readLocalAssetUploadData } from '@/services/local-asset-upload';

export type PickedProfilePhotoAsset = {
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
    base64?: string | null;
};

type ImagePickerAsset = Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>> extends {
    assets: infer T;
}
    ? T extends Array<infer U>
        ? U
        : never
    : never;

function mapProfilePhotoPickerError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '');
    const normalizedMessage = message.toLowerCase();

    if (
        normalizedMessage.includes('expoimagepicker')
        || normalizedMessage.includes('native module')
        || normalizedMessage.includes('require native module')
    ) {
        return '프로필 사진 기능을 사용할 수 없어요. 앱을 업데이트한 뒤 다시 시도해 주세요.';
    }

    if (normalizedMessage.includes('permission')) {
        return '프로필 사진을 고르려면 사진 접근 권한이 필요해요.';
    }

    return message || '프로필 사진을 고르지 못했어요.';
}

function normalizePickedAsset(asset: ImagePickerAsset): PickedProfilePhotoAsset {
    return {
        uri: asset.uri,
        fileName: 'fileName' in asset ? asset.fileName ?? null : null,
        mimeType: 'mimeType' in asset ? asset.mimeType ?? null : null,
        base64: 'base64' in asset ? asset.base64 ?? null : null
    };
}

export async function pickProfilePhotoAsset(): Promise<PickedProfilePhotoAsset | null> {
    try {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            throw new Error('프로필 사진을 고르려면 사진 접근 권한이 필요해요.');
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.82,
            selectionLimit: 1,
            base64: true
        });

        if (result.canceled || !Array.isArray(result.assets) || result.assets.length === 0) {
            return null;
        }

        return normalizePickedAsset(result.assets[0]);
    } catch (error) {
        throw new Error(mapProfilePhotoPickerError(error));
    }
}

export async function uploadProfilePhotoAsset({
    uid,
    asset
}: {
    uid: string;
    asset: PickedProfilePhotoAsset;
}) {
    if (!uid || !asset?.uri) {
        throw new Error('프로필 사진을 저장할 계정 정보를 찾지 못했어요.');
    }

    const storage = getMobileStorage();
    const uploadPayload = await readLocalAssetUploadData({
        uri: asset.uri,
        base64: asset.base64,
        maxBytes: 10 * 1024 * 1024,
        readUriAsBase64: true,
        readErrorMessage: '선택한 사진 파일을 읽지 못했어요.',
        sizeErrorMessage: '프로필 사진은 10MB 이하만 올릴 수 있어요.'
    });
    const extension = asset.mimeType === 'image/png' ? 'png' : 'jpg';
    const storageRef = ref(storage, `profile-photos/${uid}/avatar_${Date.now()}.${extension}`);

    const metadata = {
        contentType: asset.mimeType || 'image/jpeg'
    };

    if (uploadPayload.kind === 'base64') {
        await uploadString(storageRef, uploadPayload.data, 'base64', metadata);
    } else {
        await uploadBytes(storageRef, uploadPayload.data, metadata);
    }

    return getDownloadURL(storageRef);
}
