import { Component, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import {
  ConfigurationApiFailure,
  ConfigurationCatalogSection,
  DiagnosisCatalogResult,
  DiagnosisConfidence,
  DiagnosisConcept,
  DiagnosisDisplaySetting,
  DiagnosisEquivalenceDraft,
  DiagnosisEquivalenceItem,
  DiagnosisRelation,
  DiagnosisSystem,
  DIAGNOSIS_SYSTEM_LABELS,
  DIAGNOSIS_SYSTEMS,
  GuideDraft,
  GuideItem,
  STUDY_TEMPLATE_CATEGORIES,
  StudyTemplateDraft,
  StudyTemplateItem
} from './configuration-catalogs.models';
import {
  blankDiagnosisEquivalence,
  diagnosisDraftFromItem,
  formatBytes,
  guideDraftFromItem,
  imageMime,
  safeLocalAssetUrl,
  studyTemplateDraftFromItem,
  templateAvailabilityLabel,
  templateCategoryLabel,
  validateDiagnosisEquivalenceDraft,
  validateGuideDraft,
  validateStudyTemplateDraft
} from './configuration-catalogs.normalizers';
import { ConfigurationCatalogsService } from './configuration-catalogs.service';

type FeedbackKind = 'success' | 'error';

interface Feedback {
  readonly kind: FeedbackKind;
  readonly message: string;
}

interface DiagnosisSearchState {
  readonly term: string;
  readonly loading: boolean;
  readonly results: readonly DiagnosisCatalogResult[];
  readonly message: string;
  readonly kind: 'hint' | 'loading' | 'ready' | 'selected' | 'empty' | 'error';
}

const EMPTY_SEARCH: DiagnosisSearchState = {
  term: '', loading: false, results: [], message: 'Escriba al menos dos caracteres para buscar.', kind: 'hint'
};

@Component({
  selector: 'app-configuration-catalogs',
  imports: [ReactiveFormsModule],
  templateUrl: './configuration-catalogs.component.html',
  styleUrl: './configuration-catalogs.component.scss'
})
export class ConfigurationCatalogsComponent implements OnDestroy {
  private readonly catalogs = inject(ConfigurationCatalogsService);
  private readonly searchTimers: Partial<Record<DiagnosisSystem, ReturnType<typeof setTimeout>>> = {};
  private readonly searchSequence: Record<DiagnosisSystem, number> = { snomed: 0, cie10: 0, ajcc: 0 };
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private templateObjectUrl = '';

  readonly initialSection = input<ConfigurationCatalogSection>('diagnoses');
  readonly showSectionTabs = input(true);
  readonly canManage = input(true);
  readonly activeSection = signal<ConfigurationCatalogSection>('diagnoses');
  readonly dirty = signal(false);
  readonly visibleSystemsDirty = signal(false);
  readonly feedback = signal<Feedback | null>(null);
  readonly busy = signal(false);

  readonly guideLoading = signal(false);
  readonly guideError = signal('');
  readonly guides = signal<readonly GuideItem[]>([]);
  readonly guideQuery = signal('');
  readonly selectedGuide = signal<GuideItem | null>(null);
  readonly filteredGuides = computed(() => {
    const query = normalizeSearch(this.guideQuery());
    return this.guides().filter((item) => !query || normalizeSearch([
      item.title, item.name, item.site, item.source, item.tags.join(' ')
    ].join(' ')).includes(query));
  });

  readonly templateLoading = signal(false);
  readonly templateError = signal('');
  readonly templates = signal<readonly StudyTemplateItem[]>([]);
  readonly templateQuery = signal('');
  readonly templateCategory = signal('');
  readonly showInactiveTemplates = signal(false);
  readonly selectedTemplate = signal<StudyTemplateItem | null>(null);
  readonly pendingTemplateFile = signal<File | null>(null);
  readonly pendingTemplatePreview = signal('');
  readonly templateCategories = computed(() => {
    const values = new Set(this.templates().map((item) => item.category).filter(Boolean));
    return [...values].sort((left, right) => templateCategoryLabel(left).localeCompare(templateCategoryLabel(right), 'es-AR'));
  });
  readonly filteredTemplates = computed(() => {
    const query = normalizeSearch(this.templateQuery());
    const category = this.templateCategory();
    return this.templates().filter((item) => {
      if (!this.showInactiveTemplates() && !item.active) return false;
      if (category && item.category !== category) return false;
      const haystack = normalizeSearch([
        item.title, item.description, item.category, item.author, item.tags.join(' ')
      ].join(' '));
      return !query || haystack.includes(query);
    });
  });
  readonly templatePreviewUrl = computed(() => this.pendingTemplatePreview()
    || safeLocalAssetUrl(this.selectedTemplate()?.thumbnailUrl || this.selectedTemplate()?.fileUrl || ''));

  readonly diagnosisLoading = signal(false);
  readonly diagnosisError = signal('');
  readonly diagnosisEquivalences = signal<readonly DiagnosisEquivalenceItem[]>([]);
  readonly diagnosisQuery = signal('');
  readonly showInactiveDiagnoses = signal(false);
  readonly selectedDiagnosis = signal<DiagnosisEquivalenceItem | null>(null);
  readonly diagnosisDisplaySetting = signal<DiagnosisDisplaySetting>({ id: '', revision: null, visibleSystems: DIAGNOSIS_SYSTEMS });
  readonly visibleDiagnosisSystems = signal<readonly DiagnosisSystem[]>(DIAGNOSIS_SYSTEMS);
  readonly diagnosisDisplayStatus = signal('Se muestran las tres clasificaciones.');
  readonly diagnosisSearch = {
    snomed: signal<DiagnosisSearchState>({ ...EMPTY_SEARCH }),
    cie10: signal<DiagnosisSearchState>({ ...EMPTY_SEARCH }),
    ajcc: signal<DiagnosisSearchState>({ ...EMPTY_SEARCH, message: 'El catálogo AJCC es local. Seleccione el capítulo que corresponde revisar.' })
  };
  readonly filteredDiagnosisEquivalences = computed(() => {
    const query = normalizeSearch(this.diagnosisQuery());
    return this.diagnosisEquivalences().filter((item) => {
      if (!this.showInactiveDiagnoses() && !item.active) return false;
      const definition = item.definition;
      const searchable = normalizeSearch([
        item.name, item.description, definition.notes,
        definition.snomed.code, definition.snomed.display,
        definition.cie10.code, definition.cie10.display,
        definition.ajcc.code, definition.ajcc.display
      ].join(' '));
      return !query || searchable.includes(query);
    });
  });

  readonly guideForm = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
    audience: new FormControl('', { nonNullable: true }),
    source: new FormControl('', { nonNullable: true }),
    version: new FormControl('', { nonNullable: true }),
    tags: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    active: new FormControl(true, { nonNullable: true })
  });

  readonly templateForm = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
    tags: new FormControl('', { nonNullable: true }),
    author: new FormControl('', { nonNullable: true }),
    attribution: new FormControl('', { nonNullable: true }),
    sourceUrl: new FormControl('', { nonNullable: true }),
    license: new FormControl('', { nonNullable: true }),
    licenseUrl: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    rightsConfirmed: new FormControl(false, { nonNullable: true }),
    active: new FormControl(true, { nonNullable: true })
  });

  readonly diagnosisForm = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    active: new FormControl(true, { nonNullable: true }),
    relation: new FormControl<DiagnosisRelation>('exact', { nonNullable: true }),
    confidence: new FormControl<DiagnosisConfidence>('medium', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
    snomedCode: new FormControl('', { nonNullable: true }),
    snomedDisplay: new FormControl('', { nonNullable: true }),
    snomedVersion: new FormControl('', { nonNullable: true }),
    snomedSource: new FormControl('', { nonNullable: true }),
    snomedSourceConceptId: new FormControl('', { nonNullable: true }),
    cie10Code: new FormControl('', { nonNullable: true }),
    cie10Display: new FormControl('', { nonNullable: true }),
    cie10Version: new FormControl('', { nonNullable: true }),
    cie10Source: new FormControl('', { nonNullable: true }),
    cie10SourceConceptId: new FormControl('', { nonNullable: true }),
    ajccCode: new FormControl('', { nonNullable: true }),
    ajccDisplay: new FormControl('', { nonNullable: true }),
    ajccVersion: new FormControl('', { nonNullable: true }),
    ajccSource: new FormControl('', { nonNullable: true })
  });

  readonly diagnosisSystems = DIAGNOSIS_SYSTEMS;
  readonly diagnosisLabels = DIAGNOSIS_SYSTEM_LABELS;
  readonly studyTemplateCategories = STUDY_TEMPLATE_CATEGORIES;

  constructor() {
    effect(() => this.activate(this.initialSection(), false));
    this.guideForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.dirty.set(true));
    this.templateForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.dirty.set(true));
    this.diagnosisForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.dirty.set(true));
    this.loadDiagnoses();
  }

  ngOnDestroy(): void {
    Object.values(this.searchTimers).forEach((timer) => { if (timer) clearTimeout(timer); });
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.revokeTemplateObjectUrl();
  }

  activate(section: ConfigurationCatalogSection, protectDirty = true): void {
    if (section === this.activeSection()) return;
    if (protectDirty && this.hasUnsavedChanges() && !globalThis.confirm('Hay cambios sin guardar. Si cambia de sección, se perderán. ¿Desea continuar?')) return;
    this.dirty.set(false);
    this.visibleSystemsDirty.set(false);
    this.activeSection.set(section);
    if (section === 'guides' && !this.guides().length) this.loadGuides();
    if (section === 'templates' && !this.templates().length) this.loadTemplates();
    if (section === 'diagnoses' && !this.diagnosisEquivalences().length) this.loadDiagnoses();
  }

  hasUnsavedChanges(): boolean { return this.dirty() || this.visibleSystemsDirty(); }

  async loadGuides(selectName = ''): Promise<void> {
    this.guideLoading.set(true); this.guideError.set('');
    try {
      const items = await firstValueFrom(this.catalogs.guides());
      this.guides.set(items);
      const selected = items.find((item) => item.name === selectName)
        || items.find((item) => item.name === this.selectedGuide()?.name);
      if (selected) this.selectGuide(selected);
      else this.selectedGuide.set(null);
    } catch (failure) { this.guideError.set(message(failure)); }
    finally { this.guideLoading.set(false); }
  }

  selectGuide(item: GuideItem): void {
    if (!this.canReplaceEditor()) return;
    this.selectedGuide.set(item);
    this.guideForm.reset(guideDraftFromItem(item), { emitEvent: false });
    if (this.canManage()) this.guideForm.enable({ emitEvent: false });
    else this.guideForm.disable({ emitEvent: false });
    this.dirty.set(false);
  }

  async uploadGuides(files: FileList | null): Promise<void> {
    if (!this.canManage() || !files?.length || this.busy()) return;
    const list = [...files];
    this.busy.set(true);
    let first = '';
    const failures: string[] = [];
    try {
      for (const file of list) {
        try {
          if (!file.name.toLocaleLowerCase('es').endsWith('.pdf') && file.type !== 'application/pdf') {
            throw new Error(`${file.name}: debe ser PDF.`);
          }
          await firstValueFrom(this.catalogs.uploadGuide(file));
          first ||= file.name;
        } catch (failure) {
          failures.push(message(failure));
        }
      }
      if (first) await this.loadGuides(first);
      if (failures.length) this.showFeedback(failures.join(' '), 'error');
      else this.showFeedback(`${list.length} ${list.length === 1 ? 'guía agregada' : 'guías agregadas'}.`);
    } catch (failure) { this.showFeedback(message(failure), 'error'); }
    finally { this.busy.set(false); }
  }

  async saveGuide(active?: boolean): Promise<void> {
    const item = this.selectedGuide();
    if (!this.canManage() || !item || this.busy()) return;
    const draft = this.guideForm.getRawValue();
    const issues = validateGuideDraft(draft);
    if (issues.length) { this.showFeedback(issues[0], 'error'); return; }
    this.busy.set(true);
    try {
      await firstValueFrom(this.catalogs.saveGuide(item, draft, active ?? draft.active));
      this.dirty.set(false);
      this.showFeedback(item.configurationId ? 'Guía actualizada.' : 'Guía incorporada.');
      await this.loadGuides(item.name);
    } catch (failure) { this.showFeedback(message(failure), 'error'); }
    finally { this.busy.set(false); }
  }

  async toggleGuide(): Promise<void> {
    const item = this.selectedGuide();
    if (!this.canManage() || !item || this.busy()) return;
    if (!item.active) { await this.saveGuide(true); return; }
    this.busy.set(true);
    try {
      await firstValueFrom(this.catalogs.archiveGuide(item));
      this.dirty.set(false); this.showFeedback('Guía desactivada; el PDF se conserva.');
      await this.loadGuides(item.name);
    } catch (failure) { this.showFeedback(message(failure), 'error'); }
    finally { this.busy.set(false); }
  }

  async loadTemplates(selectId = ''): Promise<void> {
    this.templateLoading.set(true); this.templateError.set('');
    try {
      const items = await firstValueFrom(this.catalogs.studyTemplates());
      this.templates.set(items);
      if (this.pendingTemplateFile()) return;
      const selected = items.find((item) => item.id === selectId || item.configurationId === selectId)
        || items.find((item) => item.id === this.selectedTemplate()?.id);
      if (selected) this.selectTemplate(selected);
      else this.selectedTemplate.set(null);
    } catch (failure) { this.templateError.set(message(failure)); }
    finally { this.templateLoading.set(false); }
  }

  selectTemplate(item: StudyTemplateItem): void {
    if (!this.canReplaceEditor()) return;
    this.cancelPendingTemplate(false);
    this.selectedTemplate.set(item);
    this.templateForm.reset(studyTemplateDraftFromItem(item), { emitEvent: false });
    this.dirty.set(false);
    if (item.origin === 'bundled' || !this.canManage()) this.templateForm.disable({ emitEvent: false });
    else this.templateForm.enable({ emitEvent: false });
  }

  beginTemplateUpload(files: FileList | null): void {
    if (!this.canManage()) return;
    const file = files?.[0];
    if (!file) return;
    const mime = imageMime(file);
    if (!file.size || !mime) { this.showFeedback('Seleccione una imagen PNG, JPG, GIF o WebP válida.', 'error'); return; }
    if (file.size > 15 * 1024 * 1024) { this.showFeedback('La plantilla no puede superar los 15 MB.', 'error'); return; }
    if (!this.canReplaceEditor()) return;
    this.cancelPendingTemplate(false);
    this.revokeTemplateObjectUrl();
    this.templateObjectUrl = URL.createObjectURL(file);
    this.pendingTemplatePreview.set(this.templateObjectUrl);
    this.pendingTemplateFile.set(file);
    this.selectedTemplate.set(null);
    this.templateForm.enable({ emitEvent: false });
    const plainName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    this.templateForm.reset({
      title: plainName ? plainName.charAt(0).toLocaleUpperCase('es-AR') + plainName.slice(1) : '',
      category: '', tags: '', author: '', attribution: '', sourceUrl: '', license: '', licenseUrl: '',
      description: '', rightsConfirmed: false, active: true
    }, { emitEvent: false });
    this.dirty.set(true);
  }

  cancelPendingTemplate(resetEditor = true): void {
    this.revokeTemplateObjectUrl();
    this.pendingTemplateFile.set(null);
    this.pendingTemplatePreview.set('');
    if (resetEditor) { this.templateForm.reset(); this.selectedTemplate.set(null); this.dirty.set(false); }
  }

  async saveTemplate(active?: boolean): Promise<void> {
    if (!this.canManage() || this.busy()) return;
    const draft = this.templateForm.getRawValue();
    const pending = this.pendingTemplateFile();
    const selected = this.selectedTemplate();
    const issues = validateStudyTemplateDraft(draft, Boolean(pending));
    if (issues.length) { this.showFeedback(issues[0], 'error'); return; }
    this.busy.set(true);
    try {
      if (pending) {
        await firstValueFrom(this.catalogs.uploadStudyTemplate(pending, draft));
        this.cancelPendingTemplate(false);
        this.dirty.set(false);
        this.showFeedback('Plantilla anatómica agregada.');
        await this.loadTemplates();
        const created = this.templates().find((item) => item.origin === 'custom' && item.title === draft.title.trim());
        if (created) this.selectTemplate(created);
      } else if (selected) {
        await firstValueFrom(this.catalogs.saveStudyTemplate(selected, draft, active ?? draft.active));
        this.dirty.set(false); this.showFeedback('Plantilla actualizada.');
        await this.loadTemplates(selected.configurationId || selected.id);
      }
    } catch (failure) { this.showFeedback(message(failure), 'error'); }
    finally { this.busy.set(false); }
  }

  async toggleTemplate(): Promise<void> {
    const item = this.selectedTemplate();
    if (!this.canManage() || !item || item.origin === 'bundled' || this.busy()) return;
    if (!item.active) { await this.saveTemplate(true); return; }
    this.busy.set(true);
    try {
      await firstValueFrom(this.catalogs.archiveStudyTemplate(item));
      this.showInactiveTemplates.set(true); this.dirty.set(false);
      this.showFeedback('Plantilla desactivada; la imagen se conserva.');
      await this.loadTemplates(item.configurationId || item.id);
    } catch (failure) { this.showFeedback(message(failure), 'error'); }
    finally { this.busy.set(false); }
  }

  async loadDiagnoses(selectId = '', preserveVisibleDraft = false): Promise<void> {
    this.diagnosisLoading.set(true); this.diagnosisError.set('');
    try {
      const [settingResult, itemsResult] = await Promise.allSettled([
        firstValueFrom(this.catalogs.diagnosisDisplaySetting()),
        firstValueFrom(this.catalogs.diagnosisEquivalences())
      ]);
      if (!preserveVisibleDraft) {
        if (settingResult.status === 'fulfilled') {
          const setting = settingResult.value;
          this.diagnosisDisplaySetting.set(setting);
          this.visibleDiagnosisSystems.set(setting.visibleSystems);
          this.diagnosisDisplayStatus.set(setting.id ? `Configuración v${setting.revision ?? 1}` : 'Se muestran las tres clasificaciones.');
        } else {
          this.diagnosisDisplaySetting.set({ id: '', revision: null, visibleSystems: DIAGNOSIS_SYSTEMS });
          this.visibleDiagnosisSystems.set(DIAGNOSIS_SYSTEMS);
          this.diagnosisDisplayStatus.set(message(settingResult.reason));
        }
        this.visibleSystemsDirty.set(false);
      }
      if (itemsResult.status === 'rejected') throw itemsResult.reason;
      const items = itemsResult.value;
      this.diagnosisEquivalences.set(items);
      const selected = items.find((item) => item.id === selectId)
        || items.find((item) => item.id === this.selectedDiagnosis()?.id);
      if (selected) this.selectDiagnosis(selected);
    } catch (failure) { this.diagnosisError.set(message(failure)); }
    finally { this.diagnosisLoading.set(false); }
  }

  toggleVisibleSystem(system: DiagnosisSystem, checked: boolean): void {
    if (!this.canManage()) return;
    const next = new Set(this.visibleDiagnosisSystems());
    if (checked) next.add(system); else next.delete(system);
    this.visibleDiagnosisSystems.set(DIAGNOSIS_SYSTEMS.filter((item) => next.has(item)));
    this.diagnosisDisplayStatus.set(next.size ? 'Cambios sin guardar.' : 'Seleccione al menos una clasificación.');
    this.visibleSystemsDirty.set(true);
  }

  async saveVisibleSystems(): Promise<void> {
    if (!this.canManage()) return;
    const systems = this.visibleDiagnosisSystems();
    if (!systems.length) { this.showFeedback('Seleccione al menos una clasificación.', 'error'); return; }
    this.busy.set(true);
    try {
      const saved = await firstValueFrom(this.catalogs.saveDiagnosisDisplaySetting(this.diagnosisDisplaySetting(), systems));
      this.diagnosisDisplaySetting.set(saved); this.visibleDiagnosisSystems.set(saved.visibleSystems);
      this.diagnosisDisplayStatus.set(`Guardado · versión ${saved.revision ?? 1}`);
      this.visibleSystemsDirty.set(false);
      this.showFeedback('Clasificaciones visibles actualizadas.');
    } catch (failure) { this.showFeedback(message(failure), 'error'); }
    finally { this.busy.set(false); }
  }

  newDiagnosis(): void {
    if (!this.canManage()) return;
    if (!this.canReplaceEditor()) return;
    this.selectedDiagnosis.set(null);
    this.fillDiagnosisForm(blankDiagnosisEquivalence());
    this.resetDiagnosisSearches();
    this.dirty.set(true);
  }

  selectDiagnosis(item: DiagnosisEquivalenceItem): void {
    if (!this.canReplaceEditor()) return;
    this.selectedDiagnosis.set(item);
    this.fillDiagnosisForm(diagnosisDraftFromItem(item));
    this.resetDiagnosisSearches();
    this.dirty.set(false);
  }

  scheduleDiagnosisSearch(system: DiagnosisSystem, term: string): void {
    if (!this.canManage()) return;
    const previous = this.searchTimers[system]; if (previous) clearTimeout(previous);
    const current = this.diagnosisSearch[system]();
    this.diagnosisSearch[system].set({ ...current, term });
    if (term.trim().length < 2) {
      this.diagnosisSearch[system].set({ ...EMPTY_SEARCH, term, message: 'Escriba al menos dos caracteres para buscar.' });
      return;
    }
    this.searchTimers[system] = setTimeout(() => void this.searchDiagnosis(system, term.trim()), 280);
  }

  async searchDiagnosis(system: DiagnosisSystem, query: string): Promise<void> {
    const sequence = ++this.searchSequence[system];
    this.diagnosisSearch[system].set({ term: query, loading: true, results: [], message: `Buscando en ${DIAGNOSIS_SYSTEM_LABELS[system]}…`, kind: 'loading' });
    try {
      const results = await firstValueFrom(this.catalogs.searchDiagnosisCatalog(system, query));
      if (sequence !== this.searchSequence[system] || this.diagnosisSearch[system]().term.trim() !== query) return;
      this.diagnosisSearch[system].set({
        term: query, loading: false, results,
        message: results.length ? `${results.length} coincidencia${results.length === 1 ? '' : 's'}. Seleccione una.` : 'No se encontraron coincidencias.',
        kind: results.length ? 'ready' : 'empty'
      });
    } catch (failure) {
      if (sequence !== this.searchSequence[system]) return;
      this.diagnosisSearch[system].set({ term: query, loading: false, results: [], message: message(failure), kind: 'error' });
    }
  }

  applyDiagnosisResult(system: DiagnosisSystem, indexText: string): void {
    if (!this.canManage()) return;
    if (!indexText) return;
    const result = this.diagnosisSearch[system]().results[Number(indexText)];
    if (!result) return;
    this.patchConcept(system, result);
    if (system === 'snomed' && !this.diagnosisForm.controls.name.value.trim()) {
      this.diagnosisForm.controls.name.setValue(result.display);
    }
    this.diagnosisSearch[system].update((state) => ({ ...state, loading: false, message: `${DIAGNOSIS_SYSTEM_LABELS[system]} seleccionado. Puede ajustar los campos antes de guardar.`, kind: 'selected' }));
  }

  clearDiagnosisMetadata(system: DiagnosisSystem): void {
    if (!this.canManage()) return;
    if (system === 'snomed') {
      this.diagnosisForm.patchValue({ snomedVersion: '', snomedSource: '', snomedSourceConceptId: '' }, { emitEvent: false });
    } else if (system === 'cie10') {
      this.diagnosisForm.patchValue({ cie10Version: '', cie10Source: '', cie10SourceConceptId: '' }, { emitEvent: false });
    } else {
      this.diagnosisForm.patchValue({ ajccVersion: '', ajccSource: '' }, { emitEvent: false });
    }
    this.dirty.set(true);
  }

  async saveDiagnosis(active?: boolean): Promise<void> {
    if (!this.canManage() || this.busy()) return;
    const selected = this.selectedDiagnosis();
    const draft = this.readDiagnosisDraft();
    if (active !== undefined) draft.active = active;
    const issues = validateDiagnosisEquivalenceDraft(draft);
    if (issues.length) { this.showFeedback(issues[0], 'error'); return; }
    this.busy.set(true);
    try {
      await firstValueFrom(this.catalogs.saveDiagnosisEquivalence(selected?.id || '', selected?.revision ?? null, draft, draft.active));
      this.dirty.set(false); this.showFeedback(selected ? 'Equivalencia actualizada.' : 'Equivalencia creada.');
      await this.loadDiagnoses(selected?.id || '', true);
    } catch (failure) { this.showFeedback(message(failure), 'error'); }
    finally { this.busy.set(false); }
  }

  async toggleDiagnosis(): Promise<void> {
    const item = this.selectedDiagnosis();
    if (!this.canManage() || !item || this.busy()) return;
    if (!item.active) { await this.saveDiagnosis(true); return; }
    this.busy.set(true);
    try {
      await firstValueFrom(this.catalogs.archiveDiagnosisEquivalence(item));
      this.showInactiveDiagnoses.set(true); this.dirty.set(false);
      this.showFeedback('Equivalencia desactivada; se conservaron sus versiones.');
      await this.loadDiagnoses(item.id, true);
    } catch (failure) { this.showFeedback(message(failure), 'error'); }
    finally { this.busy.set(false); }
  }

  diagnosisSubtitle(item: DiagnosisEquivalenceItem): string {
    return `SNOMED ${item.definition.snomed.code || '—'} · CIE-10 ${item.definition.cie10.code || '—'} · AJCC ${item.definition.ajcc.code || '—'} · v${item.revision}`;
  }

  categoryLabel(value: string): string { return templateCategoryLabel(value); }
  availabilityLabel(value: string): string { return templateAvailabilityLabel(value); }
  imageUrl(item: StudyTemplateItem): string { return safeLocalAssetUrl(item.thumbnailUrl || item.fileUrl); }
  bytes(value: number): string { return formatBytes(value); }
  isVisible(system: DiagnosisSystem): boolean { return this.visibleDiagnosisSystems().includes(system); }

  private fillDiagnosisForm(draft: DiagnosisEquivalenceDraft): void {
    this.diagnosisForm.reset({
      name: draft.name, active: draft.active, relation: draft.relation, confidence: draft.confidence, notes: draft.notes,
      snomedCode: draft.snomed.code, snomedDisplay: draft.snomed.display, snomedVersion: draft.snomed.version,
      snomedSource: draft.snomed.source, snomedSourceConceptId: draft.snomed.sourceConceptId,
      cie10Code: draft.cie10.code, cie10Display: draft.cie10.display, cie10Version: draft.cie10.version,
      cie10Source: draft.cie10.source, cie10SourceConceptId: draft.cie10.sourceConceptId,
      ajccCode: draft.ajcc.code, ajccDisplay: draft.ajcc.display, ajccVersion: draft.ajcc.version, ajccSource: draft.ajcc.source
    }, { emitEvent: false });
    if (this.canManage()) this.diagnosisForm.enable({ emitEvent: false });
    else this.diagnosisForm.disable({ emitEvent: false });
  }

  private readDiagnosisDraft(): DiagnosisEquivalenceDraft {
    const value = this.diagnosisForm.getRawValue();
    return {
      name: value.name, active: value.active, relation: value.relation, confidence: value.confidence, notes: value.notes,
      snomed: concept(value.snomedCode, value.snomedDisplay, value.snomedVersion, value.snomedSource, value.snomedSourceConceptId),
      cie10: concept(value.cie10Code, value.cie10Display, value.cie10Version, value.cie10Source, value.cie10SourceConceptId),
      ajcc: concept(value.ajccCode, value.ajccDisplay, value.ajccVersion, value.ajccSource, '')
    };
  }

  private patchConcept(system: DiagnosisSystem, value: DiagnosisCatalogResult): void {
    const prefix = system;
    this.diagnosisForm.patchValue({
      [`${prefix}Code`]: value.code,
      [`${prefix}Display`]: value.display,
      [`${prefix}Version`]: value.version,
      [`${prefix}Source`]: value.source,
      ...(system === 'ajcc' ? {} : { [`${prefix}SourceConceptId`]: value.sourceConceptId })
    } as never);
  }

  private resetDiagnosisSearches(): void {
    for (const system of DIAGNOSIS_SYSTEMS) {
      this.searchSequence[system] += 1;
      const timer = this.searchTimers[system]; if (timer) clearTimeout(timer);
      this.diagnosisSearch[system].set({
        ...EMPTY_SEARCH,
        message: system === 'ajcc'
          ? 'El catálogo AJCC es local. Seleccione el capítulo que corresponde revisar.'
          : 'Busque y seleccione una coincidencia, o complete los campos manualmente.'
      });
    }
  }

  private canReplaceEditor(): boolean {
    if (!this.dirty()) return true;
    if (!globalThis.confirm('Hay cambios sin guardar. ¿Desea descartarlos?')) return false;
    this.dirty.set(false);
    return true;
  }

  private showFeedback(messageText: string, kind: FeedbackKind = 'success'): void {
    this.feedback.set({ kind, message: messageText });
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => this.feedback.set(null), 4200);
  }

  private revokeTemplateObjectUrl(): void {
    if (this.templateObjectUrl) URL.revokeObjectURL(this.templateObjectUrl);
    this.templateObjectUrl = '';
  }
}

function concept(code: string, display: string, version: string, source: string, sourceConceptId: string): DiagnosisConcept {
  return { code, display, version, source, sourceConceptId };
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim();
}

function message(failure: unknown): string {
  const value = failure as ConfigurationApiFailure | Error | null;
  return value?.message || 'No se pudo completar la operación.';
}
