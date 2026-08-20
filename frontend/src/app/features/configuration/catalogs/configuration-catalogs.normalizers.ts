import {
  ConfigurationApiFailure,
  DiagnosisCatalogResult,
  DiagnosisConcept,
  DiagnosisDisplaySetting,
  DiagnosisEquivalenceDraft,
  DiagnosisEquivalenceItem,
  DiagnosisSystem,
  DIAGNOSIS_SYSTEMS,
  GuideDraft,
  GuideItem,
  StudyTemplateDraft,
  StudyTemplateItem
} from './configuration-catalogs.models';

type JsonRecord = Record<string, unknown>;

export function normalizeGuideCatalog(payload: unknown): readonly GuideItem[] {
  return array(record(payload)['guides'])
    .map(normalizeGuide)
    .filter((item) => Boolean(item.name && item.title))
    .sort((left, right) => compare(left.title, right.title));
}

export function normalizeStudyTemplateCatalog(payload: unknown): readonly StudyTemplateItem[] {
  return array(record(payload)['templates'])
    .map(normalizeStudyTemplate)
    .filter((item) => Boolean(item.id && item.title))
    .sort((left, right) => compare(left.category, right.category) || compare(left.title, right.title));
}

export function normalizeDiagnosisEquivalences(payload: unknown): readonly DiagnosisEquivalenceItem[] {
  return array(record(payload)['items'])
    .map(normalizeDiagnosisEquivalence)
    .filter((item) => Boolean(item.id && item.name))
    .sort((left, right) => compare(left.name, right.name));
}

export function normalizeDiagnosisDisplaySetting(payload: unknown): DiagnosisDisplaySetting {
  const items = array(record(payload)['items']).map(record);
  const selected = items.find((item) => text(item['key']) === 'diagnosis-display') ?? items[0] ?? {};
  const definition = record(selected['definition']);
  const visibleSystems = array(definition['visibleSystems'])
    .map(text)
    .filter((value): value is DiagnosisSystem => isDiagnosisSystem(value));
  return {
    id: text(selected['id']),
    revision: integer(selected['revision']),
    visibleSystems: visibleSystems.length ? [...new Set(visibleSystems)] : [...DIAGNOSIS_SYSTEMS]
  };
}

export function normalizeDiagnosisCatalogResults(payload: unknown): readonly DiagnosisCatalogResult[] {
  const root = record(payload);
  return array(root['items'])
    .map((value): DiagnosisCatalogResult => {
      const item = record(value);
      return {
        code: firstText(item, ['code', 'id']),
        display: firstText(item, ['display', 'name', 'term']),
        group: text(item['group']),
        version: text(item['version']) || text(root['version']) || text(root['edition']),
        source: text(item['source']) || text(root['source']),
        sourceConceptId: text(item['sourceConceptId'])
      };
    })
    .filter((item) => Boolean(item.code && item.display));
}

export function emptyDiagnosisConcept(): DiagnosisConcept {
  return { code: '', display: '', version: '', source: '', sourceConceptId: '' };
}

export function blankDiagnosisEquivalence(): DiagnosisEquivalenceDraft {
  return {
    name: '',
    active: true,
    relation: 'exact',
    confidence: 'medium',
    notes: '',
    snomed: emptyDiagnosisConcept(),
    cie10: emptyDiagnosisConcept(),
    ajcc: emptyDiagnosisConcept()
  };
}

export function guideDraftFromItem(item: GuideItem): GuideDraft {
  return {
    title: item.title,
    category: item.site,
    audience: item.audience,
    source: item.source,
    version: item.version,
    tags: item.tags.join(', '),
    description: item.description,
    active: item.active
  };
}

export function studyTemplateDraftFromItem(item: StudyTemplateItem): StudyTemplateDraft {
  return {
    title: item.title,
    category: item.category,
    tags: item.tags.join(', '),
    author: item.author,
    attribution: item.attribution,
    sourceUrl: item.sourceUrl,
    license: item.license,
    licenseUrl: item.licenseUrl,
    description: item.description,
    rightsConfirmed: item.origin === 'bundled' || item.rightsConfirmed,
    active: item.active
  };
}

export function diagnosisDraftFromItem(item: DiagnosisEquivalenceItem): DiagnosisEquivalenceDraft {
  return {
    name: item.name,
    active: item.active,
    relation: item.definition.relation,
    confidence: item.definition.confidence,
    notes: item.definition.notes || item.description,
    snomed: { ...item.definition.snomed },
    cie10: { ...item.definition.cie10 },
    ajcc: { ...item.definition.ajcc }
  };
}

export function buildGuidePayload(item: GuideItem, draft: GuideDraft, active = draft.active): JsonRecord {
  return {
    key: `guide:${slug(item.name)}`,
    name: draft.title.trim(),
    description: draft.description.trim(),
    active,
    ...(item.configurationRevision !== null ? { expectedRevision: item.configurationRevision } : {}),
    definition: {
      fileName: item.name,
      category: draft.category.trim(),
      audience: draft.audience.trim(),
      source: draft.source.trim(),
      version: draft.version.trim(),
      tags: commaList(draft.tags)
    }
  };
}

export function buildStudyTemplatePayload(
  item: StudyTemplateItem,
  draft: StudyTemplateDraft,
  active = draft.active
): JsonRecord {
  return {
    key: item.configurationKey || `study-template:${slug(draft.title)}`,
    name: draft.title.trim(),
    description: draft.description.trim(),
    active,
    ...(item.revision !== null ? { expectedRevision: item.revision } : {}),
    definition: {
      ...item.definition,
      title: draft.title.trim(),
      category: draft.category.trim(),
      tags: commaList(draft.tags),
      author: draft.author.trim(),
      attribution: draft.attribution.trim(),
      sourceUrl: draft.sourceUrl.trim(),
      license: draft.license.trim(),
      licenseUrl: draft.licenseUrl.trim(),
      description: draft.description.trim(),
      fileName: text(item.definition['fileName']) || item.originalFileName,
      fileUrl: text(item.definition['fileUrl']) || item.fileUrl,
      thumbnailUrl: text(item.definition['thumbnailUrl']) || item.thumbnailUrl,
      sha256: text(item.definition['sha256']) || item.sha256,
      mime: text(item.definition['mime']) || item.mime,
      bytes: integer(item.definition['bytes']) ?? item.bytes,
      originalFileName: text(item.definition['originalFileName']) || item.originalFileName,
      rightsConfirmed: draft.rightsConfirmed
    }
  };
}

export function buildDiagnosisEquivalencePayload(
  draft: DiagnosisEquivalenceDraft,
  revision: number | null,
  active = draft.active
): JsonRecord {
  const notes = draft.notes.trim();
  return {
    name: draft.name.trim(),
    description: notes,
    active,
    ...(revision !== null ? { expectedRevision: revision } : {}),
    definition: {
      schemaVersion: 1,
      snomed: cleanConcept(draft.snomed, true),
      cie10: cleanConcept(draft.cie10, true),
      ajcc: cleanConcept(draft.ajcc, false),
      relation: draft.relation,
      confidence: draft.confidence,
      notes
    }
  };
}

export function buildDiagnosisDisplayPayload(setting: DiagnosisDisplaySetting, systems: readonly DiagnosisSystem[]): JsonRecord {
  return {
    key: 'diagnosis-display',
    name: 'diagnosis-display',
    active: true,
    ...(setting.revision !== null ? { expectedRevision: setting.revision } : {}),
    definition: { schemaVersion: 1, visibleSystems: systems }
  };
}

export function validateGuideDraft(draft: GuideDraft): readonly string[] {
  const issues: string[] = [];
  if (!draft.title.trim()) issues.push('Escriba el título de la guía.');
  if (draft.title.trim().length > 500) issues.push('El título no puede superar 500 caracteres.');
  return issues;
}

export function validateStudyTemplateDraft(draft: StudyTemplateDraft, isNew: boolean): readonly string[] {
  const issues: string[] = [];
  if (!draft.title.trim()) issues.push('Escriba el título de la plantilla.');
  if (!draft.category.trim()) issues.push('Seleccione una categoría.');
  if (!draft.author.trim()) issues.push('Indique el autor o la institución.');
  if (!draft.license.trim()) issues.push('Indique la licencia de uso.');
  if (!draft.rightsConfirmed) issues.push('Confirme que la institución puede utilizar esta imagen.');
  if (draft.sourceUrl.trim() && !isHttpsUrl(draft.sourceUrl)) issues.push('La fuente debe comenzar con https://.');
  if (draft.licenseUrl.trim() && !isHttpsUrl(draft.licenseUrl)) issues.push('El enlace de licencia debe comenzar con https://.');
  if (isNew && !draft.active) issues.push('Las plantillas nuevas se incorporan activas.');
  return issues;
}

export function validateDiagnosisEquivalenceDraft(draft: DiagnosisEquivalenceDraft): readonly string[] {
  const issues: string[] = [];
  if (!draft.name.trim()) issues.push('Escriba el nombre de la equivalencia.');
  const required: readonly DiagnosisSystem[] = draft.active ? DIAGNOSIS_SYSTEMS : ['ajcc'];
  for (const system of required) {
    const concept = draft[system];
    if (!concept.code.trim() || !concept.display.trim()) {
      issues.push(system === 'ajcc'
        ? 'AJCC necesita código y descripción incluso en un borrador.'
        : `Complete código y descripción de ${system === 'snomed' ? 'SNOMED CT' : 'CIE-10'}, o guarde la equivalencia desactivada como borrador.`);
    }
  }
  return issues;
}

export function normalizeConfigurationFailure(failure: unknown, fallback: string): ConfigurationApiFailure {
  if (isConfigurationFailure(failure)) return failure;
  const candidate = failure as { status?: unknown; message?: unknown; error?: unknown } | null;
  const body = record(candidate?.error);
  const status = integer(candidate?.status) ?? integer(body['status']) ?? 0;
  return {
    status,
    code: firstText(body, ['code', 'errorCode']) || 'CONFIGURATION_REQUEST_FAILED',
    message: firstText(body, ['error', 'message']) || text(candidate?.message) || fallback
  };
}

export function formatBytes(value: number): string {
  const bytes = Math.max(0, value);
  return bytes > 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function templateCategoryLabel(value: string): string {
  const labels: Record<string, string> = {
    'cuerpo-completo': 'Cuerpo completo', ginecologia: 'Ginecología', urologia: 'Urología',
    torax: 'Tórax', abdomen: 'Abdomen', 'cabeza-cuello': 'Cabeza y cuello',
    extremidades: 'Extremidades', 'organos-individuales': 'Órganos individuales'
  };
  return labels[value] || humanize(value || 'Sin categoría');
}

export function templateAvailabilityLabel(reason: string): string {
  const labels: Record<string, string> = {
    descriptor_invalid: 'descriptor inválido', file_missing: 'archivo ausente',
    file_unreadable: 'archivo inaccesible', not_a_file: 'ruta inválida',
    size_mismatch: 'tamaño alterado', hash_mismatch: 'integridad alterada',
    content_invalid: 'imagen dañada'
  };
  return labels[reason] || (reason ? 'archivo no disponible' : '');
}

export function safeLocalAssetUrl(value: string): string {
  const source = value.trim();
  if (!source) return '';
  if (source.startsWith('blob:')) return source;
  try {
    const normalized = source.startsWith('assets/') ? `/${source}` : source;
    const parsed = new URL(normalized, globalThis.location?.origin || 'http://localhost');
    if (globalThis.location?.origin && parsed.origin !== globalThis.location.origin) return '';
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

export function imageMime(file: Pick<File, 'name' | 'type'>): string {
  const allowed = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
  if (allowed.has(file.type)) return file.type;
  const extension = file.name.toLocaleLowerCase('es').split('.').pop() || '';
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' } as Record<string, string>)[extension] || '';
}

export function commaList(value: string): readonly string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function slug(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
    .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
}

function normalizeGuide(value: unknown): GuideItem {
  const item = record(value);
  const name = text(item['name']);
  return {
    name,
    title: text(item['title']) || humanize(name.replace(/\.pdf$/i, '')),
    site: text(item['site']) || 'Oncología',
    audience: text(item['audience']) || 'Equipo de salud',
    source: text(item['source']) || 'Biblioteca local',
    version: text(item['version']),
    tags: array(item['tags']).map(text).filter(Boolean),
    description: text(item['description']),
    active: boolean(item['active']) ?? true,
    configurationId: text(item['configurationId']),
    configurationRevision: integer(item['configurationRevision']),
    url: text(item['url']) || (name ? `/api/guides/file?name=${encodeURIComponent(name)}` : ''),
    size: Math.max(0, integer(item['size']) ?? 0),
    updatedAt: text(item['updatedAt'])
  };
}

function normalizeStudyTemplate(value: unknown): StudyTemplateItem {
  const item = record(value);
  const definition = record(item['definition']);
  const origin = firstText(item, ['origin']) === 'bundled' ? 'bundled' : 'custom';
  const configurationId = firstText(item, ['configurationId']);
  const fileUrl = firstTextAcross(item, definition, ['file', 'fileUrl']);
  return {
    id: firstTextAcross(item, definition, ['id']) || (configurationId ? `custom-${configurationId}` : ''),
    configurationId,
    configurationKey: firstTextAcross(item, definition, ['configurationKey', 'key']),
    revision: integer(item['revision']),
    origin,
    title: firstTextAcross(item, definition, ['title', 'name']) || 'Plantilla sin título',
    category: firstTextAcross(item, definition, ['category']),
    tags: firstArrayAcross(item, definition, ['tags']).map(text).filter(Boolean),
    author: firstTextAcross(item, definition, ['author']),
    attribution: firstTextAcross(item, definition, ['attribution']),
    sourceUrl: firstTextAcross(item, definition, ['sourceUrl']),
    license: firstTextAcross(item, definition, ['license']),
    licenseUrl: firstTextAcross(item, definition, ['licenseUrl']),
    description: firstTextAcross(item, definition, ['description']),
    rightsConfirmed: origin === 'bundled' || (boolean(definition['rightsConfirmed']) ?? false),
    active: boolean(item['active']) ?? true,
    available: boolean(item['available']) ?? true,
    availabilityReason: text(item['availabilityReason']),
    fileUrl,
    thumbnailUrl: firstTextAcross(item, definition, ['thumbnail', 'thumbnailUrl']) || fileUrl,
    originalFileName: firstTextAcross(item, definition, ['originalFileName', 'fileName']),
    mime: firstTextAcross(item, definition, ['mime']),
    bytes: Math.max(0, firstIntegerAcross(item, definition, ['bytes']) ?? 0),
    sha256: firstTextAcross(item, definition, ['sha256']),
    definition
  };
}

function normalizeDiagnosisEquivalence(value: unknown): DiagnosisEquivalenceItem {
  const item = record(value);
  const definition = record(item['definition']);
  const relation = text(definition['relation']);
  const confidence = text(definition['confidence']);
  return {
    id: text(item['id']),
    kind: text(item['kind']) || 'diagnosis-equivalence',
    key: text(item['key']),
    name: text(item['name']) || text(item['displayName']),
    description: text(item['description']),
    active: boolean(item['active']) ?? true,
    revision: integer(item['revision']) ?? 0,
    createdAt: text(item['createdAt']),
    updatedAt: text(item['updatedAt']),
    definition: {
      schemaVersion: integer(definition['schemaVersion']) ?? 1,
      snomed: normalizeConcept(definition['snomed']),
      cie10: normalizeConcept(definition['cie10']),
      ajcc: normalizeConcept(definition['ajcc']),
      relation: relation === 'exact' || relation === 'broader' ? relation : 'conditional',
      confidence: confidence === 'high' || confidence === 'low' ? confidence : 'medium',
      notes: text(definition['notes']) || text(item['description'])
    }
  };
}

function normalizeConcept(value: unknown): DiagnosisConcept {
  const concept = record(value);
  return {
    code: text(concept['code']), display: text(concept['display']), version: text(concept['version']),
    source: text(concept['source']), sourceConceptId: text(concept['sourceConceptId'])
  };
}

function cleanConcept(value: DiagnosisConcept, sourceConcept: boolean): JsonRecord {
  return {
    code: value.code.trim(), display: value.display.trim(), version: value.version.trim(), source: value.source.trim(),
    ...(sourceConcept ? { sourceConceptId: value.sourceConceptId.trim() } : {})
  };
}

function isDiagnosisSystem(value: string): value is DiagnosisSystem {
  return DIAGNOSIS_SYSTEMS.some((system) => system === value);
}

function isConfigurationFailure(value: unknown): value is ConfigurationApiFailure {
  const item = record(value);
  return Number.isFinite(Number(item['status'])) && Boolean(text(item['message']));
}

function isHttpsUrl(value: string): boolean {
  try { return new URL(value.trim()).protocol === 'https:'; } catch { return false; }
}

function humanize(value: string): string {
  const normalized = value.replace(/[-_]+/g, ' ').trim();
  return normalized ? normalized.charAt(0).toLocaleUpperCase('es-AR') + normalized.slice(1) : '';
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, 'es-AR', { sensitivity: 'base', numeric: true });
}

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function integer(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function boolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function firstText(item: JsonRecord, keys: readonly string[]): string {
  for (const key of keys) { const value = text(item[key]); if (value) return value; }
  return '';
}

function firstTextAcross(primary: JsonRecord, secondary: JsonRecord, keys: readonly string[]): string {
  return firstText(primary, keys) || firstText(secondary, keys);
}

function firstArrayAcross(primary: JsonRecord, secondary: JsonRecord, keys: readonly string[]): readonly unknown[] {
  for (const key of keys) {
    const value = array(primary[key]); if (value.length) return value;
    const fallback = array(secondary[key]); if (fallback.length) return fallback;
  }
  return [];
}

function firstIntegerAcross(primary: JsonRecord, secondary: JsonRecord, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = integer(primary[key]) ?? integer(secondary[key]); if (value !== null) return value;
  }
  return null;
}
