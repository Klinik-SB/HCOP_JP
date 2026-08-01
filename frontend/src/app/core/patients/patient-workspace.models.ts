export interface ClinicalPatient {
  id: string;
  fullName: string;
  dni?: string;
  medicalRecord?: string;
  birthDate?: string;
  sex?: string;
  insurance?: string;
  affiliateNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface ClinicalRecord {
  id?: string;
  date?: string;
  createdAt?: string;
  updatedAt?: string;
  author?: string;
  reason?: string;
  specialty?: string;
  text?: string;
  title?: string;
  type?: string;
  summary?: string;
  diagnosis?: string;
  scheme?: string;
  status?: string;
  deleted?: boolean;
  highlighted?: boolean;
  [key: string]: unknown;
}

export interface ClinicalState {
  patient?: ClinicalPatient;
  oncology?: Record<string, unknown>;
  narrative?: Record<string, unknown>;
  exam?: Record<string, unknown>;
  diagnoses?: ClinicalRecord[];
  studies?: ClinicalRecord[];
  treatments?: ClinicalRecord[];
  evolutions?: ClinicalRecord[];
  prescriptions?: ClinicalRecord[];
  researchRecords?: ClinicalRecord[];
  meta?: Record<string, unknown>;
}

export interface PatientSearchResponse { ok: boolean; patients: ClinicalPatient[]; total: number; }

export interface PatientWorkspace {
  ok: boolean;
  patientId: string;
  patient: ClinicalPatient;
  state: ClinicalState;
  revision: number;
  updatedAt?: string;
  counts?: Record<string, number>;
}
