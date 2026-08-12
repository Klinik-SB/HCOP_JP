export type TrialScreeningMode = 'manual' | 'scheduled' | 'realtime';

export interface TrialScreeningPreferenceState {
  ok: boolean;
  researchActive: boolean;
  institutionalEnabled: boolean;
  mode: TrialScreeningMode;
  proactiveActive: boolean;
  effective: boolean;
  revision: number;
  engineReady: boolean;
}

export interface TrialScreeningPreferenceUpdate {
  researchActive: boolean;
  expectedRevision: number;
}

const MODES = new Set<TrialScreeningMode>(['manual', 'scheduled', 'realtime']);

export function normalizeTrialScreeningPreference(payload: unknown): TrialScreeningPreferenceState {
  const source = isRecord(payload) ? payload : {};
  const mode = typeof source['mode'] === 'string' && MODES.has(source['mode'] as TrialScreeningMode)
    ? source['mode'] as TrialScreeningMode
    : 'manual';
  const researchActive = source['researchActive'] === true;
  const institutionalEnabled = source['institutionalEnabled'] === true;
  const engineReady = source['engineReady'] === true;
  const proactiveAllowed = researchActive && institutionalEnabled && mode !== 'manual';
  const proactiveActive = source['proactiveActive'] === true && proactiveAllowed;
  const revision = Number(source['revision']);

  return {
    ok: source['ok'] === true,
    researchActive,
    institutionalEnabled,
    mode,
    proactiveActive,
    effective: source['effective'] === true && proactiveActive && engineReady,
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
    engineReady
  };
}

export function withResearchActive(
  current: TrialScreeningPreferenceState,
  researchActive: boolean
): TrialScreeningPreferenceState {
  const proactiveActive = researchActive
    && current.institutionalEnabled
    && current.mode !== 'manual';
  return {
    ...current,
    researchActive,
    proactiveActive,
    effective: proactiveActive && current.engineReady
  };
}

export function trialScreeningPreferenceUpdate(
  researchActive: boolean,
  expectedRevision: number
): TrialScreeningPreferenceUpdate {
  return { researchActive, expectedRevision };
}

export function isTrialScreeningVersionConflict(error: unknown): boolean {
  return isRecord(error) && Number(error['status']) === 409;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
