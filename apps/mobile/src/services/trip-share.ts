import { fetchBackendJson } from '@/services/backend-client';

export type TripShareManagedRole = 'owner' | 'editor' | 'member' | 'viewer';
export type TripShareMode = 'private' | 'link';
export type TripShareLinkRole = 'editor' | 'member' | 'viewer';

export type TripShareMember = {
    uid: string;
    displayName: string;
    email: string;
    photoURL: string;
    role: TripShareManagedRole;
    isSelf: boolean;
};

export type TripShareResponse = {
    permissions: {
        role: TripShareManagedRole | '';
        canManageShare: boolean;
        canManageMembers: boolean;
        canSendAnnouncement: boolean;
    };
    members: TripShareMember[];
    shareLink: {
        mode: TripShareMode;
        role: TripShareLinkRole;
        url: string;
        active: boolean;
    };
};

type TripSharePatchInput = {
    shareLink?: {
        mode?: TripShareMode;
        role?: TripShareLinkRole;
        regenerate?: boolean;
    };
};

function normalizeManagedRole(value: unknown): TripShareManagedRole {
    return value === 'owner' || value === 'editor' || value === 'member' || value === 'viewer'
        ? value
        : 'viewer';
}

function normalizeShareMode(value: unknown): TripShareMode {
    return value === 'link' ? 'link' : 'private';
}

function normalizeShareRole(value: unknown): TripShareLinkRole {
    if (value === 'viewer' || value === 'member') {
        return value;
    }

    return 'editor';
}

function normalizeLegacyMode(value: unknown): 'restricted' | 'link_view' {
    return value === 'link_view' ? 'link_view' : 'restricted';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, key: string): Record<string, unknown> {
    if (!isRecord(value)) {
        return {};
    }

    const child = value[key];
    return isRecord(child) ? child : {};
}

function readString(value: unknown, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeShareInfo(payload: unknown): TripShareResponse {
    const payloadRecord = isRecord(payload) ? payload : {};
    const permissions = readRecord(payloadRecord, 'permissions');
    const shareLink = readRecord(payloadRecord, 'shareLink');
    const collaboratorLink = readRecord(payloadRecord, 'collaboratorLink');
    const generalAccess = readRecord(payloadRecord, 'generalAccess');
    const rawMembers = Array.isArray(payloadRecord.members) ? payloadRecord.members : [];

    const members = rawMembers
        .filter(isRecord)
        .map((member) => ({
            uid: readString(member.uid),
            displayName: readString(member.displayName) || '멤버',
            email: readString(member.email),
            photoURL: readString(member.photoURL),
            role: normalizeManagedRole(member.role),
            isSelf: member.isSelf === true
        }));

    const directMode = normalizeShareMode(shareLink.mode);
    const directRole = normalizeShareRole(shareLink.role);
    const directUrl = readString(shareLink.url);
    const legacyCollaboratorUrl = readString(collaboratorLink.url);
    const legacyPublicUrl = readString(generalAccess.url);
    const legacyPublicMode = normalizeLegacyMode(generalAccess.mode);

    let mode: TripShareMode = directMode;
    let role: TripShareLinkRole = directRole;
    let url = directUrl;

    if (!directUrl && directMode !== 'link') {
        if (legacyPublicMode === 'link_view' && legacyPublicUrl) {
            mode = 'link';
            role = 'viewer';
            url = legacyPublicUrl;
        } else if (legacyCollaboratorUrl) {
            mode = 'link';
            role = normalizeShareRole(collaboratorLink.defaultRole);
            url = legacyCollaboratorUrl;
        }
    }

    const active = mode === 'link' && Boolean(url || shareLink.active === true);
    const rawRole = typeof permissions.role === 'string'
        ? permissions.role
        : '';
    const permissionRole = rawRole === 'owner' || rawRole === 'editor' || rawRole === 'member' || rawRole === 'viewer'
        ? rawRole
        : '';

    return {
        permissions: {
            role: permissionRole,
            canManageShare: permissions.canManageShare === true,
            canManageMembers: permissions.canManageMembers === true,
            canSendAnnouncement: permissions.canSendAnnouncement === true
        },
        members,
        shareLink: {
            mode: active ? mode : 'private',
            role,
            url: active ? url : '',
            active
        }
    };
}

export async function fetchTripShareInfo(tripId: string) {
    const payload = await fetchBackendJson<unknown>(
        `/plans/${encodeURIComponent(tripId)}/share`
    );

    return normalizeShareInfo(payload);
}

export async function updateTripShareInfo(tripId: string, input: TripSharePatchInput) {
    const payload = await fetchBackendJson<unknown>(
        `/plans/${encodeURIComponent(tripId)}/share`,
        {
            method: 'PATCH',
            body: input
        }
    );

    return normalizeShareInfo(payload);
}

export async function updateTripMemberRole(
    tripId: string,
    memberUid: string,
    role: Exclude<TripShareManagedRole, 'owner' | 'viewer'>
) {
    const payload = await fetchBackendJson<unknown>(
        `/plans/${encodeURIComponent(tripId)}/members/${encodeURIComponent(memberUid)}`,
        {
            method: 'PATCH',
            body: { role }
        }
    );

    return normalizeShareInfo(payload);
}

export async function removeTripMember(tripId: string, memberUid: string) {
    const payload = await fetchBackendJson<unknown>(
        `/plans/${encodeURIComponent(tripId)}/members/${encodeURIComponent(memberUid)}`,
        {
            method: 'DELETE'
        }
    );

    return normalizeShareInfo(payload);
}

export async function transferTripOwnership(tripId: string, memberUid: string) {
    const payload = await fetchBackendJson<unknown>(
        `/plans/${encodeURIComponent(tripId)}/owner-transfer`,
        {
            method: 'POST',
            body: { ownerUid: memberUid }
        }
    );

    return normalizeShareInfo(payload);
}

export function buildTripShareMessage(
    tripTitle: string,
    shareLink: string,
    role: TripShareLinkRole
) {
    const safeTitle = String(tripTitle || '').trim() || '여행';
    const safeLink = String(shareLink || '').trim();

    if (role === 'viewer') {
        return `PLIN에서 "${safeTitle}" 여행 보기 링크를 확인해 보세요.\n${safeLink}`;
    }

    if (role === 'member') {
        return `PLIN에서 "${safeTitle}" 여행에 읽기 전용 멤버로 참여해 보세요.\n${safeLink}`;
    }

    return `PLIN에서 "${safeTitle}" 여행에 편집 멤버로 함께 참여해 보세요.\n${safeLink}`;
}
