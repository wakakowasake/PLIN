const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require('firebase-functions/params');
const express = require("express");
// const fetch = require("node-fetch"); // [수정] Node.js 18 이상은 내장 fetch를 사용하므로 이 줄은 삭제하거나 주석 처리
const cors = require('cors')({ origin: true });
require("dotenv").config();

// Secret 정의
const ekispertApiKey = defineSecret('EKISPERT_API_KEY');

const app = express();
app.use(cors);
app.use(express.json({ limit: '50mb' })); // Express 레벨 제한 해제
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// [Polyfill] Node.js 버전이 낮아 fetch가 없는 경우를 대비
if (!global.fetch) {
  try {
    global.fetch = require("node-fetch");
  } catch (err) {
    console.warn("Warning: Native fetch is missing and node-fetch is not installed. Unsplash proxy may fail.");
  }
}

// API 키 제공 엔드포인트 (보안 강화)
app.get("/config", async (req, res) => {
  try {
    // 환경 변수 검증
    const requiredKeys = {
      GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
      PLIN_FIREBASE_API_KEY: process.env.PLIN_FIREBASE_API_KEY
    };

    const missingKeys = Object.keys(requiredKeys).filter(key => !requiredKeys[key]);

    if (missingKeys.length > 0) {
      console.error('Missing environment variables:', missingKeys.join(', '));
      return res.status(500).json({
        error: 'Server Configuration Error',
        message: 'Required API keys are not configured on the server',
        details: process.env.NODE_ENV === 'development' ? { missingKeys } : undefined
      });
    }

    res.json({
      googleMapsApiKey: requiredKeys.GOOGLE_MAPS_API_KEY,
      firebaseApiKey: requiredKeys.PLIN_FIREBASE_API_KEY
    });
  } catch (error) {
    console.error("Config Error:", error);
    res.status(500).json({
      error: "Configuration Error",
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Unsplash도 똑같이 단순하게
app.get("/unsplash-proxy", async (req, res) => {
  const query = req.query.query;
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;

  console.log(`[Unsplash Proxy] Requesting: ${query}`); // [추가] 서버 로그 확인용

  // [추가] API 키가 없는 경우 명확한 에러 반환
  if (!accessKey) {
    console.error("Unsplash API Key is missing in .env");
    return res.status(500).json({ error: "Server configuration error: Unsplash API Key missing" });
  }

  try {
    // [수정] orientation=landscape 제거 (검색 결과 확률 높임), per_page=3으로 늘림
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&client_id=${accessKey}&per_page=3`;
    const response = await fetch(url);
    const data = await response.json();

    // [추가] Unsplash에서 에러를 보낸 경우 (예: 키 만료, 요청 한도 초과)
    if (data.errors) {
      console.error("Unsplash API Error:", data.errors);
      return res.status(400).json({ error: data.errors });
    }

    res.json(data);
  } catch (error) {
    console.error("Unsplash Proxy Error:", error);
    res.status(500).json({ error: "Image Error" });
  }
});

// 추억 사진 업로드 엔드포인트
app.post("/upload-memory", async (req, res) => {
  try {
    const { base64Data, fileName, tripId } = req.body;

    if (!base64Data || !fileName || !tripId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Firebase Admin SDK 초기화 (자동으로 서버에서 제공됨)
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp();
    }

    // 기본 bucket 사용
    const bucket = admin.storage().bucket();
    const filePath = `memories/${tripId}/${fileName}`;

    // Base64를 Buffer로 변환
    const buffer = Buffer.from(base64Data.split(',')[1], 'base64');

    // Storage에 업로드
    const file = bucket.file(filePath);
    await file.save(buffer, {
      metadata: {
        contentType: 'image/jpeg',
      },
    });

    // 파일을 public으로 설정
    await file.makePublic();

    // Public URL 생성
    const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    res.json({ success: true, url });
  } catch (error) {
    console.error("Memory Upload Error:", error);
    res.status(500).json({ error: "Upload failed: " + error.message });
  }
});

// 첨부파일 업로드 엔드포인트
app.post("/upload-attachment", async (req, res) => {
  try {
    const { base64Data, fileName, tripId, fileType } = req.body;

    if (!base64Data || !fileName || !tripId || !fileType) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Firebase Admin SDK 초기화
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp();
    }

    // 기본 bucket 사용
    const bucket = admin.storage().bucket();
    const filePath = `attachments/${tripId}/${fileName}`;

    // Base64를 Buffer로 변환
    const buffer = Buffer.from(base64Data.split(',')[1], 'base64');

    // Storage에 업로드
    const file = bucket.file(filePath);
    await file.save(buffer, {
      metadata: {
        contentType: fileType,
      },
    });

    // 파일을 public으로 설정
    await file.makePublic();

    // Public URL 생성
    const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    res.json({ success: true, url });
  } catch (error) {
    console.error("Attachment Upload Error:", error);
    res.status(500).json({ error: "Upload failed: " + error.message });
  }
});

// Ekispert API 프록시 (일본 철도 경로 검색) - 2단계 방식
app.get("/ekispert-proxy", async (req, res) => {
  const { fromLat, fromLng, toLat, toLng } = req.query;
  const apiKey = ekispertApiKey.value() || process.env.EKISPERT_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "EKISPERT_API_KEY is not configured" });
  }

  console.log(`[Ekispert Proxy] From: (${fromLat},${fromLng}), To: (${toLat},${toLng})`);

  if (!fromLat || !fromLng || !toLat || !toLng) {
    return res.status(400).json({ error: "Missing required parameters: fromLat, fromLng, toLat, toLng" });
  }

  try {
    // Step 1: 출발지 좌표로 가장 가까운 역 찾기
    // geoPoint 형식: "위도,경도" (측지계는 gcs 파라미터로 지정)
    const fromGeoPoint = `${fromLat},${fromLng}`;
    const fromStationUrl = `http://api.ekispert.jp/v1/json/geo/station?key=${apiKey}&geoPoint=${encodeURIComponent(fromGeoPoint)}&gcs=wgs84`;

    console.log(`[Ekispert] Finding station near from: ${fromStationUrl}`);
    const fromStationRes = await fetch(fromStationUrl);
    const fromStationData = await fromStationRes.json();

    if (!fromStationRes.ok || fromStationData.ResultSet?.Error || !fromStationData.ResultSet?.Point) {
      console.error(`[Ekispert] From station not found:`, fromStationData);
      return res.status(400).json({ error: 'From station not found', details: fromStationData });
    }

    // Step 2: 도착지 좌표로 가장 가까운 역 찾기
    const toGeoPoint = `${toLat},${toLng}`;
    const toStationUrl = `http://api.ekispert.jp/v1/json/geo/station?key=${apiKey}&geoPoint=${encodeURIComponent(toGeoPoint)}&gcs=wgs84`;

    console.log(`[Ekispert] Finding station near to: ${toStationUrl}`);
    const toStationRes = await fetch(toStationUrl);
    const toStationData = await toStationRes.json();

    if (!toStationRes.ok || toStationData.ResultSet?.Error || !toStationData.ResultSet?.Point) {
      console.error(`[Ekispert] To station not found:`, toStationData);
      return res.status(400).json({ error: 'To station not found', details: toStationData });
    }

    // Step 3: 역 이름 추출
    const fromStation = fromStationData.ResultSet.Point.Station;
    const toStation = toStationData.ResultSet.Point.Station;
    const fromStationName = fromStation.Name;
    const toStationName = toStation.Name;

    console.log(`[Ekispert] Stations found: ${fromStationName} → ${toStationName}`);

    // Step 4: 역 이름으로 경로 검색
    const viaList = `${fromStationName}:${toStationName}`;
    const routeUrl = `http://api.ekispert.jp/v1/json/search/course/extreme?key=${apiKey}&viaList=${encodeURIComponent(viaList)}&searchType=plain&sort=time`;

    console.log(`[Ekispert] Route search: ${routeUrl}`);
    const routeRes = await fetch(routeUrl);
    const routeData = await routeRes.json();

    console.log(`[Ekispert] Route result:`, JSON.stringify(routeData, null, 2));

    if (!routeRes.ok || routeData.ResultSet?.Error) {
      console.error(`[Ekispert] Route search failed:`, routeData);
      return res.status(routeRes.ok ? 400 : routeRes.status).json({ error: 'Route search failed', details: routeData });
    }

    res.json(routeData);
  } catch (error) {
    console.error("Ekispert Proxy Error:", error);
    res.status(500).json({ error: "Ekispert proxy failed: " + error.message });
  }
});

// 여기서 함수 이름이 'api'이므로, 실제 주소는 .../api/directions 가 됩니다.
exports.api = onRequest({
  secrets: [ekispertApiKey],
  region: "us-central1",
  memory: "256MiB",
  maxInstances: 10
}, app);