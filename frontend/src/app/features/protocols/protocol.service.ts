import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subject, catchError, map, shareReplay, throwError } from 'rxjs';
import {
  ProtocolCatalog,
  ProtocolCatalogItem,
  ProtocolDetail,
  ProtocolDrug,
  ProtocolPreparation,
  ProtocolPresentation,
  ProtocolSource
} from './protocol.models';

type JsonObject = Record<string, unknown>;

const CATALOG_UPDATED_EVENT = 'hcop-protocol-catalog-updated';

@Injectable({ providedIn: 'root' })
export class ProtocolService {
  private readonly http = inject(HttpClient);
  private readonly catalogCache = new Map<ProtocolSource, Observable<ProtocolCatalog>>();
  private readonly detailCache = new Map<string, Observable<ProtocolDetail>>();
  private readonly invalidatedSubject = new Subject<void>();
  private readonly catalogUpdatedListener = (): void => this.invalidate();
  private readonly storageListener = (event: StorageEvent): void => {
    if (event.key === CATALOG_UPDATED_EVENT) this.invalidate();
  };

  readonly invalidated$ = this.invalidatedSubject.asObservable();

  constructor() {
    globalThis.window?.addEventListener(CATALOG_UPDATED_EVENT, this.catalogUpdatedListener);
    globalThis.window?.addEventListener('storage', this.storageListener);
  }

  catalog(source: ProtocolSource, force = false): Observable<ProtocolCatalog> {
    if (force) this.invalidateSource(source, false);
    const cached = this.catalogCache.get(source);
    if (cached) return cached;

    const request = source === 'clinical'
      ? this.http.get<unknown>('/api/clinical/protocols?includeCatalog=1', { withCredentials: true })
      : this.http.get<unknown>('/api/protocols?source=seer', { withCredentials: true });
    let value!: Observable<ProtocolCatalog>;
    value = request.pipe(
      map((payload) => normalizeCatalog(payload, source)),
      catchError((failure: unknown) => {
        if (this.catalogCache.get(source) === value) this.catalogCache.delete(source);
        return throwError(() => failure);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.catalogCache.set(source, value);
    return value;
  }

  detail(source: ProtocolSource, id: string, force = false): Observable<ProtocolDetail> {
    const normalizedId = id.trim();
    const key = `${source}:${normalizedId}`;
    if (force) this.detailCache.delete(key);
    const cached = this.detailCache.get(key);
    if (cached) return cached;

    const request = source === 'clinical'
      ? this.http.get<unknown>(`/api/clinical/protocols/${encodeURIComponent(normalizedId)}`, { withCredentials: true })
      : this.http.get<unknown>(`/api/protocols/detail?id=${encodeURIComponent(normalizedId)}&source=seer`, { withCredentials: true });
    let value!: Observable<ProtocolDetail>;
    value = request.pipe(
      map((payload) => normalizeDetail(payload, source)),
      catchError((failure: unknown) => {
        if (this.detailCache.get(key) === value) this.detailCache.delete(key);
        return throwError(() => failure);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.detailCache.set(key, value);
    return value;
  }

  invalidate(): void {
    this.catalogCache.clear();
    this.detailCache.clear();
    this.invalidatedSubject.next();
  }

  invalidateSource(source: ProtocolSource, notify = true): void {
    this.catalogCache.delete(source);
    for (const key of this.detailCache.keys()) {
      if (key.startsWith(`${source}:`)) this.detailCache.delete(key);
    }
    if (notify) this.invalidatedSubject.next();
  }
}

function normalizeCatalog(payload: unknown, source: ProtocolSource): ProtocolCatalog {
  const root = record(payload);
  const rows = source === 'clinical' ? array(root['protocols']) : array(root['schemes']);
  const items = rows.map((row) => normalizeScheme(row, source)).filter((item) => item.id && item.name);
  const categories = unique([
    ...array(root['categories']).map(text).filter(Boolean),
    ...items.map((item) => item.category).filter(Boolean)
  ]).sort(collatorCompare);
  return {
    source,
    items: [...items].sort((left, right) => collatorCompare(left.category, right.category) || collatorCompare(left.name, right.name)),
    categories,
    total: integer(root['total']) ?? integer(root['count']) ?? items.length,
    currentCount: integer(root['currentCount']) ?? (source === 'clinical' ? items.filter((item) => !item.catalogOnly).length : 0),
    catalogCount: integer(root['catalogCount']) ?? (source === 'clinical' ? items.filter((item) => item.catalogOnly).length : items.length),
    referenceOnly: source === 'seer'
  };
}

function normalizeDetail(payload: unknown, source: ProtocolSource): ProtocolDetail {
  const root = record(payload);
  const rawScheme = record(source === 'clinical' ? root['protocol'] : root['scheme']);
  const scheme = normalizeScheme(rawScheme, source);
  const definition = record(rawScheme['definition']);
  const rawPreparations = mergedArrays(rawScheme, definition, ['preparations', 'applications', 'instructions', 'indicaciones']);
  const rawPresentations = mergedArrays(rawScheme, definition, ['presentations', 'presentaciones']);
  const rows = source === 'clinical'
    ? mergedArrays(rawScheme, definition, ['components', 'drugs', 'drogas'])
    : mergedArrays(root, rawScheme, ['drugs', 'components', 'drogas']);
  const drugs = rows.map((row, index) => normalizeDrug(row, index, rawPreparations, rawPresentations));
  return { source, scheme: { ...scheme, componentCount: drugs.length || scheme.componentCount }, drugs, referenceOnly: source === 'seer' };
}

function normalizeScheme(value: unknown, source: ProtocolSource): ProtocolCatalogItem {
  const item = record(value);
  const definition = record(item['definition']);
  const id = firstText(item, definition, ['id', 'coirSchemeId', 'schemeId', 'key']);
  const name = firstText(item, definition, ['name', 'displayName', 'schemeName', 'nombre', 'regimenName']);
  const minutes = firstInteger(item, definition, ['durationMinutes', 'estimatedDurationMinutes', 'duracionMinutos']);
  return {
    id,
    name,
    category: firstText(item, definition, ['category', 'pathology', 'grupo', 'sitio']) || (source === 'seer' ? 'SEER*Rx' : 'Otros'),
    description: firstText(item, definition, ['description', 'descripcion']),
    cycleDays: firstInteger(item, definition, ['cycleDays', 'duracionCiclo']),
    durationMinutes: minutes,
    durationText: firstText(item, definition, ['durationText', 'duracionTexto']) || formatMinutes(minutes),
    active: firstBoolean(item, definition, ['active', 'activo']) ?? true,
    catalogOnly: source === 'clinical' && (firstBoolean(item, definition, ['catalogOnly']) ?? false),
    componentCount: firstInteger(item, definition, ['componentCount'])
      ?? mergedArrays(item, definition, ['components', 'drugs', 'drogas']).length,
    histology: firstText(item, definition, ['histology', 'histologia']),
    remarks: firstText(item, definition, ['remarks', 'notes', 'observaciones']),
    alternateNames: firstText(item, definition, ['alternateNames', 'sinonimos'])
  };
}

function normalizeDrug(
  value: unknown,
  index: number,
  sharedPreparations: readonly unknown[],
  sharedPresentations: readonly unknown[]
): ProtocolDrug {
  const item = record(value);
  const source = record(item['sourcePayload']);
  const drugId = firstText(item, source, ['drugId', 'idDroga', 'drug_id']);
  const name = firstText(item, source, ['drugName', 'droga', 'name', 'nombre', 'monodroga']);
  const ownPreparations = mergedArrays(item, source, ['applications', 'preparations', 'instructions', 'indicaciones']);
  const ownPresentations = mergedArrays(item, source, ['presentations', 'presentaciones']);
  const preparations = mergeValues(ownPreparations, matchingRows(sharedPreparations, drugId, name))
    .map(normalizePreparation);
  const presentations = mergeValues(ownPresentations, matchingRows(sharedPresentations, drugId, name))
    .map(normalizePresentation);
  return {
    id: firstText(item, source, ['id']) || `${drugId || 'drug'}-${index}`,
    drugId,
    name: name || 'Droga sin identificar',
    day: firstText(item, source, ['day', 'dia']) || '—',
    dose: firstText(item, source, ['prescribedDoseText', 'dosisDiaria', 'dose', 'dosis']),
    doseUnit: firstText(item, source, ['doseUnit', 'unidadDosis', 'unidad']),
    doseCalculation: firstText(item, source, ['doseCalculationMethod', 'calculoDosis', 'calculation']),
    route: firstText(item, source, ['route', 'viaAdministracion', 'via']),
    administrationTime: firstText(item, source, ['administrationTime', 'tiempoAdministracion', 'tiempo']),
    dayHospital: firstBoolean(item, source, ['dayHospital', 'seAplicaEnHdd']),
    preparations,
    presentations
  };
}

function normalizePreparation(value: unknown): ProtocolPreparation {
  const item = record(value);
  const source = record(item['sourcePayload']);
  const concentration = firstText(item, source, ['concentration', 'concentracion']);
  const concentrationUnit = firstText(item, source, [
    'concentrationUnit', 'concentrationUnits', 'unidadConcentracion', 'unidad_concentracion'
  ]);
  const finalVolume = firstText(item, source, ['finalVolume', 'volumenFinal']);
  const finalVolumeUnit = firstText(item, source, [
    'finalVolumeUnit', 'volumeUnit', 'unidadVolumenFinal', 'unidadVolumen', 'unidad_volumen_final'
  ]);
  return {
    id: firstText(item, source, ['id']),
    title: firstText(item, source, ['presentationReferences', 'presentaciones', 'drugName', 'monodroga']) || 'Preparación registrada',
    route: firstText(item, source, ['route', 'viaAdministracion', 'via']),
    reconstituent: firstText(item, source, ['reconstituent', 'reconstituyente']),
    concentration: measure(concentration, concentrationUnit, 'mg/ml'),
    diluent: firstText(item, source, ['diluent', 'diluyente']),
    finalVolume: measure(finalVolume, finalVolumeUnit, 'ml'),
    stabilityRoomTemperature: firstText(item, source, ['stabilityRoomTemperature', 'estabilidadTemp', 'estabilidadTA']),
    stabilityRefrigerated: firstText(item, source, ['stabilityRefrigerated', 'estabilidadFrio', 'estabilidadF']),
    laboratory: firstText(item, source, ['laboratory', 'laboratorio']),
    photosensitive: firstBoolean(item, source, ['photosensitive', 'fotosensible']),
    infusionGuide: firstText(item, source, ['infusionGuide', 'guiaInfusion']),
    preparationObservations: firstText(item, source, ['preparationObservations', 'observacionesPreparacion']),
    labelObservations: firstText(item, source, ['labelObservations', 'observacionesEtiqueta'])
  };
}

function normalizePresentation(value: unknown): ProtocolPresentation {
  const item = record(value);
  const source = record(item['sourcePayload']);
  const rawAmount = firstText(item, source, ['amount', 'cantidad']);
  const amountUnit = firstText(item, source, [
    'amountUnit', 'unit', 'unidadCantidad', 'unidad', 'doseUnit', 'unidad_cantidad'
  ]);
  const amount = measure(rawAmount, amountUnit, 'mg');
  const solution = firstBoolean(item, source, ['solution', 'solucion']);
  const lyophilized = firstBoolean(item, source, ['lyophilized', 'liofilizado']);
  const form = firstText(item, source, ['form', 'forma'])
    || (lyophilized ? 'Liofilizado' : solution ? 'Solución' : 'Presentación');
  return {
    id: firstText(item, source, ['id']),
    label: measure(firstText(item, source, ['display', 'label', 'presentaciones']), amountUnit, 'mg') || amount || 'Presentación',
    amount,
    form,
    vial: firstBoolean(item, source, ['vial', 'frascoAmpolla'])
  };
}

function matchingRows(rows: readonly unknown[], drugId: string, name: string): readonly unknown[] {
  const normalizedName = normalize(name);
  return rows.filter((value) => {
    const item = record(value);
    const source = record(item['sourcePayload']);
    const candidateId = firstText(item, source, ['drugId', 'idDroga']);
    if (drugId && candidateId) return candidateId === drugId;
    const candidateName = firstText(item, source, ['drugName', 'monodroga', 'droga', 'name']);
    return Boolean(normalizedName && normalize(candidateName) === normalizedName);
  });
}

function record(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function mergedArrays(primary: JsonObject, secondary: JsonObject, keys: readonly string[]): readonly unknown[] {
  const values: unknown[] = [];
  for (const key of keys) {
    values.push(...array(primary[key]), ...array(secondary[key]));
  }
  return deduplicate(values);
}

function mergeValues(left: readonly unknown[], right: readonly unknown[]): readonly unknown[] {
  return deduplicate([...left, ...right]);
}

function deduplicate(values: readonly unknown[]): readonly unknown[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = semanticKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function semanticKey(value: unknown): string {
  const item = record(value);
  const source = record(item['sourcePayload']);
  const id = firstText(item, source, ['id']);
  if (id) return `id:${normalize(id)}`;
  const content = [
    firstText(item, source, ['drugId', 'idDroga', 'drug_id']),
    firstText(item, source, ['drugName', 'monodroga', 'droga', 'name', 'nombre']),
    firstText(item, source, ['day', 'dia']),
    firstText(item, source, ['prescribedDoseText', 'dosisDiaria', 'dose', 'dosis']),
    firstText(item, source, ['doseUnit', 'unidadDosis', 'unidad']),
    firstText(item, source, ['doseCalculationMethod', 'calculoDosis', 'calculation']),
    firstText(item, source, ['route', 'viaAdministracion', 'via']),
    firstText(item, source, ['administrationTime', 'tiempoAdministracion', 'tiempo']),
    firstText(item, source, ['presentationReferences', 'presentaciones']),
    firstText(item, source, ['reconstituent', 'reconstituyente']),
    firstText(item, source, ['concentration', 'concentracion']),
    firstText(item, source, ['concentrationUnit', 'concentrationUnits', 'unidadConcentracion']),
    firstText(item, source, ['diluent', 'diluyente']),
    firstText(item, source, ['finalVolume', 'volumenFinal']),
    firstText(item, source, ['finalVolumeUnit', 'volumeUnit', 'unidadVolumenFinal', 'unidadVolumen']),
    firstText(item, source, ['infusionGuide', 'guiaInfusion']),
    firstText(item, source, ['preparationObservations', 'observacionesPreparacion']),
    firstText(item, source, ['labelObservations', 'observacionesEtiqueta']),
    firstText(item, source, ['display', 'label', 'amount', 'cantidad']),
    firstText(item, source, ['amountUnit', 'unit', 'unidadCantidad']),
    firstBoolean(item, source, ['dayHospital', 'seAplicaEnHdd']),
    firstBoolean(item, source, ['photosensitive', 'fotosensible']),
    firstBoolean(item, source, ['solution', 'solucion']),
    firstBoolean(item, source, ['lyophilized', 'liofilizado']),
    firstBoolean(item, source, ['vial', 'frascoAmpolla'])
  ].map((part) => normalize(String(part ?? '')));
  if (content.some(Boolean)) return `content:${content.join('|')}`;
  try {
    return `raw:${JSON.stringify(withoutSourcePayload(item))}`;
  } catch {
    return `raw:${String(value)}`;
  }
}

function withoutSourcePayload(value: JsonObject): JsonObject {
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (key !== 'sourcePayload') result[key] = item;
  }
  return result;
}

function firstText(primary: JsonObject, secondary: JsonObject, keys: readonly string[]): string {
  for (const key of keys) {
    const value = text(primary[key]) || text(secondary[key]);
    if (value) return value;
  }
  return '';
}

function firstInteger(primary: JsonObject, secondary: JsonObject, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = integer(primary[key]) ?? integer(secondary[key]);
    if (value !== null) return value;
  }
  return null;
}

function firstBoolean(primary: JsonObject, secondary: JsonObject, keys: readonly string[]): boolean | null {
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
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function bool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = text(value).toLocaleLowerCase('es');
  if (['1', 'true', 'si', 'sí', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return null;
}

function measure(value: string, explicitUnit: string, fallbackUnit: string): string {
  const cleanValue = value.trim();
  if (!cleanValue) return '';
  if (!numericMeasure(cleanValue)) return cleanValue;
  const unit = explicitUnit.trim() || fallbackUnit;
  return unit ? `${cleanValue} ${unit}` : cleanValue;
}

function numericMeasure(value: string): boolean {
  return /^[-+]?\d+(?:[.,]\d+)?$/.test(value.trim());
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function collatorCompare(left: string, right: string): number {
  return left.localeCompare(right, 'es', { sensitivity: 'base', numeric: true });
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null || minutes < 1) return '';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}
