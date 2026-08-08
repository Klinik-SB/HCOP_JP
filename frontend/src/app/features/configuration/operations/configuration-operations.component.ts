import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EMPTY, Observable, Subscription, catchError, of } from 'rxjs';
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
  calculatorDraftFromItem,
  calculatorExampleValues,
  calculatorSavePayload,
  dayHospitalPreview,
  dayHospitalSavePayload,
  defaultDayHospitalDraft,
  evaluateCalculatorDraft,
  failureMessage,
  fieldIssue,
  formatAccessDate,
  hasPermission,
  llmDraftFromConfiguration,
  llmPayload,
  normalizedSearch,
  researchDraftFromItem,
  researchSavePayload,
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

@Component({
  selector: 'app-configuration-operations',
  imports: [CommonModule, FormsModule],
  host: { class: 'configuration-operations-host' },
  templateUrl: './configuration-operations.component.html',
  styleUrl: './configuration-operations.component.scss'
})
export class ConfigurationOperationsComponent implements OnInit, OnDestroy {
  private readonly service = inject(ConfigurationOperationsService);
  private readonly subscriptions = new Subscription();
  private readonly loaded = new Set<OperationsSection>();
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
  readonly fieldTypes = [
    { value: 'number', label: 'Número' }, { value: 'select', label: 'Selector' },
    { value: 'checkbox', label: 'Casilla' }, { value: 'text', label: 'Texto corto' },
    { value: 'textarea', label: 'Texto largo' }, { value: 'date', label: 'Fecha' },
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
  calculatorDraft: CalculatorDraft | null = null;
  calculatorSearch = '';
  showInactiveCalculators = false;
  calculatorIssues: readonly ValidationIssue[] = [];
  calculatorPreviewValues: Record<string, string | number | boolean> = {};
  calculatorPreviewValue: number | null = null;
  calculatorPreviewRange = '';
  calculatorPreviewError = '';
  advancedFormula = false;

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

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  get filteredCalculators(): readonly CalculatorItem[] {
    const query = normalizedSearch(this.calculatorSearch);
    return this.calculators.filter((item) =>
      (this.showInactiveCalculators || item.active) &&
      (!query || normalizedSearch(`${item.name} ${item.description} ${item.definition.category}`).includes(query)));
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

  selectSection(section: OperationsSection): void {
    this.activeSection = section;
    this.error = '';
    this.loadSection(section);
  }

  reload(): void {
    this.loaded.delete(this.activeSection);
    this.loadSection(this.activeSection);
  }

  beginCalculator(mode: CalculatorMode): void {
    if (!this.canManage || this.busy) return;
    this.calculatorDraft = blankCalculator(mode);
    this.calculatorIssues = [];
    this.advancedFormula = false;
    this.resetCalculatorPreview();
  }

  editCalculator(item: CalculatorItem): void {
    if (this.busy) return;
    this.calculatorDraft = calculatorDraftFromItem(item);
    this.calculatorIssues = [];
    this.advancedFormula = false;
    this.resetCalculatorPreview();
  }

  calculatorModeChanged(mode: CalculatorMode): void {
    const draft = this.calculatorDraft;
    if (!draft) return;
    draft.mode = mode;
    draft.decimals = mode === 'score' ? 0 : Math.max(0, draft.decimals);
    draft.resultUnit = mode === 'score' && !draft.resultUnit ? 'puntos' : draft.resultUnit;
    draft.resultLabel = mode === 'score' && draft.resultLabel === 'Resultado' ? 'Puntaje total' : draft.resultLabel;
    draft.fields.forEach((field) => this.ensureFieldEditors(field));
    this.calculatorIssues = [];
    this.calculatePreview();
  }

  addCalculatorField(): void {
    const draft = this.calculatorDraft;
    if (!draft || !this.canManage) return;
    const index = draft.fields.length + 1;
    draft.fields.push(blankCalculatorField({ key: `variable_${index}`, label: `Variable ${index}` }));
    this.resetCalculatorPreview();
  }

  removeCalculatorField(index: number): void {
    this.calculatorDraft?.fields.splice(index, 1);
    this.calculatorIssues = [];
    this.resetCalculatorPreview();
  }

  moveCalculatorField(index: number, direction: -1 | 1): void {
    const fields = this.calculatorDraft?.fields;
    if (!fields) return;
    this.move(fields, index, direction);
  }

  calculatorFieldTypeChanged(field: CalculatorFieldDraft): void {
    this.ensureFieldEditors(field);
    this.resetCalculatorPreview();
  }

  addCalculatorOption(field: CalculatorFieldDraft): void {
    field.options.push(blankBuilderOption(this.calculatorDraft?.mode === 'score'));
    this.resetCalculatorPreview();
  }

  removeCalculatorOption(field: CalculatorFieldDraft, index: number): void {
    field.options.splice(index, 1);
    this.resetCalculatorPreview();
  }

  addScoreRule(field: CalculatorFieldDraft): void {
    field.scoreRules.push(blankScoreRule());
    this.calculatePreview();
  }

  removeScoreRule(field: CalculatorFieldDraft, index: number): void {
    field.scoreRules.splice(index, 1);
    this.calculatePreview();
  }

  addCalculatorRange(): void {
    this.calculatorDraft?.ranges.push(blankCalculatorRange());
  }

  removeCalculatorRange(index: number): void { this.calculatorDraft?.ranges.splice(index, 1); }

  appendFormulaToken(token: string): void {
    const draft = this.calculatorDraft;
    if (!draft) return;
    draft.expression = `${draft.expression}${draft.expression && !draft.expression.endsWith(' ') ? ' ' : ''}${token}`;
    this.calculatePreview();
  }

  calculatePreview(): void {
    const draft = this.calculatorDraft;
    if (!draft) return;
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

  saveCalculator(): void {
    const draft = this.calculatorDraft;
    if (!draft || !this.canManage || this.busy) return;
    const issues = validateCalculatorDraft(draft);
    this.calculatorIssues = issues;
    if (issues.length) return this.showToast(issues[0]!.message, true);
    this.busy = true;
    const wasInactive = Boolean(draft.id && this.calculators.find((item) => item.id === draft.id)?.active === false);
    const request = draft.id
      ? this.service.updateCalculator(draft.id, calculatorSavePayload(draft))
      : this.service.createCalculator(calculatorSavePayload(draft));
    this.subscriptions.add(request.pipe(catchError((failure) => this.fail(failure))).subscribe((item) => {
      this.busy = false;
      if (!item) return;
      const action = draft.id ? (wasInactive && item.active ? 'restored' : 'updated') : 'created';
      this.calculatorDraft = calculatorDraftFromItem(item);
      this.afterMutation('calculators', item.id, action, true);
      this.loadCalculators(item.id);
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
    if (!globalThis.confirm('La calculadora dejará de aparecer en Herramientas. Sus versiones se conservarán. ¿Desea desactivarla?')) return;
    this.busy = true;
    this.subscriptions.add(this.service.archiveCalculator(draft.id).pipe(catchError((failure) => this.fail(failure))).subscribe((item) => {
      this.busy = false;
      if (!item) return;
      this.calculatorDraft = calculatorDraftFromItem(item);
      this.afterMutation('calculators', item.id, 'archived', true);
      this.loadCalculators(item.id);
    }));
  }

  beginResearch(): void {
    if (!this.canManage || this.busy) return;
    this.researchDraft = blankResearch();
    this.researchIssues = [];
  }

  editResearch(item: ResearchItem): void {
    this.researchDraft = researchDraftFromItem(item);
    this.researchIssues = [];
  }

  addResearchField(): void {
    const draft = this.researchDraft;
    if (!draft || !this.canManage) return;
    const index = draft.fields.length + 1;
    draft.fields.push(blankResearchField({ key: `campo_${index}`, label: `Campo ${index}` }));
  }

  removeResearchField(index: number): void { this.researchDraft?.fields.splice(index, 1); }
  moveResearchField(index: number, direction: -1 | 1): void { if (this.researchDraft) this.move(this.researchDraft.fields, index, direction); }
  addResearchOption(field: ResearchFieldDraft): void { field.options.push(blankBuilderOption()); }
  removeResearchOption(field: ResearchFieldDraft, index: number): void { field.options.splice(index, 1); }

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
      this.busy = false;
      if (!item) return;
      const action = draft.id ? (wasInactive && item.active ? 'restored' : 'updated') : 'created';
      this.researchDraft = researchDraftFromItem(item);
      this.afterMutation('research', item.id, action);
      this.loadResearch(item.id);
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
      this.busy = false;
      if (!item) return;
      this.researchDraft = researchDraftFromItem(item);
      this.afterMutation('research', item.id, 'archived');
      this.loadResearch(item.id);
    }));
  }

  saveDayHospital(): void {
    if (!this.canManage || this.busy || !this.dayHospitalPlan.valid) return;
    this.busy = true;
    const request = this.dayHospital.id
      ? this.service.updateDayHospitalSettings(this.dayHospital.id, dayHospitalSavePayload(this.dayHospital))
      : this.service.createDayHospitalSettings(dayHospitalSavePayload(this.dayHospital));
    this.subscriptions.add(request.pipe(catchError((failure) => this.fail(failure))).subscribe((item) => {
      this.busy = false;
      if (!item) return;
      const created = !this.dayHospital.id;
      this.dayHospital = defaultDayHospitalDraft(item);
      this.afterMutation('day-hospital', item.id, created ? 'created' : 'updated');
    }));
  }

  applyLlmPreset(name: keyof typeof LLM_PRESETS): void {
    const draft = this.llmDraft;
    if (!draft || this.llmLocked('baseUrl') || this.llmLocked('model')) return;
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
      this.busy = false;
      this.setLlmStatus(failureMessage(failure, 'No se pudo conectar con el servicio LLM.'), 'error');
      return of(null);
    })).subscribe((result) => {
      this.busy = false;
      if (!result) return;
      const detail = [result.model, result.response || result.message].filter(Boolean).join(' · ');
      this.setLlmStatus(`Conexión correcta${detail ? `: ${detail}` : '.'}`, 'success');
      this.configurationChanged.emit({ section: 'llm', id: 'llm', action: 'tested' });
    }));
  }

  saveLlm(): void {
    const draft = this.llmDraft;
    if (!draft || !this.canManage || this.busy) return;
    const issues = validateLlmDraft(draft);
    if (issues.length) return this.setLlmStatus(issues[0]!.message, 'error');
    this.busy = true;
    this.subscriptions.add(this.service.updateLlmConfiguration(llmPayload(draft)).pipe(catchError((failure) => {
      this.busy = false;
      this.setLlmStatus(failureMessage(failure), 'error');
      return of(null);
    })).subscribe((config) => {
      this.busy = false;
      if (!config) return;
      this.llmDraft = llmDraftFromConfiguration(config);
      this.setLlmStatus('Configuración guardada. La clave privada no se muestra.', 'success');
      this.afterMutation('llm', 'llm', 'updated');
    }));
  }

  selectAccessView(view: AccessView): void {
    if (!this.canAdmin(view)) return;
    this.accessView = view;
  }

  canAdmin(view: AccessView): boolean {
    return hasPermission(this.identity, `admin.manage-${view === 'security' ? 'security' : view}`);
  }

  beginUser(): void { if (this.canAdmin('users')) { this.userDraft = blankAdminUser(); this.userIssues = []; } }
  editUser(user: AdminUser): void { this.userDraft = adminUserDraft(user); this.userIssues = []; }
  beginRole(): void { if (this.canAdmin('roles')) { this.roleDraft = blankAdminRole(); this.roleIssues = []; } }
  editRole(role: AdminRole): void { this.roleDraft = adminRoleDraft(role); this.roleIssues = []; }

  toggleUserRole(roleId: string, checked: boolean): void {
    if (!this.userDraft) return;
    const roles = new Set(this.userDraft.roleIds);
    checked ? roles.add(roleId) : roles.delete(roleId);
    this.userDraft.roleIds = [...roles];
  }

  togglePermission(permission: string, checked: boolean): void {
    if (!this.roleDraft) return;
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
      this.busy = false;
      if (!saved) return;
      this.userDraft = adminUserDraft(saved);
      this.afterMutation('access', saved.id, draft.id ? 'updated' : 'created');
      this.loadUsers(saved.id);
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
      this.busy = false;
      if (!saved) return;
      this.roleDraft = adminRoleDraft(saved);
      this.afterMutation('access', saved.id, draft.id ? 'updated' : 'created');
      this.loadRoles(saved.id);
    }));
  }

  saveSecurity(): void {
    if (!this.security || !this.canAdmin('security') || this.busy) return;
    this.busy = true;
    this.subscriptions.add(this.service.updateSecuritySettings(this.security.sessionDurationMinutes).pipe(catchError((failure) => this.fail(failure))).subscribe((settings) => {
      this.busy = false;
      if (!settings) return;
      this.security = settings;
      this.afterMutation('access', 'security', 'updated');
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
    this.subscriptions.add(this.service.calculators().pipe(catchError((failure) => this.fail(failure))).subscribe((items) => {
      this.busy = false;
      if (!items) return;
      this.calculators = items;
      const selected = items.find((item) => item.id === selectId || item.id === this.calculatorDraft?.id);
      if (selected) this.editCalculator(selected);
    }));
  }

  private loadResearch(selectId = ''): void {
    this.busy = true; this.error = '';
    this.subscriptions.add(this.service.researchForms().pipe(catchError((failure) => this.fail(failure))).subscribe((items) => {
      this.busy = false;
      if (!items) return;
      this.researchForms = items;
      const selected = items.find((item) => item.id === selectId || item.id === this.researchDraft?.id);
      if (selected) this.editResearch(selected);
    }));
  }

  private loadDayHospital(): void {
    this.busy = true; this.error = '';
    this.subscriptions.add(this.service.dayHospitalSettings().pipe(catchError((failure) => this.fail(failure))).subscribe((item) => {
      this.busy = false;
      if (item === undefined) return;
      this.dayHospital = defaultDayHospitalDraft(item);
    }));
  }

  private loadLlm(): void {
    this.busy = true; this.error = '';
    this.subscriptions.add(this.service.llmConfiguration().pipe(catchError((failure) => this.fail(failure))).subscribe((config) => {
      this.busy = false;
      if (!config) return;
      this.llmDraft = llmDraftFromConfiguration(config);
      this.setLlmStatus('Configuración cargada. Puede probarla o modificarla.', 'ready');
    }));
  }

  private loadAccess(): void {
    this.busy = true; this.error = '';
    this.subscriptions.add(this.service.identity().pipe(catchError((failure) => this.fail(failure))).subscribe((identity) => {
      this.busy = false;
      if (!identity) return;
      this.identity = identity;
      if (this.canAdmin('roles')) this.loadRoles();
      if (this.canAdmin('users')) this.loadUsers();
      if (this.canAdmin('security')) this.loadSecurity();
      this.accessView = (['users', 'roles', 'security'] as AccessView[]).find((view) => this.canAdmin(view)) ?? 'users';
    }));
  }

  private loadUsers(selectId = ''): void {
    this.subscriptions.add(this.service.users().pipe(catchError((failure) => this.fail(failure))).subscribe((users) => {
      if (!users) return;
      this.users = users;
      const selected = users.find((user) => user.id === selectId || user.id === this.userDraft?.id);
      if (selected) this.editUser(selected);
    }));
  }

  private loadRoles(selectId = ''): void {
    this.subscriptions.add(this.service.roles().pipe(catchError((failure) => this.fail(failure))).subscribe((catalog) => {
      if (!catalog) return;
      this.roles = catalog.roles;
      this.permissions = catalog.permissions;
      const selected = catalog.roles.find((role) => role.id === selectId || role.id === this.roleDraft?.id);
      if (selected) this.editRole(selected);
    }));
  }

  private loadSecurity(): void {
    this.subscriptions.add(this.service.securitySettings().pipe(catchError((failure) => this.fail(failure))).subscribe((settings) => {
      if (settings) this.security = settings;
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
    this.busy = false;
    this.error = failureMessage(failure);
    this.showToast(this.error, true);
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
    this.toastTimer = setTimeout(() => { this.toastMessage = ''; this.toastError = false; }, 4200);
  }

  private move<T>(items: T[], index: number, direction: -1 | 1): void {
    const destination = index + direction;
    if (destination < 0 || destination >= items.length) return;
    const [item] = items.splice(index, 1);
    if (item != null) items.splice(destination, 0, item);
  }
}
