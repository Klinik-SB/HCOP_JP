import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EMPTY, Observable, Subscription, catchError, forkJoin, of } from 'rxjs';
import { CalculatorDefinition as BuiltInCalculatorDefinition } from '../../tools/calculators/calculator.models';
import { toolConfigurationKey } from '../../tools/calculators/institutional-calculator-catalog.validator';
import { PORTED_CALCULATORS } from '../../tools/calculators/ported-calculator.registry';
import {
  AccessIdentity,
  AccessView,
  AdminPermission,
  AdminRole,
  AdminRoleDraft,
  AdminUser,
  AdminUserDraft,
  BuilderOptionDraft,
  CalculatorDraft,
  CalculatorFieldDraft,
  CalculatorItem,
  CalculatorMode,
  ConfigurationMutationEvent,
  DayHospitalDraft,
  LlmDraft,
  OperationsSection,
  ResearchDraft,
  ResearchFieldDraft,
  ResearchItem,
  ScoreRuleDraft,
  SecuritySettings,
  ToolSettingsItem,
  ValidationIssue
} from './configuration-operations.models';
import {
  LLM_PRESETS,
  adminRoleDraft,
  adminRolePayload,
  adminUserDraft,
  adminUserPayload,
  blankAdminRole,
  blankAdminUser,
  blankBuilderOption,
  blankCalculator,
  blankCalculatorField,
  blankCalculatorRange,
  blankResearch,
  blankResearchField,
  blankScoreRule,
  calculatorDraftFromBuiltIn,
  calculatorDraftFromItem,
  calculatorExampleValues,
  calculatorSavePayload,
  dayHospitalPreview,
  dayHospitalSavePayload,
  defaultDayHospitalDraft,
  droppedItemDestination,
  evaluateCalculatorDraft,
  failureMessage,
  fieldIssue,
  formatAccessDate,
  hasPermission,
  llmDraftFromConfiguration,
  llmPayload,
  normalizedSearch,
  reorderMutableItems,
  researchDraftFromItem,
  researchSavePayload,
  toolSettingsSavePayload,
  validateAdminRoleDraft,
  validateAdminUserDraft,
  validateCalculatorDraft,
  validateLlmDraft,
  validateResearchDraft
} from './configuration-operations.normalizers';
import { ConfigurationOperationsService } from './configuration-operations.service';

interface SectionDescriptor {
  readonly id: OperationsSection;
  readonly label: string;
  readonly description: string;
}

interface BuiltInCalculatorEntry {
  readonly key: string;
  readonly definition: BuiltInCalculatorDefinition;
  readonly disabled: boolean;
  readonly override: CalculatorItem | null;
}

type DirtyTarget = OperationsSection | 'calculator-settings' | 'access-user' | 'access-role' | 'access-security';

@Component({
  selector: 'app-configuration-operations',
  imports: [CommonModule, FormsModule],
  host: { class: 'configuration-operations-host' },
  templateUrl: './configuration-operations.component.html',
  styleUrl: './configuration-operations.component.scss'
})
export class ConfigurationOperationsComponent implements OnInit, OnChanges, OnDestroy {
  private readonly service = inject(ConfigurationOperationsService);
  private readonly zone = inject(NgZone);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly subscriptions = new Subscription();
  private readonly loaded = new Set<OperationsSection>();
  private readonly cleanSnapshots = new Map<DirtyTarget, string>();
  private readonly cleanValues = new Map<DirtyTarget, unknown>();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  @Input() autoLoad = true;
  @Input() canManage = true;
  @Input() initialSection: OperationsSection = 'calculators';
  @Output() readonly configurationChanged = new EventEmitter<ConfigurationMutationEvent>();

  readonly sections: readonly SectionDescriptor[] = [
    { id: 'calculators', label: 'Calculadoras y scores', description: 'Constructores clínicos sin programación' },
    { id: 'research', label: 'Investigación', description: 'Formularios configurables' },
    { id: 'day-hospital', label: 'Hospital de día', description: 'Capacidad y agenda' },
    { id: 'llm', label: 'Inteligencia artificial', description: 'Servicio LLM opcional' },
    { id: 'access', label: 'Usuarios y permisos', description: 'Acceso y trazabilidad' }
  ];
  readonly calculatorFieldTypes = [
    { value: 'number', label: 'Número' }, { value: 'select', label: 'Selector' },
    { value: 'checkbox', label: 'Casilla' }, { value: 'text', label: 'Texto corto' },
    { value: 'textarea', label: 'Texto largo' },
    { value: 'section', label: 'Separador' }
  ] as const;
  readonly researchFieldTypes = [
    ...this.calculatorFieldTypes.slice(0, -1),
    { value: 'date', label: 'Fecha' },
    { value: 'section', label: 'Separador' }
  ] as const;
  readonly slotOptions = [5, 10, 15, 20, 30] as const;
  readonly scoreOperators = [
    { value: 'lt', label: 'Menor que' }, { value: 'lte', label: 'Menor o igual' },
    { value: 'eq', label: 'Igual a' }, { value: 'gte', label: 'Mayor o igual' },
    { value: 'gt', label: 'Mayor que' }, { value: 'between', label: 'Entre' }
  ] as const;
  readonly formulaFunctions = ['sqrt', 'abs', 'round', 'floor', 'ceil', 'min', 'max', 'pow', 'log', 'exp'];
  readonly sessionDurations = [
    { value: 60, label: '1 hora' }, { value: 480, label: '8 horas' },
    { value: 1440, label: '1 día' }, { value: 10080, label: '7 días' },
    { value: 43200, label: '30 días' }
  ];

  activeSection: OperationsSection = 'calculators';
  busy = false;
  error = '';
  toastMessage = '';
  toastError = false;

  calculators: readonly CalculatorItem[] = [];
  toolSettings: ToolSettingsItem | null = null;
  disabledBuiltInKeys: string[] = [];
  selectedBuiltInKey = '';
  calculatorDraft: CalculatorDraft | null = null;
  calculatorSearch = '';
  showInactiveCalculators = false;
  calculatorIssues: readonly ValidationIssue[] = [];
  calculatorPreviewValues: Record<string, string | number | boolean> = {};
  calculatorPreviewValue: number | null = null;
  calculatorPreviewRange = '';
  calculatorPreviewError = '';
  advancedFormula = false;
  calculatorDragIndex: number | null = null;
  calculatorDropIndex: number | null = null;
  calculatorDropAfter = false;
  researchDragIndex: number | null = null;
  researchDropIndex: number | null = null;
  researchDropAfter = false;
  reorderAnnouncement = '';

  researchForms: readonly ResearchItem[] = [];
  researchDraft: ResearchDraft | null = null;
  researchSearch = '';
  showInactiveResearch = false;
  researchIssues: readonly ValidationIssue[] = [];

  dayHospital: DayHospitalDraft = defaultDayHospitalDraft();

  llmDraft: LlmDraft | null = null;
  llmStatus = '';
  llmStatusKind: 'ready' | 'pending' | 'success' | 'error' = 'ready';

  identity: AccessIdentity | null = null;
  users: readonly AdminUser[] = [];
  roles: readonly AdminRole[] = [];
  permissions: readonly AdminPermission[] = [];
  security: SecuritySettings | null = null;
  accessView: AccessView = 'users';
  userDraft: AdminUserDraft | null = null;
  roleDraft: AdminRoleDraft | null = null;
  userIssues: readonly ValidationIssue[] = [];
  roleIssues: readonly ValidationIssue[] = [];
  userSearch = '';
  roleSearch = '';
  showInactiveUsers = false;
  showInactiveRoles = false;

  ngOnInit(): void {
    this.activeSection = this.initialSection;
    if (this.autoLoad) this.loadSection(this.activeSection);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const section = changes['initialSection'];
    if (!section || section.firstChange || section.currentValue === this.activeSection) return;
    this.selectSection(section.currentValue as OperationsSection);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  get filteredCalculators(): readonly CalculatorItem[] {
    const query = normalizedSearch(this.calculatorSearch);
    return this.calculators.filter((item) =>
      !item.definition.replacesBuiltInKey &&
      (this.showInactiveCalculators || item.active) &&
      (!query || normalizedSearch(`${item.name} ${item.description} ${item.definition.category}`).includes(query)));
  }

  get builtInCalculators(): readonly BuiltInCalculatorEntry[] {
    const disabled = new Set(this.disabledBuiltInKeys);
    return PORTED_CALCULATORS.map((definition) => {
      const key = toolConfigurationKey(definition.title);
      return { key, definition, disabled: disabled.has(key), override: this.calculatorOverrideFor(key) };
    });
  }

  get filteredBuiltInCalculators(): readonly BuiltInCalculatorEntry[] {
    const query = normalizedSearch(this.calculatorSearch);
    return this.builtInCalculators.filter((item) =>
      (this.showInactiveCalculators || !item.disabled) &&
      (!query || normalizedSearch([
        item.definition.title,
        item.definition.shortTitle || '',
        item.definition.category,
        item.definition.subtitle,
        item.definition.clinicalUse,
        item.override?.name || ''
      ].join(' ')).includes(query)));
  }

  get enabledBuiltInCount(): number {
    return this.builtInCalculators.filter((item) => !item.disabled).length;
  }

  get calculatorCatalogCount(): number {
    return PORTED_CALCULATORS.length + this.calculators.filter((item) => !item.definition.replacesBuiltInKey).length;
  }

  get hasUnsavedCalculatorSettings(): boolean {
    return this.targetHasUnsavedChanges('calculator-settings');
  }

  get filteredResearchForms(): readonly ResearchItem[] {
    const query = normalizedSearch(this.researchSearch);
    return this.researchForms.filter((item) =>
      (this.showInactiveResearch || item.active) &&
      (!query || normalizedSearch(`${item.name} ${item.definition.category}`).includes(query)));
  }

  get filteredUsers(): readonly AdminUser[] {
    const query = normalizedSearch(this.userSearch);
    return this.users.filter((user) => (this.showInactiveUsers || user.active) && (!query || normalizedSearch([
      user.displayName, user.username, user.email, user.specialty, user.licenseNumber,
      user.roles.map((role) => role.name).join(' ')
    ].join(' ')).includes(query)));
  }

  get filteredRoles(): readonly AdminRole[] {
    const query = normalizedSearch(this.roleSearch);
    return this.roles.filter((role) => (this.showInactiveRoles || role.active) &&
      (!query || normalizedSearch(`${role.name} ${role.key} ${role.description}`).includes(query)));
  }

  get dayHospitalPlan() { return dayHospitalPreview(this.dayHospital); }

  get effectiveSessionDurations(): readonly { readonly value: number; readonly label: string }[] {
    const configured = this.security?.sessionDurationMinutes;
    if (!configured || this.sessionDurations.some((item) => item.value === configured)) return this.sessionDurations;
    return [...this.sessionDurations, { value: configured, label: `${configured.toLocaleString('es-AR')} minutos` }]
      .sort((left, right) => left.value - right.value);
  }

  get permissionGroups(): readonly { readonly label: string; readonly permissions: readonly AdminPermission[] }[] {
    const groups = new Map<string, { label: string; permissions: AdminPermission[] }>();
    this.permissions.forEach((permission) => {
      const group = groups.get(permission.groupKey) ?? { label: permission.groupLabel, permissions: [] };
      group.permissions.push(permission);
      groups.set(permission.groupKey, group);
    });
    return [...groups.values()];
  }

  hasUnsavedChanges(section: OperationsSection = this.activeSection): boolean {
    if (section === 'calculators') {
      return this.targetHasUnsavedChanges('calculators') || this.targetHasUnsavedChanges('calculator-settings');
    }
    if (section === 'access') {
      return (['access-user', 'access-role', 'access-security'] as const)
        .some((target) => this.targetHasUnsavedChanges(target));
    }
    return this.targetHasUnsavedChanges(section);
  }

  confirmDiscardChanges(section: OperationsSection = this.activeSection): boolean {
    if (!this.hasUnsavedChanges(section)) return true;
    if (!globalThis.confirm('Hay cambios sin guardar en esta sección. Si continúa, se perderán. ¿Desea descartarlos?')) return false;
    this.discardSectionChanges(section);
    return true;
  }

  selectSection(section: OperationsSection): boolean {
    if (section === this.activeSection) {
      this.loadSection(section);
      return true;
    }
    if (!this.confirmDiscardChanges(this.activeSection)) return false;
    this.activeSection = section;
    this.error = '';
    this.loadSection(section);
    return true;
  }

  reload(): void {
    if (!this.confirmDiscardChanges(this.activeSection)) return;
    this.loaded.delete(this.activeSection);
    this.loadSection(this.activeSection);
  }

  beginCalculator(mode: CalculatorMode): void {
    if (!this.canManage || this.busy) return;
    if (!this.confirmTargetDiscard('calculators')) return;
    this.captureClean('calculators');
    this.selectedBuiltInKey = '';
    this.calculatorDraft = blankCalculator(mode);
    this.calculatorIssues = [];
    this.advancedFormula = false;
    this.resetCalculatorPreview();
  }

  editCalculator(item: CalculatorItem, force = false): void {
    if (this.busy) return;
    if (!force && this.calculatorDraft?.id === item.id) return;
    if (!force && !this.confirmTargetDiscard('calculators')) return;
    this.calculatorDraft = calculatorDraftFromItem(item);
    this.selectedBuiltInKey = item.definition.replacesBuiltInKey || '';
    this.calculatorIssues = [];
    this.advancedFormula = false;
    this.resetCalculatorPreview();
    this.captureClean('calculators');
  }

  selectBuiltInCalculator(item: BuiltInCalculatorEntry): void {
    if (this.busy || !this.confirmTargetDiscard('calculators')) return;
    if (item.override) {
      this.editCalculator(item.override, true);
      return;
    }
    this.calculatorDraft = calculatorDraftFromBuiltIn(item.definition, item.key);
    this.selectedBuiltInKey = item.key;
    this.calculatorIssues = [];
    this.advancedFormula = false;
    this.resetCalculatorPreview();
    this.captureClean('calculators');
  }

  setBuiltInEnabled(key: string, enabled: boolean): void {
    if (!this.canManage || this.busy || !this.builtInCalculators.some((item) => item.key === key)) return;
    const disabled = new Set(this.disabledBuiltInKeys);
    enabled ? disabled.delete(key) : disabled.add(key);
    this.disabledBuiltInKeys = PORTED_CALCULATORS
      .map((definition) => toolConfigurationKey(definition.title))
      .filter((builtInKey) => disabled.has(builtInKey));
  }

  saveToolSettings(): void {
    if (!this.canManage || this.busy || !this.targetHasUnsavedChanges('calculator-settings')) return;
    this.busy = true;
    const payload = toolSettingsSavePayload(this.toolSettings, this.disabledBuiltInKeys);
    const request = this.toolSettings?.id
      ? this.service.updateToolSettings(this.toolSettings.id, payload)
      : this.service.createToolSettings(payload);
    this.subscriptions.add(request.pipe(catchError((failure) => this.fail(failure))).subscribe((item) => {
      this.updateView(() => {
        this.busy = false;
        if (!item) return;
        const created = !this.toolSettings?.id;
        this.toolSettings = item;
        this.disabledBuiltInKeys = [...item.definition.disabledBuiltInKeys];
        this.captureClean('calculator-settings');
        this.afterMutation('calculators', item.id, created ? 'created' : 'updated', true);
      });
    }));
  }

  isBuiltInDisabled(key: string): boolean {
    return this.disabledBuiltInKeys.includes(key);
  }

  calculatorModeChanged(mode: CalculatorMode): void {
    const draft = this.calculatorDraft;
    if (!draft) return;
    draft.mode = mode;
    if (mode === 'builtin') {
      const builtInKey = this.selectedBuiltInKey || draft.replacesBuiltInKey;
      const definition = PORTED_CALCULATORS.find((candidate) => toolConfigurationKey(candidate.title) === builtInKey);
      if (definition) {
        const editableText = new Map(draft.fields.map((field) => [field.key, { label: field.label, help: field.help }]));
        const protectedDraft = calculatorDraftFromBuiltIn(definition, builtInKey, draft.active);
        this.calculatorDraft = {
          ...protectedDraft,
          id: draft.id,
          revision: draft.revision,
          name: draft.name,
          description: draft.description,
          active: draft.active,
          category: draft.category,
          source: draft.source,
          fields: protectedDraft.fields.map((field) => ({
            ...field,
            label: editableText.get(field.key)?.label || field.label,
            help: editableText.get(field.key)?.help ?? field.help
          }))
        };
      }
      this.calculatorIssues = [];
      this.resetCalculatorPreview();
      return;
    }
    draft.decimals = mode === 'score' ? 0 : Math.max(0, draft.decimals);
    draft.resultUnit = mode === 'score' && !draft.resultUnit ? 'puntos' : draft.resultUnit;
    draft.resultLabel = mode === 'score' && draft.resultLabel === 'Resultado' ? 'Puntaje total' : draft.resultLabel;
    draft.fields.forEach((field) => this.ensureFieldEditors(field));
    this.calculatorIssues = [];
    this.calculatePreview();
  }

  addCalculatorField(): void {
    const draft = this.calculatorDraft;
    if (!draft || !this.canManage || this.busy || draft.mode === 'builtin') return;
    const index = draft.fields.length + 1;
    draft.fields.push(blankCalculatorField({ key: `variable_${index}`, label: `Variable ${index}` }));
    this.resetCalculatorPreview();
  }

  removeCalculatorField(index: number): void {
    if (!this.canManage || this.busy || this.calculatorDraft?.mode === 'builtin') return;
    this.calculatorDraft?.fields.splice(index, 1);
    this.calculatorIssues = [];
    this.resetCalculatorPreview();
  }

  moveCalculatorField(index: number, direction: -1 | 1): void {
    if (!this.canManage || this.busy) return;
    const fields = this.calculatorDraft?.fields;
    if (!fields || this.calculatorDraft?.mode === 'builtin') return;
    if (this.move(fields, index, direction)) this.announceFieldMove(fields[index + direction]?.label, index + direction, fields.length);
  }

  startCalculatorFieldDrag(index: number, event: DragEvent): void {
    if (!this.canManage || this.busy || this.calculatorDraft?.mode === 'builtin') return event.preventDefault();
    this.calculatorDragIndex = index;
    this.calculatorDropIndex = index;
    this.calculatorDropAfter = false;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', this.calculatorDraft?.fields[index]?.clientId || String(index));
    }
  }

  calculatorFieldDragOver(index: number, event: DragEvent): void {
    if (this.calculatorDragIndex == null || this.calculatorDraft?.mode === 'builtin') return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement | null;
    const bounds = target?.getBoundingClientRect();
    this.calculatorDropIndex = index;
    this.calculatorDropAfter = Boolean(bounds && event.clientY >= bounds.top + bounds.height / 2);
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  dropCalculatorField(index: number, event: DragEvent): void {
    event.preventDefault();
    const fields = this.calculatorDraft?.fields;
    const from = this.calculatorDragIndex;
    if (!fields || from == null || this.calculatorDraft?.mode === 'builtin') return this.endCalculatorFieldDrag();
    const destination = droppedItemDestination(from, index, this.calculatorDropAfter, fields.length);
    const label = fields[from]?.label;
    if (reorderMutableItems(fields, from, destination)) this.announceFieldMove(label, destination, fields.length);
    this.endCalculatorFieldDrag();
  }

  endCalculatorFieldDrag(): void {
    this.calculatorDragIndex = null;
    this.calculatorDropIndex = null;
    this.calculatorDropAfter = false;
  }

  calculatorFieldTypeChanged(field: CalculatorFieldDraft): void {
    if (!this.canManage || this.busy || this.calculatorDraft?.mode === 'builtin') return;
    this.ensureFieldEditors(field);
    this.resetCalculatorPreview();
  }

  addCalculatorOption(field: CalculatorFieldDraft): void {
    if (!this.canManage || this.busy || this.calculatorDraft?.mode === 'builtin') return;
    field.options.push(blankBuilderOption(this.calculatorDraft?.mode === 'score'));
    this.resetCalculatorPreview();
  }

  removeCalculatorOption(field: CalculatorFieldDraft, index: number): void {
    if (!this.canManage || this.busy || this.calculatorDraft?.mode === 'builtin') return;
    field.options.splice(index, 1);
    this.resetCalculatorPreview();
  }

  addScoreRule(field: CalculatorFieldDraft): void {
    if (!this.canManage || this.busy) return;
    field.scoreRules.push(blankScoreRule());
    this.calculatePreview();
  }

  removeScoreRule(field: CalculatorFieldDraft, index: number): void {
    if (!this.canManage || this.busy) return;
    field.scoreRules.splice(index, 1);
    this.calculatePreview();
  }

  addCalculatorRange(): void {
    if (!this.canManage || this.busy) return;
    this.calculatorDraft?.ranges.push(blankCalculatorRange());
  }

  removeCalculatorRange(index: number): void {
    if (!this.canManage || this.busy) return;
    this.calculatorDraft?.ranges.splice(index, 1);
  }

  appendFormulaToken(token: string): void {
    const draft = this.calculatorDraft;
    if (!draft || !this.canManage || this.busy) return;
    draft.expression = `${draft.expression}${draft.expression && !draft.expression.endsWith(' ') ? ' ' : ''}${token}`;
    this.calculatePreview();
  }

  calculatePreview(): void {
    const draft = this.calculatorDraft;
    if (!draft) return;
    if (draft.mode === 'builtin') {
      this.calculatorPreviewValue = null;
      this.calculatorPreviewRange = '';
      this.calculatorPreviewError = 'El motor clínico original se ejecuta desde Herramientas.';
      return;
    }
    try {
      const result = evaluateCalculatorDraft(draft, this.calculatorPreviewValues);
      this.calculatorPreviewValue = result.value;
      this.calculatorPreviewRange = result.range?.label || '';
      this.calculatorPreviewError = '';
    } catch (failure) {
      this.calculatorPreviewValue = null;
      this.calculatorPreviewRange = '';
      this.calculatorPreviewError = failureMessage(failure, 'Complete la fórmula y sus variables.');
    }
  }

  calculatorFieldKeyChanged(): void {
    if (!this.canManage || this.busy || this.calculatorDraft?.mode === 'builtin') return;
    this.resetCalculatorPreview();
  }

  saveCalculator(): void {
    const draft = this.calculatorDraft;
    if (!draft || !this.canManage || this.busy) return;
    const issues = [...validateCalculatorDraft(draft)];
    if (draft.replacesBuiltInKey) {
      const duplicate = this.calculators.find((item) =>
        item.id !== draft.id && item.definition.replacesBuiltInKey === draft.replacesBuiltInKey);
      if (duplicate) {
        issues.push({
          path: 'replacesBuiltInKey',
          message: `Ya existe una personalización para ${draft.replacesBuiltInKey}. Abra esa versión para editarla o reactivarla.`
        });
      }
    }
    this.calculatorIssues = issues;
    if (issues.length) return this.showToast(issues[0]!.message, true);
    this.busy = true;
    const wasInactive = Boolean(draft.id && this.calculators.find((item) => item.id === draft.id)?.active === false);
    const request = draft.id
      ? this.service.updateCalculator(draft.id, calculatorSavePayload(draft))
      : this.service.createCalculator(calculatorSavePayload(draft));
    this.subscriptions.add(request.pipe(catchError((failure) => this.fail(failure))).subscribe((item) => {
      this.updateView(() => {
        this.busy = false;
        if (!item) return;
        const action = draft.id ? (wasInactive && item.active ? 'restored' : 'updated') : 'created';
        this.calculatorDraft = calculatorDraftFromItem(item);
        this.captureClean('calculators');
        this.afterMutation('calculators', item.id, action, true);
        this.loadCalculators(item.id);
      });
    }));
  }

  archiveCalculator(): void {
    const draft = this.calculatorDraft;
    if (!draft?.id || !this.canManage || this.busy) return;
    if (!draft.active) {
      draft.active = true;
      this.saveCalculator();
      return;
    }
    const question = this.selectedBuiltInKey
      ? 'Se archivará esta personalización y volverá a usarse el motor clínico original. La versión se conservará y podrá reactivarse. ¿Desea continuar?'
      : 'La calculadora dejará de aparecer en Herramientas. Sus versiones se conservarán. ¿Desea desactivarla?';
    if (!globalThis.confirm(question)) return;
    this.busy = true;
    this.subscriptions.add(this.service.archiveCalculator(draft.id).pipe(catchError((failure) => this.fail(failure))).subscribe((item) => {
      this.updateView(() => {
        this.busy = false;
        if (!item) return;
        this.calculatorDraft = calculatorDraftFromItem(item);
        this.captureClean('calculators');
        this.afterMutation('calculators', item.id, 'archived', true);
        this.loadCalculators(item.id);
      });
    }));
  }

  beginResearch(): void {
    if (!this.canManage || this.busy) return;
    if (!this.confirmTargetDiscard('research')) return;
    this.captureClean('research');
    this.researchDraft = blankResearch();
    this.researchIssues = [];
  }

  editResearch(item: ResearchItem, force = false): void {
    if (this.busy) return;
    if (!force && this.researchDraft?.id === item.id) return;
    if (!force && !this.confirmTargetDiscard('research')) return;
    this.researchDraft = researchDraftFromItem(item);
    this.researchIssues = [];
    this.captureClean('research');
  }

  addResearchField(): void {
    const draft = this.researchDraft;
    if (!draft || !this.canManage || this.busy) return;
    const index = draft.fields.length + 1;
    draft.fields.push(blankResearchField({ key: `campo_${index}`, label: `Campo ${index}` }));
  }

  removeResearchField(index: number): void {
    if (!this.canManage || this.busy) return;
    this.researchDraft?.fields.splice(index, 1);
  }
  moveResearchField(index: number, direction: -1 | 1): void {
    if (!this.canManage || this.busy || !this.researchDraft) return;
    if (this.move(this.researchDraft.fields, index, direction)) {
      this.announceFieldMove(this.researchDraft.fields[index + direction]?.label, index + direction, this.researchDraft.fields.length);
    }
  }
  startResearchFieldDrag(index: number, event: DragEvent): void {
    if (!this.canManage || this.busy) return event.preventDefault();
    this.researchDragIndex = index;
    this.researchDropIndex = index;
    this.researchDropAfter = false;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', this.researchDraft?.fields[index]?.clientId || String(index));
    }
  }
  researchFieldDragOver(index: number, event: DragEvent): void {
    if (this.researchDragIndex == null) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement | null;
    const bounds = target?.getBoundingClientRect();
    this.researchDropIndex = index;
    this.researchDropAfter = Boolean(bounds && event.clientY >= bounds.top + bounds.height / 2);
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }
  dropResearchField(index: number, event: DragEvent): void {
    event.preventDefault();
    const fields = this.researchDraft?.fields;
    const from = this.researchDragIndex;
    if (!fields || from == null) return this.endResearchFieldDrag();
    const destination = droppedItemDestination(from, index, this.researchDropAfter, fields.length);
    const label = fields[from]?.label;
    if (reorderMutableItems(fields, from, destination)) this.announceFieldMove(label, destination, fields.length);
    this.endResearchFieldDrag();
  }
  endResearchFieldDrag(): void {
    this.researchDragIndex = null;
    this.researchDropIndex = null;
    this.researchDropAfter = false;
  }
  addResearchOption(field: ResearchFieldDraft): void {
    if (!this.canManage || this.busy) return;
    field.options.push(blankBuilderOption());
  }
  removeResearchOption(field: ResearchFieldDraft, index: number): void {
    if (!this.canManage || this.busy) return;
    field.options.splice(index, 1);
  }

  saveResearch(): void {
    const draft = this.researchDraft;
    if (!draft || !this.canManage || this.busy) return;
    const issues = validateResearchDraft(draft);
    this.researchIssues = issues;
    if (issues.length) return this.showToast(issues[0]!.message, true);
    this.busy = true;
    const wasInactive = Boolean(draft.id && this.researchForms.find((item) => item.id === draft.id)?.active === false);
    const request = draft.id
      ? this.service.updateResearchForm(draft.id, researchSavePayload(draft))
      : this.service.createResearchForm(researchSavePayload(draft));
    this.subscriptions.add(request.pipe(catchError((failure) => this.fail(failure))).subscribe((item) => {
      this.updateView(() => {
        this.busy = false;
        if (!item) return;
        const action = draft.id ? (wasInactive && item.active ? 'restored' : 'updated') : 'created';
        this.researchDraft = researchDraftFromItem(item);
        this.captureClean('research');
        this.afterMutation('research', item.id, action);
        this.loadResearch(item.id);
      });
    }));
  }

  archiveResearch(): void {
    const draft = this.researchDraft;
    if (!draft?.id || !this.canManage || this.busy) return;
    if (!draft.active) {
      draft.active = true;
      this.saveResearch();
      return;
    }
    if (!globalThis.confirm('El formulario dejará de estar disponible para nuevas cargas. Sus registros y versiones se conservarán. ¿Desea desactivarlo?')) return;
    this.busy = true;
    this.subscriptions.add(this.service.archiveResearchForm(draft.id).pipe(catchError((failure) => this.fail(failure))).subscribe((item) => {
      this.updateView(() => {
        this.busy = false;
        if (!item) return;
        this.researchDraft = researchDraftFromItem(item);
        this.captureClean('research');
        this.afterMutation('research', item.id, 'archived');
        this.loadResearch(item.id);
      });
    }));
  }

  saveDayHospital(): void {
    if (!this.canManage || this.busy || !this.dayHospitalPlan.valid) return;
    this.busy = true;
    const request = this.dayHospital.id
      ? this.service.updateDayHospitalSettings(this.dayHospital.id, dayHospitalSavePayload(this.dayHospital))
      : this.service.createDayHospitalSettings(dayHospitalSavePayload(this.dayHospital));
    this.subscriptions.add(request.pipe(catchError((failure) => this.fail(failure))).subscribe((item) => {
      this.updateView(() => {
        this.busy = false;
        if (!item) return;
        const created = !this.dayHospital.id;
        this.dayHospital = defaultDayHospitalDraft(item);
        this.captureClean('day-hospital');
        this.afterMutation('day-hospital', item.id, created ? 'created' : 'updated');
      });
    }));
  }

  applyLlmPreset(name: keyof typeof LLM_PRESETS): void {
    const draft = this.llmDraft;
    if (!draft || !this.canManage || this.busy || this.llmLocked('baseUrl') || this.llmLocked('model')) return;
    Object.assign(draft, LLM_PRESETS[name]);
    this.llmStatus = 'Configuración rápida aplicada. Falta probarla o guardarla.';
    this.llmStatusKind = 'pending';
  }

  llmLocked(field: string): boolean { return Boolean(this.llmDraft?.lockedFields.includes(field)); }

  testLlm(): void {
    const draft = this.llmDraft;
    if (!draft || !this.canManage || this.busy) return;
    const issues = validateLlmDraft(draft);
    if (issues.length) return this.setLlmStatus(issues[0]!.message, 'error');
    this.busy = true;
    this.setLlmStatus('Probando la conexión con el modelo…', 'pending');
    this.subscriptions.add(this.service.testLlmConfiguration(llmPayload(draft)).pipe(catchError((failure) => {
      this.updateView(() => {
        this.busy = false;
        this.setLlmStatus(failureMessage(failure, 'No se pudo conectar con el servicio LLM.'), 'error');
      });
      return of(null);
    })).subscribe((result) => {
      this.updateView(() => {
        this.busy = false;
        if (!result) return;
        const detail = [result.model, result.response || result.message].filter(Boolean).join(' · ');
        this.setLlmStatus(`Conexión correcta${detail ? `: ${detail}` : '.'}`, 'success');
        this.configurationChanged.emit({ section: 'llm', id: 'llm', action: 'tested' });
      });
    }));
  }

  saveLlm(): void {
    const draft = this.llmDraft;
    if (!draft || !this.canManage || this.busy) return;
    const issues = validateLlmDraft(draft);
    if (issues.length) return this.setLlmStatus(issues[0]!.message, 'error');
    this.busy = true;
    this.subscriptions.add(this.service.updateLlmConfiguration(llmPayload(draft)).pipe(catchError((failure) => {
      this.updateView(() => {
        this.busy = false;
        this.setLlmStatus(failureMessage(failure), 'error');
      });
      return of(null);
    })).subscribe((config) => {
      this.updateView(() => {
        this.busy = false;
        if (!config) return;
        this.llmDraft = llmDraftFromConfiguration(config);
        this.captureClean('llm');
        this.setLlmStatus('Configuración guardada. La clave privada no se muestra.', 'success');
        this.afterMutation('llm', 'llm', 'updated');
      });
    }));
  }

  selectAccessView(view: AccessView): void {
    if (!this.canAdmin(view) || this.busy) return;
    if (view === this.accessView) return;
    if (!this.confirmTargetDiscard(this.accessDirtyTarget(this.accessView))) return;
    this.accessView = view;
  }

  canAdmin(view: AccessView): boolean {
    return hasPermission(this.identity, `admin.manage-${view === 'security' ? 'security' : view}`);
  }

  beginUser(): void {
    if (!this.canAdmin('users') || this.busy || !this.confirmTargetDiscard('access-user')) return;
    this.captureClean('access-user');
    this.userDraft = blankAdminUser();
    this.userIssues = [];
  }
  editUser(user: AdminUser, force = false): void {
    if (this.busy && !force) return;
    if (!force && this.userDraft?.id === user.id) return;
    if (!force && !this.confirmTargetDiscard('access-user')) return;
    this.userDraft = adminUserDraft(user);
    this.userIssues = [];
    this.captureClean('access-user');
  }
  beginRole(): void {
    if (!this.canAdmin('roles') || this.busy || !this.confirmTargetDiscard('access-role')) return;
    this.captureClean('access-role');
    this.roleDraft = blankAdminRole();
    this.roleIssues = [];
  }
  editRole(role: AdminRole, force = false): void {
    if (this.busy && !force) return;
    if (!force && this.roleDraft?.id === role.id) return;
    if (!force && !this.confirmTargetDiscard('access-role')) return;
    this.roleDraft = adminRoleDraft(role);
    this.roleIssues = [];
    this.captureClean('access-role');
  }

  toggleUserRole(roleId: string, checked: boolean): void {
    if (!this.userDraft || !this.canAdmin('users') || this.busy) return;
    const roles = new Set(this.userDraft.roleIds);
    checked ? roles.add(roleId) : roles.delete(roleId);
    this.userDraft.roleIds = [...roles];
  }

  togglePermission(permission: string, checked: boolean): void {
    if (!this.roleDraft || !this.canAdmin('roles') || this.busy) return;
    const permissions = new Set(this.roleDraft.permissions);
    checked ? permissions.add(permission) : permissions.delete(permission);
    this.roleDraft.permissions = [...permissions];
  }

  saveUser(): void {
    const draft = this.userDraft;
    if (!draft || !this.canAdmin('users') || this.busy) return;
    const issues = validateAdminUserDraft(draft);
    this.userIssues = issues;
    if (issues.length) return this.showToast(issues[0]!.message, true);
    this.busy = true;
    const request = draft.id ? this.service.updateUser(draft.id, adminUserPayload(draft)) : this.service.createUser(adminUserPayload(draft));
    this.subscriptions.add(request.pipe(catchError((failure) => this.fail(failure))).subscribe((saved) => {
      this.updateView(() => {
        this.busy = false;
        if (!saved) return;
        this.userDraft = adminUserDraft(saved);
        this.captureClean('access-user');
        this.afterMutation('access', saved.id, draft.id ? 'updated' : 'created');
        this.loadUsers(saved.id);
      });
    }));
  }

  saveRole(): void {
    const draft = this.roleDraft;
    if (!draft || !this.canAdmin('roles') || this.busy) return;
    const issues = validateAdminRoleDraft(draft);
    this.roleIssues = issues;
    if (issues.length) return this.showToast(issues[0]!.message, true);
    this.busy = true;
    const request = draft.id ? this.service.updateRole(draft.id, adminRolePayload(draft)) : this.service.createRole(adminRolePayload(draft));
    this.subscriptions.add(request.pipe(catchError((failure) => this.fail(failure))).subscribe((saved) => {
      this.updateView(() => {
        this.busy = false;
        if (!saved) return;
        this.roleDraft = adminRoleDraft(saved);
        this.captureClean('access-role');
        this.afterMutation('access', saved.id, draft.id ? 'updated' : 'created');
        this.loadRoles(saved.id);
      });
    }));
  }

  saveSecurity(): void {
    if (!this.security || !this.canAdmin('security') || this.busy) return;
    this.busy = true;
    this.subscriptions.add(this.service.updateSecuritySettings(this.security.sessionDurationMinutes).pipe(catchError((failure) => this.fail(failure))).subscribe((settings) => {
      this.updateView(() => {
        this.busy = false;
        if (!settings) return;
        this.security = settings;
        this.captureClean('access-security');
        this.afterMutation('access', 'security', 'updated');
      });
    }));
  }

  hasIssue(issues: readonly ValidationIssue[], path: string): boolean { return fieldIssue(issues, path); }
  accessDate(value: string): string { return formatAccessDate(value); }

  private loadSection(section: OperationsSection): void {
    if (this.loaded.has(section)) return;
    this.loaded.add(section);
    if (section === 'calculators') this.loadCalculators();
    else if (section === 'research') this.loadResearch();
    else if (section === 'day-hospital') this.loadDayHospital();
    else if (section === 'llm') this.loadLlm();
    else this.loadAccess();
  }

  private loadCalculators(selectId = ''): void {
    this.busy = true; this.error = '';
    this.subscriptions.add(forkJoin({
      items: this.service.calculators(),
      settings: this.service.toolSettings()
    }).pipe(catchError((failure) => this.fail(failure))).subscribe(({ items, settings }) => {
      this.updateView(() => {
        this.busy = false;
        this.calculators = items;
        if (!this.targetHasUnsavedChanges('calculator-settings')) {
          this.toolSettings = settings;
          this.disabledBuiltInKeys = [...(settings?.definition.disabledBuiltInKeys ?? [])];
          this.captureClean('calculator-settings');
        }
        const selected = items.find((item) => item.id === selectId || item.id === this.calculatorDraft?.id);
        if (selected && (Boolean(selectId) || !this.targetHasUnsavedChanges('calculators'))) this.editCalculator(selected, true);
        else if (this.selectedBuiltInKey && !this.targetHasUnsavedChanges('calculators')) {
          const builtIn = this.builtInCalculators.find((item) => item.key === this.selectedBuiltInKey);
          if (builtIn) this.selectBuiltInCalculator(builtIn);
        } else if (!this.calculatorDraft) this.captureClean('calculators');
      });
    }));
  }

  private loadResearch(selectId = ''): void {
    this.busy = true; this.error = '';
    this.subscriptions.add(this.service.researchForms().pipe(catchError((failure) => this.fail(failure))).subscribe((items) => {
      this.updateView(() => {
        this.busy = false;
        if (!items) return;
        this.researchForms = items;
        const selected = items.find((item) => item.id === selectId || item.id === this.researchDraft?.id);
        if (selected && (Boolean(selectId) || !this.targetHasUnsavedChanges('research'))) this.editResearch(selected, true);
        else if (!this.researchDraft) this.captureClean('research');
      });
    }));
  }

  private loadDayHospital(): void {
    this.busy = true; this.error = '';
    this.subscriptions.add(this.service.dayHospitalSettings().pipe(catchError((failure) => this.fail(failure))).subscribe((item) => {
      this.updateView(() => {
        this.busy = false;
        if (item === undefined) return;
        if (!this.targetHasUnsavedChanges('day-hospital')) {
          this.dayHospital = defaultDayHospitalDraft(item);
          this.captureClean('day-hospital');
        }
      });
    }));
  }

  private loadLlm(): void {
    this.busy = true; this.error = '';
    this.subscriptions.add(this.service.llmConfiguration().pipe(catchError((failure) => this.fail(failure))).subscribe((config) => {
      this.updateView(() => {
        this.busy = false;
        if (!config) return;
        if (!this.targetHasUnsavedChanges('llm')) {
          this.llmDraft = llmDraftFromConfiguration(config);
          this.captureClean('llm');
          this.setLlmStatus('Configuración cargada. Puede probarla o modificarla.', 'ready');
        }
      });
    }));
  }

  private loadAccess(): void {
    this.busy = true; this.error = '';
    this.subscriptions.add(this.service.identity().pipe(catchError((failure) => this.fail(failure))).subscribe((identity) => {
      this.updateView(() => {
        this.busy = false;
        if (!identity) return;
        this.identity = identity;
        if (this.canAdmin('roles')) this.loadRoles();
        if (this.canAdmin('users')) this.loadUsers();
        if (this.canAdmin('security')) this.loadSecurity();
        this.accessView = (['users', 'roles', 'security'] as AccessView[]).find((view) => this.canAdmin(view)) ?? 'users';
      });
    }));
  }

  private loadUsers(selectId = ''): void {
    this.subscriptions.add(this.service.users().pipe(catchError((failure) => this.fail(failure))).subscribe((users) => {
      this.updateView(() => {
        if (!users) return;
        this.users = users;
        const selected = users.find((user) => user.id === selectId || user.id === this.userDraft?.id);
        if (selected && (Boolean(selectId) || !this.targetHasUnsavedChanges('access-user'))) this.editUser(selected, true);
        else if (!this.userDraft) this.captureClean('access-user');
      });
    }));
  }

  private loadRoles(selectId = ''): void {
    this.subscriptions.add(this.service.roles().pipe(catchError((failure) => this.fail(failure))).subscribe((catalog) => {
      this.updateView(() => {
        if (!catalog) return;
        this.roles = catalog.roles;
        this.permissions = catalog.permissions;
        const selected = catalog.roles.find((role) => role.id === selectId || role.id === this.roleDraft?.id);
        if (selected && (Boolean(selectId) || !this.targetHasUnsavedChanges('access-role'))) this.editRole(selected, true);
        else if (!this.roleDraft) this.captureClean('access-role');
      });
    }));
  }

  private loadSecurity(): void {
    this.subscriptions.add(this.service.securitySettings().pipe(catchError((failure) => this.fail(failure))).subscribe((settings) => {
      this.updateView(() => {
        if (settings && !this.targetHasUnsavedChanges('access-security')) {
          this.security = settings;
          this.captureClean('access-security');
        }
      });
    }));
  }

  private resetCalculatorPreview(): void {
    const draft = this.calculatorDraft;
    this.calculatorPreviewValues = draft ? { ...calculatorExampleValues(draft) } as Record<string, string | number | boolean> : {};
    this.calculatePreview();
  }

  private ensureFieldEditors(field: CalculatorFieldDraft): void {
    if (field.type === 'select' && !field.options.length) field.options.push(blankBuilderOption(this.calculatorDraft?.mode === 'score'));
    if (this.calculatorDraft?.mode === 'score' && field.type === 'number' && !field.scoreRules.length) field.scoreRules.push(blankScoreRule());
  }

  private afterMutation(section: OperationsSection, id: string, action: ConfigurationMutationEvent['action'], calculator = false): void {
    this.service.broadcastChanged(calculator);
    this.configurationChanged.emit({ section, id, action });
    this.showToast(action === 'created' ? 'Configuración creada.' : action === 'archived' ? 'Configuración desactivada sin borrar su historial.' : action === 'restored' ? 'Configuración reactivada.' : 'Cambios guardados.');
  }

  private fail(failure: unknown): Observable<never> {
    this.updateView(() => {
      this.busy = false;
      this.error = failureMessage(failure);
      this.showToast(this.error, true);
    });
    return EMPTY;
  }

  private setLlmStatus(message: string, kind: typeof this.llmStatusKind): void {
    this.llmStatus = message;
    this.llmStatusKind = kind;
  }

  private showToast(message: string, error = false): void {
    this.toastMessage = message;
    this.toastError = error;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.updateView(() => {
      this.toastMessage = '';
      this.toastError = false;
    }), 4200);
  }

  private updateView(action: () => void): void {
    this.zone.run(() => {
      action();
      this.changeDetector.markForCheck();
      this.changeDetector.detectChanges();
    });
  }

  private accessDirtyTarget(view: AccessView): DirtyTarget {
    return view === 'users' ? 'access-user' : view === 'roles' ? 'access-role' : 'access-security';
  }

  private dirtyValue(target: DirtyTarget): unknown {
    if (target === 'calculators') return this.calculatorDraft;
    if (target === 'calculator-settings') return this.disabledBuiltInKeys;
    if (target === 'research') return this.researchDraft;
    if (target === 'day-hospital') return this.dayHospital;
    if (target === 'llm') return this.llmDraft;
    if (target === 'access-user') return this.userDraft;
    if (target === 'access-role') return this.roleDraft;
    return this.security;
  }

  private captureClean(target: DirtyTarget): void {
    const value = this.dirtyValue(target);
    this.cleanSnapshots.set(target, JSON.stringify(value));
    this.cleanValues.set(target, this.cloneValue(value));
  }

  private targetHasUnsavedChanges(target: DirtyTarget): boolean {
    const clean = this.cleanSnapshots.get(target);
    return clean !== undefined && clean !== JSON.stringify(this.dirtyValue(target));
  }

  private confirmTargetDiscard(target: DirtyTarget): boolean {
    if (!this.targetHasUnsavedChanges(target)) return true;
    if (!globalThis.confirm('Hay cambios sin guardar. Si continúa, se perderán. ¿Desea descartarlos?')) return false;
    this.restoreClean(target);
    return true;
  }

  private discardSectionChanges(section: OperationsSection): void {
    if (section === 'calculators') {
      this.restoreClean('calculators');
      this.restoreClean('calculator-settings');
      return;
    }
    if (section === 'access') {
      (['access-user', 'access-role', 'access-security'] as const).forEach((target) => this.restoreClean(target));
      return;
    }
    this.restoreClean(section);
  }

  private restoreClean(target: DirtyTarget): void {
    if (!this.cleanValues.has(target)) return;
    const value = this.cloneValue(this.cleanValues.get(target));
    if (target === 'calculators') {
      this.calculatorDraft = value as CalculatorDraft | null;
      this.selectedBuiltInKey = this.calculatorDraft?.replacesBuiltInKey || '';
      this.calculatorIssues = [];
      this.resetCalculatorPreview();
    } else if (target === 'calculator-settings') {
      this.disabledBuiltInKeys = value as string[];
    } else if (target === 'research') {
      this.researchDraft = value as ResearchDraft | null;
      this.researchIssues = [];
    } else if (target === 'day-hospital') {
      this.dayHospital = value as DayHospitalDraft;
    } else if (target === 'llm') {
      this.llmDraft = value as LlmDraft | null;
      this.setLlmStatus('Cambios descartados.', 'ready');
    } else if (target === 'access-user') {
      this.userDraft = value as AdminUserDraft | null;
      this.userIssues = [];
    } else if (target === 'access-role') {
      this.roleDraft = value as AdminRoleDraft | null;
      this.roleIssues = [];
    } else {
      this.security = value as SecuritySettings | null;
    }
  }

  private cloneValue<T>(value: T): T {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private calculatorOverrideFor(key: string): CalculatorItem | null {
    return [...this.calculators]
      .filter((item) => item.definition.replacesBuiltInKey === key)
      .sort((left, right) => Number(right.active) - Number(left.active) || right.revision - left.revision)[0] ?? null;
  }

  private announceFieldMove(label: string | undefined, destination: number, length: number): void {
    this.reorderAnnouncement = `${label || 'Campo'} movido a la posición ${destination + 1} de ${length}.`;
  }

  private move<T>(items: T[], index: number, direction: -1 | 1): boolean {
    const destination = index + direction;
    if (destination < 0 || destination >= items.length) return false;
    return reorderMutableItems(items, index, destination);
  }
}
