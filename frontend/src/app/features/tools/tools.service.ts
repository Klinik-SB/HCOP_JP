import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subject, catchError, map, shareReplay, throwError } from 'rxjs';
import {
  AjccAxis,
  AjccCatalog,
  AjccCategory,
  AjccSiteDetail,
  AjccSiteSummary,
  AjccStageRequest,
  AjccStageResult,
  GuideCatalog,
  GuideItem,
  ToolsApiError
} from './tools.models';

type JsonObject = Record<string, unknown>;

const CONFIGURATION_UPDATED_EVENT = 'hcop-configuration-updated';

@Injectable({ providedIn: 'root' })
export class ToolsService {
  private readonly http = inject(HttpClient);
  private guideCache: Observable<GuideCatalog> | null = null;
  private ajccCatalogCache: Observable<AjccCatalog> | null = null;
  private readonly ajccDetailCache = new Map<string, Observable<AjccSiteDetail>>();
  private readonly invalidatedSubject = new Subject<void>();
  private readonly configurationListener = (): void => this.invalidateGuides();
  private readonly storageListener = (event: StorageEvent): void => {
    if (event.key === CONFIGURATION_UPDATED_EVENT) this.invalidateGuides();
  };

  readonly invalidated$ = this.invalidatedSubject.asObservable();

  constructor() {
    globalThis.window?.addEventListener(CONFIGURATION_UPDATED_EVENT, this.configurationListener);
    globalThis.window?.addEventListener('storage', this.storageListener);
  }

  guides(force = false): Observable<GuideCatalog> {
    if (force) this.guideCache = null;
    if (this.guideCache) return this.guideCache;

    let value!: Observable<GuideCatalog>;
    value = this.http.get<unknown>('/api/guides', { withCredentials: true }).pipe(
      map(normalizeGuideCatalog),
      catchError((failure: unknown) => {
        if (this.guideCache === value) this.guideCache = null;
        return throwError(() => normalizeApiError(failure, 'No se pudo abrir la biblioteca de guías.'));
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.guideCache = value;
    return value;
  }

  ajccCatalog(force = false): Observable<AjccCatalog> {
    if (force) this.ajccCatalogCache = null;
    if (this.ajccCatalogCache) return this.ajccCatalogCache;

    let value!: Observable<AjccCatalog>;
    value = this.http.get<unknown>('/api/ajcc8', { withCredentials: true }).pipe(
      map(normalizeAjccCatalog),
      catchError((failure: unknown) => {
        if (this.ajccCatalogCache === value) this.ajccCatalogCache = null;
        return throwError(() => normalizeApiError(failure, 'No se pudo cargar el catálogo AJCC 8.'));
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.ajccCatalogCache = value;
    return value;
  }

  ajccDetail(id: string, force = false): Observable<AjccSiteDetail> {
    const normalizedId = id.trim();
    if (!normalizedId) return throwError(() => apiError(400, 'INVALID_SITE', 'Seleccione un sitio tumoral.'));
    if (force) this.ajccDetailCache.delete(normalizedId);
    const cached = this.ajccDetailCache.get(normalizedId);
    if (cached) return cached;

    let value!: Observable<AjccSiteDetail>;
    value = this.http.get<unknown>(`/api/ajcc8/detail?id=${encodeURIComponent(normalizedId)}`, {
      withCredentials: true
    }).pipe(
      map(normalizeAjccDetail),
      catchError((failure: unknown) => {
        if (this.ajccDetailCache.get(normalizedId) === value) this.ajccDetailCache.delete(normalizedId);
        return throwError(() => normalizeApiError(failure, 'No se pudo abrir el sitio AJCC 8.'));
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.ajccDetailCache.set(normalizedId, value);
    return value;
  }

  stage(request: AjccStageRequest): Observable<AjccStageResult> {
    return this.http.post<unknown>('/api/ajcc8/stage', request, { withCredentials: true }).pipe(
      map(normalizeStageResult),
      catchError((failure: unknown) => throwError(() =>
        normalizeApiError(failure, 'No se pudo calcular el estadio AJCC.')))
    );
  }

  invalidateGuides(): void {
    this.guideCache = null;
    this.invalidatedSubject.next();
  }
}

function normalizeGuideCatalog(payload: unknown): GuideCatalog {
  const root = record(payload);
  const guides = array(root['guides'])
    .map(normalizeGuide)
    .filter((guide) => guide.name && guide.title && guide.active)
    .sort((left, right) => compare(left.title, right.title));
  return { guides, count: integer(root['count']) ?? guides.length };
}

function normalizeGuide(value: unknown): GuideItem {
  const item = record(value);
  const name = text(item['name']);
  return {
    name,
    url: name ? `/api/guides/file?name=${encodeURIComponent(name)}` : '',
    title: text(item['title']) || humanize(name),
    site: text(item['site']) || 'Oncología',
    audience: text(item['audience']) || 'Equipo de salud',
    source: text(item['source']) || 'Biblioteca local',
    version: text(item['version']),
    tags: array(item['tags']).map(text).filter(Boolean),
    description: text(item['description']),
    active: boolean(item['active']) ?? true,
    size: Math.max(0, integer(item['size']) ?? 0),
    updatedAt: text(item['updatedAt'])
  };
}

function normalizeAjccCatalog(payload: unknown): AjccCatalog {
  const root = record(payload);
  const sites = array(root['sites'])
    .map(normalizeSiteSummary)
    .filter((site) => site.id && site.name)
    .sort((left, right) => compare(left.group, right.group) || compare(left.name, right.name));
  return {
    edition: text(root['edition']) || 'AJCC 8',
    source: text(root['source']) || 'Catálogo local validado',
    sites,
    count: integer(root['count']) ?? sites.length
  };
}

function normalizeSiteSummary(value: unknown): AjccSiteSummary {
  const item = record(value);
  return {
    id: text(item['id']),
    name: text(item['name']),
    group: text(item['group']) || 'Otros'
  };
}

function normalizeAjccDetail(payload: unknown): AjccSiteDetail {
  const root = record(payload);
  const axesRoot = record(root['axes']);
  const axes: Record<string, AjccAxis> = {};
  for (const [key, value] of Object.entries(axesRoot)) {
    const axis = normalizeAxis(value, key);
    if (axis.categories.length) axes[key] = axis;
  }
  const id = text(root['id']);
  if (!id || !Object.keys(axes).length) {
    throw apiError(502, 'INVALID_AJCC_CONTRACT', 'El sitio AJCC recibido no contiene ejes utilizables.');
  }
  return {
    id,
    name: text(root['name']) || id,
    edition: text(root['edition']) || 'AJCC 8',
    source: text(root['source']) || 'Catálogo local validado',
    guideVersion: text(root['guideVersion']),
    axes
  };
}

function normalizeAxis(value: unknown, key: string): AjccAxis {
  const item = record(value);
  const categories = array(item['categories'])
    .map(normalizeCategory)
    .filter((category) => category.code);
  return { label: text(item['label']) || key, categories };
}

function normalizeCategory(value: unknown): AjccCategory {
  const item = record(value);
  return {
    code: text(item['code']),
    description: text(item['description']),
    notes: array(item['notes']).map(text).filter(Boolean)
  };
}

function normalizeStageResult(payload: unknown): AjccStageResult {
  const root = record(payload);
  const sourceRow = integer(root['sourceRow']);
  return {
    stage: text(root['stage']),
    missing: array(root['missing']).map(text).filter(Boolean),
    sourceRow: sourceRow !== null && sourceRow > 0 ? sourceRow : null
  };
}

function normalizeApiError(failure: unknown, fallback: string): ToolsApiError {
  if (isToolsApiError(failure)) return failure;
  if (failure instanceof HttpErrorResponse) {
    const body = record(failure.error);
    return apiError(
      failure.status,
      text(body['code']) || text(body['errorCode']) || 'TOOLS_REQUEST_FAILED',
      text(body['error']) || text(body['message']) || failure.message || fallback
    );
  }
  if (failure instanceof Error) return apiError(0, 'TOOLS_REQUEST_FAILED', failure.message || fallback);
  return apiError(0, 'TOOLS_REQUEST_FAILED', fallback);
}

function apiError(status: number, code: string, message: string): ToolsApiError {
  return { status, code, message };
}

function isToolsApiError(value: unknown): value is ToolsApiError {
  const item = record(value);
  return Number.isFinite(Number(item['status'])) && Boolean(text(item['message']));
}

function record(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
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
  return Number.isInteger(parsed) ? parsed : null;
}

function boolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function humanize(value: string): string {
  return value.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, 'es-AR', { sensitivity: 'base', numeric: true });
}
