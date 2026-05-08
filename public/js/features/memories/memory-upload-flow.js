import { buildMemoryFileName } from './memory-helpers.js';

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = () => reject(new Error('파일 읽기 실패'));
        reader.readAsDataURL(file);
    });
}

function base64ToBlob(base64Data) {
    const byteString = atob(base64Data.split(',')[1]);
    const mimeString = base64Data.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);

    for (let index = 0; index < byteString.length; index += 1) {
        ia[index] = byteString.charCodeAt(index);
    }

    return new Blob([ab], { type: mimeString });
}

async function compressMemoryImage(file, compressImage, isMobile) {
    const compressionSteps = [
        { maxWidth: isMobile ? 800 : 1024, quality: isMobile ? 0.65 : 0.7 },
        { maxWidth: 600, quality: 0.6 },
        { maxWidth: 400, quality: 0.5 }
    ];

    for (const step of compressionSteps) {
        try {
            return await compressImage(file, step.maxWidth, step.quality);
        } catch (error) {
            console.warn('Memory compression attempt failed:', error);
        }
    }

    if (file.size > 7 * 1024 * 1024) {
        throw new Error(`이미지 압축에 실패했습니다. 원본 용량(${Math.round(file.size / 1024 / 1024)}MB)이 너무 커서 업로드할 수 없습니다.`);
    }

    return readFileAsDataUrl(file);
}

export async function uploadMemoryFiles({
    files,
    tripId,
    dayIndex,
    itemIndex,
    compressImage,
    storage,
    ref,
    uploadBytes,
    getDownloadURL,
    userAgent = ''
}) {
    if (!files || files.length === 0) {
        return [];
    }

    const uploadedUrls = [];
    const isMobile = /iPhone|iPad|iPod|Android/i.test(userAgent);

    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];
        const timestamp = Date.now();
        const fileName = buildMemoryFileName({
            dayIndex,
            itemIndex,
            timestamp,
            fileIndex
        });

        const base64Data = await compressMemoryImage(file, compressImage, isMobile);
        if (base64Data.length > 9.5 * 1024 * 1024) {
            throw new Error('이미지 용량이 너무 큽니다 (압축 실패). 더 작은 사진을 선택해주세요.');
        }

        const blob = base64ToBlob(base64Data);
        const storageRef = ref(storage, `memories/${tripId}/${fileName}`);
        const snapshot = await uploadBytes(storageRef, blob, {
            contentType: blob.type
        });
        const url = await getDownloadURL(snapshot.ref);
        uploadedUrls.push(url);
    }

    return uploadedUrls;
}
