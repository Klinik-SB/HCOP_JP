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
  category?: string;
  kind?: string;
  modality?: string;
  source?: string;
  summary?: string;
  diagnosis?: string;
  scheme?: string;
  intent?: string;
  notes?: string;
  generic?: string;
  studyName?: string;
  instructions?: string;
  status?: string;
  fileName?: string;
  fileSize?: number;
  size?: number;
  fileCategory?: string;
  fileUrl?: string;
  reportUrl?: string;
  studyUrl?: string;
  attachments?: Array<{ category?: string; url?: string; [key: string]: unknown }>;
  sourceRef?: Record<string, unknown>;
  deleted?: boolean;
  highlighted?: boolean;
  [key: string]: unknown;
}

export interface StudyUploadDescriptor {
  id?: string;
  fileName?: string;
  contentType?: string;
  size?: number;
  sha256?: string;
  category?: string;
  previewable?: boolean;
  url?: string;
  uploadedAt?: string;
  deleteToken?: string;
  deleteExpiresAt?: string;
}

export interface ClinicalSaveResponse {
  ok: boolean;
  unified?: { persisted?: boolean; revision?: number };
}

export interface ClinicalState {
  patient?: ClinicalPatient;
  oncology?: Record<string, unknown>;
  narrative?: Record<string, unknown>;
  exam?: Record<string, unknown>;
  diagnoses?: ClinicalRecord[];
  externalStudies?: ClinicalRecord[];
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
  treatments?: {
    oncology?: ClinicalRecord[];
    nonOncology?: ClinicalRecord[];
    procedures?: ClinicalRecord[];
    referrals?: ClinicalRecord[];
  };
}

export interface NewPatientRequest {
  firstName: string;
  lastName: string;
  dni: string;
  medicalRecord: string;
  birthDate: string;
  sex: string;
  insurance: string;
  affiliateNumber: string;
  phone: string;
  email: string;
  address: string;
}

export interface CreatedPatientResponse {
  ok: boolean;
  created: boolean;
  patientId: string;
  revision: number;
  patient: ClinicalPatient;
  state: ClinicalState;
}
