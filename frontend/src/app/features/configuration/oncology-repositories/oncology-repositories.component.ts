import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin } from 'rxjs';
import {
  OncologyRepositoriesApiFailure,
  RepositoryValidationIssue,
  TrialScreeningMode,
  TrialScreeningModeOption,
  TrialScreeningSettingsDraft,
  TrialSourceConnector,
  TrialSourceConnectorOption,
  TrialSourceDraft,
  TrialSourceItem
} from './oncology-repositories.models';
import {
  applyTrialSourceConnector,
  blankTrialSourceDraft,
  normalizeTrialScreeningSettings,
  trialScreeningDraftSnapshot,
  trialSourceAutomationReady,
  trialSourceConnectorLabel,
  trialSourceDraftFromItem,
  trialSourceDraftSnapshot,
  trialSourceRealtimeReady,
  trialSourceTypeLabel,
  validateTrialScreeningSettings,
  validateTrialSourceDraft
} from './oncology-repositories.normalizers';
import { OncologyRepositoriesService } from './oncology-repositories.service';

@Component({
  selector: 'app-oncology-repositories',
  imports: [CommonModule, FormsModule],
  templateUrl: './oncology-repositories.component.html',
  styleUrl: './oncology-repositories.component.scss'
})
export class OncologyRepositoriesComponent implements OnInit {
  private readonly service = inject(OncologyRepositoriesService);
  private sourceCleanSnapshot = '';
  private screeningCleanSnapshot = '';
  private screeningCleanDraft: TrialScreeningSettingsDraft = normalizeTrialScreeningSettings({});

  @Input() canManage = true;

  readonly connectorOptions: readonly TrialSourceConnectorOption[] = [
    { value: 'clinicaltrials-gov', label: 'ClinicalTrials.gov', description: 'API pública internacional' },
    { value: 'nci', label: 'NCI Clinical Trials', description: 'API con conector seguro' },
    { value: 'who-ictrp', label: 'WHO ICTRP', description: 'Descarga internacional' },
    { value: 'eu-ctis', label: 'EU CTIS', description: 'Portal de la Unión Europea' },
    { value: 'anmat', label: 'ANMAT', description: 'Estudios en Argentina' },
    { value: 'renis', label: 'RENIS', description: 'Registro nacional' }
  ];
  readonly screeningModes: readonly TrialScreeningModeOption[] = [
    { value: 'manual', label: 'A demanda', description: 'Deja preparada la futura consulta solicitada por el equipo.' },
    { value: 'scheduled', label: 'Programado', description: 'Deja preparada una futura reevaluación periódica.' },
    { value: 'realtime', label: 'Tiempo real', description: 'Deja preparado el futuro disparador al guardar datos clínicos.' }
  ];

  sources: readonly TrialSourceItem[] = [];
  sourceDraft: TrialSourceDraft | null = null;
  screening: TrialScreeningSettingsDraft = normalizeTrialScreeningSettings({});
  search = '';
  showInactive = false;
  loading = true;
  savingSource = false;
  savingScreening = false;
  loadError = '';
  sourceError = '';
  screeningError = '';
  notice = '';
  sourceIssues: readonly RepositoryValidationIssue[] = [];
  screeningIssues: readonly RepositoryValidationIssue[] = [];

  ngOnInit(): void { this.load(); }

  get filteredSources(): readonly TrialSourceItem[] {
    const query = this.search.trim().toLocaleLowerCase('es-AR');
    return this.sources.filter((source) =>
      (this.showInactive || source.active)
      && (!query || `${source.name} ${source.description} ${source.definition.attribution}`
        .toLocaleLowerCase('es-AR').includes(query)));
  }

  reload(): void {
    if (!this.confirmDiscardAndRestore('Actualizar descartará los cambios que todavía no guardó. ¿Desea continuar?')) return;
    this.load(this.sourceDraft?.id ?? '');
  }

  hasUnsavedChanges(): boolean {
    return trialSourceDraftSnapshot(this.sourceDraft) !== this.sourceCleanSnapshot
      || trialScreeningDraftSnapshot(this.screening) !== this.screeningCleanSnapshot;
  }

  confirmDiscardAndRestore(message = 'Hay cambios sin guardar. ¿Desea descartarlos?'): boolean {
    if (!this.hasUnsavedChanges()) return true;
    if (!globalThis.confirm(message)) return false;
    const selected = this.sources.find((source) => source.id === this.sourceDraft?.id);
    this.sourceDraft = selected ? trialSourceDraftFromItem(selected) : null;
    this.sourceCleanSnapshot = trialSourceDraftSnapshot(this.sourceDraft);
    this.screening = { ...this.screeningCleanDraft, triggerFields: [...this.screeningCleanDraft.triggerFields] };
    this.screeningCleanSnapshot = trialScreeningDraftSnapshot(this.screening);
    return true;
  }

  selectSource(source: TrialSourceItem): void {
    if (source.id === this.sourceDraft?.id) return;
    if (this.sourceDirty() && !globalThis.confirm('La fuente actual tiene cambios sin guardar. ¿Desea descartarlos?')) return;
    this.openSource(source);
  }

  newSource(): void {
    if (!this.canManage || this.savingSource) return;
    if (this.sourceDirty() && !globalThis.confirm('La fuente actual tiene cambios sin guardar. ¿Desea descartarlos?')) return;
    this.sourceDraft = blankTrialSourceDraft();
    this.sourceCleanSnapshot = '';
    this.sourceIssues = [];
    this.sourceError = '';
    this.notice = '';
  }

  changeConnector(connector: TrialSourceConnector): void {
    if (!this.sourceDraft) return;
    this.sourceDraft = applyTrialSourceConnector(this.sourceDraft, connector, !this.sourceDraft.id);
    this.sourceIssues = [];
  }

  chooseScreeningMode(mode: TrialScreeningMode): void {
    if (!this.canManage) return;
    this.screening = { ...this.screening, mode };
    this.screeningIssues = [];
  }

  saveSource(): void {
    const draft = this.sourceDraft;
    if (!draft || !this.canManage || this.savingSource) return;
    this.sourceIssues = validateTrialSourceDraft(draft);
    this.sourceError = '';
    this.notice = '';
    if (this.sourceIssues.length) return;
    this.savingSource = true;
    const request = draft.id ? this.service.updateSource(draft) : this.service.createSource(draft);
    request.subscribe({
      next: (saved) => {
        this.sources = [...this.sources.filter((item) => item.id !== saved.id), saved]
          .sort((left, right) => Number(right.active) - Number(left.active)
            || left.name.localeCompare(right.name, 'es-AR'));
        if (!saved.active) this.showInactive = true;
        this.openSource(saved);
        this.notice = 'Fuente guardada.';
        this.savingSource = false;
      },
      error: (failure: OncologyRepositoriesApiFailure) => {
        this.sourceError = failure.message;
        this.savingSource = false;
      }
    });
  }

  toggleSourceActive(): void {
    const draft = this.sourceDraft;
    if (!draft?.id || !this.canManage || this.savingSource) return;
    if (!draft.active && !this.sourceCanBeReactivated(draft)) {
      this.sourceError = 'NCI permanecerá inactivo hasta que el conector seguro esté disponible.';
      return;
    }
    const wasActive = draft.active;
    const action = draft.active ? 'desactivar' : 'reactivar';
    if (!globalThis.confirm(`¿Desea ${action} ${draft.name}?`)) return;
    this.savingSource = true;
    const request: Observable<TrialSourceItem | void> = draft.active
      ? this.service.archiveSource(draft)
      : this.service.updateSource(draft, true);
    request.subscribe({
      next: () => {
        this.savingSource = false;
        this.notice = wasActive ? 'Fuente desactivada.' : 'Fuente reactivada.';
        const preferredSourceId = wasActive && !this.showInactive ? '' : draft.id;
        this.load(preferredSourceId, true);
      },
      error: (failure: OncologyRepositoriesApiFailure) => {
        this.sourceError = failure.message;
        this.savingSource = false;
      }
    });
  }

  saveScreening(): void {
    if (!this.canManage || this.savingScreening) return;
    this.screeningIssues = validateTrialScreeningSettings(this.screening);
    this.screeningError = '';
    this.notice = '';
    if (this.screeningIssues.length) return;
    this.savingScreening = true;
    this.service.saveScreeningSettings(this.screening).subscribe({
      next: (saved) => {
        this.screening = saved;
        this.screeningCleanDraft = { ...saved, triggerFields: [...saved.triggerFields] };
        this.screeningCleanSnapshot = trialScreeningDraftSnapshot(saved);
        this.notice = 'Política de preselección guardada.';
        this.savingScreening = false;
      },
      error: (failure: OncologyRepositoriesApiFailure) => {
        this.screeningError = failure.message;
        this.savingScreening = false;
      }
    });
  }

  sourceIssue(path: string): string {
    return this.sourceIssues.find((issue) => issue.path === path)?.message ?? '';
  }

  screeningIssue(path: string): string {
    return this.screeningIssues.find((issue) => issue.path === path)?.message ?? '';
  }

  sourceType(source: TrialSourceItem): string { return trialSourceTypeLabel(source.definition.accessType); }
  sourceConnector(source: TrialSourceItem): string { return trialSourceConnectorLabel(source.definition.connector); }
  sourceAutomation(source: TrialSourceItem): boolean { return trialSourceAutomationReady(source); }
  sourceRealtime(source: TrialSourceItem): boolean { return trialSourceRealtimeReady(source); }
  sourceCanBeReactivated(draft: TrialSourceDraft): boolean {
    return !(draft.connector === 'nci' && draft.secureConnectorState === 'pending');
  }

  private load(preferredSourceId = '', preserveNotice = false): void {
    this.loading = true;
    this.loadError = '';
    if (!preserveNotice) this.notice = '';
    forkJoin({ sources: this.service.sources(), screening: this.service.screeningSettings() }).subscribe({
      next: ({ sources, screening }) => {
        this.sources = sources;
        if (!this.showInactive && !sources.some((source) => source.active)) this.showInactive = true;
        this.screening = screening;
        this.screeningCleanDraft = { ...screening, triggerFields: [...screening.triggerFields] };
        this.screeningCleanSnapshot = trialScreeningDraftSnapshot(screening);
        const selected = sources.find((item) => item.id === preferredSourceId)
          ?? sources.find((item) => item.active)
          ?? sources[0];
        if (selected) this.openSource(selected);
        else {
          this.sourceDraft = null;
          this.sourceCleanSnapshot = '';
        }
        this.loading = false;
      },
      error: (failure: OncologyRepositoriesApiFailure) => {
        this.loadError = failure.message;
        this.loading = false;
      }
    });
  }

  private openSource(source: TrialSourceItem): void {
    this.sourceDraft = trialSourceDraftFromItem(source);
    this.sourceCleanSnapshot = trialSourceDraftSnapshot(this.sourceDraft);
    this.sourceIssues = [];
    this.sourceError = '';
  }

  private sourceDirty(): boolean {
    return trialSourceDraftSnapshot(this.sourceDraft) !== this.sourceCleanSnapshot;
  }
}
