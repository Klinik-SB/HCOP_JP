export type TrialSourceConnector =
  | 'clinicaltrials-gov'
  | 'nci'
  | 'who-ictrp'
  | 'eu-ctis'
  | 'anmat'
  | 'renis';

export type TrialSourceAccessType = 'api' | 'portal' | 'file';
export type TrialSourceSyncPolicy = 'manual' | 'scheduled';
export type TrialScreeningMode = 'manual' | 'scheduled' | 'realtime';
export type SecureConnectorState = 'not-required' | 'pending' | 'managed';

export interface TrialSourceDefinition {
  readonly schemaVersion: number;
  readonly connector: TrialSourceConnector;
  readonly accessType: TrialSourceAccessType;
  readonly endpointUrl: string;
  readonly countries: readonly string[];
  readonly recruitmentStatuses: readonly string[];
  readonly phases: readonly string[];
  readonly syncPolicy: TrialSourceSyncPolicy;
  readonly syncIntervalHours: number;
  readonly automationCapable: boolean;
  readonly realtimeCapable: boolean;
  readonly secureConnectorState: SecureConnectorState;
  readonly attribution: string;
  readonly termsUrl: string;
  readonly notes: string;
}

export interface TrialSourceItem {
  readonly id: string;
  readonly kind: 'trial-source';
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly active: boolean;
  readonly revision: number;
  readonly definition: TrialSourceDefinition;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TrialSourceDraft {
  id: string;
  key: string;
  revision: number | null;
  name: string;
  active: boolean;
  connector: TrialSourceConnector;
  accessType: TrialSourceAccessType;
  endpointUrl: string;
  countries: string;
  recruitmentStatuses: string;
  phases: string;
  syncPolicy: TrialSourceSyncPolicy;
  syncIntervalHours: number;
  automationCapable: boolean;
  realtimeCapable: boolean;
  secureConnectorState: SecureConnectorState;
  attribution: string;
  termsUrl: string;
  notes: string;
}

export interface TrialScreeningSettingsDefinition {
  readonly schemaVersion: number;
  readonly enabled: boolean;
  readonly mode: TrialScreeningMode;
  readonly intervalHours: number;
  readonly cooldownHours: number;
  readonly maxQuestionsPerModal: number;
  readonly snoozeHours: number;
  readonly localEvaluationOnly: true;
  readonly triggerFields: readonly string[];
}

export interface TrialScreeningSettingsDraft {
  id: string;
  revision: number | null;
  enabled: boolean;
  mode: TrialScreeningMode;
  intervalHours: number;
  cooldownHours: number;
  maxQuestionsPerModal: number;
  snoozeHours: number;
  localEvaluationOnly: true;
  triggerFields: readonly string[];
}

export interface RepositoryValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface TrialSourceConnectorOption {
  readonly value: TrialSourceConnector;
  readonly label: string;
  readonly description: string;
}

export interface TrialScreeningModeOption {
  readonly value: TrialScreeningMode;
  readonly label: string;
  readonly description: string;
}

export interface OncologyRepositoriesApiFailure {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}
