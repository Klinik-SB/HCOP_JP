import type { ClinicalPatient } from '../patients/patient-workspace.models';

const REDACTED = '[dato reservado]';

const SENSITIVE_PROPERTY_NAMES = new Set([
  'fullname',
  'firstname',
  'lastname',
  'patientname',
  'dni',
  'documentnumber',
  'numerodocumento',
  'medicalrecord',
  'numerohc',
  'affiliateNumber',
  'phone',
  'telephone',
  'cellphone',
  'email',
  'address',
  'birthdate',
  'dateofbirth',
  'deathdate',
  'liraid',
  'patientid'
].map((value) => normalizeKey(value)));

export function deidentifyClinicalText(value: unknown, patient?: ClinicalPatient): string {
  let text = String(value ?? '');
  const replacements = identityReplacements(patient)
    .filter(([candidate]) => candidate.length >= 3)
    .sort(([left], [right]) => right.length - left.length);

  for (const [candidate, replacement] of replacements) {
    text = text.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(candidate)}(?![\\p{L}\\p{N}])`, 'giu'),
      replacement
    );
  }

  for (const candidate of [patient?.dni, patient?.medicalRecord, patient?.affiliateNumber, patient?.phone]) {
    const digits = String(candidate || '').replace(/\D/g, '');
    if (digits.length < 6) continue;
    const looseDigits = digits.split('').map(escapeRegExp).join('[\\s.()/-]*');
    text = text.replace(new RegExp(looseDigits, 'g'), REDACTED);
  }

  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, REDACTED)
    .replace(
      /\b(?:documento|n[uú]mero de documento|historia cl[ií]nica|ID Lira|ID paciente|tel[eé]fono|celular|domicilio|direcci[oó]n|email|correo|n[uú]mero de afiliado|fecha de nacimiento)\s*[:#-]\s*[^,;\n}\]]+/giu,
      REDACTED
    )
    .replace(
      /\b(?:DNI|HC|afiliado)\s*[:#-]?\s*[A-Z0-9][A-Z0-9./-]{3,}\b/giu,
      REDACTED
    );
}

export function deidentifyClinicalContext(value: unknown, patient?: ClinicalPatient): string {
  return deidentifyClinicalText(JSON.stringify(stripIdentityFields(value)) || '', patient);
}

function stripIdentityFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripIdentityFields(item));
  if (!value || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const localKey = String(source['localKey'] || '').trim();
  const protectedLocalValue = /^(patient|professional)\./i.test(localKey);
  const result: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(source)) {
    if (isSensitiveProperty(key) || (key === 'value' && protectedLocalValue)) {
      result[key] = REDACTED;
    } else {
      result[key] = stripIdentityFields(item);
    }
  }
  return result;
}

function identityReplacements(patient?: ClinicalPatient): Array<[string, string]> {
  if (!patient) return [];
  const fullName = String(patient.fullName || '').trim();
  const nameVariants = new Set<string>();
  if (fullName) {
    nameVariants.add(fullName);
    fullName.split(/[,\s]+/).map((part) => part.trim()).filter((part) => part.length >= 3)
      .forEach((part) => nameVariants.add(part));
    if (fullName.includes(',')) {
      const [lastName, ...firstNameParts] = fullName.split(',');
      const firstNames = firstNameParts.join(' ').trim();
      if (lastName.trim() && firstNames) {
        nameVariants.add(`${firstNames} ${lastName.trim()}`);
        nameVariants.add(`${lastName.trim()} ${firstNames}`);
      }
    }
  }

  const values: Array<[unknown, string]> = [
    ...[...nameVariants].map((name): [string, string] => [name, '[paciente]']),
    [patient.dni, REDACTED],
    [patient.medicalRecord, REDACTED],
    [patient.affiliateNumber, REDACTED],
    [patient.phone, REDACTED],
    [patient.email, REDACTED],
    [patient.address, REDACTED],
    ...dateVariants(patient.birthDate).map((date): [string, string] => [date, '[fecha personal omitida]'])
  ];
  return values
    .map(([candidate, replacement]): [string, string] => [String(candidate || '').trim(), replacement])
    .filter(([candidate]) => Boolean(candidate));
}

function dateVariants(value?: string): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const variants = new Set([raw]);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    variants.add(`${day}/${month}/${year}`);
    variants.add(`${Number(day)}/${Number(month)}/${year}`);
  }
  return [...variants];
}

function isSensitiveProperty(value: string): boolean {
  return SENSITIVE_PROPERTY_NAMES.has(normalizeKey(value));
}

function normalizeKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLocaleLowerCase('en-US');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
