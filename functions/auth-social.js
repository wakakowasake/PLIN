const crypto = require("crypto");

const AUTH_PROVIDER_LINKS_COLLECTION = "auth_provider_links";
const AUTH_PROVIDER_TOKENS_COLLECTION = "auth_provider_tokens";
const AUTH_AUDIT_LOGS_COLLECTION = "auth_audit_logs";
const AUTH_SOCIAL_STARTS_COLLECTION = "auth_social_starts";
const AUTH_SOCIAL_TICKETS_COLLECTION = "auth_social_tickets";
const APP_SOCIAL_REDIRECT_URI = "plinmobile://auth/social-complete";
const APPLE_MOBILE_COMPLETE_PATH = "/auth/apple/mobile-complete";
const APPLE_SERVICE_ID_FALLBACK = "ink.plin.mobile.signin";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const RESUME_TICKET_TTL_MS = 10 * 60 * 1000;
const SUPPORTED_AUTH_PROVIDERS = ["google", "apple", "kakao", "naver"];
const CUSTOM_SOCIAL_PROVIDERS = new Set(["kakao", "naver"]);
const GOOGLE_PROVIDER_ID = "google.com";
const APPLE_PROVIDER_ID = "apple.com";
const PENDING_DELETION_MESSAGE =
  "계정 삭제가 요청되어 다시 로그인할 수 없어요. 데이터 삭제 처리 중입니다.";
const SAFE_APP_REDIRECT_PROTOCOLS = new Set(["http:", "https:"]);
const SAFE_APP_REDIRECT_HOSTS = new Set([
  "plin.ink",
  "www.plin.ink",
  "plin-db93d.web.app",
  "plin-db93d.firebaseapp.com",
  "localhost",
  "127.0.0.1"
]);
const DEFAULT_PUBLIC_API_BASE_URL = "https://plin.ink/api";
const DEFAULT_NAVER_WEB_CALLBACK_BASE_URL = "https://plin.ink/api";
const FORCE_HTTPS_IMAGE_HOSTS = [/(\.|^)kakaocdn\.net$/i];

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readEnv(readString, ...names) {
  for (const name of names) {
    const value = readString(process.env[name]);
    if (value) {
      return value;
    }
  }

  return "";
}

function normalizeKnownPhotoUrl(readString, value) {
  const raw = readString(value);
  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol === "http:"
      && FORCE_HTTPS_IMAGE_HOSTS.some((pattern) => pattern.test(readString(parsed.hostname)))
    ) {
      parsed.protocol = "https:";
      return parsed.toString();
    }

    return parsed.toString();
  } catch (error) {
    return raw;
  }
}

function readScalarString(readString, value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return readString(value);
}

function readAuthProvider(readString, value) {
  const provider = readString(value).toLowerCase();
  return SUPPORTED_AUTH_PROVIDERS.includes(provider) ? provider : null;
}

function readIntent(readString, value) {
  return readString(value) === "link" ? "link" : "signin";
}

function readAppRedirectUrl(readString, value) {
  const raw = readString(value);
  if (!raw) {
    return APP_SOCIAL_REDIRECT_URI;
  }

  if (raw === APP_SOCIAL_REDIRECT_URI) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    const protocol = readString(parsed.protocol).toLowerCase();
    const hostname = readString(parsed.hostname).toLowerCase();
    const pathname = readString(parsed.pathname).replace(/\/+$/, "");

    if (!SAFE_APP_REDIRECT_PROTOCOLS.has(protocol)) {
      return null;
    }

    if (!SAFE_APP_REDIRECT_HOSTS.has(hostname)) {
      return null;
    }

    const isSupportedCompletePath =
      pathname.endsWith("/auth/social-complete")
      || pathname.endsWith("/auth/social-complete.html")
      || pathname.endsWith("/auth-social-complete.html");

    if (!isSupportedCompletePath) {
      return null;
    }

    return parsed.toString();
  } catch (error) {
    return null;
  }
}

function appendQueryParamsToUrl(targetUrl, params) {
  try {
    const parsed = new URL(String(targetUrl || ""));
    for (const [key, value] of Object.entries(params || {})) {
      if (value === undefined || value === null || value === "") {
        continue;
      }

      parsed.searchParams.set(key, String(value));
    }
    return parsed.toString();
  } catch (error) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
      if (value === undefined || value === null || value === "") {
        continue;
      }

      search.set(key, String(value));
    }

    const query = search.toString();
    if (!query) {
      return targetUrl;
    }

    return `${targetUrl}${String(targetUrl).includes("?") ? "&" : "?"}${query}`;
  }
}

function normalizeProviderSubject(provider, providerUserId) {
  return `${provider}:${String(providerUserId || "").trim()}`;
}

function toFirebaseProviderId(provider) {
  if (provider === "google") {
    return GOOGLE_PROVIDER_ID;
  }

  if (provider === "apple") {
    return APPLE_PROVIDER_ID;
  }

  return "";
}

function fromFirebaseProviderId(providerId) {
  if (providerId === GOOGLE_PROVIDER_ID) {
    return "google";
  }

  if (providerId === APPLE_PROVIDER_ID) {
    return "apple";
  }

  return null;
}

function getProviderLabel(provider) {
  switch (provider) {
    case "apple":
      return "Apple";
    case "kakao":
      return "Kakao";
    case "naver":
      return "Naver";
    default:
      return "Google";
  }
}

function maskEmail(readString, email) {
  const normalized = readString(email);
  if (!normalized || !normalized.includes("@")) {
    return null;
  }

  const [localPart, domain] = normalized.split("@");
  if (!localPart || !domain) {
    return null;
  }

  if (localPart.length <= 2) {
    return `${localPart[0] || "*"}*@${domain}`;
  }

  return `${localPart.slice(0, 2)}***@${domain}`;
}

function readCurrentSignInMethod(readString, decodedToken) {
  const explicitProvider = readAuthProvider(readString, decodedToken?.currentSignInMethod);
  if (explicitProvider) {
    return explicitProvider;
  }

  const firebaseProvider = readString(decodedToken?.firebase?.sign_in_provider);
  if (firebaseProvider === GOOGLE_PROVIDER_ID) {
    return "google";
  }

  if (firebaseProvider === APPLE_PROVIDER_ID) {
    return "apple";
  }

  return null;
}

function buildExistingLoginConflictResponse(readString, email) {
  return {
    outcome: "requires_existing_login",
    reason: "existing_account_requires_link",
    nextAction: "login_then_link",
    emailMasked: maskEmail(readString, email),
    message: "기존 계정이 있어요. 기존 방식으로 로그인한 뒤 이 소셜 계정을 연결하세요."
  };
}

function buildProviderConflictResponse(provider) {
  return {
    outcome: "provider_conflict",
    reason: "provider_already_linked_elsewhere",
    nextAction: "use_other_account",
    message: `이 ${getProviderLabel(provider)} 계정은 이미 다른 PLIN 계정에 연결되어 있어요.`
  };
}

async function writeAuthAuditLog(admin, payload) {
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();

  await admin
    .firestore()
    .collection(AUTH_AUDIT_LOGS_COLLECTION)
    .doc(eventId)
    .set({
      createdAt: now,
      ...payload
    });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text || null;
  }

  if (!response.ok) {
    const error = new Error(`External request failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function exchangeKakaoAuthorizationCode(readString, code, redirectUri) {
  const clientId = readEnv(
    readString,
    "KAKAO_CLIENT_ID",
    "PLIN_KAKAO_CLIENT_ID",
    "KAKAO_REST_API_KEY",
    "PLIN_KAKAO_REST_API_KEY"
  );
  const clientSecret = readEnv(readString, "KAKAO_CLIENT_SECRET", "PLIN_KAKAO_CLIENT_SECRET");

  if (!clientId) {
    throw new Error("Kakao 로그인 설정이 아직 준비되지 않았어요.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code
  });

  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }

  return fetchJson("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
    },
    body
  });
}

async function readKakaoIdentity(readString, accessToken) {
  const payload = await fetchJson("https://kapi.kakao.com/v2/user/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const providerUserId = readScalarString(readString, payload?.id);
  const account = isPlainObject(payload?.kakao_account) ? payload.kakao_account : {};
  const profile = isPlainObject(account.profile) ? account.profile : {};

  if (!providerUserId) {
    throw new Error("Kakao 사용자 정보를 확인하지 못했어요.");
  }

  const email = readString(account.email);
  const displayName =
    readString(profile.nickname)
    || email
    || "PLIN User";
  const photoURL = normalizeKnownPhotoUrl(readString, profile.profile_image_url);

  return {
    provider: "kakao",
    providerUserId,
    normalizedSubject: normalizeProviderSubject("kakao", providerUserId),
    email,
    displayName,
    photoURL,
    accessToken
  };
}

async function exchangeNaverAuthorizationCode(readString, code, state) {
  const clientId = readEnv(readString, "NAVER_CLIENT_ID", "PLIN_NAVER_CLIENT_ID");
  const clientSecret = readEnv(readString, "NAVER_CLIENT_SECRET", "PLIN_NAVER_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("Naver 로그인 설정이 아직 준비되지 않았어요.");
  }

  const url = new URL("https://nid.naver.com/oauth2.0/token");
  url.searchParams.set("grant_type", "authorization_code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("code", code);
  url.searchParams.set("state", state);

  return fetchJson(url.toString());
}

async function refreshNaverAccessToken(readString, refreshToken) {
  const clientId = readEnv(readString, "NAVER_CLIENT_ID", "PLIN_NAVER_CLIENT_ID");
  const clientSecret = readEnv(readString, "NAVER_CLIENT_SECRET", "PLIN_NAVER_CLIENT_SECRET");

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const url = new URL("https://nid.naver.com/oauth2.0/token");
  url.searchParams.set("grant_type", "refresh_token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("refresh_token", refreshToken);

  return fetchJson(url.toString());
}

async function revokeNaverAccess(readString, accessToken) {
  const clientId = readEnv(readString, "NAVER_CLIENT_ID", "PLIN_NAVER_CLIENT_ID");
  const clientSecret = readEnv(readString, "NAVER_CLIENT_SECRET", "PLIN_NAVER_CLIENT_SECRET");

  if (!clientId || !clientSecret || !accessToken) {
    return false;
  }

  const url = new URL("https://nid.naver.com/oauth2.0/token");
  url.searchParams.set("grant_type", "delete");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("service_provider", "NAVER");

  try {
    await fetchJson(url.toString());
    return true;
  } catch {
    return false;
  }
}

async function readNaverIdentity(readString, accessToken, refreshToken = "") {
  const payload = await fetchJson("https://openapi.naver.com/v1/nid/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const response = isPlainObject(payload?.response) ? payload.response : {};
  const providerUserId = readScalarString(readString, response.id);

  if (!providerUserId) {
    throw new Error("Naver 사용자 정보를 확인하지 못했어요.");
  }

  const email = readString(response.email);
  const displayName =
    readString(response.name)
    || readString(response.nickname)
    || email
    || "PLIN User";
  const photoURL = normalizeKnownPhotoUrl(readString, response.profile_image);

  return {
    provider: "naver",
    providerUserId,
    normalizedSubject: normalizeProviderSubject("naver", providerUserId),
    email,
    displayName,
    photoURL,
    accessToken,
    refreshToken
  };
}

function buildProviderAuthorizationUrl(readString, provider, state, redirectUri) {
  if (provider === "kakao") {
    const clientId = readEnv(
      readString,
      "KAKAO_CLIENT_ID",
      "PLIN_KAKAO_CLIENT_ID",
      "KAKAO_REST_API_KEY",
      "PLIN_KAKAO_REST_API_KEY"
    );
    if (!clientId) {
      throw new Error("Kakao 로그인 설정이 아직 준비되지 않았어요.");
    }

    const url = new URL("https://kauth.kakao.com/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "login");
    return url.toString();
  }

  const clientId = readEnv(readString, "NAVER_CLIENT_ID", "PLIN_NAVER_CLIENT_ID");
  if (!clientId) {
    throw new Error("Naver 로그인 설정이 아직 준비되지 않았어요.");
  }

  const url = new URL("https://nid.naver.com/oauth2.0/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

function readAppleServiceId(readString) {
  return readEnv(
    readString,
    "APPLE_SERVICE_ID",
    "PLIN_APPLE_SERVICE_ID",
    "APPLE_CLIENT_ID",
    "PLIN_APPLE_CLIENT_ID"
  ) || APPLE_SERVICE_ID_FALLBACK;
}

function readAppleNonce(readString, value) {
  const nonce = readString(value).toLowerCase();
  return /^[a-f0-9]{64}$/.test(nonce) ? nonce : "";
}

function buildAppleAuthorizationUrl(readString, state, redirectUri, nonce) {
  const clientId = readAppleServiceId(readString);
  if (!clientId) {
    throw new Error("Apple 로그인 설정이 아직 준비되지 않았어요.");
  }

  const url = new URL("https://appleid.apple.com/auth/authorize");
  url.searchParams.set("response_type", "code id_token");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "name email");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  return url.toString();
}

function readBooleanEnvToggle(readString, ...names) {
  const value = readEnv(readString, ...names).toLowerCase();

  if (!value) {
    return null;
  }

  if (["1", "true", "yes", "on", "enabled"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off", "disabled"].includes(value)) {
    return false;
  }

  return null;
}

function isCustomProviderConfigured(readString, provider) {
  if (provider === "kakao") {
    return Boolean(
      readEnv(
        readString,
        "KAKAO_CLIENT_ID",
        "PLIN_KAKAO_CLIENT_ID",
        "KAKAO_REST_API_KEY",
        "PLIN_KAKAO_REST_API_KEY"
      )
    );
  }

  if (provider === "naver") {
    return Boolean(
      readEnv(readString, "NAVER_CLIENT_ID", "PLIN_NAVER_CLIENT_ID")
      && readEnv(readString, "NAVER_CLIENT_SECRET", "PLIN_NAVER_CLIENT_SECRET")
    );
  }

  return false;
}

function readAuthProviderAvailability(readString) {
  const googleDisabled = readBooleanEnvToggle(
    readString,
    "GOOGLE_AUTH_DISABLED",
    "PLIN_GOOGLE_AUTH_DISABLED"
  );
  const appleDisabled = readBooleanEnvToggle(
    readString,
    "APPLE_AUTH_DISABLED",
    "PLIN_APPLE_AUTH_DISABLED"
  );

  return {
    google: googleDisabled === null ? true : !googleDisabled,
    apple: appleDisabled === null ? true : !appleDisabled,
    kakao: isCustomProviderConfigured(readString, "kakao"),
    naver: isCustomProviderConfigured(readString, "naver")
  };
}

function isProviderConfigurationError(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("로그인 설정이 아직 준비되지 않았어요.");
}

async function revokeKakaoWithAdminKey(readString, providerUserId) {
  const adminKey = readEnv(readString, "KAKAO_ADMIN_KEY", "PLIN_KAKAO_ADMIN_KEY");
  if (!adminKey || !providerUserId) {
    return false;
  }

  try {
    await fetchJson("https://kapi.kakao.com/v1/user/unlink", {
      method: "POST",
      headers: {
        Authorization: `KakaoAK ${adminKey}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
      },
      body: new URLSearchParams({
        target_id_type: "user_id",
        target_id: providerUserId
      })
    });
    return true;
  } catch {
    return false;
  }
}

async function readLinkedCustomProvidersForUid(admin, readString, uid) {
  const snapshot = await admin
    .firestore()
    .collection(AUTH_PROVIDER_LINKS_COLLECTION)
    .where("uid", "==", uid)
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      const provider = readAuthProvider(readString, data.provider);

      if (!provider || !CUSTOM_SOCIAL_PROVIDERS.has(provider)) {
        return null;
      }

      return {
        id: doc.id,
        provider,
        providerUserId: readString(data.providerUserId),
        normalizedSubject: readString(data.normalizedSubject) || doc.id,
        uid: readString(data.uid),
        linkedAt: readString(data.linkedAt) || null,
        emailHint: readString(data.emailHint) || null
      };
    })
    .filter(Boolean);
}

async function buildAuthProvidersResponse(admin, readString, uid, currentSignInMethod = null) {
  const userRecord = await admin.auth().getUser(uid);
  const customLinks = await readLinkedCustomProvidersForUid(admin, readString, uid);
  const providerAvailability = readAuthProviderAvailability(readString);
  const providerDetails = new Map(
    SUPPORTED_AUTH_PROVIDERS.map((provider) => [provider, {
      provider,
      linked: false,
      emailHint: null,
      linkedAt: null
    }])
  );

  for (const providerData of userRecord.providerData || []) {
    const provider = fromFirebaseProviderId(readString(providerData.providerId));
    if (!provider) {
      continue;
    }

    providerDetails.set(provider, {
      provider,
      linked: true,
      emailHint: readString(providerData.email) || null,
      linkedAt: null
    });
  }

  for (const link of customLinks) {
    providerDetails.set(link.provider, {
      provider: link.provider,
      linked: true,
      emailHint: link.emailHint,
      linkedAt: link.linkedAt
    });
  }

  const linkedCount = Array.from(providerDetails.values()).filter((entry) => entry.linked).length;

  return {
    currentSignInMethod: currentSignInMethod || null,
    providers: SUPPORTED_AUTH_PROVIDERS.map((provider) => {
      const detail = providerDetails.get(provider) || {
        provider,
        linked: false,
        emailHint: null,
        linkedAt: null
      };
      const isCurrentSignInMethod = currentSignInMethod === provider;
      const available = providerAvailability[provider] === true;

      return {
        provider,
        available,
        linked: detail.linked,
        canLink: !detail.linked && available,
        canUnlink: detail.linked && !isCurrentSignInMethod && linkedCount > 1,
        isCurrentSignInMethod,
        ...(detail.emailHint ? { emailHint: detail.emailHint } : {}),
        ...(detail.linkedAt ? { linkedAt: detail.linkedAt } : {})
      };
    })
  };
}

async function readUserRecordByEmail(admin, email) {
  if (!email) {
    return null;
  }

  try {
    return await admin.auth().getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      return null;
    }
    throw error;
  }
}

async function ensureAccountIsLoginable(admin, readUserProfileSummary, uid) {
  const [userRecord, profile] = await Promise.all([
    admin.auth().getUser(uid),
    readUserProfileSummary(uid)
  ]);

  if (userRecord.disabled || profile.accountStatus === "pending_deletion") {
    return {
      blocked: true,
      message: PENDING_DELETION_MESSAGE
    };
  }

  return {
    blocked: false,
    userRecord,
    profile
  };
}

async function seedUserProfileDoc(admin, identity, uid) {
  await admin.firestore().collection("users").doc(uid).set({
    email: identity.email || null,
    displayName: identity.displayName || identity.email || "PLIN User",
    photoURL: identity.photoURL || null
  }, { merge: true });
}

async function storeProviderTokens(admin, identity) {
  if (identity.provider !== "naver") {
    await admin
      .firestore()
      .collection(AUTH_PROVIDER_TOKENS_COLLECTION)
      .doc(identity.normalizedSubject)
      .delete()
      .catch(() => {});
    return;
  }

  const payload = {
    provider: identity.provider,
    normalizedSubject: identity.normalizedSubject,
    providerUserId: identity.providerUserId,
    accessToken: identity.accessToken || null,
    refreshToken: identity.refreshToken || null,
    updatedAt: new Date().toISOString()
  };

  await admin
    .firestore()
    .collection(AUTH_PROVIDER_TOKENS_COLLECTION)
    .doc(identity.normalizedSubject)
    .set(payload, { merge: true });
}

async function clearCustomProviderArtifacts(admin, normalizedSubject) {
  if (!normalizedSubject) {
    return;
  }

  const batch = admin.firestore().batch();
  batch.delete(
    admin.firestore().collection(AUTH_PROVIDER_LINKS_COLLECTION).doc(normalizedSubject)
  );
  batch.delete(
    admin.firestore().collection(AUTH_PROVIDER_TOKENS_COLLECTION).doc(normalizedSubject)
  );
  await batch.commit();
}

function isFirebaseUserNotFoundError(error) {
  return error?.code === "auth/user-not-found";
}

async function linkCustomIdentityToUid(admin, readString, identity, uid, actorUid) {
  const linkRef = admin
    .firestore()
    .collection(AUTH_PROVIDER_LINKS_COLLECTION)
    .doc(identity.normalizedSubject);

  let conflict = false;

  await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(linkRef);
    if (snapshot.exists) {
      const existingData = snapshot.data() || {};
      const existingUid = readString(existingData.uid);

      if (existingUid && existingUid !== uid) {
        conflict = true;
        return;
      }
    }

    transaction.set(linkRef, {
      provider: identity.provider,
      providerUserId: identity.providerUserId,
      normalizedSubject: identity.normalizedSubject,
      uid,
      linkedAt: new Date().toISOString(),
      linkedBy: actorUid,
      emailHint: identity.email || null
    }, { merge: true });
  });

  if (conflict) {
    return {
      ok: false,
      response: buildProviderConflictResponse(identity.provider)
    };
  }

  await storeProviderTokens(admin, identity);
  return {
    ok: true
  };
}

async function createCustomProviderAccount(admin, identity) {
  const userRecord = await admin.auth().createUser({
    email: identity.email || undefined,
    displayName: identity.displayName || undefined,
    photoURL: identity.photoURL || undefined
  });

  await seedUserProfileDoc(admin, identity, userRecord.uid);
  return userRecord;
}

function toAuthUserPayload(profile, provider) {
  return {
    uid: profile.uid,
    email: profile.email || "",
    displayName: profile.displayName || profile.email || "PLIN User",
    photoURL: profile.photoURL || null,
    provider
  };
}

async function completeCustomSignIn(admin, readString, readUserProfileSummary, identity) {
  const linkRef = admin
    .firestore()
    .collection(AUTH_PROVIDER_LINKS_COLLECTION)
    .doc(identity.normalizedSubject);
  const linkSnapshot = await linkRef.get();

  if (linkSnapshot.exists) {
    const existingUid = readString(linkSnapshot.data()?.uid);

    if (existingUid) {
      try {
        const state = await ensureAccountIsLoginable(admin, readUserProfileSummary, existingUid);
        if (state.blocked) {
          return {
            status: 403,
            body: {
              message: state.message
            }
          };
        }

        await storeProviderTokens(admin, identity);
        const profile = await readUserProfileSummary(existingUid);
        const providers = await buildAuthProvidersResponse(admin, readString, existingUid, identity.provider);
        const firebaseCustomToken = await admin.auth().createCustomToken(existingUid, {
          currentSignInMethod: identity.provider
        });

        return {
          status: 200,
          body: {
            outcome: "signed_in",
            firebaseCustomToken,
            authUser: toAuthUserPayload(profile, identity.provider),
            providers
          }
        };
      } catch (error) {
        if (!isFirebaseUserNotFoundError(error)) {
          throw error;
        }
      }
    }

    // Recover from stale custom-provider links that point to deleted Firebase users.
    await clearCustomProviderArtifacts(admin, identity.normalizedSubject);
  }

  const existingUserByEmail = await readUserRecordByEmail(admin, identity.email);
  if (existingUserByEmail) {
    return {
      status: 409,
      body: buildExistingLoginConflictResponse(readString, identity.email)
    };
  }

  let createdUser = null;

  try {
    createdUser = await createCustomProviderAccount(admin, identity);
    const linkResult = await linkCustomIdentityToUid(
      admin,
      readString,
      identity,
      createdUser.uid,
      createdUser.uid
    );

    if (!linkResult.ok) {
      await admin.auth().deleteUser(createdUser.uid).catch(() => {});
      return {
        status: 409,
        body: linkResult.response
      };
    }

    const profile = await readUserProfileSummary(createdUser.uid);
    const providers = await buildAuthProvidersResponse(admin, readString, createdUser.uid, identity.provider);
    const firebaseCustomToken = await admin.auth().createCustomToken(createdUser.uid, {
      currentSignInMethod: identity.provider
    });

    return {
      status: 200,
      body: {
        outcome: "signed_in",
        firebaseCustomToken,
        authUser: toAuthUserPayload(profile, identity.provider),
        providers
      }
    };
  } catch (error) {
    if (createdUser?.uid) {
      await admin.auth().deleteUser(createdUser.uid).catch(() => {});
    }

    if (error.code === "auth/email-already-exists") {
      return {
        status: 409,
        body: buildExistingLoginConflictResponse(readString, identity.email)
      };
    }

    throw error;
  }
}

function buildSocialExchangeFailureResponse(provider, error) {
  const reason = String(error?.message || "").trim();
  const authCode = String(error?.errorInfo?.code || error?.code || "").trim();

  if (
    reason === "missing"
    || reason === "expired"
    || reason === "used"
  ) {
    return {
      status: 410,
      body: {
        error: "Auth Social Exchange Expired",
        message: `${getProviderLabel(provider)} 로그인 유효 시간이 만료되었어요. 다시 시도해 주세요.`
      }
    };
  }

  if (
    reason === "provider_mismatch"
    || reason === "intent_mismatch"
    || reason === "uid_mismatch"
    || reason === "missing_identity"
  ) {
    return {
      status: 400,
      body: {
        error: "Auth Social Exchange Invalid State",
        message: `${getProviderLabel(provider)} 로그인 상태를 확인하지 못했어요. 다시 시도해 주세요.`
      }
    };
  }

  if (authCode === "auth/insufficient-permission") {
    return {
      status: 503,
      body: {
        error: "Auth Social Exchange Permission Error",
        message: `${getProviderLabel(provider)} 로그인 마무리 준비가 아직 끝나지 않았어요. 잠시 후 다시 시도해 주세요.`
      }
    };
  }

  return null;
}

async function completeCustomLink(admin, readString, identity, uid, currentSignInMethod) {
  const linkResult = await linkCustomIdentityToUid(admin, readString, identity, uid, uid);
  if (!linkResult.ok) {
    return {
      status: 409,
      body: linkResult.response
    };
  }

  const providers = await buildAuthProvidersResponse(admin, readString, uid, currentSignInMethod);
  return {
    status: 200,
    body: {
      outcome: "linked",
      providers
    }
  };
}

async function consumeResumeTicket(admin, readString, ticketId, expectedProvider, intent, expectedUid = null) {
  const ticketRef = admin
    .firestore()
    .collection(AUTH_SOCIAL_TICKETS_COLLECTION)
    .doc(ticketId);

  let ticketPayload = null;
  let failure = null;

  await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ticketRef);
    if (!snapshot.exists) {
      failure = new Error("missing");
      return;
    }

    const data = snapshot.data() || {};
    const expiresAt = readString(data.expiresAt);
    const used = Boolean(data.used);
    const ticketIntent = readIntent(readString, data.intent);
    const provider = readAuthProvider(readString, data.provider);
    const uid = readString(data.uid);

    if (provider !== expectedProvider) {
      failure = new Error("provider_mismatch");
      return;
    }

    if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
      failure = new Error("expired");
      return;
    }

    if (used) {
      failure = new Error("used");
      return;
    }

    if (ticketIntent !== intent) {
      failure = new Error("intent_mismatch");
      return;
    }

    if (intent === "link" && uid !== expectedUid) {
      failure = new Error("uid_mismatch");
      return;
    }

    transaction.set(ticketRef, {
      used: true,
      usedAt: new Date().toISOString()
    }, { merge: true });
    ticketPayload = data.identity || null;
  });

  if (failure) {
    throw failure;
  }

  if (!isPlainObject(ticketPayload)) {
    throw new Error("missing_identity");
  }

  return {
    provider: readAuthProvider(readString, ticketPayload.provider),
    providerUserId: readString(ticketPayload.providerUserId),
    normalizedSubject: readString(ticketPayload.normalizedSubject),
    email: readString(ticketPayload.email),
    displayName: readString(ticketPayload.displayName) || "PLIN User",
    photoURL: readString(ticketPayload.photoURL) || null,
    accessToken: readString(ticketPayload.accessToken),
    refreshToken: readString(ticketPayload.refreshToken)
  };
}

async function consumeAppleIdTokenTicket(admin, readString, ticketId, intent, expectedUid = null) {
  const ticketRef = admin
    .firestore()
    .collection(AUTH_SOCIAL_TICKETS_COLLECTION)
    .doc(ticketId);

  let idToken = "";
  let failure = null;

  await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ticketRef);
    if (!snapshot.exists) {
      failure = new Error("missing");
      return;
    }

    const data = snapshot.data() || {};
    const expiresAt = readString(data.expiresAt);
    const used = Boolean(data.used);
    const ticketIntent = readIntent(readString, data.intent);
    const provider = readAuthProvider(readString, data.provider);
    const uid = readString(data.uid);

    if (provider !== "apple") {
      failure = new Error("provider_mismatch");
      return;
    }

    if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
      failure = new Error("expired");
      return;
    }

    if (used) {
      failure = new Error("used");
      return;
    }

    if (ticketIntent !== intent) {
      failure = new Error("intent_mismatch");
      return;
    }

    if (intent === "link" && uid !== expectedUid) {
      failure = new Error("uid_mismatch");
      return;
    }

    idToken = readString(data.idToken);
    transaction.set(ticketRef, {
      used: true,
      usedAt: new Date().toISOString(),
      idToken: null
    }, { merge: true });
  });

  if (failure) {
    throw failure;
  }

  if (!idToken) {
    throw new Error("missing_identity");
  }

  return idToken;
}

function getApiBaseUrl(req, readString) {
  const configuredBaseUrl = readEnv(
    readString,
    "PLIN_PUBLIC_API_BASE_URL",
    "PUBLIC_API_BASE_URL"
  ).replace(/\/+$/, "");
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const host = readString(req.get("host"));
  const forwardedProto = readString(req.get("x-forwarded-proto"));
  const protocol = (forwardedProto || req.protocol || "https").split(",")[0].trim();

  if (
    host === "localhost"
    || host.startsWith("localhost:")
    || host === "127.0.0.1"
    || host.startsWith("127.0.0.1:")
  ) {
    return `${protocol}://${host}/api`;
  }

  return DEFAULT_PUBLIC_API_BASE_URL;
}

function getCustomSocialCallbackBaseUrl(req, readString, provider) {
  if (provider !== "naver") {
    return getApiBaseUrl(req, readString);
  }

  const configuredBaseUrl = readEnv(
    readString,
    "PLIN_NAVER_PUBLIC_API_BASE_URL",
    "NAVER_PUBLIC_API_BASE_URL",
    "PLIN_PUBLIC_API_BASE_URL",
    "PUBLIC_API_BASE_URL"
  ).replace(/\/+$/, "");
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  return DEFAULT_NAVER_WEB_CALLBACK_BASE_URL;
}

async function revokeCustomProviderLink(admin, readString, link) {
  if (link.provider === "kakao") {
    return revokeKakaoWithAdminKey(readString, link.providerUserId);
  }

  const tokenSnapshot = await admin
    .firestore()
    .collection(AUTH_PROVIDER_TOKENS_COLLECTION)
    .doc(link.normalizedSubject)
    .get();
  const tokenData = tokenSnapshot.exists ? (tokenSnapshot.data() || {}) : {};
  let accessToken = readString(tokenData.accessToken);

  if (!accessToken) {
    const refreshed = await refreshNaverAccessToken(readString, readString(tokenData.refreshToken));
    accessToken = readString(refreshed?.access_token);
  }

  return revokeNaverAccess(readString, accessToken);
}

async function unlinkCustomProvider(admin, readString, uid, provider) {
  const customLinks = await readLinkedCustomProvidersForUid(admin, readString, uid);
  const link = customLinks.find((entry) => entry.provider === provider);
  if (!link) {
    return {
      linked: false
    };
  }

  const revoked = await revokeCustomProviderLink(admin, readString, link);
  const batch = admin.firestore().batch();
  batch.delete(
    admin.firestore().collection(AUTH_PROVIDER_LINKS_COLLECTION).doc(link.id)
  );
  batch.delete(
    admin.firestore().collection(AUTH_PROVIDER_TOKENS_COLLECTION).doc(link.normalizedSubject)
  );
  await batch.commit();

  return {
    linked: true,
    revoked
  };
}

async function revokeLinkedProvidersForUid(admin, readString, uid) {
  const customLinks = await readLinkedCustomProvidersForUid(admin, readString, uid);

  for (const link of customLinks) {
    const revoked = await revokeCustomProviderLink(admin, readString, link);
    const batch = admin.firestore().batch();
    batch.delete(
      admin.firestore().collection(AUTH_PROVIDER_LINKS_COLLECTION).doc(link.id)
    );
    batch.delete(
      admin.firestore().collection(AUTH_PROVIDER_TOKENS_COLLECTION).doc(link.normalizedSubject)
    );
    await batch.commit();

    await writeAuthAuditLog(admin, {
      actorUid: uid,
      targetUid: uid,
      provider: link.provider,
      actionType: revoked ? "deletion_revoke_success" : "deletion_revoke_failed",
      success: revoked
    });
  }
}

function buildUnlinkBlockedResponse(reason, message) {
  return {
    outcome: "provider_conflict",
    reason,
    message
  };
}

function registerAuthSocialRoutes({
  app,
  admin,
  validateFirebaseIdToken,
  attachOptionalFirebaseIdToken,
  readString,
  readNullableString,
  readUserProfileSummary
}) {
  app.post("/auth/apple/mobile-start", attachOptionalFirebaseIdToken, async (req, res) => {
    const intent = readIntent(readString, req.body?.intent);
    const appRedirectUrl = readAppRedirectUrl(readString, req.body?.appRedirectUrl);
    const nonce = readAppleNonce(readString, req.body?.nonce);
    const providerAvailability = readAuthProviderAvailability(readString);

    if (providerAvailability.apple !== true) {
      return res.status(503).json({
        error: "Provider Disabled",
        message: "Apple 로그인이 현재 비활성화되어 있어요."
      });
    }

    if (!appRedirectUrl) {
      return res.status(400).json({
        error: "Invalid Redirect URL",
        message: "로그인 완료 주소가 올바르지 않아요."
      });
    }

    if (!nonce) {
      return res.status(400).json({
        error: "Invalid Nonce",
        message: "Apple 로그인 확인값이 올바르지 않아요."
      });
    }

    if (intent === "link" && !req.user?.uid) {
      return res.status(403).json({
        error: "Unauthorized",
        message: "로그인이 필요합니다."
      });
    }

    try {
      const state = crypto.randomUUID();
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + OAUTH_STATE_TTL_MS);
      const callbackUrl = `${getApiBaseUrl(req, readString)}${APPLE_MOBILE_COMPLETE_PATH}`;
      const authorizationUrl = buildAppleAuthorizationUrl(
        readString,
        state,
        callbackUrl,
        nonce
      );

      await admin
        .firestore()
        .collection(AUTH_SOCIAL_STARTS_COLLECTION)
        .doc(state)
        .set({
          provider: "apple",
          intent,
          appRedirectUrl,
          uid: intent === "link" ? req.user.uid : null,
          nonce,
          used: false,
          createdAt: createdAt.toISOString(),
          expiresAt: expiresAt.toISOString()
        });

      return res.json({
        provider: "apple",
        intent,
        authorizationUrl,
        callbackUrl: appRedirectUrl,
        state
      });
    } catch (error) {
      console.error("[Apple Auth Start] Error:", error);
      if (isProviderConfigurationError(error)) {
        return res.status(503).json({
          error: "Provider Configuration Missing",
          message: error.message
        });
      }

      return res.status(500).json({
        error: "Apple Auth Start Error",
        message: "Apple 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요."
      });
    }
  });

  app.all("/auth/apple/mobile-complete", async (req, res) => {
    const code = readString(req.body?.code || req.query?.code);
    const idToken = readString(req.body?.id_token || req.query?.id_token);
    const state = readString(req.body?.state || req.query?.state);
    const oauthError = readString(req.body?.error || req.query?.error);
    let appRedirectUrl = APP_SOCIAL_REDIRECT_URI;

    if (!state) {
      return res.status(400).send("missing_state");
    }

    const stateRef = admin
      .firestore()
      .collection(AUTH_SOCIAL_STARTS_COLLECTION)
      .doc(state);

    try {
      const stateSnapshot = await stateRef.get();
      if (!stateSnapshot.exists) {
        return res.status(400).send("invalid_state");
      }

      const stateData = stateSnapshot.data() || {};
      const provider = readAuthProvider(readString, stateData.provider);
      const intent = readIntent(readString, stateData.intent);
      appRedirectUrl = readAppRedirectUrl(readString, stateData.appRedirectUrl) || APP_SOCIAL_REDIRECT_URI;
      const targetUid = readString(stateData.uid) || null;
      const expiresAt = readString(stateData.expiresAt);
      const alreadyUsed = Boolean(stateData.used);

      if (provider !== "apple") {
        return res.status(400).send("invalid_provider");
      }

      if (!expiresAt || Date.parse(expiresAt) <= Date.now() || alreadyUsed) {
        return res.redirect(appendQueryParamsToUrl(appRedirectUrl, {
          provider,
          error: "expired"
        }));
      }

      if (oauthError) {
        return res.redirect(appendQueryParamsToUrl(appRedirectUrl, {
          provider,
          error: oauthError
        }));
      }

      if (!code || !idToken) {
        return res.redirect(appendQueryParamsToUrl(appRedirectUrl, {
          provider,
          error: "missing_token"
        }));
      }

      const ticketId = crypto.randomUUID();
      const expiresAtTicket = new Date(Date.now() + RESUME_TICKET_TTL_MS).toISOString();
      const batch = admin.firestore().batch();
      batch.set(stateRef, {
        used: true,
        usedAt: new Date().toISOString()
      }, { merge: true });
      batch.set(
        admin.firestore().collection(AUTH_SOCIAL_TICKETS_COLLECTION).doc(ticketId),
        {
          provider,
          intent,
          uid: targetUid,
          used: false,
          expiresAt: expiresAtTicket,
          idToken
        }
      );
      await batch.commit();

      return res.redirect(appendQueryParamsToUrl(appRedirectUrl, {
        provider,
        ticket: ticketId
      }));
    } catch (error) {
      console.error("[Apple Auth Complete] Error:", error);
      return res.redirect(appendQueryParamsToUrl(appRedirectUrl, {
        provider: "apple",
        error: "callback_failed"
      }));
    }
  });

  app.post("/auth/apple/mobile-exchange", attachOptionalFirebaseIdToken, async (req, res) => {
    const intent = readIntent(readString, req.body?.intent);
    const ticket = readString(req.body?.ticket);
    const currentUid = req.user?.uid || null;

    if (intent === "link" && !currentUid) {
      return res.status(403).json({
        error: "Unauthorized",
        message: "로그인이 필요합니다."
      });
    }

    if (!ticket) {
      return res.status(400).json({
        error: "Missing Apple Ticket",
        message: "Apple 로그인 인증 정보를 확인하지 못했어요."
      });
    }

    try {
      const idToken = await consumeAppleIdTokenTicket(
        admin,
        readString,
        ticket,
        intent,
        currentUid
      );

      return res.json({
        idToken
      });
    } catch (error) {
      console.error("[Apple Auth Exchange] Error:", error);
      const mappedFailure = buildSocialExchangeFailureResponse("apple", error);
      if (mappedFailure) {
        return res.status(mappedFailure.status).json(mappedFailure.body);
      }
      return res.status(500).json({
        error: "Apple Auth Exchange Error",
        message: "Apple 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요."
      });
    }
  });

  app.get("/auth/providers", validateFirebaseIdToken, async (req, res) => {
    const uid = req.user.uid;
    const currentSignInMethod = readCurrentSignInMethod(readString, req.user);

    try {
      const payload = await buildAuthProvidersResponse(
        admin,
        readString,
        uid,
        currentSignInMethod
      );
      return res.json(payload);
    } catch (error) {
      console.error("[Auth Providers] Read error:", error);
      return res.status(500).json({
        error: "Auth Providers Read Error",
        message: "연결된 로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
      });
    }
  });

  app.post("/auth/social/mobile-start", attachOptionalFirebaseIdToken, async (req, res) => {
    const provider = readAuthProvider(readString, req.body?.provider);
    const intent = readIntent(readString, req.body?.intent);
    const appRedirectUrl = readAppRedirectUrl(readString, req.body?.appRedirectUrl);

    if (!provider || !CUSTOM_SOCIAL_PROVIDERS.has(provider)) {
      return res.status(400).json({
        error: "Unsupported Provider",
        message: "지원하지 않는 로그인 방식이에요."
      });
    }

    if (!appRedirectUrl) {
      return res.status(400).json({
        error: "Invalid Redirect URL",
        message: "로그인 완료 주소가 올바르지 않아요."
      });
    }

    if (intent === "link" && !req.user?.uid) {
      return res.status(403).json({
        error: "Unauthorized",
        message: "로그인이 필요합니다."
      });
    }

    try {
      const state = crypto.randomUUID();
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + OAUTH_STATE_TTL_MS);
      const callbackUrl = `${getCustomSocialCallbackBaseUrl(req, readString, provider)}/auth/social/mobile-complete`;
      const authorizationUrl = buildProviderAuthorizationUrl(
        readString,
        provider,
        state,
        callbackUrl
      );

      await admin
        .firestore()
        .collection(AUTH_SOCIAL_STARTS_COLLECTION)
        .doc(state)
        .set({
          provider,
          intent,
          appRedirectUrl,
          uid: intent === "link" ? req.user.uid : null,
          used: false,
          createdAt: createdAt.toISOString(),
          expiresAt: expiresAt.toISOString()
        });

      return res.json({
        provider,
        intent,
        authorizationUrl,
        callbackUrl: appRedirectUrl,
        state
      });
    } catch (error) {
      console.error("[Auth Social Start] Error:", error);
      if (isProviderConfigurationError(error)) {
        return res.status(503).json({
          error: "Provider Configuration Missing",
          message: error.message
        });
      }

      return res.status(500).json({
        error: "Auth Social Start Error",
        message: `${getProviderLabel(provider)} 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.`
      });
    }
  });

  app.get("/auth/social/mobile-complete", async (req, res) => {
    const code = readString(req.query?.code);
    const state = readString(req.query?.state);
    const oauthError = readString(req.query?.error);
    let appRedirectUrl = APP_SOCIAL_REDIRECT_URI;

    if (!state) {
      return res.status(400).send("missing_state");
    }

    const stateRef = admin
      .firestore()
      .collection(AUTH_SOCIAL_STARTS_COLLECTION)
      .doc(state);

    try {
      const stateSnapshot = await stateRef.get();
      if (!stateSnapshot.exists) {
        return res.status(400).send("invalid_state");
      }

      const stateData = stateSnapshot.data() || {};
      const provider = readAuthProvider(readString, stateData.provider);
      const intent = readIntent(readString, stateData.intent);
      appRedirectUrl = readAppRedirectUrl(readString, stateData.appRedirectUrl) || APP_SOCIAL_REDIRECT_URI;
      const targetUid = readString(stateData.uid) || null;
      const expiresAt = readString(stateData.expiresAt);
      const alreadyUsed = Boolean(stateData.used);

      if (!provider || !CUSTOM_SOCIAL_PROVIDERS.has(provider)) {
        return res.status(400).send("invalid_provider");
      }

      if (!expiresAt || Date.parse(expiresAt) <= Date.now() || alreadyUsed) {
        return res.redirect(appendQueryParamsToUrl(appRedirectUrl, {
          provider,
          error: "expired"
        }));
      }

      if (oauthError) {
        return res.redirect(appendQueryParamsToUrl(appRedirectUrl, {
          provider,
          error: oauthError
        }));
      }

      if (!code) {
        return res.redirect(appendQueryParamsToUrl(appRedirectUrl, {
          provider,
          error: "missing_code"
        }));
      }

      const callbackUrl = `${getCustomSocialCallbackBaseUrl(req, readString, provider)}/auth/social/mobile-complete`;
      let identity = null;

      if (provider === "kakao") {
        const tokenPayload = await exchangeKakaoAuthorizationCode(readString, code, callbackUrl);
        identity = await readKakaoIdentity(readString, readString(tokenPayload?.access_token));
      } else {
        const tokenPayload = await exchangeNaverAuthorizationCode(readString, code, state);
        identity = await readNaverIdentity(
          readString,
          readString(tokenPayload?.access_token),
          readString(tokenPayload?.refresh_token)
        );
      }

      const ticketId = crypto.randomUUID();
      const expiresAtTicket = new Date(Date.now() + RESUME_TICKET_TTL_MS).toISOString();
      const batch = admin.firestore().batch();
      batch.set(stateRef, {
        used: true,
        usedAt: new Date().toISOString()
      }, { merge: true });
      batch.set(
        admin.firestore().collection(AUTH_SOCIAL_TICKETS_COLLECTION).doc(ticketId),
        {
          provider,
          intent,
          uid: targetUid,
          used: false,
          expiresAt: expiresAtTicket,
          identity
        }
      );
      await batch.commit();

      return res.redirect(appendQueryParamsToUrl(appRedirectUrl, {
        provider,
        ticket: ticketId
      }));
    } catch (error) {
      console.error("[Auth Social Complete] Error:", error);
      return res.redirect(appendQueryParamsToUrl(appRedirectUrl, {
        error: "callback_failed"
      }));
    }
  });

  app.post("/auth/social/mobile-exchange", attachOptionalFirebaseIdToken, async (req, res) => {
    const provider = readAuthProvider(readString, req.body?.provider);
    const intent = readIntent(readString, req.body?.intent);
    const accessToken = readString(req.body?.accessToken);
    const ticket = readString(req.body?.ticket);
    const currentUid = req.user?.uid || null;
    const currentSignInMethod = readCurrentSignInMethod(readString, req.user);

    if (!provider || !CUSTOM_SOCIAL_PROVIDERS.has(provider)) {
      return res.status(400).json({
        error: "Unsupported Provider",
        message: "지원하지 않는 로그인 방식이에요."
      });
    }

    if (intent === "link" && !currentUid) {
      return res.status(403).json({
        error: "Unauthorized",
        message: "로그인이 필요합니다."
      });
    }

    try {
      let identity = null;

      if (ticket) {
        identity = await consumeResumeTicket(
          admin,
          readString,
          ticket,
          provider,
          intent,
          currentUid
        );
      } else if (provider === "kakao" && accessToken) {
        identity = await readKakaoIdentity(readString, accessToken);
      } else if (provider === "naver" && accessToken) {
        identity = await readNaverIdentity(readString, accessToken);
      } else {
        return res.status(400).json({
          error: "Missing Social Credential",
          message: "로그인 인증 정보를 확인하지 못했어요."
        });
      }

      const result = intent === "link"
        ? await completeCustomLink(admin, readString, identity, currentUid, currentSignInMethod)
        : await completeCustomSignIn(admin, readString, readUserProfileSummary, identity);

      if (result.body?.outcome === "signed_in") {
        await writeAuthAuditLog(admin, {
          actorUid: result.body.authUser?.uid || null,
          targetUid: result.body.authUser?.uid || null,
          provider,
          actionType: "sign_in_success",
          success: true
        });
      } else if (result.body?.reason === "existing_account_requires_link") {
        await writeAuthAuditLog(admin, {
          actorUid: null,
          targetUid: null,
          provider,
          actionType: "sign_in_blocked_requires_existing_login",
          success: false,
          conflictType: result.body.reason
        });
      } else if (result.body?.reason === "provider_already_linked_elsewhere") {
        await writeAuthAuditLog(admin, {
          actorUid: currentUid,
          targetUid: currentUid,
          provider,
          actionType: intent === "link"
            ? "link_blocked_provider_conflict"
            : "sign_in_blocked_provider_conflict",
          success: false,
          conflictType: result.body.reason
        });
      } else if (result.body?.outcome === "linked") {
        await writeAuthAuditLog(admin, {
          actorUid: currentUid,
          targetUid: currentUid,
          provider,
          actionType: "link_success",
          success: true
        });
      }

      return res.status(result.status).json(result.body);
    } catch (error) {
      console.error("[Auth Social Exchange] Error:", error);
      const mappedFailure = buildSocialExchangeFailureResponse(provider, error);
      if (mappedFailure) {
        return res.status(mappedFailure.status).json(mappedFailure.body);
      }
      return res.status(500).json({
        error: "Auth Social Exchange Error",
        message: `${getProviderLabel(provider)} 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.`
      });
    }
  });

  app.post("/auth/providers/:provider/link", validateFirebaseIdToken, async (req, res) => {
    const provider = readAuthProvider(readString, req.params?.provider);
    const uid = req.user.uid;
    const currentSignInMethod = readCurrentSignInMethod(readString, req.user);
    const accessToken = readString(req.body?.accessToken);
    const ticket = readString(req.body?.ticket);

    if (!provider || !CUSTOM_SOCIAL_PROVIDERS.has(provider)) {
      return res.status(400).json({
        error: "Unsupported Provider",
        message: "지원하지 않는 로그인 연결 요청이에요."
      });
    }

    try {
      let identity = null;

      if (ticket) {
        identity = await consumeResumeTicket(
          admin,
          readString,
          ticket,
          provider,
          "link",
          uid
        );
      } else if (provider === "kakao" && accessToken) {
        identity = await readKakaoIdentity(readString, accessToken);
      } else if (provider === "naver" && accessToken) {
        identity = await readNaverIdentity(readString, accessToken);
      } else {
        return res.status(400).json({
          error: "Missing Social Credential",
          message: "로그인 인증 정보를 확인하지 못했어요."
        });
      }

      const result = await completeCustomLink(
        admin,
        readString,
        identity,
        uid,
        currentSignInMethod
      );

      await writeAuthAuditLog(admin, {
        actorUid: uid,
        targetUid: uid,
        provider,
        actionType: result.status === 200 ? "link_success" : "link_blocked_provider_conflict",
        success: result.status === 200,
        conflictType: result.body?.reason || null
      });

      return res.status(result.status).json(result.body);
    } catch (error) {
      console.error("[Auth Provider Link] Error:", error);
      return res.status(500).json({
        error: "Auth Provider Link Error",
        message: `${getProviderLabel(provider)} 연결을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.`
      });
    }
  });

  app.post("/auth/providers/:provider/unlink", validateFirebaseIdToken, async (req, res) => {
    const provider = readAuthProvider(readString, req.params?.provider);
    const uid = req.user.uid;
    const currentSignInMethod = readCurrentSignInMethod(readString, req.user);

    if (!provider) {
      return res.status(400).json({
        error: "Unsupported Provider",
        message: "지원하지 않는 로그인 연결 해제 요청이에요."
      });
    }

    try {
      const currentProviders = await buildAuthProvidersResponse(
        admin,
        readString,
        uid,
        currentSignInMethod
      );
      const targetProvider = currentProviders.providers.find((entry) => entry.provider === provider);

      if (!targetProvider?.linked) {
        await writeAuthAuditLog(admin, {
          actorUid: uid,
          targetUid: uid,
          provider,
          actionType: "unlink_blocked_not_linked",
          success: false
        });

        return res.status(409).json(buildUnlinkBlockedResponse(
          "provider_not_linked",
          "현재 계정에 연결되지 않은 로그인 방식이에요."
        ));
      }

      if (targetProvider.isCurrentSignInMethod) {
        await writeAuthAuditLog(admin, {
          actorUid: uid,
          targetUid: uid,
          provider,
          actionType: "unlink_blocked_current_method",
          success: false
        });

        return res.status(409).json(buildUnlinkBlockedResponse(
          "current_method_forbidden",
          "현재 로그인 방식은 연결 해제할 수 없어요."
        ));
      }

      const linkedCount = currentProviders.providers.filter((entry) => entry.linked).length;
      if (linkedCount <= 1) {
        await writeAuthAuditLog(admin, {
          actorUid: uid,
          targetUid: uid,
          provider,
          actionType: "unlink_blocked_last_method",
          success: false
        });

        return res.status(409).json(buildUnlinkBlockedResponse(
          "last_method_forbidden",
          "마지막 로그인 수단은 연결 해제할 수 없어요."
        ));
      }

      if (provider === "google" || provider === "apple") {
        await admin.auth().updateUser(uid, {
          providersToUnlink: [toFirebaseProviderId(provider)]
        });
      } else {
        await unlinkCustomProvider(admin, readString, uid, provider);
      }

      const nextProviders = await buildAuthProvidersResponse(
        admin,
        readString,
        uid,
        currentSignInMethod
      );

      await writeAuthAuditLog(admin, {
        actorUid: uid,
        targetUid: uid,
        provider,
        actionType: "unlink_success",
        success: true
      });

      return res.json(nextProviders);
    } catch (error) {
      console.error("[Auth Provider Unlink] Error:", error);
      return res.status(500).json({
        error: "Auth Provider Unlink Error",
        message: `${getProviderLabel(provider)} 연결 해제를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.`
      });
    }
  });
}

module.exports = {
  readAuthProviderAvailability,
  registerAuthSocialRoutes,
  revokeLinkedProvidersForUid
};
