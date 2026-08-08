import {
  CoirCatalogItem,
  DrugCatalogItem,
  DrugPresentation,
  JsonRecord,
  ProtocolApiFailure,
  ProtocolCatalogItem,
  ProtocolCatalogState,
  ProtocolComponentDraft,
  ProtocolEditorDraft,
  ProtocolPreparationDraft,
  ProtocolValidationIssue,
  SaveProtocolPayload
} from './protocol-configuration.models';

export const DEFAULT_PROTOCOL_CATEGORIES = Object.freeze([
  'Mama',
  'Pulmón',
  'Digestivo',
  'Ginecológico',
  'Urológico',
  'Hematología',
  'Cabeza y cuello',
  'Melanoma y piel',
  'Sarcoma',
  'Sistema nervioso',
  'Mesotelioma',
  'Soporte',
  'Otros'
]);

let clientSequence = 0;

export function normalizeProtocolCatalog(payload: unknown): ProtocolCatalogState {
  const root = record(payload);
  const protocols = array(root['protocols'])
    .map(normalizeProtocolCatalogItem)
    .filter((item) => Boolean(item.id && item.name));
  const customCount = integer(root['currentCount'])
    ?? protocols.filter((item) => !item.catalogOnly && item.active).length;
  const catalogCount = integer(root['catalogCount'])
    ?? protocols.filter((item) => item.catalogOnly).length;
  return {
    protocols,
    currentCount: customCount,
    catalogCount,
    total: integer(root['total']) ?? protocols.length
  };
}

export function normalizeProtocolCatalogItem(value: unknown): ProtocolCatalogItem {
  const item = record(value);
  const definition = record(item['definition']);
  const durationMinutes = firstInteger(item, definition, ['durationMinutes']);
  return {
    id: firstText(item, definition, ['id', 'key', 'coirSchemeId']),
    name: firstText(item, definition, ['name', 'displayName', 'schemeName']),
    category: firstText(item, definition, ['category']) || 'Otros',
    description: firstText(item, definition, ['description']),
    active: firstBoolean(item, definition, ['active']) ?? true,
    catalogOnly: firstBoolean(item, definition, ['catalogOnly']) ?? false,
    componentCount: firstInteger(item, definition, ['componentCount'])
      ?? firstArray(item, definition, ['components']).length,
    cycleDays: firstInteger(item, definition, ['cycleDays']),
    durationMinutes,
    durationText: firstText(item, definition, ['durationText']) || formatMinutes(durationMinutes),
    coirSchemeId: firstText(item, definition, ['coirSchemeId'])
  };
}

export function normalizeProtocolDetail(payload: unknown): ProtocolEditorDraft {
  const root = record(payload);
  const item = Object.keys(record(root['protocol'])).length ? record(root['protocol']) : root;
  const definition = record(item['definition']);
  const summary = normalizeProtocolCatalogItem(item);
  const sharedPreparations = firstArray(item, definition, ['preparations', 'applications', 'instructions']);
  const components = firstArray(item, definition, ['components', 'drugs', 'drogas'])
    .map((component) => normalizeProtocolComponent(component, sharedPreparations));
  const links = array(item['coirLinks']);
  return {
    id: summary.id,
    revision: firstInteger(item, definition, ['revision']),
    name: summary.name,
    category: summary.category === 'COIR sin vincular' ? '' : summary.category,
    description: summary.description,
    cycleDays: summary.cycleDays,
    durationMinutes: summary.durationMinutes,
    coirSchemeId: summary.coirSchemeId || text(record(links[0])['coirSchemeId']),
    active: summary.active,
    catalogOnly: summary.catalogOnly,
    components
  };
}

export function normalizeCoirCatalog(payload: unknown): readonly CoirCatalogItem[] {
  return array(record(payload)['catalog'])
    .map((value): CoirCatalogItem => {
      const item = record(value);
      const durationMinutes = integer(item['durationMinutes']);
      return {
        coirSchemeId: text(item['coirSchemeId']),
        schemeName: text(item['schemeName']),
        cycleDays: integer(item['cycleDays']),
        durationMinutes,
        durationText: text(item['durationText']) || formatMinutes(durationMinutes),
        entryType: text(item['entryType']) || 'treatment'
      };
    })
    .filter((item) => Boolean(item.coirSchemeId && item.schemeName));
}

/**
 * The management endpoint already merges the complete COIR catalog when
 * includeCatalog=1. Reusing that response avoids downloading and waiting for
 * the same catalog a second time before the editor can become interactive.
 */
export function coirCatalogFromProtocols(state: ProtocolCatalogState): readonly CoirCatalogItem[] {
  return state.protocols
    .filter((item) => item.catalogOnly && Boolean(item.coirSchemeId && item.name))
    .map((item): CoirCatalogItem => ({
      coirSchemeId: item.coirSchemeId,
      schemeName: item.name,
      cycleDays: item.cycleDays,
      durationMinutes: item.durationMinutes,
      durationText: item.durationText || formatMinutes(item.durationMinutes),
      entryType: 'treatment'
    }));
}

export function normalizeDrugCatalog(payload: unknown): readonly DrugCatalogItem[] {
  return array(record(payload)['drugs'])
    .map((value): DrugCatalogItem => {
      const item = record(value);
      const id = firstText(item, {}, ['id', 'drugId']);
      const name = firstText(item, {}, ['name', 'nombre', 'genericName']);
      return {
        id,
        name,
        instructions: firstArray(item, {}, ['instructions', 'applications', 'preparations'])
          .map((row) => normalizePreparation(row, id, name)),
        presentations: firstArray(item, {}, ['presentations', 'presentaciones'])
          .map(normalizePresentation)
      };
    })
    .filter((item) => Boolean(item.id && item.name));
}

export function blankProtocol(): ProtocolEditorDraft {
  return {
    id: '',
    revision: null,
    name: '',
    category: '',
    description: '',
    cycleDays: 21,
    durationMinutes: 120,
    coirSchemeId: '',
    active: true,
    catalogOnly: false,
    components: [blankProtocolComponent()]
  };
}

export function blankProtocolComponent(): ProtocolComponentDraft {
  return {
    clientId: createClientId(),
    id: '',
    drugId: '',
    drugName: '',
    day: '1',
    prescribedDoseText: '',
    doseUnit: '',
    doseCalculationMethod: 'Fija',
    route: 'Endovenosa',
    administrationTime: '',
    dayHospital: true,
    preparation: blankPreparation(),
    instructionCount: 0,
    presentationCount: 0
  };
}

export function blankPreparation(): ProtocolPreparationDraft {
  return {
    id: '',
    drugId: '',
    drugName: '',
    presentationReferences: '',
    reconstituent: '',
    concentration: '',
    diluent: '',
    finalVolume: '',
    route: '',
    stabilityRoomTemperature: '',
    stabilityRefrigerated: '',
    laboratory: '',
    photosensitive: false,
    infusionGuide: '',
    preparationObservations: '',
    labelObservations: '',
    dirty: false
  };
}

export function duplicateProtocol(source: ProtocolEditorDraft): ProtocolEditorDraft {
  return {
    ...structuredCloneSafe(source),
    id: '',
    revision: null,
    name: `Copia de ${source.name}`,
    coirSchemeId: '',
    active: true,
    catalogOnly: false,
    components: source.components.map((component) => ({
      ...structuredCloneSafe(component),
      clientId: createClientId(),
      id: ''
    }))
  };
}

export function promoteCatalogProtocol(source: ProtocolEditorDraft): ProtocolEditorDraft {
  return {
    ...structuredCloneSafe(source),
    id: '',
    revision: null,
    active: true,
    catalogOnly: false,
    coirSchemeId: source.coirSchemeId || source.id.replace(/^coir:/i, ''),
    cycleDays: source.cycleDays ?? 21,
    components: (source.components.length ? source.components : [blankProtocolComponent()]).map((component) => ({
      ...structuredCloneSafe(component),
      clientId: createClientId(),
      id: ''
    }))
  };
}

export function buildSaveProtocolPayload(draft: ProtocolEditorDraft): SaveProtocolPayload {
  const preparations = draft.components
    .filter((component) => component.preparation.dirty)
    .map((component) => {
      const preparation = component.preparation;
      return {
        id: preparation.id.trim(),
        drugId: component.drugId.trim(),
        drugName: component.drugName.trim(),
        presentationReferences: preparation.presentationReferences.trim(),
        reconstituent: preparation.reconstituent.trim(),
        concentration: preparation.concentration.trim(),
        diluent: preparation.diluent.trim(),
        finalVolume: preparation.finalVolume.trim(),
        route: preparation.route.trim(),
        stabilityRoomTemperature: preparation.stabilityRoomTemperature.trim(),
        stabilityRefrigerated: preparation.stabilityRefrigerated.trim(),
        laboratory: preparation.laboratory.trim(),
        photosensitive: preparation.photosensitive,
        infusionGuide: preparation.infusionGuide.trim(),
        preparationObservations: preparation.preparationObservations.trim(),
        labelObservations: preparation.labelObservations.trim(),
        ...(preparation.sourcePayload ? { sourcePayload: preparation.sourcePayload } : {})
      };
    });
  return {
    name: draft.name.trim(),
    category: draft.category.trim(),
    description: draft.description.trim(),
    cycleDays: positiveIntegerOrNull(draft.cycleDays),
    durationMinutes: positiveIntegerOrNull(draft.durationMinutes),
    coirSchemeId: draft.coirSchemeId.trim() || null,
    active: draft.active,
    ...(draft.revision !== null ? { revision: draft.revision } : {}),
    components: draft.components.map((component) => ({
      id: component.id.trim(),
      drugId: component.drugId.trim(),
      drugName: component.drugName.trim(),
      day: component.day.trim(),
      prescribedDoseText: component.prescribedDoseText.trim(),
      doseUnit: component.doseUnit.trim(),
      doseCalculationMethod: component.doseCalculationMethod.trim() || 'Fija',
      route: component.route.trim(),
      administrationTime: component.administrationTime.trim(),
      dayHospital: component.dayHospital,
      ...(component.sourcePayload ? { sourcePayload: component.sourcePayload } : {})
    })),
    preparations
  };
}

/**
 * Stable representation of the fields that are actually persisted for a protocol.
 * UI-only identities and read-only COIR catalog entries deliberately do not make a
 * configuration editor appear dirty.
 */
export function protocolDraftSignature(draft: ProtocolEditorDraft | null): string {
  if (!draft || draft.catalogOnly) return '';
  return JSON.stringify(buildSaveProtocolPayload(draft));
}

export function validateProtocolDraft(draft: ProtocolEditorDraft): readonly ProtocolValidationIssue[] {
  const issues: ProtocolValidationIssue[] = [];
  if (draft.catalogOnly) issues.push({ path: 'protocol', message: 'Convierta el registro COIR antes de editarlo.' });
  if (!draft.name.trim()) issues.push({ path: 'name', message: 'Ingrese el nombre del protocolo.' });
  if (draft.name.trim().length > 500) issues.push({ path: 'name', message: 'El nombre no puede superar 500 caracteres.' });
  if (draft.category.trim().length > 120) issues.push({ path: 'category', message: 'El grupo no puede superar 120 caracteres.' });
  if (draft.cycleDays !== null && (!Number.isInteger(Number(draft.cycleDays)) || Number(draft.cycleDays) < 1 || Number(draft.cycleDays) > 365)) {
    issues.push({ path: 'cycleDays', message: 'El ciclo debe estar entre 1 y 365 días.' });
  }
  if (draft.durationMinutes !== null && (!Number.isInteger(Number(draft.durationMinutes)) || Number(draft.durationMinutes) < 1 || Number(draft.durationMinutes) > 1440)) {
    issues.push({ path: 'durationMinutes', message: 'La duración debe estar entre 1 y 1440 minutos.' });
  }
  if (!draft.components.length) issues.push({ path: 'components', message: 'Agregue al menos una droga o componente.' });
  draft.components.forEach((component, index) => {
    const label = `Droga ${index + 1}`;
    if (!component.drugName.trim()) issues.push({ path: `components.${index}.drugName`, message: `${label}: ingrese el nombre.` });
    if (!component.day.trim()) issues.push({ path: `components.${index}.day`, message: `${label}: indique el día o patrón de aplicación.` });
    if (!component.prescribedDoseText.trim()) issues.push({ path: `components.${index}.dose`, message: `${label}: ingrese la dosis base.` });
    if (!component.doseUnit.trim()) issues.push({ path: `components.${index}.doseUnit`, message: `${label}: ingrese la unidad.` });
    if (!component.route.trim()) issues.push({ path: `components.${index}.route`, message: `${label}: ingrese la vía.` });
    if (component.preparation.dirty && !component.drugId.trim()) {
      issues.push({ path: `components.${index}.preparation`, message: `${label}: vincule una droga del catálogo antes de guardar su preparación.` });
    }
  });
  return issues;
}

export function protocolFailureMessage(failure: unknown): string {
  const value = failure as ProtocolApiFailure | null;
  const status = value?.status ?? value?.error?.status;
  const message = value?.error?.message || value?.error?.error || value?.message;
  if ((failure as { name?: string } | null)?.name === 'TimeoutError') {
    return 'La carga de protocolos superó los 30 segundos. Revise la conexión y vuelva a intentar.';
  }
  if (status === 401) return 'La sesión venció. Vuelva a ingresar para continuar.';
  if (status === 403) return 'Su usuario no tiene permiso para administrar protocolos.';
  if (status === 409) return message || 'El protocolo cambió mientras lo editaba. Recargue la ficha antes de guardar.';
  return message || 'No se pudo completar la operación con el protocolo.';
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null || minutes < 1) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} h` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ');
}

function normalizeProtocolComponent(value: unknown, sharedPreparations: readonly unknown[] = []): ProtocolComponentDraft {
  const item = record(value);
  const source = record(item['sourcePayload']);
  const drugId = firstText(item, source, ['drugId', 'idDroga', 'drug_id']);
  const drugName = firstText(item, source, ['drugName', 'droga', 'name', 'nombre', 'monodroga']);
  const ownInstructions = firstArray(item, source, ['applications', 'instructions', 'preparations']);
  const matchingPreparations = sharedPreparations.filter((preparation) => preparationMatches(preparation, drugId, drugName));
  const instructions = ownInstructions.length ? ownInstructions : matchingPreparations;
  const presentations = firstArray(item, source, ['presentations', 'presentaciones']);
  const preparation = instructions.length
    ? normalizePreparation(instructions[0], drugId, drugName)
    : { ...blankPreparation(), drugId, drugName };
  return {
    clientId: createClientId(),
    id: firstText(item, source, ['id']),
    drugId,
    drugName,
    day: firstText(item, source, ['day', 'dia']) || '1',
    prescribedDoseText: firstText(item, source, ['prescribedDoseText', 'dosisDiaria', 'dose', 'dosis']),
    doseUnit: firstText(item, source, ['doseUnit', 'unidadDosis', 'unidad']),
    doseCalculationMethod: firstText(item, source, ['doseCalculationMethod', 'calculoDosis', 'calculation']) || 'Fija',
    route: firstText(item, source, ['route', 'viaAdministracion', 'via']) || 'Endovenosa',
    administrationTime: firstText(item, source, ['administrationTime', 'tiempoAdministracion', 'tiempo']),
    dayHospital: firstBoolean(item, source, ['dayHospital', 'seAplicaEnHdd']) ?? true,
    preparation,
    instructionCount: instructions.length,
    presentationCount: presentations.length,
    ...(Object.keys(source).length ? { sourcePayload: source } : {})
  };
}

function preparationMatches(value: unknown, drugId: string, drugName: string): boolean {
  const item = record(value);
  const source = record(item['sourcePayload']);
  const candidateId = firstText(item, source, ['drugId', 'idDroga']);
  if (drugId && candidateId) return candidateId === drugId;
  const candidateName = firstText(item, source, ['drugName', 'monodroga', 'name']);
  return Boolean(drugName && candidateName && normalizeComparable(candidateName) === normalizeComparable(drugName));
}

function normalizePreparation(value: unknown, fallbackDrugId = '', fallbackDrugName = ''): ProtocolPreparationDraft {
  const item = record(value);
  const source = record(item['sourcePayload']);
  return {
    id: firstText(item, source, ['id']),
    drugId: firstText(item, source, ['drugId', 'idDroga']) || fallbackDrugId,
    drugName: firstText(item, source, ['drugName', 'monodroga', 'name']) || fallbackDrugName,
    presentationReferences: firstText(item, source, ['presentationReferences', 'presentaciones']),
    reconstituent: firstText(item, source, ['reconstituent', 'reconstituyente']),
    concentration: firstText(item, source, ['concentration', 'concentracion']),
    diluent: firstText(item, source, ['diluent', 'diluyente']),
    finalVolume: firstText(item, source, ['finalVolume', 'volumenFinal']),
    route: firstText(item, source, ['route', 'viaAdministracion', 'via']),
    stabilityRoomTemperature: firstText(item, source, ['stabilityRoomTemperature', 'estabilidadTemp', 'estabilidadTA']),
    stabilityRefrigerated: firstText(item, source, ['stabilityRefrigerated', 'estabilidadFrio', 'estabilidadF']),
    laboratory: firstText(item, source, ['laboratory', 'laboratorio']),
    photosensitive: firstBoolean(item, source, ['photosensitive', 'fotosensible']) ?? false,
    infusionGuide: firstText(item, source, ['infusionGuide', 'guiaInfusion']),
    preparationObservations: firstText(item, source, ['preparationObservations', 'observacionesPreparacion']),
    labelObservations: firstText(item, source, ['labelObservations', 'observacionesEtiqueta']),
    dirty: false,
    ...(Object.keys(source).length ? { sourcePayload: source } : {})
  };
}

function normalizePresentation(value: unknown): DrugPresentation {
  const item = record(value);
  const source = record(item['sourcePayload']);
  const amount = firstText(item, source, ['display', 'label', 'amount', 'cantidad']);
  const unit = firstText(item, source, ['amountUnit', 'unit', 'unidadCantidad', 'unidad']);
  return {
    id: firstText(item, source, ['id']),
    label: [amount, unit].filter(Boolean).join(' ') || 'Presentación registrada',
    ...(Object.keys(source).length ? { sourcePayload: source } : {})
  };
}

function createClientId(): string {
  clientSequence += 1;
  return `protocol-component-${Date.now().toString(36)}-${clientSequence.toString(36)}`;
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function positiveIntegerOrNull(value: number | null): number | null {
  if (value === null || value === undefined || value === ('' as unknown as number)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstArray(primary: JsonRecord, secondary: JsonRecord, keys: readonly string[]): readonly unknown[] {
  for (const key of keys) {
    const left = array(primary[key]);
    if (left.length) return left;
    const right = array(secondary[key]);
    if (right.length) return right;
  }
  return [];
}

function firstText(primary: JsonRecord, secondary: JsonRecord, keys: readonly string[]): string {
  for (const key of keys) {
    const value = text(primary[key]) || text(secondary[key]);
    if (value) return value;
  }
  return '';
}

function firstInteger(primary: JsonRecord, secondary: JsonRecord, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = integer(primary[key]) ?? integer(secondary[key]);
    if (value !== null) return value;
  }
  return null;
}

function firstBoolean(primary: JsonRecord, secondary: JsonRecord, keys: readonly string[]): boolean | null {
  for (const key of keys) {
    const value = bool(primary[key]) ?? bool(secondary[key]);
    if (value !== null) return value;
  }
  return null;
}

function text(value: unknown): string {
  return value === null || value === undefined || typeof value === 'object' ? '' : String(value).trim();
}

function integer(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function bool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = text(value).toLocaleLowerCase('es');
  if (['1', 'true', 'sí', 'si', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return null;
}

function normalizeComparable(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
}
