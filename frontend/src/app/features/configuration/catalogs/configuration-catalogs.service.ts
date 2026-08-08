import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, tap, throwError } from 'rxjs';
import {
  ConfigurationApiFailure,
  DiagnosisCatalogResult,
  DiagnosisDisplaySetting,
  DiagnosisEquivalenceDraft,
  DiagnosisEquivalenceItem,
  DiagnosisSystem,
  GuideDraft,
  GuideItem,
  StudyTemplateDraft,
  StudyTemplateItem
} from './configuration-catalogs.models';
import {
  buildDiagnosisDisplayPayload,
  buildDiagnosisEquivalencePayload,
  buildGuidePayload,
  buildStudyTemplatePayload,
  imageMime,
  normalizeConfigurationFailure,
  normalizeDiagnosisCatalogResults,
  normalizeDiagnosisDisplaySetting,
  normalizeDiagnosisEquivalences,
  normalizeGuideCatalog,
  normalizeStudyTemplateCatalog
} from './configuration-catalogs.normalizers';

type JsonRecord = Record<string, unknown>;

const CONFIGURATION_UPDATED_EVENT = 'hcop-configuration-updated';

@Injectable({ providedIn: 'root' })
export class ConfigurationCatalogsService {
  private readonly http = inject(HttpClient);

  guides(): Observable<readonly GuideItem[]> {
    return this.http.get<unknown>('/api/guides', {
      params: new HttpParams().set('includeInactive', '1'),
      withCredentials: true
    }).pipe(
      map(normalizeGuideCatalog),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo abrir la biblioteca de guías.'))
    );
  }

  uploadGuide(file: File): Observable<void> {
    return this.http.put<unknown>('/api/guides/import', file, {
      params: new HttpParams().set('name', file.name),
      headers: { 'Content-Type': 'application/pdf' },
      withCredentials: true
    }).pipe(
      map(() => undefined),
      tap(() => this.notifyConfigurationUpdated()),
      catchError((failure: unknown) => this.fail(failure, `No se pudo subir ${file.name}.`))
    );
  }

  saveGuide(item: GuideItem, draft: GuideDraft, active = draft.active): Observable<void> {
    const body = buildGuidePayload(item, draft, active);
    const request = item.configurationId
      ? this.http.put<unknown>(`/api/clinical/configuration/guide/${encodeURIComponent(item.configurationId)}`, body, { withCredentials: true })
      : this.http.post<unknown>('/api/clinical/configuration/guide', body, { withCredentials: true });
    return request.pipe(
      map(() => undefined),
      tap(() => this.notifyConfigurationUpdated()),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo guardar la guía.'))
    );
  }

  archiveGuide(item: GuideItem): Observable<void> {
    if (!item.configurationId) {
      return throwError(() => failure(409, 'GUIDE_NOT_CONFIGURED', 'Guarde los datos de esta guía antes de desactivarla.'));
    }
    return this.http.delete<unknown>(`/api/clinical/configuration/guide/${encodeURIComponent(item.configurationId)}`, {
      withCredentials: true
    }).pipe(
      map(() => undefined),
      tap(() => this.notifyConfigurationUpdated()),
      catchError((error: unknown) => this.fail(error, 'No se pudo desactivar la guía.'))
    );
  }

  studyTemplates(): Observable<readonly StudyTemplateItem[]> {
    return forkJoin({
      catalog: this.http.get<unknown>('/api/study-templates', {
        params: new HttpParams().set('scope', 'all').set('includeInactive', '1'),
        withCredentials: true
      }),
      configuration: this.http.get<unknown>('/api/clinical/configuration/study-template', {
        params: new HttpParams().set('includeInactive', '1'),
        withCredentials: true
      })
    }).pipe(
      map(({ catalog, configuration }) => normalizeStudyTemplateCatalog(
        mergeStudyTemplateConfiguration(catalog, configuration)
      )),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo abrir la biblioteca anatómica.'))
    );
  }

  uploadStudyTemplate(file: File, draft: StudyTemplateDraft): Observable<void> {
    const mime = imageMime(file);
    if (!mime) return throwError(() => failure(400, 'INVALID_IMAGE', 'Seleccione una imagen PNG, JPG, GIF o WebP válida.'));
    if (!file.size || file.size > 15 * 1024 * 1024) {
      return throwError(() => failure(413, 'IMAGE_TOO_LARGE', 'La plantilla está vacía o supera los 15 MB.'));
    }
    let params = new HttpParams()
      .set('name', file.name)
      .set('title', draft.title.trim())
      .set('category', draft.category.trim())
      .set('tags', draft.tags.trim())
      .set('author', draft.author.trim())
      .set('attribution', draft.attribution.trim())
      .set('license', draft.license.trim())
      .set('description', draft.description.trim())
      .set('sourceUrl', draft.sourceUrl.trim())
      .set('licenseUrl', draft.licenseUrl.trim())
      .set('rightsConfirmed', '1');
    return this.http.post<unknown>('/api/study-templates', file, {
      params,
      headers: { 'Content-Type': mime },
      withCredentials: true
    }).pipe(
      map(() => undefined),
      tap(() => this.notifyConfigurationUpdated()),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo agregar la plantilla anatómica.'))
    );
  }

  saveStudyTemplate(item: StudyTemplateItem, draft: StudyTemplateDraft, active = draft.active): Observable<void> {
    if (!item.configurationId) {
      return throwError(() => failure(400, 'BUNDLED_TEMPLATE', 'Las plantillas incluidas son de solo lectura.'));
    }
    return this.http.put<unknown>(
      `/api/clinical/configuration/study-template/${encodeURIComponent(item.configurationId)}`,
      buildStudyTemplatePayload(item, draft, active),
      { withCredentials: true }
    ).pipe(
      map(() => undefined),
      tap(() => this.notifyConfigurationUpdated()),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo guardar la plantilla.'))
    );
  }

  archiveStudyTemplate(item: StudyTemplateItem): Observable<void> {
    if (!item.configurationId) {
      return throwError(() => failure(400, 'BUNDLED_TEMPLATE', 'Las plantillas incluidas no pueden desactivarse.'));
    }
    return this.http.delete<unknown>(
      `/api/clinical/configuration/study-template/${encodeURIComponent(item.configurationId)}`,
      { withCredentials: true }
    ).pipe(
      map(() => undefined),
      tap(() => this.notifyConfigurationUpdated()),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo desactivar la plantilla.'))
    );
  }

  diagnosisDisplaySetting(): Observable<DiagnosisDisplaySetting> {
    return this.http.get<unknown>('/api/clinical/configuration/diagnosis-setting', {
      params: new HttpParams().set('includeInactive', '1'),
      withCredentials: true
    }).pipe(
      map(normalizeDiagnosisDisplaySetting),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo leer la configuración diagnóstica.'))
    );
  }

  saveDiagnosisDisplaySetting(
    setting: DiagnosisDisplaySetting,
    systems: readonly DiagnosisSystem[]
  ): Observable<DiagnosisDisplaySetting> {
    const body = buildDiagnosisDisplayPayload(setting, systems);
    const request = setting.id
      ? this.http.put<unknown>(`/api/clinical/configuration/diagnosis-setting/${encodeURIComponent(setting.id)}`, body, { withCredentials: true })
      : this.http.post<unknown>('/api/clinical/configuration/diagnosis-setting', body, { withCredentials: true });
    return request.pipe(
      map((payload) => normalizeDiagnosisDisplaySetting({ items: [record(payload)['item']] })),
      tap(() => this.notifyConfigurationUpdated()),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo guardar qué clasificaciones se muestran.'))
    );
  }

  diagnosisEquivalences(): Observable<readonly DiagnosisEquivalenceItem[]> {
    return this.http.get<unknown>('/api/clinical/configuration/diagnosis-equivalence', {
      params: new HttpParams().set('includeInactive', '1'),
      withCredentials: true
    }).pipe(
      map(normalizeDiagnosisEquivalences),
      catchError((failure: unknown) => this.fail(failure, 'No se pudieron cargar las equivalencias diagnósticas.'))
    );
  }

  saveDiagnosisEquivalence(
    id: string,
    revision: number | null,
    draft: DiagnosisEquivalenceDraft,
    active = draft.active
  ): Observable<void> {
    const body = buildDiagnosisEquivalencePayload(draft, revision, active);
    const request = id
      ? this.http.put<unknown>(`/api/clinical/configuration/diagnosis-equivalence/${encodeURIComponent(id)}`, body, { withCredentials: true })
      : this.http.post<unknown>('/api/clinical/configuration/diagnosis-equivalence', body, { withCredentials: true });
    return request.pipe(
      map(() => undefined),
      tap(() => this.notifyConfigurationUpdated()),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo guardar la equivalencia diagnóstica.'))
    );
  }

  archiveDiagnosisEquivalence(item: DiagnosisEquivalenceItem): Observable<void> {
    return this.http.delete<unknown>(
      `/api/clinical/configuration/diagnosis-equivalence/${encodeURIComponent(item.id)}`,
      { withCredentials: true }
    ).pipe(
      map(() => undefined),
      tap(() => this.notifyConfigurationUpdated()),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo desactivar la equivalencia.'))
    );
  }

  searchDiagnosisCatalog(system: DiagnosisSystem, query: string): Observable<readonly DiagnosisCatalogResult[]> {
    return this.http.get<unknown>('/api/diagnosis-catalogs/search', {
      params: new HttpParams().set('system', system).set('q', query.trim()).set('limit', '40'),
      withCredentials: true
    }).pipe(
      map(normalizeDiagnosisCatalogResults),
      catchError((failure: unknown) => this.fail(failure, `No se pudo buscar en ${system.toUpperCase()}.`))
    );
  }

  notifyConfigurationUpdated(): void {
    const updatedAt = String(Date.now());
    try {
      globalThis.localStorage?.setItem(CONFIGURATION_UPDATED_EVENT, updatedAt);
    } catch {
      // El evento de la ventana mantiene sincronizada la pestaña actual si storage está bloqueado.
    }
    globalThis.window?.dispatchEvent(new CustomEvent(CONFIGURATION_UPDATED_EVENT, { detail: { updatedAt } }));
  }

  private fail(failureValue: unknown, fallback: string): Observable<never> {
    return throwError(() => normalizeConfigurationFailure(failureValue, fallback));
  }
}

function mergeStudyTemplateConfiguration(catalogPayload: unknown, configurationPayload: unknown): unknown {
  const catalog = record(catalogPayload);
  const items = array(record(configurationPayload)['items']).map(record);
  const byId = new Map(items.map((item) => [text(item['id']), item]));
  const templates = array(catalog['templates']).map((value) => {
    const template = record(value);
    const configurationId = text(template['configurationId']);
    const configuration = byId.get(configurationId);
    if (!configuration) return template;
    return {
      ...template,
      configurationKey: text(configuration['key']),
      revision: integer(configuration['revision']),
      definition: { ...record(template['definition']), ...record(configuration['definition']) }
    };
  });
  return { ...catalog, templates };
}

function failure(status: number, code: string, message: string): ConfigurationApiFailure {
  return { status, code, message };
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
