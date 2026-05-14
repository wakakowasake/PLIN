import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const requireFromFunctions = createRequire(path.join(__dirname, '../functions/package.json'));
const admin = requireFromFunctions('firebase-admin');
const sharp = requireFromFunctions('sharp');
const dotenv = requireFromFunctions('dotenv');

dotenv.config({ path: path.join(__dirname, '../functions/.env') });
dotenv.config({ path: path.join(__dirname, '../functions/.env.local'), override: true });

const DEFAULT_PROJECT_ID = 'plin-db93d';
const DEFAULT_BUCKET = 'plin-db93d.firebasestorage.app';
const IS_WRITE_MODE = process.argv.includes('--write') || process.env.PLIN_BACKFILL_WRITE === '1';
const FORCE_THUMBNAILS = process.argv.includes('--force') || process.env.PLIN_BACKFILL_FORCE_THUMBNAILS === '1';
const TARGET_TRIP_ID = readArgValue('--trip') || process.env.PLIN_BACKFILL_TRIP_ID || '';
const LIMIT = readPositiveInteger(readArgValue('--limit') || process.env.PLIN_BACKFILL_LIMIT, TARGET_TRIP_ID ? 1 : 25);
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_PROJECT_ID;
const STORAGE_BUCKET = process.env.PLIN_STORAGE_BUCKET || DEFAULT_BUCKET;

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return '';
  }

  return String(process.argv[index + 1] || '').trim();
}

function readPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonValue(entry));
  }

  if (isPlainObject(value)) {
    return Object.entries(value).reduce((nextValue, [key, entry]) => {
      nextValue[key] = cloneJsonValue(entry);
      return nextValue;
    }, {});
  }

  return value;
}

function parseStoragePathFromUrl(value) {
  const rawUrl = readString(value);
  if (!rawUrl) {
    return '';
  }

  if (rawUrl.startsWith('gs://')) {
    const withoutScheme = rawUrl.slice('gs://'.length);
    const slashIndex = withoutScheme.indexOf('/');
    if (slashIndex < 0) {
      return '';
    }

    return decodeURIComponent(withoutScheme.slice(slashIndex + 1));
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return '';
  }

  if (parsed.hostname === 'firebasestorage.googleapis.com') {
    const match = parsed.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  if (parsed.hostname === 'storage.googleapis.com' || parsed.hostname === 'storage.cloud.google.com') {
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return '';
    }

    return decodeURIComponent(pathParts.slice(1).join('/'));
  }

  return '';
}

function buildFirebaseStorageDownloadUrl(bucketName, storagePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
}

function readFirebaseDownloadToken(metadata) {
  const rawTokens = readString(metadata?.metadata?.firebaseStorageDownloadTokens);
  return rawTokens.split(',').map((entry) => entry.trim()).filter(Boolean)[0] || '';
}

async function ensureFirebaseDownloadToken(file, stats) {
  const [metadata] = await file.getMetadata();
  const existingToken = readFirebaseDownloadToken(metadata);
  if (existingToken) {
    return existingToken;
  }

  stats.downloadTokensToAdd += 1;
  const nextToken = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');

  if (IS_WRITE_MODE) {
    await file.setMetadata({
      metadata: {
        ...(metadata.metadata || {}),
        firebaseStorageDownloadTokens: nextToken
      }
    });
  }

  return nextToken;
}

function buildThumbnailPath(tripId, sourcePath) {
  const parsed = path.parse(sourcePath);
  const baseName = readString(parsed.name || `memory_${Date.now()}`)
    .replace(/[^a-zA-Z0-9_-]/g, '_');

  return `memories/${tripId}/thumbs/${baseName}_thumb.jpg`;
}

async function ensureThumbnailUrl({ bucket, tripId, sourcePath, sourceFile, uid, stats }) {
  const thumbnailPath = buildThumbnailPath(tripId, sourcePath);
  const thumbnailFile = bucket.file(thumbnailPath);
  const [exists] = await thumbnailFile.exists();

  if (!exists) {
    stats.thumbnailsToCreate += 1;

    if (IS_WRITE_MODE) {
      const [sourceBuffer] = await sourceFile.download();
      const thumbnailBuffer = await sharp(sourceBuffer)
        .rotate()
        .resize({
          width: 480,
          height: 480,
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({
          quality: 68,
          mozjpeg: true
        })
        .toBuffer();
      const token = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : crypto.randomBytes(16).toString('hex');

      await thumbnailFile.save(thumbnailBuffer, {
        resumable: false,
        metadata: {
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=31536000, immutable',
          metadata: {
            firebaseStorageDownloadTokens: token,
            uploadedBy: uid,
            tripId,
            role: 'memoryThumbnail',
            sourcePath
          }
        }
      });

      return buildFirebaseStorageDownloadUrl(bucket.name, thumbnailPath, token);
    }
  }

  const thumbnailToken = exists
    ? await ensureFirebaseDownloadToken(thumbnailFile, stats)
    : 'dry-run-token';

  return buildFirebaseStorageDownloadUrl(bucket.name, thumbnailPath, thumbnailToken);
}

async function backfillMemory({ bucket, tripId, memory, uid, stats }) {
  if (!isPlainObject(memory)) {
    return false;
  }

  stats.memoriesSeen += 1;

  const sourceUrl = readString(memory.photoUrl || memory.url || memory.image || memory.previewUrl || memory.thumbnailUrl);
  const sourcePath = parseStoragePathFromUrl(sourceUrl);
  if (!sourcePath) {
    stats.memoriesWithoutStoragePath += 1;
    return false;
  }

  const sourceFile = bucket.file(sourcePath);
  const [sourceExists] = await sourceFile.exists();
  if (!sourceExists) {
    stats.missingStorageFiles += 1;
    return false;
  }

  const sourceToken = await ensureFirebaseDownloadToken(sourceFile, stats);
  const fixedPhotoUrl = buildFirebaseStorageDownloadUrl(bucket.name, sourcePath, sourceToken);
  const hasThumbnail = readString(memory.thumbnailUrl || memory.previewUrl);
  const shouldCreateThumbnail = FORCE_THUMBNAILS || !hasThumbnail;
  const thumbnailUrl = shouldCreateThumbnail
    ? await ensureThumbnailUrl({ bucket, tripId, sourcePath, sourceFile, uid, stats })
    : hasThumbnail;
  let didChange = false;

  if (readString(memory.photoUrl) !== fixedPhotoUrl) {
    memory.photoUrl = fixedPhotoUrl;
    didChange = true;
  }

  if (!readString(memory.thumbnailUrl) && thumbnailUrl) {
    memory.thumbnailUrl = thumbnailUrl;
    didChange = true;
  }

  if (!readString(memory.previewUrl) && thumbnailUrl) {
    memory.previewUrl = thumbnailUrl;
    didChange = true;
  }

  if (didChange) {
    stats.memoriesUpdated += 1;
  }

  return didChange;
}

async function backfillTripDocument({ bucket, docSnapshot, stats }) {
  const tripId = docSnapshot.id;
  const data = docSnapshot.data() || {};
  const days = Array.isArray(data.days) ? cloneJsonValue(data.days) : [];
  const uid = readString(data.createdBy || data.userId || data.ownerUid);
  let didChangeTrip = false;

  for (const day of days) {
    if (!isPlainObject(day)) {
      continue;
    }

    for (const collectionKey of ['items', 'timeline']) {
      const items = Array.isArray(day[collectionKey]) ? day[collectionKey] : [];
      for (const item of items) {
        if (!isPlainObject(item) || !Array.isArray(item.memories)) {
          continue;
        }

        for (const memory of item.memories) {
          const didChangeMemory = await backfillMemory({
            bucket,
            tripId,
            memory,
            uid,
            stats
          });
          didChangeTrip = didChangeTrip || didChangeMemory;
        }
      }
    }
  }

  if (!didChangeTrip) {
    return;
  }

  stats.tripsToUpdate += 1;

  if (IS_WRITE_MODE) {
    await docSnapshot.ref.update({
      days,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    stats.tripsUpdated += 1;
  }
}

async function loadTripSnapshots(db) {
  if (TARGET_TRIP_ID) {
    const snapshot = await db.collection('plans').doc(TARGET_TRIP_ID).get();
    return snapshot.exists ? [snapshot] : [];
  }

  const snapshot = await db.collection('plans').limit(LIMIT).get();
  return snapshot.docs;
}

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: PROJECT_ID,
      storageBucket: STORAGE_BUCKET
    });
  }

  const db = admin.firestore();
  const bucket = admin.storage().bucket(STORAGE_BUCKET);
  const stats = {
    mode: IS_WRITE_MODE ? 'write' : 'dry-run',
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET,
    tripsScanned: 0,
    tripsToUpdate: 0,
    tripsUpdated: 0,
    memoriesSeen: 0,
    memoriesUpdated: 0,
    memoriesWithoutStoragePath: 0,
    missingStorageFiles: 0,
    downloadTokensToAdd: 0,
    thumbnailsToCreate: 0
  };
  const tripSnapshots = await loadTripSnapshots(db);

  for (const snapshot of tripSnapshots) {
    stats.tripsScanned += 1;
    await backfillTripDocument({
      bucket,
      docSnapshot: snapshot,
      stats
    });
  }

  console.log(JSON.stringify(stats, null, 2));
  if (!IS_WRITE_MODE) {
    console.log('Dry-run only. Re-run with --write or PLIN_BACKFILL_WRITE=1 to update Firestore and Storage.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
