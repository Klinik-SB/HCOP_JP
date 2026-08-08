import { CommonModule } from '@angular/common';
import {
  Component,
  ChangeDetectorRef,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  NgZone,
  Output,
  ViewChild,
  inject
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, catchError, finalize, of } from 'rxjs';
import {
  CoirCatalogItem,
  DrugCatalogItem,
  ProtocolCatalogItem,
  ProtocolChangedEvent,
  ProtocolComponentDraft,
  ProtocolEditorDraft,
  ProtocolValidationIssue
} from './protocol-configuration.models';
import {
  DEFAULT_PROTOCOL_CATEGORIES,
  blankPreparation,
  blankProtocol,
  blankProtocolComponent,
  buildSaveProtocolPayload,
  duplicateProtocol,
  formatMinutes,
  promoteCatalogProtocol,
  protocolDraftSignature,
  protocolFailureMessage,
  validateProtocolDraft
} from './protocol-configuration.normalizers';
import { ProtocolConfigurationService } from './protocol-configuration.service';

@Component({
  selector: 'app-protocol-configuration',
  imports: [CommonModule, FormsModule],
  host: {
    class: 'protocol-configuration-host'
  },
  templateUrl: './protocol-configuration.component.html',
  styleUrl: './protocol-configuration.component.scss'
})
export class ProtocolConfigurationComponent implements OnInit, OnDestroy {
  private readonly service = inject(ProtocolConfigurationService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  private readonly subscriptions = new Subscription();
  private readonly searchTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly searchSequences = new Map<string, number>();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private catalogSequence = 0;
  private detailSequence = 0;
  private draggedClientId = '';
  private persistedDraftSignature = '';
  private persistedDraft: ProtocolEditorDraft | null = null;

  @Input() autoLoad = true;
  @Input() canEdit = true;
  @Input() embedded = true;
  @Output() readonly protocolChanged = new EventEmitter<ProtocolChangedEvent>();
  @ViewChild('protocolNameInput') private protocolNameInput?: ElementRef<HTMLInputElement>;

  readonly categories = DEFAULT_PROTOCOL_CATEGORIES;
  protocols: readonly ProtocolCatalogItem[] = [];
  coirCatalog: readonly CoirCatalogItem[] = [];
  draft: ProtocolEditorDraft | null = null;
  selectedId = '';
  search = '';
  showArchived = false;
  showCoir = true;
  loadingCatalog = false;
  loadingEditor = false;
  saving = false;
  catalogError = '';
  editorError = '';
  validationIssues: readonly ProtocolValidationIssue[] = [];
  toastMessage = '';
  toastError = false;
  currentCount = 0;
  catalogCount = 0;
  drugResults = new Map<string, readonly DrugCatalogItem[]>();
  drugSearchLoading = new Set<string>();
  activeDrugPicker = '';

  ngOnInit(): void {
    if (this.autoLoad) this.reload();
  }

  ngOnDestroy(): void {
    this.catalogSequence += 1;
    this.detailSequence += 1;
    this.subscriptions.unsubscribe();
    this.searchTimers.forEach((timer) => clearTimeout(timer));
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  get filteredProtocols(): readonly ProtocolCatalogItem[] {
    const query = normalizeSearch(this.search);
    return this.protocols.filter((item) => {
      if (item.catalogOnly && !this.showCoir) return false;
      if (!item.catalogOnly && !item.active && !this.showArchived) return false;
      return !query || normalizeSearch(`${item.name} ${item.category}`).includes(query);
    });
  }

  get statusText(): string {
    if (this.loadingCatalog) return 'Conectando con la base local…';
    if (this.catalogError) return 'La base clínica local no responde';
    return `${this.currentCount} propios · ${this.catalogCount} COIR disponibles`;
  }

  get isReadOnly(): boolean {
    return !this.canEdit || Boolean(this.draft?.catalogOnly) || this.loadingEditor || this.saving;
  }

  hasUnsavedChanges(): boolean {
    const current = protocolDraftSignature(this.draft);
    return Boolean(current && current !== this.persistedDraftSignature);
  }

  confirmDiscardChanges(
    message = 'Hay cambios sin guardar en el protocolo. Si continúa, se perderán. ¿Desea descartarlos?'
  ): boolean {
    return !this.hasUnsavedChanges() || globalThis.confirm(message);
  }

  confirmDiscardAndRestore(
    message = 'Hay cambios sin guardar en el protocolo. Si continúa, se perderán. ¿Desea descartarlos?'
  ): boolean {
    if (this.saving) {
      this.showToast('Espere a que termine el guardado antes de cambiar de sección.');
      return false;
    }
    if (!this.hasUnsavedChanges()) return true;
    if (!this.confirmDiscardChanges(message)) return false;
    this.restorePersistedDraft();
    return true;
  }

  get editorEyebrow(): string {
    const draft = this.draft;
    if (!draft) return 'Protocolo clínico';
    if (draft.catalogOnly) return 'Catálogo operativo COIR';
    return draft.id ? `Protocolo ${draft.id}` : 'Nuevo protocolo';
  }

  get stateLabel(): string {
    const draft = this.draft;
    if (!draft) return '';
    if (draft.catalogOnly) return 'Sin vincular';
    return draft.active ? 'Activo' : 'Archivado';
  }

  reload(): void {
    if (!this.confirmDiscardChanges('Actualizar descartará los cambios del protocolo que todavía no guardó. ¿Desea continuar?')) return;
    if (!this.selectedId) {
      this.detailSequence += 1;
      this.draft = null;
      this.persistedDraftSignature = '';
      this.persistedDraft = null;
      this.editorError = '';
      this.validationIssues = [];
      this.clearDrugPickers();
    }
    this.loadCatalog(this.selectedId, true);
  }

  beginNewProtocol(): void {
    if (!this.canEdit || this.saving) return;
    if (!this.confirmDiscardChanges()) return;
    this.detailSequence += 1;
    this.selectedId = '';
    this.draft = blankProtocol();
    this.persistedDraftSignature = '';
    this.persistedDraft = null;
    this.editorError = '';
    this.validationIssues = [];
    this.clearDrugPickers();
    this.focusProtocolName();
  }

  selectProtocol(id: string, discardConfirmed = false): void {
    const normalizedId = id.trim();
    if (!normalizedId || this.saving) return;
    if (!discardConfirmed && !this.confirmDiscardChanges()) return;
    this.selectedId = normalizedId;
    this.draft = null;
    this.persistedDraftSignature = '';
    this.persistedDraft = null;
    this.editorError = '';
    this.validationIssues = [];
    this.loadingEditor = true;
    this.clearDrugPickers();
    const sequence = ++this.detailSequence;
    this.subscriptions.add(this.service.detail(normalizedId).pipe(
      catchError((failure: unknown) => {
        if (sequence === this.detailSequence) {
          this.updateView(() => {
            this.loadingEditor = false;
            this.editorError = protocolFailureMessage(failure);
          });
        }
        return of(null);
      })
    ).subscribe((draft) => {
      if (sequence !== this.detailSequence) return;
      this.updateView(() => {
        this.loadingEditor = false;
        if (!draft) return;
        this.draft = draft;
        this.rememberPersistedDraft(draft);
        this.selectedId = draft.id;
        this.clearDrugPickers();
      });
    }));
  }

  clearSearch(): void {
    this.search = '';
  }

  addComponent(): void {
    if (!this.draft || this.isReadOnly) return;
    this.draft.components.push(blankProtocolComponent());
    this.validationIssues = [];
  }

  removeComponent(index: number): void {
    if (!this.draft || this.isReadOnly) return;
    const [removed] = this.draft.components.splice(index, 1);
    if (removed) this.clearDrugPicker(removed.clientId);
    if (!this.draft.components.length) this.draft.components.push(blankProtocolComponent());
    this.validationIssues = [];
  }

  moveComponent(index: number, direction: -1 | 1): void {
    if (!this.draft || this.isReadOnly) return;
    const destination = index + direction;
    if (destination < 0 || destination >= this.draft.components.length) return;
    const [component] = this.draft.components.splice(index, 1);
    if (!component) return;
    this.draft.components.splice(destination, 0, component);
  }

  startComponentDrag(component: ProtocolComponentDraft, event: DragEvent): void {
    if (this.isReadOnly) return;
    this.draggedClientId = component.clientId;
    event.dataTransfer?.setData('text/plain', component.clientId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  allowComponentDrop(event: DragEvent): void {
    if (!this.isReadOnly) event.preventDefault();
  }

  dropComponent(targetIndex: number, event: DragEvent): void {
    event.preventDefault();
    if (!this.draft || this.isReadOnly) return;
    const clientId = this.draggedClientId || event.dataTransfer?.getData('text/plain') || '';
    const sourceIndex = this.draft.components.findIndex((item) => item.clientId === clientId);
    this.draggedClientId = '';
    if (sourceIndex < 0 || sourceIndex === targetIndex) return;
    const [component] = this.draft.components.splice(sourceIndex, 1);
    if (!component) return;
    const destination = Math.min(targetIndex, this.draft.components.length);
    this.draft.components.splice(destination, 0, component);
  }

  drugNameChanged(component: ProtocolComponentDraft): void {
    if (component.drugId && component.drugName !== component.preparation.drugName) {
      component.drugId = '';
      component.instructionCount = 0;
      component.presentationCount = 0;
    }
    this.scheduleDrugSearch(component);
  }

  focusDrugPicker(component: ProtocolComponentDraft): void {
    this.activeDrugPicker = component.clientId;
    if (component.drugName.trim().length >= 2) this.scheduleDrugSearch(component, 0);
  }

  closeDrugPicker(component: ProtocolComponentDraft): void {
    setTimeout(() => {
      if (this.activeDrugPicker !== component.clientId) return;
      this.updateView(() => { this.activeDrugPicker = ''; });
    }, 180);
  }

  selectDrug(component: ProtocolComponentDraft, drug: DrugCatalogItem): void {
    component.drugId = drug.id;
    component.drugName = drug.name;
    component.instructionCount = drug.instructions.length;
    component.presentationCount = drug.presentations.length;
    component.preparation = drug.instructions[0]
      ? { ...structuredCloneSafe(drug.instructions[0]), dirty: false, drugId: drug.id, drugName: drug.name }
      : { ...blankPreparation(), drugId: drug.id, drugName: drug.name };
    if (!component.route && component.preparation.route) component.route = component.preparation.route;
    this.activeDrugPicker = '';
  }

  markPreparationDirty(component: ProtocolComponentDraft): void {
    component.preparation.dirty = true;
  }

  preparationState(component: ProtocolComponentDraft): string {
    if (component.preparation.dirty) return 'Cambios pendientes';
    if (component.preparation.id || component.instructionCount) return 'Preparación vinculada';
    return 'Sin preparación registrada';
  }

  duplicateCurrent(): void {
    if (!this.draft || this.draft.catalogOnly || !this.canEdit) return;
    this.selectedId = '';
    this.draft = duplicateProtocol(this.draft);
    this.persistedDraftSignature = '';
    this.persistedDraft = null;
    this.validationIssues = [];
    this.editorError = '';
    this.clearDrugPickers();
    this.focusProtocolName();
  }

  promoteCurrent(): void {
    if (!this.draft?.catalogOnly || !this.canEdit) return;
    const hadComponents = this.draft.components.length > 0;
    this.selectedId = '';
    this.draft = promoteCatalogProtocol(this.draft);
    this.persistedDraftSignature = '';
    this.persistedDraft = null;
    this.validationIssues = [];
    this.editorError = '';
    this.clearDrugPickers();
    this.showToast(hadComponents
      ? 'Revise las drogas importadas y guarde el protocolo clínico.'
      : 'Complete al menos una droga para crear el protocolo clínico.');
  }

  save(): void {
    const draft = this.draft;
    if (!draft || this.isReadOnly || this.saving) return;
    const issues = validateProtocolDraft(draft);
    this.validationIssues = issues;
    if (issues.length) {
      this.showToast(issues[0]?.message ?? 'Revise los campos obligatorios.', true);
      return;
    }
    const isNew = !draft.id;
    const wasArchived = draft.active === false;
    this.saving = true;
    this.editorError = '';
    const request = isNew
      ? this.service.create(buildSaveProtocolPayload(draft))
      : this.service.update(draft.id, buildSaveProtocolPayload(draft));
    this.subscriptions.add(request.pipe(
      catchError((failure: unknown) => {
        this.updateView(() => {
          this.saving = false;
          this.editorError = protocolFailureMessage(failure);
        });
        return of(null);
      })
    ).subscribe((saved) => {
      this.updateView(() => {
        this.saving = false;
        if (!saved) return;
        this.draft = saved;
        this.rememberPersistedDraft(saved);
        this.selectedId = saved.id;
        this.validationIssues = [];
        const action: ProtocolChangedEvent['action'] = isNew ? 'created' : wasArchived && saved.active ? 'restored' : 'updated';
        this.afterMutation(saved.id, action);
        this.showToast(isNew
          ? 'Protocolo creado y disponible en el sistema.'
          : action === 'restored'
            ? 'Protocolo restaurado correctamente.'
            : 'Protocolo actualizado correctamente.');
      });
    }));
  }

  archiveOrRestore(): void {
    const draft = this.draft;
    if (!draft?.id || draft.catalogOnly || !this.canEdit || this.saving) return;
    if (!draft.active) {
      draft.active = true;
      this.save();
      return;
    }
    const archiveMessage = this.hasUnsavedChanges()
      ? 'Hay cambios sin guardar que se descartarán al archivar. El protocolo dejará de aparecer al crear tratamientos, pero sus datos históricos se conservarán. ¿Desea continuar?'
      : 'El protocolo dejará de aparecer al crear tratamientos. Sus datos y tratamientos históricos se conservarán. ¿Desea archivarlo?';
    if (!globalThis.confirm(archiveMessage)) return;
    this.saving = true;
    this.editorError = '';
    this.subscriptions.add(this.service.archive(draft.id).pipe(
      catchError((failure: unknown) => {
        this.updateView(() => {
          this.saving = false;
          this.editorError = protocolFailureMessage(failure);
        });
        return of(null);
      })
    ).subscribe((archived) => {
      this.updateView(() => {
        this.saving = false;
        if (!archived) return;
        this.draft = archived;
        this.rememberPersistedDraft(archived);
        this.selectedId = archived.id;
        this.afterMutation(archived.id, 'archived');
        this.showToast('Protocolo archivado sin eliminar datos históricos.');
      });
    }));
  }

  fieldHasIssue(path: string): boolean {
    return this.validationIssues.some((issue) => issue.path === path || issue.path.startsWith(`${path}.`));
  }

  componentHasIssue(index: number): boolean {
    return this.validationIssues.some((issue) => issue.path.startsWith(`components.${index}.`));
  }

  protocolMeta(item: ProtocolCatalogItem): string {
    const duration = item.durationText || formatMinutes(item.durationMinutes);
    if (item.catalogOnly) {
      return `${item.componentCount} drogas · ${duration}${item.componentCount ? '' : ' · pendiente de completar'}`;
    }
    return `${item.componentCount} drogas · ${item.durationMinutes ? duration : 'sin duración'}${item.active ? '' : ' · archivado'}`;
  }

  formatDuration(value: number | null): string {
    return formatMinutes(value);
  }

  trackProtocol(_index: number, item: ProtocolCatalogItem): string {
    return item.id;
  }

  trackComponent(_index: number, item: ProtocolComponentDraft): string {
    return item.clientId;
  }

  private loadCatalog(keepSelection: string, refreshDetail: boolean): void {
    const sequence = ++this.catalogSequence;
    this.loadingCatalog = true;
    this.catalogError = '';
    this.subscriptions.add(this.service.loadCatalog().pipe(
      catchError((failure: unknown) => {
        if (sequence === this.catalogSequence) {
          this.updateView(() => { this.catalogError = protocolFailureMessage(failure); });
        }
        return of(null);
      }),
      finalize(() => {
        if (sequence === this.catalogSequence) {
          this.updateView(() => { this.loadingCatalog = false; });
        }
      })
    ).subscribe((catalog) => {
      if (sequence !== this.catalogSequence) return;
      if (!catalog) return;
      this.updateView(() => {
        this.protocols = catalog.protocols.protocols;
        this.currentCount = catalog.protocols.currentCount;
        this.catalogCount = catalog.protocols.catalogCount;
        this.coirCatalog = catalog.coir.filter((item) => item.entryType === 'treatment');
        if (keepSelection && this.protocols.some((item) => item.id === keepSelection)) {
          this.selectedId = keepSelection;
          if (refreshDetail) this.selectProtocol(keepSelection, true);
        } else if (keepSelection && refreshDetail) {
          this.selectedId = '';
          this.draft = null;
          this.persistedDraftSignature = '';
          this.persistedDraft = null;
        }
      });
    }));
  }

  private updateView(update: () => void): void {
    this.zone.run(() => {
      update();
      this.changeDetector.markForCheck();
      this.changeDetector.detectChanges();
    });
  }

  private rememberPersistedDraft(draft: ProtocolEditorDraft): void {
    this.persistedDraft = structuredCloneSafe(draft);
    this.persistedDraftSignature = protocolDraftSignature(draft);
  }

  private restorePersistedDraft(): void {
    this.detailSequence += 1;
    this.loadingEditor = false;
    this.draft = this.persistedDraft ? structuredCloneSafe(this.persistedDraft) : null;
    this.selectedId = this.draft?.id ?? '';
    this.persistedDraftSignature = protocolDraftSignature(this.draft);
    this.editorError = '';
    this.validationIssues = [];
    this.clearDrugPickers();
  }

  private scheduleDrugSearch(component: ProtocolComponentDraft, delay = 250): void {
    this.clearSearchTimer(component.clientId);
    const query = component.drugName.trim();
    if (query.length < 2) {
      this.drugResults.delete(component.clientId);
      this.drugSearchLoading.delete(component.clientId);
      return;
    }
    const timer = setTimeout(() => this.runDrugSearch(component, query), delay);
    this.searchTimers.set(component.clientId, timer);
  }

  private runDrugSearch(component: ProtocolComponentDraft, query: string): void {
    const clientId = component.clientId;
    const sequence = (this.searchSequences.get(clientId) ?? 0) + 1;
    this.searchSequences.set(clientId, sequence);
    this.updateView(() => { this.drugSearchLoading.add(clientId); });
    this.subscriptions.add(this.service.searchDrugs(query).pipe(
      catchError(() => of<readonly DrugCatalogItem[]>([]))
    ).subscribe((results) => {
      if (this.searchSequences.get(clientId) !== sequence || component.drugName.trim() !== query) return;
      this.updateView(() => {
        this.drugSearchLoading.delete(clientId);
        this.drugResults.set(clientId, results);
        this.activeDrugPicker = clientId;
      });
    }));
  }

  private afterMutation(protocolId: string, action: ProtocolChangedEvent['action']): void {
    this.service.broadcastCatalogChanged();
    this.protocolChanged.emit({ protocolId, action });
    this.loadCatalog(protocolId, false);
  }

  private clearDrugPickers(): void {
    this.searchTimers.forEach((timer) => clearTimeout(timer));
    this.searchTimers.clear();
    this.searchSequences.clear();
    this.drugResults.clear();
    this.drugSearchLoading.clear();
    this.activeDrugPicker = '';
  }

  private clearDrugPicker(clientId: string): void {
    this.clearSearchTimer(clientId);
    this.searchSequences.delete(clientId);
    this.drugResults.delete(clientId);
    this.drugSearchLoading.delete(clientId);
    if (this.activeDrugPicker === clientId) this.activeDrugPicker = '';
  }

  private clearSearchTimer(clientId: string): void {
    const timer = this.searchTimers.get(clientId);
    if (timer) clearTimeout(timer);
    this.searchTimers.delete(clientId);
  }

  private focusProtocolName(): void {
    setTimeout(() => this.protocolNameInput?.nativeElement.focus(), 0);
  }

  private showToast(message: string, error = false): void {
    this.toastMessage = message;
    this.toastError = error;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.updateView(() => {
        this.toastMessage = '';
        this.toastError = false;
      });
    }, 4200);
  }
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
