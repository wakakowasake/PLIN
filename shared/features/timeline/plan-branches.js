function normalizePlanCode(planCode) {
    const code = String(planCode || '').trim().toUpperCase();
    if (!/^[A-Z]$/.test(code)) return null;
    return code;
}

function getSortedPlanCodes(planMap) {
    return Object.keys(planMap).sort((left, right) => left.localeCompare(right));
}

function syncLegacyPlanFields(day) {
    day.planATimeline = day.plans.A;
    if (Array.isArray(day.plans.B)) {
        day.planBTimeline = day.plans.B;
    } else {
        delete day.planBTimeline;
    }
}

export function cloneTimelineItems(items = []) {
    try {
        return structuredClone(items);
    } catch (error) {
        return JSON.parse(JSON.stringify(items));
    }
}

export function ensureDayPlanBranchState(day) {
    if (!day || typeof day !== 'object') return;

    if (!Array.isArray(day.timeline)) {
        day.timeline = [];
    }

    const normalizedPlans = {};
    const rawPlans = (day.plans && typeof day.plans === 'object' && !Array.isArray(day.plans)) ? day.plans : {};

    Object.entries(rawPlans).forEach(([rawCode, rawTimeline]) => {
        const code = normalizePlanCode(rawCode);
        if (!code || normalizedPlans[code]) return;
        normalizedPlans[code] = Array.isArray(rawTimeline) ? rawTimeline : [];
    });

    if (!normalizedPlans.A) {
        if (Array.isArray(day.planATimeline)) {
            normalizedPlans.A = day.planATimeline;
        } else {
            normalizedPlans.A = day.timeline;
        }
    }

    if (!normalizedPlans.B && Array.isArray(day.planBTimeline)) {
        normalizedPlans.B = day.planBTimeline;
    }

    day.plans = normalizedPlans;

    const activePlan = normalizePlanCode(day.activePlan);
    if (!activePlan || !Array.isArray(day.plans[activePlan])) {
        day.activePlan = 'A';
    } else {
        day.activePlan = activePlan;
    }

    day.timeline = day.plans[day.activePlan];
    syncLegacyPlanFields(day);
}

export function getDayPlanCodes(day) {
    ensureDayPlanBranchState(day);
    return getSortedPlanCodes(day?.plans || {});
}

export function getDayActivePlan(day) {
    ensureDayPlanBranchState(day);
    return normalizePlanCode(day?.activePlan) || 'A';
}

export function hasDayAlternativePlans(day) {
    return getDayPlanCodes(day).length > 1;
}

export function getDayTimeline(day, planCode = null) {
    ensureDayPlanBranchState(day);

    const requestedCode = normalizePlanCode(planCode);
    if (requestedCode && Array.isArray(day.plans[requestedCode])) {
        return day.plans[requestedCode];
    }

    return day.timeline;
}

export function switchDayPlan(day, planCode = 'A') {
    ensureDayPlanBranchState(day);

    const requestedCode = normalizePlanCode(planCode);
    day.activePlan = (requestedCode && Array.isArray(day.plans[requestedCode])) ? requestedCode : 'A';
    day.timeline = day.plans[day.activePlan];
    syncLegacyPlanFields(day);
    return day.activePlan;
}

export function getNextPlanCode(day) {
    ensureDayPlanBranchState(day);
    const usedCodes = new Set(getDayPlanCodes(day));

    for (let code = 'B'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code += 1) {
        const nextCode = String.fromCharCode(code);
        if (!usedCodes.has(nextCode)) return nextCode;
    }

    return null;
}

export function createDayPlanBranch(day, sourcePlanCode = null, targetPlanCode = null) {
    ensureDayPlanBranchState(day);

    const requestedSourceCode = normalizePlanCode(sourcePlanCode);
    const sourceCode = (requestedSourceCode && Array.isArray(day.plans[requestedSourceCode]))
        ? requestedSourceCode
        : getDayActivePlan(day);

    const requestedTargetCode = normalizePlanCode(targetPlanCode);
    let nextCode = requestedTargetCode;

    if (!nextCode) {
        nextCode = getNextPlanCode(day);
    }

    if (!nextCode || Array.isArray(day.plans[nextCode])) {
        return null;
    }

    day.plans[nextCode] = cloneTimelineItems(day.plans[sourceCode] || []);
    switchDayPlan(day, nextCode);
    return nextCode;
}

export function deleteDayPlanBranch(day, planCode) {
    ensureDayPlanBranchState(day);

    const code = normalizePlanCode(planCode);
    if (!code || !Array.isArray(day.plans[code])) {
        return false;
    }

    const planCodes = getDayPlanCodes(day);
    if (planCodes.length <= 1) {
        day.plans.A = [];
        day.activePlan = 'A';
        day.timeline = day.plans.A;
        syncLegacyPlanFields(day);
        return true;
    }

    if (code === 'A') {
        const replacementCode = planCodes.find((candidate) => candidate !== 'A');
        if (!replacementCode || !Array.isArray(day.plans[replacementCode])) {
            return false;
        }

        const replacementTimeline = day.plans[replacementCode];
        delete day.plans[replacementCode];
        day.plans.A = replacementTimeline;

        if (day.activePlan === 'A' || day.activePlan === replacementCode) {
            day.activePlan = 'A';
        } else if (!Array.isArray(day.plans[day.activePlan])) {
            day.activePlan = 'A';
        }

        day.timeline = day.plans[day.activePlan] || day.plans.A;
        syncLegacyPlanFields(day);
        return true;
    }

    delete day.plans[code];

    if (day.activePlan === code || !Array.isArray(day.plans[day.activePlan])) {
        day.activePlan = 'A';
    }

    day.timeline = day.plans[day.activePlan] || day.plans.A;
    syncLegacyPlanFields(day);
    return true;
}
