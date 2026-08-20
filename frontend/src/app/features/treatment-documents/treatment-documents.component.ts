import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import {
  TreatmentDocumentAction,
  TreatmentDocumentKind,
  TreatmentDocumentSnapshot,
  deriveTreatmentDocumentActions,
  normalizeDocumentContext
} from './treatment-documents.models';
import {
  TreatmentDocumentContent,
  TreatmentDocumentsService,
  treatmentDocumentError
} from './treatment-documents.service';

export interface TreatmentDocumentNotification {
  readonly type: 'success' | 'error' | 'info';
  readonly message: string;
  readonly kind?: TreatmentDocumentKind;
}

@Component({
  selector: 'app-treatment-documents',
  templateUrl: './treatment-documents.component.html',
  styleUrl: './treatment-documents.component.scss',
  host: {
    '[class.is-compact]': 'compact()',
    '[attr.aria-busy]': 'loading() || !!openingKind()'
  }
})
export class TreatmentDocumentsComponent {
  readonly patientId = input<string | number | null>(null);
  readonly treatmentId = input<string | number | null>(null);
  readonly cycle = input<string | number | null>(null);
  readonly applicationDay = input<string | number | null>(1);
  readonly sourceCycleId = input<string | number | null>(null);
  readonly compact = input(true);
  readonly autoLoad = input(true);
  readonly onlyKinds = input<readonly TreatmentDocumentKind[] | null>(null);
  readonly notification = output<TreatmentDocumentNotification>();

  private readonly auth = inject(AuthService);
  private readonly documents = inject(TreatmentDocumentsService);

  readonly loading = signal(false);
  readonly openingKind = signal<TreatmentDocumentKind | null>(null);
  readonly snapshot = signal<TreatmentDocumentSnapshot>({});
  readonly warning = signal('');
  readonly error = signal('');
  readonly context = computed(() => normalizeDocumentContext(
    this.patientId(), this.treatmentId(), this.cycle(), this.applicationDay(), this.sourceCycleId()
  ));
  readonly actions = computed(() => deriveTreatmentDocumentActions(
    this.context(),
    {
      prescriptionsView: this.auth.hasPermission('section.prescriptions.view'),
      dayHospitalView: this.auth.hasPermission('section.day-hospital.view'),
      preparationManage: this.auth.hasPermission('application.preparation.manage')
    },
    this.snapshot()
  ));
  readonly visibleActions = computed(() => {
    const onlyKinds = this.onlyKinds();
    return this.actions().filter((action) =>
      action.availability !== 'blocked' && (!onlyKinds || onlyKinds.includes(action.kind))
    );
  });

  constructor() {
    effect((onCleanup) => {
      const context = this.context();
      if (!this.autoLoad() || !context.patientId || !context.treatmentId) {
        this.snapshot.set({});
        this.warning.set('');
        return;
      }
      this.loading.set(true);
      this.error.set('');
      const subscription = this.documents.load(context).subscribe({
        next: (result) => {
          this.snapshot.set(result.snapshot);
          this.warning.set(result.warnings[0] || '');
          this.loading.set(false);
        },
        error: (failure: unknown) => {
          const message = treatmentDocumentError(failure, 'No se pudieron verificar los documentos del tratamiento.');
          this.error.set(message);
          this.loading.set(false);
          this.emit('error', message);
        }
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  reload(): void {
    const context = this.context();
    if (!context.patientId || !context.treatmentId || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.documents.load(context).subscribe({
      next: (result) => {
        this.snapshot.set(result.snapshot);
        this.warning.set(result.warnings[0] || '');
        this.loading.set(false);
        this.emit('info', 'Estados de documentos actualizados.');
      },
      error: (failure: unknown) => {
        const message = treatmentDocumentError(failure, 'No se pudieron actualizar los documentos.');
        this.error.set(message);
        this.loading.set(false);
        this.emit('error', message);
      }
    });
  }

  openDocument(action: TreatmentDocumentAction): void {
    if (this.loading() || !action.enabled || this.openingKind()) return;
    this.error.set('');
    this.openingKind.set(action.kind);
    const target = openLoadingWindow(action.label);
    const html = isHtmlDocument(action.kind);
    this.documents.open(action.url, html).subscribe({
      next: (content) => {
        this.present(content, target, action.label, html);
        this.openingKind.set(null);
        this.emit('success', `${action.shortLabel} abierto.`, action.kind);
      },
      error: (failure: unknown) => {
        target?.close();
        const message = treatmentDocumentError(failure, `No se pudo abrir ${action.shortLabel.toLocaleLowerCase('es-AR')}.`);
        this.error.set(message);
        this.openingKind.set(null);
        this.emit('error', message, action.kind);
        if (failureStatus(failure) === 404) this.markUnavailable(action.kind);
      }
    });
  }

  trackAction(_: number, action: TreatmentDocumentAction): TreatmentDocumentKind {
    return action.kind;
  }

  private present(content: TreatmentDocumentContent, target: Window | null, title: string, html: boolean): void {
    if (html && typeof content.body === 'string') {
      if (target) {
        target.document.open();
        target.document.write(withBase(content.body));
        target.document.close();
        return;
      }
      downloadBlob(new Blob([withBase(content.body)], { type: content.contentType }), content.fileName);
      return;
    }
    const blob = content.body instanceof Blob
      ? content.body : new Blob([content.body], { type: content.contentType });
    const objectUrl = URL.createObjectURL(blob);
    if (target) {
      target.document.title = title;
      target.location.replace(objectUrl);
    } else {
      downloadUrl(objectUrl, content.fileName);
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
  }

  private markUnavailable(kind: TreatmentDocumentKind): void {
    const current = this.snapshot();
    if (kind === 'consent' && current.treatment) {
      this.snapshot.set({ ...current, treatment: { ...current.treatment, consentAvailable: false } });
    }
    if (kind === 'prescription') {
      const detail = unwrapDetail(current.detail);
      this.snapshot.set({
        ...current,
        detail: { ...detail, documentAvailability: { ...asObject(detail['documentAvailability']), prescription: false } }
      });
    }
  }

  private emit(type: TreatmentDocumentNotification['type'], message: string, kind?: TreatmentDocumentKind): void {
    this.notification.emit(kind ? { type, message, kind } : { type, message });
  }
}

function isHtmlDocument(kind: TreatmentDocumentKind): boolean {
  return kind === 'treatment-sheet' || kind === 'qr' || kind === 'preparation-label';
}

function openLoadingWindow(title: string): Window | null {
  const target = window.open('', '_blank');
  if (!target) return null;
  target.opener = null;
  target.document.title = title;
  target.document.body.textContent = 'Abriendo documento clínico…';
  return target;
}

function withBase(html: string): string {
  const base = `<base href="${escapeAttribute(window.location.origin)}/">`;
  return /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${base}`)
    : `<!doctype html><html lang="es"><head>${base}<meta charset="utf-8"></head><body>${html}</body></html>`;
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, fileName);
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function downloadUrl(url: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function failureStatus(failure: unknown): number {
  return failure !== null && typeof failure === 'object' && 'status' in failure
    ? Number((failure as { status?: unknown }).status) : 0;
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function unwrapDetail(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {};
  const detail = asObject(value['detail']);
  return Object.keys(detail).length ? detail : value;
}
