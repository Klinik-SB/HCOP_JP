export type JsonRecord = Record<string, unknown>;

export type OperationsSection = 'calculators' | 'research' | 'day-hospital' | 'llm' | 'access';
export type CalculatorMode = 'formula' | 'score';
export type BuilderFieldType = 'number' | 'select' | 'checkbox' | 'text' | 'textarea' | 'date' | 'section';
export type ScoreOperator = 'lt' | 'lte' | 'eq' | 'gte' | 'gt' | 'between';
export type AccessView = 'users' | 'roles' | 'security';

export interface ConfigurationItem<TDefinition extends object> {
  readonly id: string;
  readonly kind: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly active: boolean;
  readonly revision: number;
  readonly definition: TDefinition;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BuilderOptionDraft {
  clientId: string;
  value: string;
  label: string;
  points: number;
}

export interface ScoreRuleDraft {
  clientId: string;
  operator: ScoreOperator;
  value: number | null;
  max: number | null;
  points: number;
  label: string;
}

export interface CalculatorFieldDraft {
  clientId: string;
  key: string;
  label: string;
  type: BuilderFieldType;
  unit: string;
  min: number | null;
  max: number | null;
  required: boolean;
  checkedPoints: number;
  options: BuilderOptionDraft[];
  scoreRules: ScoreRuleDraft[];
}

export interface CalculatorRangeDraft {
  clientId: string;
  min: number | null;
  max: number | null;
  label: string;
  severity: 'info' | 'good' | 'warn' | 'bad';
}

export interface CalculatorDefinition {
  readonly mode: CalculatorMode;
  readonly category: string;
  readonly source: string;
  readonly clinicalUse: string;
  readonly fields: readonly JsonRecord[];
  readonly expression: string;
  readonly basePoints: number;
  readonly resultLabel: string;
  readonly resultUnit: string;
  readonly decimals: number;
  readonly ranges: readonly JsonRecord[];
  readonly replacesBuiltInKey?: string;
}

export type CalculatorItem = ConfigurationItem<CalculatorDefinition>;

export interface CalculatorDraft {
  id: string;
  revision: number | null;
  name: string;
  description: string;
  active: boolean;
  mode: CalculatorMode;
  category: string;
  source: string;
  expression: string;
  basePoints: number;
  resultLabel: string;
  resultUnit: string;
  decimals: number;
  replacesBuiltInKey: string;
  fields: CalculatorFieldDraft[];
  ranges: CalculatorRangeDraft[];
}

export interface ResearchFieldDraft {
  clientId: string;
  key: string;
  label: string;
  type: BuilderFieldType;
  placeholder: string;
  required: boolean;
  options: BuilderOptionDraft[];
}

export interface ResearchDefinition {
  readonly category: string;
  readonly instructions: string;
  readonly fields: readonly JsonRecord[];
}

export type ResearchItem = ConfigurationItem<ResearchDefinition>;

export interface ResearchDraft {
  id: string;
  revision: number | null;
  name: string;
  category: string;
  instructions: string;
  active: boolean;
  fields: ResearchFieldDraft[];
}

export interface DayHospitalDefinition {
  chairCount: number;
  slotMinutes: 5 | 10 | 15 | 20 | 30;
  startTime: string;
  endTime: string;
}

export type DayHospitalItem = ConfigurationItem<DayHospitalDefinition>;

export interface DayHospitalDraft extends DayHospitalDefinition {
  readonly id: string;
  readonly revision: number | null;
}

export interface DayHospitalPreview {
  readonly valid: boolean;
  readonly message: string;
  readonly slotsPerChair: number;
  readonly totalSlots: number;
  readonly columnsPerHour: number;
  readonly rowsPerHour: number;
}

export type LlmProvider = 'openai-compatible' | 'ollama' | 'lm-studio' | 'gemini';
export type ApiKeyAction = 'keep' | 'replace' | 'remove';

export interface LlmConfiguration {
  enabled: boolean;
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  hasApiKey: boolean;
  lockedFields: readonly string[];
}

export interface LlmDraft extends LlmConfiguration {
  apiKeyAction: ApiKeyAction;
  apiKey: string;
}

export interface AdminPermission {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly groupKey: string;
  readonly groupLabel: string;
  readonly actionLabel: string;
}

export interface AdminRole {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly system: boolean;
  readonly active: boolean;
  readonly userCount: number;
  readonly permissions: readonly string[];
}

export interface AdminUser {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly displayName: string;
  readonly specialty: string;
  readonly licenseNumber: string;
  readonly active: boolean;
  readonly lastLoginAt: string;
  readonly roles: readonly AdminRole[];
}

export interface AdminUserDraft {
  id: string;
  username: string;
  email: string;
  displayName: string;
  specialty: string;
  licenseNumber: string;
  active: boolean;
  password: string;
  roleIds: string[];
}

export interface AdminRoleDraft {
  id: string;
  key: string;
  name: string;
  description: string;
  active: boolean;
  system: boolean;
  permissions: string[];
}

export interface SecuritySettings {
  loginRequired: true;
  sessionDurationMinutes: number;
  revision: number | null;
}

export interface AccessIdentity {
  readonly authenticated: boolean;
  readonly permissions: readonly string[];
  readonly user: AdminUser | null;
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ConfigurationMutationEvent {
  readonly section: OperationsSection;
  readonly id: string;
  readonly action: 'created' | 'updated' | 'archived' | 'restored' | 'tested';
}
