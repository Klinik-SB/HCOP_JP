import { Component, ElementRef, HostListener, ViewChild, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ClinicalStudyEntry, clinicalStudyEntries } from '../../core/clinical/clinical-study-projection';
import { ClinicalRecord, ClinicalState, StudyUploadDescriptor } from '../../core/patients/patient-workspace.models';
import { PatientWorkspaceService } from '../../core/patients/patient-workspace.service';

type UploadStatus = 'ready' | 'uploading' | 'uploaded' | 'error';

interface UploadItem {
  id: string;
  file: File;
  extension: string;
  status: UploadStatus;
  error?: string;
}

interface DeleteAuthorization {
  storageName: string;
  token: string;
  expiresAt: string;
}

export interface StudyPanelRequest {
  readonly id: number;
  readonly mode: 'browse' | 'upload';
  readonly studyKey?: string;
}

const ACCEPTED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'heif', 'svg', 'dcm',
  'pdf', 'doc', 'docx', 'rtf', 'odt', 'ppt', 'pps', 'pptx', 'ppsx', 'odp',
  'mp4', 'm4v', 'mov', '3gp', 'webm', 'mkv', 'avi', 'mpeg', 'mpg', 'ogv', 'wmv', 'flv'
]);
const MAX_FILE_SIZE = 250 * 1024 * 1024;
const MAX_BATCH_SIZE = 500 * 1024 * 1024;
const MAX_FILE_COUNT = 30;

@Component({
  selector: 'app-study-panel',
  imports: [ReactiveFormsModule],
  templateUrl: './study-panel.component.html',
  styleUrl: './study-panel.component.scss'
})
export class StudyPanelComponent {
  readonly workspace = inject(PatientWorkspaceService);
  readonly auth = inject(AuthService);
  readonly request = input<StudyPanelRequest | null>(null);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly term = new FormControl('', { nonNullable: true });
  readonly searchTerm = signal('');
  readonly uploads = signal<UploadItem[]>([]);
  readonly uploadOpen = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly dragActive = signal(false);
  readonly selectedKey = signal('');
  private readonly deleteAuthorizations = new Map<string, DeleteAuthorization>();
  private handledRequestId = 0;
  private uploadReturnFocus: HTMLElement | null = null;
  @ViewChild('studyUploadClose') private studyUploadClose?: ElementRef<HTMLButtonElement>;

  readonly studyEntries = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase('es-AR');
    const state = this.workspace.workingWorkspace()?.state;
    return clinicalStudyEntries(state)
      .filter((entry) => !query || this.searchText(entry.record).includes(query));
  });
  readonly studies = computed(() => this.studyEntries().map((entry) => entry.record));

  constructor() {
    this.term.valueChanges.subscribe((value) => this.searchTerm.set(value));
    effect(() => {
      const request = this.request();
      if (!request || request.id === this.handledRequestId) return;
      this.handledRequestId = request.id;
      this.term.setValue('', { emitEvent: false });
      this.searchTerm.set('');
      if (request.studyKey) this.selectedKey.set(request.studyKey);
      if (request.mode === 'upload') {
        queueMicrotask(() => this.openUpload());
      } else {
        queueMicrotask(() => this.focusStudy(request.studyKey));
      }
    });
  }

  openUpload(files?: FileList | File[]): void {
    if (this.busy()) return;
    if (!this.canUpload()) {
      this.message.set('No tiene disponible la carga de estudios en este momento.');
      return;
    }
    if (!this.uploadOpen()) {
      this.uploadReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    this.message.set('');
    this.uploadOpen.set(true);
    if (files) this.addFiles(Array.from(files));
    queueMicrotask(() => this.studyUploadClose?.nativeElement.focus());
  }

  closeUpload(): void {
    if (this.busy()) return;
    this.finishCloseUpload();
  }

  addFiles(files: File[]): void {
    const current = this.uploads();
    let size = current.filter((item) => item.status !== 'error').reduce((total, item) => total + item.file.size, 0);
    const additions = files.map((file, index) => {
      const extension = this.extension(file.name);
      let error = '';
      if (current.length + index >= MAX_FILE_COUNT) error = `Solo se pueden preparar ${MAX_FILE_COUNT} archivos por lote.`;
      else if (!ACCEPTED_EXTENSIONS.has(extension)) error = 'Formato no admitido.';
      else if (!file.size) error = 'El archivo está vacío.';
      else if (file.size > MAX_FILE_SIZE) error = 'Supera el límite de 250 MB.';
      else if (size + file.size > MAX_BATCH_SIZE) error = 'El lote supera el límite total de 500 MB.';
      if (!error) size += file.size;
      return { id: this.id(), file, extension, status: error ? 'error' : 'ready', error } as UploadItem;
    });
    this.uploads.set([...current, ...additions]);
  }

  removeUpload(id: string): void { if (!this.busy()) this.uploads.update((items) => items.filter((item) => item.id !== id)); }
  retryUpload(id: string): void { if (!this.busy()) this.uploads.update((items) => items.map((item) => item.id === id ? { ...item, status: 'ready', error: '' } : item)); }
  onFileInput(event: Event): void { const input = event.target as HTMLInputElement; if (input.files) this.addFiles(Array.from(input.files)); input.value = ''; }
  onDragOver(event: DragEvent): void { event.preventDefault(); this.dragActive.set(true); }
  onDragLeave(event: DragEvent): void { event.preventDefault(); this.dragActive.set(false); }
  onDrop(event: DragEvent): void { event.preventDefault(); this.dragActive.set(false); if (event.dataTransfer?.files?.length) this.addFiles(Array.from(event.dataTransfer.files)); }

  @HostListener('document:paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    if (!this.uploadOpen() || this.busy()) return;
    const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    this.addFiles(files);
  }

  async upload(): Promise<void> {
    if (this.workspace.activeSaveConflict()) {
      this.message.set('Resuelva el borrador pendiente antes de cargar nuevos archivos.');
      return;
    }
    const current = this.workspace.workspace();
    const patientId = current?.patientId || current?.patient?.id;
    const ready = this.uploads().filter((item) => item.status === 'ready');
    if (!patientId) { this.message.set('Abra o cree un paciente antes de subir estudios.'); return; }
    if (!ready.length || this.busy()) return;

    this.busy.set(true);
    this.message.set('');
    const records: ClinicalRecord[] = [];
    try {
      for (const item of ready) {
        this.markUpload(item.id, { status: 'uploading', error: '' });
        try {
          const studyId = `est-${this.id()}`;
          const descriptor = await firstValueFrom(this.workspace.uploadStudy(String(patientId), studyId, item.file));
          if (!descriptor.url) throw new Error('El servidor no confirmó el archivo cargado.');
          records.push(this.studyFromUpload(studyId, item.file, descriptor));
          if (descriptor.deleteToken) {
            this.deleteAuthorizations.set(studyId, {
              storageName: descriptor.url.split('/').pop() || '',
              token: descriptor.deleteToken,
              expiresAt: descriptor.deleteExpiresAt || ''
            });
          }
          this.markUpload(item.id, { status: 'uploaded' });
        } catch (error) {
          this.markUpload(item.id, { status: 'error', error: this.error(error, 'No se pudo cargar el archivo.') });
        }
      }
      if (records.length) {
        const next = this.nextState((state) => ({
          ...state,
          studies: [...records, ...(state.studies || [])],
          meta: { ...(state.meta || {}), updatedAt: new Date().toISOString() }
        }));
        await firstValueFrom(this.workspace.saveState(next));
        this.selectedKey.set(`id:${String(records[0].id)}`);
      }
      if (!this.uploads().some((item) => item.status === 'error')) this.finishCloseUpload();
      else this.message.set(`${records.length} archivo(s) cargado(s). Revise los pendientes.`);
    } catch (error) {
      this.message.set(this.error(error, 'Los archivos se cargaron, pero la historia no pudo guardarse.'));
    } finally {
      this.busy.set(false);
    }
  }

  async removeStudy(record: ClinicalRecord): Promise<void> {
    if (this.workspace.activeSaveConflict()) {
      this.message.set('Resuelva el borrador pendiente antes de eliminar archivos.');
      return;
    }
    const studyId = String(record.id || '');
    const authorization = this.deleteAuthorizations.get(studyId);
    if (!authorization || !authorization.storageName || this.busy()) return;
    if (!window.confirm('¿Eliminar este archivo cargado durante la sesión actual? Esta acción no se puede deshacer.')) return;
    this.busy.set(true);
    this.message.set('');
    try {
      const next = this.nextState((state) => ({
        ...state,
        studies: (state.studies || []).filter((item) => String(item.id) !== studyId),
        meta: { ...(state.meta || {}), updatedAt: new Date().toISOString() }
      }));
      await firstValueFrom(this.workspace.saveState(next));
      try { await firstValueFrom(this.workspace.deleteUploadedStudy(authorization.storageName, authorization.token)); }
      catch { this.message.set('La imagen se eliminó de la ficha, pero no se pudo limpiar el archivo local.'); }
      this.deleteAuthorizations.delete(studyId);
      if (this.selectedKey() === `id:${studyId}`) this.selectedKey.set('');
    } catch (error) {
      this.message.set(this.error(error, 'No se pudo confirmar la eliminación de la imagen.'));
    } finally {
      this.busy.set(false);
    }
  }

  select(entry: ClinicalStudyEntry): void { this.selectedKey.set(entry.key); }
  canDelete(record: ClinicalRecord): boolean {
    const authorization = this.deleteAuthorizations.get(String(record.id || ''));
    return Boolean(authorization && (!authorization.expiresAt || Date.parse(authorization.expiresAt) > Date.now()));
  }
  canEdit(): boolean { return this.auth.hasPermission('section.studies.edit'); }
  canUpload(): boolean {
    return Boolean(this.workspace.workspace()
      && !this.workspace.loading()
      && !this.workspace.hasPendingClinicalWork()
      && this.canEdit());
  }
  trapUploadFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )].filter((element) => element.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault(); first.focus();
    }
  }
  fileIcon(record: ClinicalRecord): string { return this.category(record) === 'image' ? '▧' : this.category(record) === 'pdf' ? '▤' : this.category(record) === 'video' ? '▶' : '▱'; }
  fileKind(record: ClinicalRecord): string { return String(record.type || this.category(record) || 'Archivo'); }
  title(record: ClinicalRecord): string { return String(record.title || record.fileName || 'Estudio sin título'); }
  source(record: ClinicalRecord): string { return String(record.source || 'Repositorio local'); }
  fileUrl(record: ClinicalRecord): string { return String(record.fileUrl || record.reportUrl || record.studyUrl || ''); }
  date(value: unknown): string { const text = String(value || ''); if (!text) return 'Sin fecha'; const parsed = new Date(`${text.length === 10 ? `${text}T12:00:00` : text}`); return Number.isNaN(parsed.getTime()) ? text : new Intl.DateTimeFormat('es-AR').format(parsed); }
  size(record: ClinicalRecord): string { const value = Number(record.fileSize || record.size || 0); return value ? this.formatSize(value) : ''; }
  queueKind(item: UploadItem): string { return this.kindFromExtension(item.extension); }
  queueLabel(item: UploadItem): string { return item.status === 'ready' ? 'Listo para subir' : item.status === 'uploading' ? 'Subiendo…' : item.status === 'uploaded' ? 'Cargado' : item.error || 'No se pudo cargar'; }

  private nextState(mutator: (state: ClinicalState) => ClinicalState): ClinicalState {
    const current = this.workspace.workingWorkspace()?.state;
    if (!current) throw new Error('No hay una historia clínica activa.');
    return mutator(structuredClone(current));
  }
  private studyFromUpload(id: string, file: File, descriptor: StudyUploadDescriptor): ClinicalRecord {
    const category = descriptor.category || this.categoryFromExtension(this.extension(file.name));
    const attachment = {
      id: descriptor.id || id, fileName: descriptor.fileName || file.name, contentType: descriptor.contentType || file.type,
      size: Number(descriptor.size || file.size), sha256: descriptor.sha256 || '', category, previewable: Boolean(descriptor.previewable),
      url: descriptor.url, uploadedAt: descriptor.uploadedAt || new Date().toISOString()
    };
    const record: ClinicalRecord = {
      id, date: new Date().toISOString().slice(0, 10), datePrecision: 'day', type: this.typeForCategory(category, this.extension(file.name)),
      title: file.name.replace(/\.[^.]+$/, '') || file.name, source: 'Repositorio local', summary: '', tags: [], attachments: [attachment],
      fileName: attachment.fileName, fileType: attachment.contentType, fileSize: attachment.size, fileCategory: category,
      fileSha256: attachment.sha256, fileUrl: attachment.url, createdAt: attachment.uploadedAt, updatedAt: attachment.uploadedAt
    };
    if (category === 'image' && attachment.previewable) Object.assign(record, { presentationKind: 'loose-image', previewImageUrl: attachment.url, displayImageUrls: [attachment.url], imageUrls: [attachment.url], imageCount: 1 });
    else if (category === 'pdf') record.reportUrl = attachment.url;
    else record.studyUrl = attachment.url;
    return record;
  }
  private markUpload(id: string, patch: Partial<UploadItem>): void { this.uploads.update((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  private focusStudy(studyKey?: string): void {
    const candidates = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-study-key]')];
    const target = studyKey
      ? candidates.find((element) => element.dataset['studyKey'] === studyKey)
      : this.host.nativeElement.querySelector<HTMLElement>('.study-list');
    target?.scrollIntoView({ block: 'nearest' });
    target?.focus({ preventScroll: true });
  }
  private finishCloseUpload(): void {
    this.uploadOpen.set(false);
    this.uploads.set([]);
    this.dragActive.set(false);
    const returnFocus = this.uploadReturnFocus;
    this.uploadReturnFocus = null;
    queueMicrotask(() => {
      if (returnFocus?.isConnected && !returnFocus.hasAttribute('disabled')) returnFocus.focus({ preventScroll: true });
    });
  }
  private searchText(record: ClinicalRecord): string { return [record.title, record.fileName, record.summary, record.source, record.type, record.modality].map((item) => String(item || '')).join(' ').toLocaleLowerCase('es-AR'); }
  private extension(name: string): string { return name.toLocaleLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || ''; }
  private category(record: ClinicalRecord): string { return String(record.fileCategory || (record.attachments as Array<{ category?: string }> | undefined)?.[0]?.category || this.categoryFromExtension(this.extension(String(record.fileName || '')))); }
  private categoryFromExtension(extension: string): string {
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'heif', 'svg', 'dcm'].includes(extension)) return 'image';
    if (extension === 'pdf') return 'pdf';
    if (['doc', 'docx', 'rtf', 'odt'].includes(extension)) return 'word';
    if (['ppt', 'pps', 'pptx', 'ppsx', 'odp'].includes(extension)) return 'presentation';
    if (['mp4', 'm4v', 'mov', '3gp', 'webm', 'mkv', 'avi', 'mpeg', 'mpg', 'ogv', 'wmv', 'flv'].includes(extension)) return 'video';
    return 'file';
  }
  private typeForCategory(category: string, extension: string): string { if (category === 'image') return extension === 'dcm' ? 'Imagen DICOM' : 'Imagen'; return ({ pdf: 'Documento PDF', word: 'Documento Word', presentation: 'Presentación', video: 'Video' } as Record<string, string>)[category] || 'Otro'; }
  private kindFromExtension(extension: string): string { return this.typeForCategory(this.categoryFromExtension(extension), extension); }
  formatSize(size: number): string { if (size < 1024) return `${size} B`; if (size < 1024 ** 2) return `${Math.round(size / 1024)} KB`; return `${(size / 1024 ** 2).toFixed(1)} MB`; }
  private id(): string { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  private error(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback; }
}
