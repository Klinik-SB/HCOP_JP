export type JsonRecord = Record<string, unknown>;

export interface ProtocolCatalogState {
  readonly protocols: readonly ProtocolCatalogItem[];
  readonly currentCount: number;
  readonly catalogCount: number;
  readonly total: number;
}

export interface ProtocolCatalogItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly active: boolean;
  readonly catalogOnly: boolean;
  readonly componentCount: number;
  readonly cycleDays: number | null;
  readonly durationMinutes: number | null;
  readonly durationText: string;
  readonly coirSchemeId: string;
}

export interface CoirCatalogItem {
  readonly coirSchemeId: string;
  readonly schemeName: string;
  readonly cycleDays: number | null;
  readonly durationMinutes: number | null;
  readonly durationText: string;
  readonly entryType: string;
}

export interface DrugCatalogItem {
  readonly id: string;
  readonly name: string;
  readonly instructions: readonly ProtocolPreparationDraft[];
  readonly presentations: readonly DrugPresentation[];
}

export interface DrugPresentation {
  readonly id: string;
  readonly label: string;
  readonly sourcePayload?: JsonRecord;
}

export interface ProtocolEditorDraft {
  id: string;
  revision: number | null;
  name: string;
  category: string;
  description: string;
  cycleDays: number | null;
  durationMinutes: number | null;
  coirSchemeId: string;
  active: boolean;
  catalogOnly: boolean;
  components: ProtocolComponentDraft[];
}

export interface ProtocolComponentDraft {
  clientId: string;
  id: string;
  drugId: string;
  drugName: string;
  day: string;
  prescribedDoseText: string;
  doseUnit: string;
  doseCalculationMethod: string;
  route: string;
  administrationTime: string;
  dayHospital: boolean;
  preparation: ProtocolPreparationDraft;
  instructionCount: number;
  presentationCount: number;
  sourcePayload?: JsonRecord;
}

export interface ProtocolPreparationDraft {
  id: string;
  drugId: string;
  drugName: string;
  presentationReferences: string;
  reconstituent: string;
  concentration: string;
  diluent: string;
  finalVolume: string;
  route: string;
  stabilityRoomTemperature: string;
  stabilityRefrigerated: string;
  laboratory: string;
  photosensitive: boolean;
  infusionGuide: string;
  preparationObservations: string;
  labelObservations: string;
  dirty: boolean;
  sourcePayload?: JsonRecord;
}

export interface ProtocolComponentPayload {
  readonly id: string;
  readonly drugId: string;
  readonly drugName: string;
  readonly day: string;
  readonly prescribedDoseText: string;
  readonly doseUnit: string;
  readonly doseCalculationMethod: string;
  readonly route: string;
  readonly administrationTime: string;
  readonly dayHospital: boolean;
  readonly sourcePayload?: JsonRecord;
}

export interface ProtocolPreparationPayload {
  readonly id: string;
  readonly drugId: string;
  readonly drugName: string;
  readonly presentationReferences: string;
  readonly reconstituent: string;
  readonly concentration: string;
  readonly diluent: string;
  readonly finalVolume: string;
  readonly route: string;
  readonly stabilityRoomTemperature: string;
  readonly stabilityRefrigerated: string;
  readonly laboratory: string;
  readonly photosensitive: boolean;
  readonly infusionGuide: string;
  readonly preparationObservations: string;
  readonly labelObservations: string;
  readonly sourcePayload?: JsonRecord;
}

export interface SaveProtocolPayload {
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly cycleDays: number | null;
  readonly durationMinutes: number | null;
  readonly coirSchemeId: string | null;
  readonly active: boolean;
  readonly revision?: number;
  readonly components: readonly ProtocolComponentPayload[];
  readonly preparations: readonly ProtocolPreparationPayload[];
}

export interface ProtocolValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ProtocolApiFailure {
  readonly status?: number;
  readonly error?: {
    readonly status?: number;
    readonly code?: string;
    readonly error?: string;
    readonly message?: string;
  };
  readonly message?: string;
}

export interface ProtocolChangedEvent {
  readonly protocolId: string;
  readonly action: 'created' | 'updated' | 'archived' | 'restored';
}
