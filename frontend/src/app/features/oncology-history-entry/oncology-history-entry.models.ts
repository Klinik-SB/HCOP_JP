import type { ClinicalRecord, ClinicalState } from '../../core/patients/patient-workspace.models';

export type OncologyHistoryEntryKind = 'systemic' | 'radiotherapy' | 'surgery';

export interface OncologyHistoryActor {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
  readonly specialty: string;
  readonly licenseNumber: string;
}

export interface OncologyHistoryEntryDraft {
  readonly date: string;
  readonly endDate: string;
  readonly diagnosis: string;
  readonly intent: string;
  readonly status: string;
  readonly institution: string;
  readonly professional: string;
  /** Value entered and shown by the UI, always in kilograms. */
  readonly weightKg: string;
  /** Value entered and shown by the UI, always in centimetres. */
  readonly heightCm: string;
  readonly notes: string;
  readonly treatmentType: string;
  readonly scheme: string;
  readonly drugs: string;
  readonly cycles: string;
  readonly response: string;
  readonly toxicity: string;
  readonly targetSite: string;
  readonly technique: string;
  readonly totalDoseGy: string;
  readonly fractions: string;
  readonly concurrentSystemic: string;
  readonly procedure: string;
  readonly surgeon: string;
  readonly pathology: string;
  readonly margins: string;
  readonly complications: string;
  readonly reason: string;
}

export interface OncologyHistoryMetrics {
  readonly bmi: number | null;
  readonly bodySurfaceM2: number | null;
  readonly dosePerFractionGy: number | null;
}

export interface ApplyOncologyHistoryEntryRequest {
  readonly kind: OncologyHistoryEntryKind;
  readonly draft: OncologyHistoryEntryDraft;
  readonly actor: OncologyHistoryActor;
  readonly original?: ClinicalRecord | null;
  readonly at?: string;
  readonly id?: string;
  readonly evolutionId?: string;
}

export interface AppliedOncologyHistoryEntry {
  readonly state: ClinicalState;
  readonly record: ClinicalRecord;
  readonly evolution: ClinicalRecord;
  readonly mode: 'created' | 'updated';
}
