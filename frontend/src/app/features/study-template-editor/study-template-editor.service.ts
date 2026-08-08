import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { normalizeTemplateCatalog } from './study-template-editor.geometry';
import { StudyTemplateCatalogItem } from './study-template-editor.models';

@Injectable({ providedIn: 'root' })
export class StudyTemplateEditorService {
  private readonly http = inject(HttpClient);
  templates(): Observable<readonly StudyTemplateCatalogItem[]> {
    return this.http.get<unknown>('/api/study-templates', { params: new HttpParams().set('scope', 'all').set('includeInactive', '0'), withCredentials: true })
      .pipe(map(normalizeTemplateCatalog));
  }
  image(url: string): Observable<Blob> { return this.http.get(url, { responseType: 'blob', withCredentials: true }); }
}
