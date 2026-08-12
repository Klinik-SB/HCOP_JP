import {
  OncologyRepositoriesApiFailure,
  RepositoryValidationIssue,
  SecureConnectorState,
  TrialScreeningMode,
  TrialScreeningSettingsDraft,
  TrialSourceAccessType,
  TrialSourceConnector,
  TrialSourceDefinition,
  TrialSourceDraft,
  TrialSourceItem,
  TrialSourceSyncPolicy
} from './oncology-repositories.models';

type JsonRecord = Record<string, unknown>;

interface ConnectorPreset {
  readonly label: string;
  readonly accessType: TrialSourceAccessType;
  readonly endpointUrl: string;
  readonly automationCapable: boolean;
  readonly realtimeCapable: boolean;
  readonly secureConnectorState: SecureConnectorState;
  readonly attribution: string;
  readonly termsUrl: string;
}

const CONNECTORS: Readonly<Record<TrialSourceConnector, ConnectorPreset>> = Object.freeze({
  'clinicaltrials-gov': {
    label: 'ClinicalTrials.gov', accessType: 'api', endpointUrl: 'https://clinicaltrials.gov/api/v2',
    automationCapable: true, realtimeCapable: true, secureConnectorState: 'not-required',
    attribution: 'ClinicalTrials.gov · U.S. National Library of Medicine',
    termsUrl: 'https://clinicaltrials.gov/about-site/terms-conditions'
  },
  nci: {
    label: 'NCI Clinical Trials', accessType: 'api', endpointUrl: 'https://clinicaltrialsapi.cancer.gov/api/v2',
    automationCapable: false, realtimeCapable: false, secureConnectorState: 'pending',
    attribution: 'National Cancer Institute (NCI)',
    termsUrl: 'https://www.cancer.gov/policies/copyright-reuse'
  },
  'who-ictrp': {
    label: 'WHO ICTRP', accessType: 'file', endpointUrl: 'https://www.who.int/tools/clinical-trials-registry-platform',
    automationCapable: false, realtimeCapable: false, secureConnectorState: 'not-required',
    attribution: 'World Health Organization · ICTRP',
    termsUrl: 'https://www.who.int/tools/clinical-trials-registry-platform/network/who-data-set/downloading-records-from-the-ictrp-database'
  },
  'eu-ctis': {
    label: 'EU CTIS', accessType: 'portal', endpointUrl: 'https://euclinicaltrials.eu/search-for-clinical-trials/',
    automationCapable: false, realtimeCapable: false, secureConnectorState: 'not-required',
    attribution: 'European Medicines Agency · CTIS',
    termsUrl: 'https://www.ema.europa.eu/en/about-us/about-website/legal-notice'
  },
  anmat: {
    label: 'ANMAT · Estudios de farmacología clínica', accessType: 'file',
    endpointUrl: 'https://www.argentina.gob.ar/anmat/regulados/base-de-datos-estudios-de-farmacologia-clinica',
    automationCapable: false, realtimeCapable: false, secureConnectorState: 'not-required',
    attribution: 'Administración Nacional de Medicamentos, Alimentos y Tecnología Médica · Argentina',
    termsUrl: 'https://www.argentina.gob.ar/terminos-y-condiciones'
  },
  renis: {
    label: 'RENIS', accessType: 'portal',
    endpointUrl: 'https://www.argentina.gob.ar/salud/epidemiologia/registro-nacional-investigaciones-salud-renis',
    automationCapable: false, realtimeCapable: false, secureConnectorState: 'not-required',
    attribution: 'Registro Nacional de Investigaciones en Salud · Argentina',
    termsUrl: 'https://www.argentina.gob.ar/terminos-y-condiciones'
  }
});

const CONNECTOR_VALUES = Object.freeze(Object.keys(CONNECTORS) as TrialSourceConnector[]);
const ACCESS_TYPES: readonly TrialSourceAccessType[] = Object.freeze(['api', 'portal', 'file']);
const SCREENING_MODES: readonly TrialScreeningMode[] = Object.freeze(['manual', 'scheduled', 'realtime']);
const SOURCE_POLICIES: readonly TrialSourceSyncPolicy[] = Object.freeze(['manual', 'scheduled']);
const SECURE_STATES: readonly SecureConnectorState[] = Object.freeze(['not-required', 'pending', 'managed']);
const DEFAULT_TRIGGERS = Object.freeze(['diagnosis', 'staging', 'pathology', 'biomarkers', 'treatment']);

export function normalizeTrialSourceCatalog(payload: unknown): readonly TrialSourceItem[] {
  return array(record(payload)['items'])
    .map(normalizeTrialSourceItem)
    .filter((item): item is TrialSourceItem => Boolean(item))
    .sort((left, right) => Number(right.active) - Number(left.active) || compare(left.name, right.name));
}

export function normalizeTrialSourceMutation(payload: unknown): TrialSourceItem {
  const item = normalizeTrialSourceItem(record(payload)['item']);
  if (!item) throw new Error('La fuente guardada no tiene un formato utilizable.');
  return item;
}

export function normalizeTrialScreeningSettings(payload: unknown): TrialScreeningSettingsDraft {
  const items = array(record(payload)['items']).map(record);
  const item = items.find((candidate) => text(candidate['key']) === 'trial-screening:default') ?? items[0] ?? {};
  const definition = record(item['definition']);
  const mode = enumValue(text(definition['mode']), SCREENING_MODES, 'manual');
  return {
    id: text(item['id']),
    revision: nullableInteger(item['revision']),
    enabled: boolean(definition['enabled']) ?? true,
    mode,
    intervalHours: boundedInteger(definition['intervalHours'], 1, 168, 24),
    cooldownHours: boundedInteger(definition['cooldownHours'], 1, 720, 24),
    maxQuestionsPerModal: boundedInteger(definition['maxQuestionsPerModal'], 1, 3, 3),
    snoozeHours: boundedInteger(definition['snoozeHours'], 1, 720, 24),
    localEvaluationOnly: true,
    triggerFields: uniqueList(definition['triggerFields']).length
      ? uniqueList(definition['triggerFields'])
      : DEFAULT_TRIGGERS
  };
}

export function normalizeTrialScreeningMutation(payload: unknown): TrialScreeningSettingsDraft {
  return normalizeTrialScreeningSettings({ items: [record(payload)['item']] });
}

export function blankTrialSourceDraft(connector: TrialSourceConnector = 'clinicaltrials-gov'): TrialSourceDraft {
  const preset = CONNECTORS[connector];
  return {
    id: '', key: '', revision: null, name: preset.label, active: connector !== 'nci', connector,
    accessType: preset.accessType, endpointUrl: preset.endpointUrl, countries: '',
    recruitmentStatuses: 'Recruiting; Not yet recruiting; Active, not recruiting', phases: '',
    syncPolicy: preset.automationCapable ? 'scheduled' : 'manual', syncIntervalHours: 24,
    automationCapable: preset.automationCapable, realtimeCapable: preset.realtimeCapable,
    secureConnectorState: preset.secureConnectorState, attribution: preset.attribution,
    termsUrl: preset.termsUrl, notes: ''
  };
}

export function trialSourceDraftFromItem(item: TrialSourceItem): TrialSourceDraft {
  const definition = item.definition;
  return {
    id: item.id, key: item.key, revision: item.revision, name: item.name, active: item.active,
    connector: definition.connector, accessType: definition.accessType, endpointUrl: definition.endpointUrl,
    countries: definition.countries.join(', '), recruitmentStatuses: definition.recruitmentStatuses.join('; '),
    phases: definition.phases.join(', '), syncPolicy: definition.syncPolicy,
    syncIntervalHours: definition.syncIntervalHours, automationCapable: definition.automationCapable,
    realtimeCapable: definition.realtimeCapable, secureConnectorState: definition.secureConnectorState,
    attribution: definition.attribution, termsUrl: definition.termsUrl, notes: definition.notes
  };
}

export function applyTrialSourceConnector(
  draft: TrialSourceDraft,
  connector: TrialSourceConnector,
  replaceName = false
): TrialSourceDraft {
  const preset = CONNECTORS[connector];
  return {
    ...draft,
    connector,
    active: draft.id ? draft.active : connector !== 'nci',
    name: replaceName || !draft.name.trim() ? preset.label : draft.name,
    accessType: preset.accessType,
    endpointUrl: preset.endpointUrl,
    automationCapable: preset.automationCapable,
    realtimeCapable: preset.realtimeCapable,
    secureConnectorState: preset.secureConnectorState,
    syncPolicy: preset.automationCapable ? draft.syncPolicy : 'manual',
    attribution: preset.attribution,
    termsUrl: preset.termsUrl
  };
}

export function trialSourcePayload(draft: TrialSourceDraft, active = draft.active): JsonRecord {
  return {
    key: draft.key || `trial-source:${slug(draft.name)}`,
    name: draft.name.trim(),
    description: draft.notes.trim(),
    active,
    ...(draft.revision === null ? {} : { expectedRevision: draft.revision }),
    definition: {
      schemaVersion: 1,
      connector: draft.connector,
      accessType: draft.accessType,
      endpointUrl: draft.endpointUrl.trim(),
      countries: commaList(draft.countries),
      recruitmentStatuses: semicolonList(draft.recruitmentStatuses),
      phases: commaList(draft.phases),
      syncPolicy: draft.syncPolicy,
      syncIntervalHours: boundedInteger(draft.syncIntervalHours, 1, 168, 24),
      automationCapable: draft.automationCapable,
      realtimeCapable: draft.realtimeCapable,
      secureConnectorState: draft.secureConnectorState,
      attribution: draft.attribution.trim(),
      termsUrl: draft.termsUrl.trim(),
      notes: draft.notes.trim()
    }
  };
}

export function trialScreeningSettingsPayload(draft: TrialScreeningSettingsDraft): JsonRecord {
  return {
    key: 'trial-screening:default',
    name: 'Preselección de protocolos oncológicos',
    description: 'Política institucional para evaluar coincidencias y solicitar datos faltantes.',
    active: true,
    ...(draft.revision === null ? {} : { expectedRevision: draft.revision }),
    definition: {
      schemaVersion: 1,
      enabled: draft.enabled,
      mode: draft.mode,
      intervalHours: boundedInteger(draft.intervalHours, 1, 168, 24),
      cooldownHours: boundedInteger(draft.cooldownHours, 1, 720, 24),
      maxQuestionsPerModal: boundedInteger(draft.maxQuestionsPerModal, 1, 3, 3),
      snoozeHours: boundedInteger(draft.snoozeHours, 1, 720, 24),
      localEvaluationOnly: true,
      triggerFields: [...draft.triggerFields]
    }
  };
}

export function validateTrialSourceDraft(draft: TrialSourceDraft): readonly RepositoryValidationIssue[] {
  const issues: RepositoryValidationIssue[] = [];
  if (!draft.name.trim()) issues.push(issue('name', 'Escriba el nombre de la fuente.'));
  if (draft.name.trim().length > 500) issues.push(issue('name', 'El nombre no puede superar 500 caracteres.'));
  if (draft.active && !isHttpsUrl(draft.endpointUrl)) {
    issues.push(issue('endpointUrl', 'La fuente activa necesita una dirección oficial que comience con https://.'));
  }
  if (draft.active && !draft.attribution.trim()) {
    issues.push(issue('attribution', 'Indique cómo debe atribuirse la fuente.'));
  }
  if (draft.termsUrl.trim() && !isHttpsUrl(draft.termsUrl)) {
    issues.push(issue('termsUrl', 'El enlace de términos debe comenzar con https://.'));
  }
  if (draft.connector === 'nci' && draft.secureConnectorState !== 'managed'
      && (draft.active || draft.syncPolicy === 'scheduled' || draft.automationCapable || draft.realtimeCapable)) {
    issues.push(issue(
      'connector',
      'NCI debe permanecer inactivo y sin automatización hasta disponer del conector seguro.'
    ));
  }
  if (draft.syncPolicy === 'scheduled' && !draft.automationCapable) {
    issues.push(issue('syncPolicy', 'Esta fuente no está marcada como apta para actualización programada.'));
  }
  if (!Number.isInteger(Number(draft.syncIntervalHours)) || Number(draft.syncIntervalHours) < 1
      || Number(draft.syncIntervalHours) > 168) {
    issues.push(issue('syncIntervalHours', 'El intervalo debe estar entre 1 y 168 horas.'));
  }
  return issues;
}

export function validateTrialScreeningSettings(
  draft: TrialScreeningSettingsDraft
): readonly RepositoryValidationIssue[] {
  const issues: RepositoryValidationIssue[] = [];
  if (!SCREENING_MODES.includes(draft.mode)) issues.push(issue('mode', 'Seleccione una política de evaluación válida.'));
  if (!Number.isInteger(Number(draft.intervalHours)) || Number(draft.intervalHours) < 1
      || Number(draft.intervalHours) > 168) {
    issues.push(issue('intervalHours', 'La evaluación programada debe repetirse entre 1 y 168 horas.'));
  }
  if (!Number.isInteger(Number(draft.cooldownHours)) || Number(draft.cooldownHours) < 1
      || Number(draft.cooldownHours) > 720) {
    issues.push(issue('cooldownHours', 'El descanso entre avisos debe estar entre 1 y 720 horas.'));
  }
  if (!Number.isInteger(Number(draft.maxQuestionsPerModal)) || Number(draft.maxQuestionsPerModal) < 1
      || Number(draft.maxQuestionsPerModal) > 3) {
    issues.push(issue('maxQuestionsPerModal', 'El modal puede mostrar entre 1 y 3 preguntas.'));
  }
  if (!Number.isInteger(Number(draft.snoozeHours)) || Number(draft.snoozeHours) < 1
      || Number(draft.snoozeHours) > 720) {
    issues.push(issue('snoozeHours', 'Recordar después debe estar entre 1 y 720 horas.'));
  }
  return issues;
}

export function trialSourceDraftSnapshot(draft: TrialSourceDraft | null): string {
  if (!draft) return '';
  return stableJson({ id: draft.id, ...trialSourcePayload(draft) });
}

export function trialScreeningDraftSnapshot(draft: TrialScreeningSettingsDraft): string {
  return stableJson(trialScreeningSettingsPayload(draft));
}

export function trialSourceTypeLabel(value: TrialSourceAccessType): string {
  return value === 'api' ? 'API' : value === 'file' ? 'Archivo' : 'Portal';
}

export function trialSourceConnectorLabel(value: TrialSourceConnector): string {
  return CONNECTORS[value].label;
}

export function trialSourceAutomationReady(source: TrialSourceItem | TrialSourceDraft): boolean {
  return 'automationCapable' in source
    ? source.automationCapable && source.secureConnectorState !== 'pending'
    : source.definition.automationCapable && source.definition.secureConnectorState !== 'pending';
}

export function trialSourceRealtimeReady(source: TrialSourceItem | TrialSourceDraft): boolean {
  return 'realtimeCapable' in source
    ? source.realtimeCapable && source.secureConnectorState !== 'pending'
    : source.definition.realtimeCapable && source.definition.secureConnectorState !== 'pending';
}

export function normalizeOncologyRepositoriesFailure(
  failure: unknown,
  fallback: string
): OncologyRepositoriesApiFailure {
  if (isApiFailure(failure)) return failure;
  const candidate = failure as { status?: unknown; message?: unknown; error?: unknown } | null;
  const body = record(candidate?.error);
  return {
    status: nullableInteger(candidate?.status) ?? nullableInteger(body['status']) ?? 0,
    code: text(body['code']) || text(body['errorCode']) || 'TRIAL_REPOSITORY_REQUEST_FAILED',
    message: text(body['error']) || text(body['message']) || text(candidate?.message) || fallback
  };
}

function normalizeTrialSourceItem(value: unknown): TrialSourceItem | null {
  const item = record(value);
  const definition = record(item['definition']);
  const connector = enumValue(text(definition['connector']), CONNECTOR_VALUES, inferConnector(definition));
  const preset = CONNECTORS[connector];
  const automationCapable = boolean(definition['automationCapable']) ?? preset.automationCapable;
  const secureConnectorState = connector === 'nci'
    ? 'pending'
    : enumValue(text(definition['secureConnectorState']), SECURE_STATES, preset.secureConnectorState);
  const requestedPolicy = enumValue(text(definition['syncPolicy']), SOURCE_POLICIES, 'manual');
  const id = text(item['id']);
  const name = text(item['name']) || text(item['displayName']);
  if (!id || !name) return null;
  return {
    id,
    kind: 'trial-source',
    key: text(item['key']),
    name,
    description: text(item['description']),
    active: connector === 'nci' && secureConnectorState === 'pending'
      ? false
      : boolean(item['active']) ?? true,
    revision: nullableInteger(item['revision']) ?? 0,
    definition: {
      schemaVersion: nullableInteger(definition['schemaVersion']) ?? 1,
      connector,
      accessType: enumValue(text(definition['accessType']), ACCESS_TYPES, preset.accessType),
      endpointUrl: text(definition['endpointUrl']) || text(definition['url']) || preset.endpointUrl,
      countries: uniqueList(definition['countries']),
      recruitmentStatuses: uniqueList(definition['recruitmentStatuses']),
      phases: uniqueList(definition['phases']),
      syncPolicy: requestedPolicy === 'scheduled' && automationCapable && secureConnectorState !== 'pending'
        ? 'scheduled'
        : 'manual',
      syncIntervalHours: boundedInteger(definition['syncIntervalHours'], 1, 168, 24),
      automationCapable,
      realtimeCapable: boolean(definition['realtimeCapable']) ?? preset.realtimeCapable,
      secureConnectorState,
      attribution: text(definition['attribution']) || preset.attribution,
      termsUrl: text(definition['termsUrl']) || preset.termsUrl,
      notes: text(definition['notes']) || text(item['description'])
    },
    createdAt: text(item['createdAt']),
    updatedAt: text(item['updatedAt'])
  };
}

function inferConnector(definition: JsonRecord): TrialSourceConnector {
  const endpoint = text(definition['endpointUrl']) || text(definition['url']);
  if (endpoint.includes('clinicaltrialsapi.cancer.gov')) return 'nci';
  if (endpoint.includes('who.int')) return 'who-ictrp';
  if (endpoint.includes('euclinicaltrials.eu')) return 'eu-ctis';
  if (endpoint.includes('anmat')) return 'anmat';
  if (endpoint.includes('renis')) return 'renis';
  return 'clinicaltrials-gov';
}

function issue(path: string, message: string): RepositoryValidationIssue { return { path, message }; }
function isApiFailure(value: unknown): value is OncologyRepositoriesApiFailure {
  const candidate = record(value);
  return Number.isFinite(Number(candidate['status'])) && Boolean(text(candidate['message']));
}
function isHttpsUrl(value: string): boolean {
  try { return new URL(value.trim()).protocol === 'https:'; } catch { return false; }
}
function commaList(value: string): readonly string[] {
  return [...new Set(value.split(/[;,\n]+/).map((item) => item.trim()).filter(Boolean))];
}
function semicolonList(value: string): readonly string[] {
  return [...new Set(value.split(/[;\n]+/).map((item) => item.trim()).filter(Boolean))];
}
function uniqueList(value: unknown): readonly string[] {
  return [...new Set(array(value).map(text).filter(Boolean))];
}
function slug(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'fuente';
}
function stableJson(value: unknown): string { return JSON.stringify(stableValue(value)); }
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value as JsonRecord).sort()
    .map((key) => [key, stableValue((value as JsonRecord)[key])]));
}
function compare(left: string, right: string): number {
  return left.localeCompare(right, 'es-AR', { sensitivity: 'base', numeric: true });
}
function enumValue<T extends string>(value: string, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? value as T : fallback;
}
function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}
function nullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}
function boolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}
function array(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : []; }
function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}
