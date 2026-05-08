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

function normalizeShareInfo(payload: any): TripShareResponse {
    const members = Array.isArray(payload?.members)
        ? payload.members.map((member: any) => ({
            uid: String(member?.uid || '').trim(),
            displayName: String(member?.displayName || '').trim() || '멤버',
            email: String(member?.email || '').trim(),
            photoURL: String(member?.photoURL || '').trim(),
            role: normalizeManagedRole(member?.role),
            isSelf: member?.isSelf === true
        }))
        : [];

    const directMode = normalizeShareMode(payload?.shareLink?.mode);
    const directRole = normalizeShareRole(payload?.shareLink?.role);
    const directUrl = String(payload?.shareLink?.url || '').trim();
    const legacyCollaboratorUrl = String(payload?.collaboratorLink?.url || '').trim();
    const legacyPublicUrl = String(payload?.generalAccess?.url || '').trim();
    const legacyPublicMode = normalizeLegacyMode(payload?.generalAccess?.mode);

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
            role = normalizeShareRole(payload?.collaboratorLink?.defaultRole);
            url = legacyCollaboratorUrl;
        }
    }

    const active = mode === 'link' && Boolean(url || payload?.shareLink?.active === true);
    const rawRole = typeof payload?.permissions?.role === 'string'
        ? payload.permissions.role
        : '';
    const permissionRole = rawRole === 'owner' || rawRole === 'editor' || rawRole === 'member' || rawRole === 'viewer'
        ? rawRole
        : '';

    return {
        permissions: {
            role: permissionRole,
            canManageShare: payload?.permissions?.canManageShare === true,
            canManageMembers: payload?.permissions?.canManageMembers === true,
            canSendAnnouncement: payload?.permissions?.canSendAnnouncement === true
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
    const payload = await fetchBackendJson<TripShareResponse>(
        `/plans/${encodeURIComponent(tripId)}/share`
    );

    return normalizeShareInfo(payload);
}

export async function updateTripShareInfo(tripId: string, input: TripSharePatchInput) {
    const payload = await fetchBackendJson<TripShareResponse>(
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
    const payload = await fetchBackendJson<TripShareResponse>(
        `/plans/${encodeURIComponent(tripId)}/members/${encodeURIComponent(memberUid)}`,
        {
            method: 'PATCH',
            body: { role }
        }
    );

    return normalizeShareInfo(payload);
}

export async function removeTripMember(tripId: string, memberUid: string) {
    const payload = await fetchBackendJson<TripShareResponse>(
        `/plans/${encodeURIComponent(tripId)}/members/${encodeURIComponent(memberUid)}`,
        {
            method: 'DELETE'
        }
    );

    return normalizeShareInfo(payload);
}

export async function transferTripOwnership(tripId: string, memberUid: string) {
    const payload = await fetchBackendJson<TripShareResponse>(
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
