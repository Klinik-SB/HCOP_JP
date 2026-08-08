import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, timeout } from 'rxjs';
import {
  CoirCatalogItem,
  DrugCatalogItem,
  ProtocolCatalogState,
  ProtocolEditorDraft,
  SaveProtocolPayload
} from './protocol-configuration.models';
import {
  coirCatalogFromProtocols,
  normalizeDrugCatalog,
  normalizeProtocolCatalog,
  normalizeProtocolDetail
} from './protocol-configuration.normalizers';

export interface ProtocolConfigurationCatalog {
  readonly protocols: ProtocolCatalogState;
  readonly coir: readonly CoirCatalogItem[];
}

export const PROTOCOL_CATALOG_UPDATED_EVENT = 'hcop-protocol-catalog-updated';

@Injectable({ providedIn: 'root' })
export class ProtocolConfigurationService {
  private readonly http = inject(HttpClient);

  loadCatalog(): Observable<ProtocolConfigurationCatalog> {
    return this.http.get<unknown>(
      '/api/clinical/protocols?includeArchived=1&includeCatalog=1',
      { withCredentials: true }
    ).pipe(
      timeout({ first: 30_000 }),
      map(normalizeProtocolCatalog),
      map((protocols): ProtocolConfigurationCatalog => ({
        protocols,
        coir: coirCatalogFromProtocols(protocols)
      }))
    );
  }

  detail(id: string): Observable<ProtocolEditorDraft> {
    return this.http.get<unknown>(
      `/api/clinical/protocols/${encodeURIComponent(id.trim())}`,
      { withCredentials: true }
    ).pipe(map(normalizeProtocolDetail));
  }

  searchDrugs(query: string): Observable<readonly DrugCatalogItem[]> {
    return this.http.get<unknown>(
      `/api/clinical/drugs?q=${encodeURIComponent(query.trim())}`,
      { withCredentials: true }
    ).pipe(map(normalizeDrugCatalog));
  }

  create(payload: SaveProtocolPayload): Observable<ProtocolEditorDraft> {
    return this.http.post<unknown>('/api/clinical/protocols', payload, { withCredentials: true })
      .pipe(map(normalizeProtocolDetail));
  }

  update(id: string, payload: SaveProtocolPayload): Observable<ProtocolEditorDraft> {
    return this.http.put<unknown>(
      `/api/clinical/protocols/${encodeURIComponent(id.trim())}`,
      payload,
      { withCredentials: true }
    ).pipe(map(normalizeProtocolDetail));
  }

  archive(id: string): Observable<ProtocolEditorDraft> {
    return this.http.delete<unknown>(
      `/api/clinical/protocols/${encodeURIComponent(id.trim())}`,
      { withCredentials: true }
    ).pipe(map(normalizeProtocolDetail));
  }

  broadcastCatalogChanged(): void {
    const timestamp = String(Date.now());
    try {
      globalThis.localStorage?.setItem(PROTOCOL_CATALOG_UPDATED_EVENT, timestamp);
    } catch {
      // El evento de memoria sigue informando a la pestaña actual si el almacenamiento está bloqueado.
    }
    globalThis.window?.dispatchEvent(new CustomEvent(PROTOCOL_CATALOG_UPDATED_EVENT, {
      detail: { timestamp }
    }));
  }
}
