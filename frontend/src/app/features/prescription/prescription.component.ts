import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, ElementRef, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ClinicalRecord, ClinicalState } from '../../core/patients/patient-workspace.models';
import { PatientWorkspaceService } from '../../core/patients/patient-workspace.service';

type PrescriptionType = 'medication' | 'certificate' | 'study' | 'free' | 'systemic';
type JsonObject = Record<string, unknown>;

interface MedicationResult {
  generic?: string;
  brand?: string;
  presentation?: string;
  form?: string;
  laboratory?: string;
}

interface SystemicPage {
  image: string;
  width?: number;
  height?: number;
  paper?: string;
}

interface SystemicField {
  id: string;
  label: string;
  page: number;
  kind: 'text' | 'textarea' | 'checkbox';
  source?: string;
  localKey?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  maxChars?: number;
  maxLines?: number;
  maxWords?: number;
  fontSize?: number;
  group?: string;
  required?: boolean;
}

interface SystemicTemplate {
  id: string;
  version?: number;
  title: string;
  shortTitle?: string;
  description?: string;
  sourceFile?: string;
  pages: SystemicPage[];
  fields: SystemicField[];
}

interface SystemicPreviewField extends SystemicField { value: string | boolean; }
interface SystemicPreview { template: SystemicTemplate; fields: SystemicPreviewField[]; warnings: string[]; }

interface PrescriptionRecord extends ClinicalRecord {
  type: PrescriptionType;
  title: string;
  summary: string;
  data: JsonObject;
}

@Component({
  selector: 'app-prescription',
  imports: [FormsModule],
  templateUrl: './prescription.component.html',
  styleUrl: './prescription.component.scss'
})
export class PrescriptionComponent {
  readonly workspace = inject(PatientWorkspaceService);
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly type = signal<PrescriptionType>('medication');
  readonly busy = signal(false);
  readonly message = signal('');
  readonly preview = signal<PrescriptionRecord | null>(null);
  readonly medicationQuery = signal('');
  readonly medicationResults = signal<MedicationResult[]>([]);
  readonly medicationSearching = signal(false);
  readonly systemicTemplates = signal<SystemicTemplate[]>([]);
  readonly systemicTemplateId = signal('');
  readonly systemicNotes = signal('');
  readonly systemicStatus = signal('');
  readonly systemicStatusKind = signal<'ready' | 'loading' | 'warning' | 'error'>('ready');
  readonly systemicPreview = signal<SystemicPreview | null>(null);
  readonly systemicPreviewPersisted = signal(false);
  readonly canEdit = computed(() => this.auth.hasPermission('section.prescriptions.edit') && this.auth.hasPermission('section.history.edit'));
  private medicationSearchRequest = 0;
  private systemicRequestId = 0;
  private lastPatientId: string | null = null;

  medication = this.blankMedication();
  certificate = this.blankCertificate();
  study = this.blankStudy();
  free = this.blankFree();

  constructor() {
    effect(() => {
      const patientId = this.workspace.workspace()?.patientId || null;
      if (patientId === this.lastPatientId) return;
      this.lastPatientId = patientId;
      this.resetDraftsForPatientChange();
    });
  }

  readonly records = computed(() => {
    const source = this.workspace.workingWorkspace()?.state.prescriptions || [];
    return [...source]
      .filter((item): item is PrescriptionRecord => Boolean(item && item.type && item.title))
      .sort((left, right) => String(right.createdAt || right.date || '').localeCompare(String(left.createdAt || left.date || '')));
  });

  readonly selectedSystemicTemplate = computed(() =>
    this.systemicTemplates().find((item) => item.id === this.systemicTemplateId()) || null
  );

  selectType(type: PrescriptionType): void {
    if (type !== this.type()) {
      this.systemicRequestId += 1;
      if (this.type() === 'systemic') this.busy.set(false);
    }
    this.type.set(type);
    this.message.set('');
    if (type === 'certificate' && !this.certificate.text.trim()) this.fillCertificateTemplate();
    if (type === 'systemic') void this.loadSystemicTemplates();
  }

  selectSystemicTemplate(templateId: string): void {
    this.systemicRequestId += 1;
    this.busy.set(false);
    this.systemicTemplateId.set(templateId);
    this.systemicPreview.set(null);
    this.systemicPreviewPersisted.set(false);
    this.systemicStatusKind.set('ready');
    this.systemicStatus.set(this.systemicTemplates().length ? `${this.systemicTemplates().length} formularios disponibles` : '');
  }

  async searchMedication(value: string): Promise<void> {
    this.medicationQuery.set(value);
    const query = value.trim();
    const request = ++this.medicationSearchRequest;
    if (query.length < 2) { this.medicationResults.set([]); return; }
    this.medicationSearching.set(true);
    try {
      const payload = await firstValueFrom(this.http.get<{ results?: MedicationResult[] }>('/api/medications/search', {
        params: new HttpParams().set('q', query), withCredentials: true
      }));
      if (request === this.medicationSearchRequest) this.medicationResults.set(payload.results || []);
    } catch {
      if (request === this.medicationSearchRequest) this.medicationResults.set([]);
    } finally {
      if (request === this.medicationSearchRequest) this.medicationSearching.set(false);
    }
  }

  chooseMedication(item: MedicationResult): void {
    this.medication.generic = item.generic || '';
    this.medication.brand = item.brand || '';
    this.medication.presentation = item.presentation || '';
    this.medication.form = item.form || '';
    this.medicationQuery.set([item.generic, item.presentation].filter(Boolean).join(' · '));
    this.medicationResults.set([]);
  }

  useMedicationPreset(key: string): void {
    const presets: Record<string, ReturnType<PrescriptionComponent['blankMedication']>> = {
      ondansetron: { generic: 'Ondansetron', brand: '', presentation: '8 mg x 20 comprimidos', form: 'Comprimidos', dose: '8 mg', route: 'Oral', frequency: 'Cada 8 horas si náuseas', duration: '5 días', quantity: '1 envase', indication: 'Prevención y tratamiento de náuseas', instructions: 'Usar según necesidad. Revisar interacciones y contraindicaciones.' },
      paracetamol: { generic: 'Paracetamol', brand: '', presentation: '500 mg x 20 comprimidos', form: 'Comprimidos', dose: '500 mg', route: 'Oral', frequency: 'Cada 8 horas si dolor', duration: '5 días', quantity: '1 envase', indication: 'Analgesia', instructions: 'No superar la dosis máxima diaria. Revisar función hepática.' },
      omeprazol: { generic: 'Omeprazol', brand: '', presentation: '20 mg x 30 cápsulas', form: 'Cápsulas', dose: '20 mg', route: 'Oral', frequency: 'Una vez al día', duration: '30 días', quantity: '1 envase', indication: 'Protección gástrica', instructions: 'Administrar antes del desayuno.' },
      dexametasona: { generic: 'Dexametasona', brand: '', presentation: '4 mg x 20 comprimidos', form: 'Comprimidos', dose: '4 mg', route: 'Oral', frequency: 'Según esquema', duration: 'A definir', quantity: '1 envase', indication: 'Soporte oncológico', instructions: 'Requiere definir pauta y descenso según indicación clínica.' }
    };
    const selected = presets[key];
    if (selected) { this.medication = { ...selected }; this.medicationQuery.set(selected.generic); }
  }

  fillCertificateTemplate(): void {
    const name = this.workspace.workspace()?.patient.fullName || 'el/la paciente';
    const templates: Record<string, string> = {
      attendance: `Se deja constancia que ${name} fue atendido/a en la fecha por control médico.`,
      rest: `Se certifica que ${name} requiere reposo laboral por el período indicado.`,
      treatment: `Se certifica que ${name} se encuentra actualmente en tratamiento médico.`,
      transport: `Se certifica que ${name} requiere asistencia para traslado por razones de salud.`,
      custom: ''
    };
    this.certificate.text = templates[this.certificate.certificateType] || '';
  }

  useStudyPreset(key: string): void {
    const presets: Record<string, [string, string, string, string]> = {
      laboratory: ['Laboratorio', 'Hemograma, función renal, hepatograma, ionograma y marcadores según patología', 'Control oncológico y evaluación de toxicidad', 'Ayuno según determinaciones'],
      ct: ['Imagen', 'TC de tórax, abdomen y pelvis con contraste', 'Evaluación de respuesta / estadificación oncológica', 'Informar creatinina y antecedentes de alergia al contraste'],
      mri: ['Imagen', 'Resonancia magnética de región a evaluar con contraste', 'Caracterización y extensión de enfermedad', 'Verificar contraindicaciones y función renal'],
      pathology: ['Anatomía patológica', 'Revisión de anatomía patológica y material disponible', 'Confirmación diagnóstica, histología y biomarcadores', 'Remitir tacos, preparados e informe previo']
    };
    const item = presets[key];
    if (item) [this.study.category, this.study.name, this.study.indication, this.study.notes] = item;
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    if (!this.canEdit()) { this.message.set('No tiene permiso para registrar prescripciones.'); return; }
    if (!this.workspace.workspace()) { this.message.set('Abra o cree un paciente antes de registrar documentos.'); return; }
    if (this.workspace.activeSaveConflict()) { this.message.set('Resuelva el borrador pendiente antes de registrar otro documento.'); return; }
    if (this.type() === 'systemic') { await this.prepareSystemicForm(); return; }
    const record = this.collectRecord();
    if (!record) return;
    if (await this.saveRecords([record, ...this.rawRecords()])) {
      this.clear();
      this.preview.set(record);
      this.message.set('Documento registrado en la historia clínica.');
    }
  }

  clear(): void {
    if (this.type() === 'medication') { this.medication = this.blankMedication(); this.medicationQuery.set(''); this.medicationResults.set([]); }
    if (this.type() === 'certificate') { this.certificate = this.blankCertificate(); this.fillCertificateTemplate(); }
    if (this.type() === 'study') this.study = this.blankStudy();
    if (this.type() === 'free') this.free = this.blankFree();
    if (this.type() === 'systemic') {
      this.systemicRequestId += 1;
      this.busy.set(false);
      this.systemicNotes.set('');
      this.systemicPreview.set(null);
      this.systemicPreviewPersisted.set(false);
      this.systemicStatus.set(this.systemicTemplates().length ? `${this.systemicTemplates().length} formularios disponibles` : '');
    }
    this.message.set('');
  }

  async duplicate(record: PrescriptionRecord): Promise<void> {
    if (!this.canEdit()) { this.message.set('No tiene permiso para duplicar prescripciones.'); return; }
    const now = new Date().toISOString();
    const copy: PrescriptionRecord = { ...structuredClone(record), id: this.id('rx'), date: this.today(), datePrecision: 'day', createdAt: now, updatedAt: now, audit: this.audit(now) };
    if (await this.saveRecords([copy, ...this.rawRecords()])) this.message.set('Documento duplicado y registrado.');
  }

  async remove(record: PrescriptionRecord): Promise<void> {
    if (!this.canEdit()) { this.message.set('No tiene permiso para eliminar prescripciones.'); return; }
    if (!window.confirm('¿Eliminar este documento de la historia clínica?')) return;
    if (await this.saveRecords(this.rawRecords().filter((item) => item.id !== record.id))) this.message.set('Documento eliminado.');
  }

  openPreview(record: PrescriptionRecord): void {
    if (record.type === 'systemic') {
      const data = record.data || {};
      const template: SystemicTemplate = {
        id: String(data['formId'] || record.id || ''), version: Number(data['formVersion'] || 0),
        title: String(data['formTitle'] || record.title), pages: (data['pages'] as SystemicPage[]) || [], fields: []
      };
      this.systemicPreview.set({ template, fields: (data['fields'] as SystemicPreviewField[]) || [], warnings: [] });
      this.systemicPreviewPersisted.set(true);
      return;
    }
    this.preview.set(record);
  }

  closePreview(): void {
    this.preview.set(null);
    this.systemicPreview.set(null);
    this.systemicPreviewPersisted.set(false);
  }

  printRecord(record: PrescriptionRecord): void {
    if (record.type === 'systemic') { this.openPreview(record); queueMicrotask(() => this.printSystemic()); return; }
    const patient = this.workspace.workspace()?.patient;
    const professionalName = this.prescriptionProfessionalName(record);
    const professionalLicense = this.prescriptionProfessionalLicense(record);
    const details = this.detailEntries(record).map(([label, value]) => `<p><strong>${this.escape(label)}:</strong> ${this.escape(value)}</p>`).join('');
    const coverage = record.type === 'medication'
      ? `<p><strong>Obra social:</strong> ${this.escape(patient?.insurance || '—')} · <strong>N.° de afiliado:</strong> ${this.escape(patient?.affiliateNumber || '—')}</p>` : '';
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${this.escape(this.typeLabel(record.type))}</title><style>@page{size:A5 landscape;margin:10mm}*{box-sizing:border-box}html,body{width:210mm;min-height:148mm;margin:0}body{display:flex;flex-direction:column;padding:10mm;font:12px Arial,sans-serif;color:#2f4050}.type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#087fc4}h1{margin:5px 0 8px;border-bottom:1px solid #d7e0e7;padding-bottom:7px;font-size:18px}p{margin:4px 0;line-height:1.35}footer{margin-top:auto;border-top:1px solid #d7e0e7;padding-top:8px}@media print{body{padding:0}}</style></head><body><div class="type">${this.escape(this.typeLabel(record.type))}</div><h1>${this.escape(record.title)}</h1><p><strong>Fecha:</strong> ${this.escape(this.formatDate(record.date || record.createdAt))}</p><p><strong>Paciente:</strong> ${this.escape(patient?.fullName || '')} · DNI ${this.escape(patient?.dni || '')}</p>${coverage}${details}<footer>Profesional: ${this.escape(professionalName)} · Mat. ${this.escape(professionalLicense)}</footer><script>window.addEventListener('load',()=>window.print())<\/script></body></html>`;
    this.openPrintWindow(html);
  }

  async loadSystemicTemplates(): Promise<void> {
    if (this.systemicTemplates().length || this.busy()) return;
    this.busy.set(true); this.systemicStatusKind.set('loading'); this.systemicStatus.set('Cargando formularios locales…');
    try {
      const payload = await firstValueFrom(this.http.get<{ forms?: SystemicTemplate[] }>('/api/systemic-forms', { withCredentials: true }));
      const forms = payload.forms || [];
      this.systemicTemplates.set(forms);
      if (forms.length && !this.systemicTemplateId()) this.systemicTemplateId.set(forms[0].id);
      this.systemicStatusKind.set('ready'); this.systemicStatus.set(`${forms.length} formularios disponibles`);
    } catch (error) {
      this.systemicStatusKind.set('error'); this.systemicStatus.set(this.error(error, 'No se pudieron cargar los formularios.'));
    } finally { this.busy.set(false); }
  }

  async prepareSystemicForm(): Promise<void> {
    const template = this.selectedSystemicTemplate();
    if (!template) { this.message.set('Seleccione un formulario sistémico.'); return; }
    const requestId = ++this.systemicRequestId;
    const requestPatientId = this.workspace.workspace()?.patientId || '';
    const requestRevision = this.workspace.workspace()?.revision || 0;
    this.busy.set(true); this.message.set(''); this.systemicStatusKind.set('loading'); this.systemicStatus.set('Analizando la historia clínica y completando cada campo…');
    let generated: Record<string, unknown> = {};
    const warnings: string[] = [];
    let completedByService = false;
    try {
      const payload = await firstValueFrom(this.http.post<{ templateId?: string; fields?: Record<string, unknown> }>('/api/llm/fill-systemic-form', {
        templateId: template.id,
        clinicalText: this.redactDirectIdentifiers(this.clinicalText()),
        notes: this.redactDirectIdentifiers(this.systemicNotes().trim())
      }, { withCredentials: true }));
      if (payload.templateId !== template.id) throw new Error('La respuesta no corresponde al formulario seleccionado.');
      generated = payload.fields || {};
      completedByService = true;
    } catch {
      warnings.push('El servicio inteligente no completó los campos. Los datos locales están cargados y el resto queda editable.');
    } finally {
      if (requestId === this.systemicRequestId) this.busy.set(false);
    }
    if (requestId !== this.systemicRequestId
        || this.type() !== 'systemic'
        || this.systemicTemplateId() !== template.id) return;
    if ((this.workspace.workspace()?.patientId || '') !== requestPatientId || (this.workspace.workspace()?.revision || 0) !== requestRevision) {
      this.systemicStatusKind.set('warning'); this.systemicStatus.set('La historia cambió durante el análisis. Vuelva a completar el formulario.');
      this.message.set('Se descartó una respuesta correspondiente a una versión anterior de la historia.');
      return;
    }
    this.systemicStatusKind.set(completedByService ? 'ready' : 'warning');
    this.systemicStatus.set(completedByService
      ? 'Formulario preparado. Revíselo antes de registrar e imprimir.'
      : 'Formulario abierto con los datos locales disponibles.');
    const fields = template.fields.map((field) => ({
      ...field,
      value: this.fitField(field.source === 'local' ? this.localValue(field.localKey || '') : generated[field.id], field)
    }));
    this.normalizeGroups(fields);
    this.systemicPreview.set({ template, fields, warnings });
    this.systemicPreviewPersisted.set(false);
  }

  updateSystemicField(id: string, value: string | boolean): void {
    this.systemicPreview.update((current) => {
      if (!current) return current;
      const selected = current.fields.find((field) => field.id === id);
      if (!selected) return current;
      const fitted = typeof value === 'string' ? this.constrainEditedValue(value, selected) : value;
      return {
        ...current,
        fields: current.fields.map((field) => {
          if (field.id === id) return { ...field, value: fitted };
          if (selected.kind === 'checkbox' && fitted === true && selected.group && field.group === selected.group) {
            return { ...field, value: false };
          }
          return field;
        })
      };
    });
  }

  async confirmSystemic(): Promise<void> {
    const preview = this.systemicPreview();
    if (!preview || this.busy()) return;
    if (this.systemicPreviewPersisted()) { this.message.set('El formulario ya está registrado. Use Imprimir copia.'); return; }
    if (!this.canEdit()) { this.message.set('No tiene permiso para registrar prescripciones.'); return; }
    const validationError = this.validateSystemicPreview(preview);
    if (validationError) { this.message.set(validationError); return; }
    const printTarget = this.openPendingPrintWindow();
    if (!printTarget) { this.message.set('El navegador bloqueó la ventana de impresión; el formulario no fue registrado.'); return; }
    const now = new Date().toISOString();
    const record: PrescriptionRecord = {
      id: this.id('rx'), type: 'systemic', date: this.today(), datePrecision: 'day', createdAt: now, updatedAt: now, audit: this.audit(now),
      title: preview.template.shortTitle || preview.template.title,
      summary: `${preview.template.pages.length} página(s) · formulario sistémico`, status: 'registered',
      data: { formId: preview.template.id, formVersion: preview.template.version || 1, formTitle: preview.template.title, sourceFile: preview.template.sourceFile || '', pages: preview.template.pages, fields: preview.fields }
    };
    if (await this.saveRecords([record, ...this.rawRecords()])) {
      const printed = this.writePrintWindow(printTarget, this.systemicPrintHtml(preview));
      this.message.set(printed
        ? 'Formulario sistémico registrado en la historia clínica.'
        : 'Formulario registrado; la ventana de impresión se cerró antes de completarse.');
      this.systemicPreview.set(null);
      this.systemicPreviewPersisted.set(false);
      this.systemicNotes.set('');
    } else {
      printTarget.close();
    }
  }

  printSystemic(): boolean {
    const preview = this.systemicPreview();
    if (!preview) return false;
    return this.openPrintWindow(this.systemicPrintHtml(preview));
  }

  private systemicPrintHtml(preview: SystemicPreview): string {
    const pages = preview.template.pages.map((page, index) => {
      const fields = preview.fields.filter((field) => field.page === index + 1).map((field) => {
        const value = field.kind === 'checkbox' ? (field.value === true ? 'X' : '') : String(field.value || '');
        if (!value) return '';
        return `<span class="field ${field.kind}" style="left:${field.x}%;top:${field.y}%;width:${field.width}%;height:${field.height}%;font-size:${Math.max(7, Number(field.fontSize || 1) * 9)}pt">${this.escape(value)}</span>`;
      }).join('');
      return `<section class="page ${String(page.paper || 'A4').toLowerCase()}"><img src="${this.escape(page.image)}">${fields}</section>`;
    }).join('');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${this.escape(preview.template.title)}</title><style>@page{size:A4 portrait;margin:0}@page legal{size:legal portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#eee}body{display:grid;justify-content:center;gap:10mm;padding:8mm}.page{position:relative;width:210mm;height:297mm;overflow:hidden;background:#fff;break-after:page}.page.legal{page:legal;width:216mm;height:356mm}.page:last-child{break-after:auto}.page>img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}.field{position:absolute;z-index:2;display:block;overflow:hidden;padding:0 .35mm;font-family:Arial,sans-serif;line-height:1.05;white-space:pre-wrap}.field.checkbox{display:grid;place-items:center;padding:0;font-weight:800}@media print{html,body{background:#fff}body{display:block;padding:0}.page{margin:0}}</style></head><body>${pages}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),180))<\/script></body></html>`;
  }

  detailEntries(record: PrescriptionRecord): Array<[string, string]> {
    const labels: Record<string, string> = { generic: 'Nombre genérico', brand: 'Nombre comercial', presentation: 'Presentación', form: 'Forma farmacéutica', dose: 'Dosis', route: 'Vía', frequency: 'Frecuencia', duration: 'Duración', quantity: 'Cantidad', indication: 'Indicación / diagnóstico', instructions: 'Instrucciones', certificateType: 'Tipo de certificado', from: 'Desde', to: 'Hasta', text: 'Texto', includeDiagnosis: 'Incluye diagnóstico', category: 'Categoría', priority: 'Prioridad', name: 'Estudio / práctica', notes: 'Preparación / observaciones', title: 'Título' };
    return Object.entries(record.data || {}).filter(([, value]) => value !== '' && value !== false && value != null && typeof value !== 'object').map(([key, value]) => [labels[key] || key, value === true ? 'Sí' : String(value)]);
  }

  typeLabel(type: PrescriptionType): string {
    return ({ medication: 'Receta médica', certificate: 'Certificado médico', study: 'Solicitud de estudio', free: 'Indicación médica', systemic: 'Formulario de tratamiento sistémico' })[type];
  }

  formatDate(value?: string): string {
    if (!value) return '—';
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: value.length > 10 ? 'short' : undefined }).format(date);
  }

  private collectRecord(): PrescriptionRecord | null {
    const now = new Date().toISOString();
    const base = { id: this.id('rx'), type: this.type(), date: this.today(), datePrecision: 'day', createdAt: now, updatedAt: now, status: 'registered', audit: this.audit(now) };
    if (this.type() === 'medication') {
      const item = this.medication;
      if (![item.generic, item.presentation, item.form, item.quantity].every((value) => value.trim())) { this.message.set('Complete genérico, presentación, forma farmacéutica y cantidad.'); return null; }
      return { ...base, type: 'medication', title: item.generic.trim(), summary: [item.presentation, item.dose, item.frequency].filter(Boolean).join(' · '), data: { ...item } };
    }
    if (this.type() === 'certificate') {
      if (!this.certificate.text.trim()) { this.message.set('Complete el texto del certificado.'); return null; }
      const labels: Record<string, string> = { attendance: 'Constancia de atención', rest: 'Reposo laboral', treatment: 'En tratamiento', transport: 'Traslado / transporte', custom: 'Certificado personalizado' };
      return { ...base, type: 'certificate', title: labels[this.certificate.certificateType], summary: this.certificate.text.trim(), data: { ...this.certificate } };
    }
    if (this.type() === 'study') {
      if (!this.study.name.trim() || !this.study.indication.trim()) { this.message.set('Complete el estudio y la indicación clínica.'); return null; }
      return { ...base, type: 'study', title: this.study.name.trim(), summary: this.study.indication.trim(), data: { ...this.study } };
    }
    if (!this.free.text.trim()) { this.message.set('Complete el texto libre.'); return null; }
    return { ...base, type: 'free', title: this.free.title.trim() || 'Indicaciones médicas', summary: this.free.text.trim(), data: { ...this.free } };
  }

  private async saveRecords(records: ClinicalRecord[]): Promise<boolean> {
    const current = this.workspace.workspace();
    if (!current || this.busy()) return false;
    if (this.workspace.activeSaveConflict()) {
      this.message.set('Resuelva el borrador pendiente antes de guardar otro documento.');
      return false;
    }
    const patientId = current.patientId;
    this.busy.set(true); this.message.set('');
    try {
      const next = structuredClone(current.state) as ClinicalState;
      next.prescriptions = records;
      next.meta = { ...(next.meta || {}), updatedAt: new Date().toISOString() };
      await firstValueFrom(this.workspace.saveState(next));
      if (this.workspace.workspace()?.patientId !== patientId) {
        this.message.set('El paciente activo cambió durante el guardado. El borrador no se aplicó a la ficha abierta.');
        return false;
      }
      return true;
    } catch (error) {
      this.message.set(this.error(error, 'No se pudo guardar el documento en la historia clínica.'));
      return false;
    } finally { this.busy.set(false); }
  }

  private rawRecords(): ClinicalRecord[] { return [...(this.workspace.workingWorkspace()?.state.prescriptions || [])]; }

  private audit(at: string): JsonObject {
    const user = this.auth.session()?.user;
    const displayName = user?.displayName || user?.username || 'Profesional';
    const lastName = displayName.includes(',') ? displayName.split(',')[0].trim() : (displayName.trim().split(/\s+/).at(-1) || displayName);
    return { action: 'cargado', displayName, lastName, license: user?.licenseNumber || 's/d', at };
  }

  prescriptionProfessionalName(record: PrescriptionRecord): string {
    const auditValue = record['audit'];
    const audit = (auditValue && typeof auditValue === 'object' ? auditValue : {}) as JsonObject;
    const current = this.auth.session()?.user;
    return String(audit['displayName'] || audit['lastName'] || current?.displayName || current?.username || '—');
  }

  prescriptionProfessionalLicense(record: PrescriptionRecord): string {
    const auditValue = record['audit'];
    const audit = (auditValue && typeof auditValue === 'object' ? auditValue : {}) as JsonObject;
    return String(audit['license'] || this.auth.session()?.user?.licenseNumber || 's/d');
  }

  private clinicalText(): string {
    const state = this.workspace.workingWorkspace()?.state || {};
    return JSON.stringify({ oncology: state.oncology || {}, narrative: state.narrative || {}, exam: state.exam || {}, diagnoses: state.diagnoses || [], studies: state.studies || [], treatments: state.treatments || [], evolutions: state.evolutions || [] });
  }

  private redactDirectIdentifiers(value: string): string {
    const patient = this.workspace.workspace()?.patient;
    let redacted = value;
    const direct = [patient?.fullName, patient?.dni, patient?.medicalRecord, patient?.phone, patient?.email, patient?.address]
      .map((item) => String(item || '').trim()).filter((item) => item.length >= 3).sort((left, right) => right.length - left.length);
    for (const item of direct) redacted = redacted.replace(new RegExp(this.escapeRegExp(item), 'giu'), '[dato reservado]');
    return redacted;
  }

  private escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  private localValue(key: string): string | boolean {
    const current = this.workspace.workspace();
    const state = current?.state || {};
    const patient = current?.patient || state.patient || { id: '', fullName: '' };
    const patientData = patient as unknown as JsonObject;
    const oncology = state.oncology || {};
    const exam = state.exam || {};
    const meta = state.meta || {};
    const names = this.splitName(patient.fullName || '');
    const sex = String(patient.sex || '').toLocaleLowerCase('es-AR');
    const intent = String(oncology['intent'] || '').toLocaleLowerCase('es-AR');
    const heightRaw = Number(exam['heightM'] || exam['height'] || 0);
    const heightCm = heightRaw > 3 ? heightRaw : heightRaw * 100;
    const heightM = heightCm > 0 ? heightCm / 100 : 0;
    const weight = Number(exam['weightKg'] || 0);
    const bsa = weight > 0 && heightCm > 0 ? Math.sqrt(weight * heightCm / 3600) : 0;
    const bmi = weight > 0 && heightM > 0 ? weight / (heightM * heightM) : 0;
    const tnm = (oncology['tnm'] && typeof oncology['tnm'] === 'object' ? oncology['tnm'] : {}) as JsonObject;
    const professional = this.auth.session()?.user;
    const configuredProfessional = (meta['currentProfessional'] && typeof meta['currentProfessional'] === 'object'
      ? meta['currentProfessional'] : {}) as JsonObject;
    const professionalName = professional?.displayName || professional?.username
      || String(configuredProfessional['fullName'] || configuredProfessional['name'] || meta['currentUser'] || '');
    const locality = String(patientData['locality'] || patientData['city'] || '');
    const formattedToday = this.formatDate(this.today());
    const optionalDate = (value: unknown): string => value ? this.formatDate(String(value)) : '';
    const decimal = (value: number, places: number): string => value > 0 ? value.toFixed(places).replace('.', ',') : '';
    const values: Record<string, string | boolean> = {
      'patient.fullName': patient.fullName || '', 'patient.firstName': names.first, 'patient.lastName': names.last,
      'patient.dni': patient.dni || '', 'patient.birthDate': optionalDate(patient.birthDate), 'patient.age': this.age(patient.birthDate), 'patient.phone': patient.phone || '',
      'patient.email': patient.email || '', 'patient.address': patient.address || '', 'patient.locality': locality,
      'patient.insurance': patient.insurance || '', 'patient.affiliateNumber': patient.affiliateNumber || '',
      'patient.affiliateCardLast4': String(patient.affiliateNumber || '').replace(/\D/g, '').slice(-4),
      'patient.civilStatus': String(patientData['civilStatus'] || patientData['maritalStatus'] || ''),
      'patient.documentTypeDni': Boolean(patient.dni), 'patient.documentTypeCi': false, 'patient.documentTypeLe': false, 'patient.documentTypeLc': false,
      'patient.affiliateActive': false, 'patient.affiliateMonotributista': false, 'patient.affiliateRetired': false,
      'patient.sexMale': /masculino|var[oó]n|hombre|^m$/.test(sex), 'patient.sexFemale': /femenino|mujer|^f$/.test(sex),
      'oncology.diagnosis': String(oncology['diagnosis'] || ''), 'oncology.diagnosisDate': optionalDate(oncology['diagnosisDate']),
      'oncology.diagnosisHistology': [oncology['diagnosis'], oncology['histology']].filter(Boolean).join('. '), 'oncology.topography': String(oncology['topography'] || ''),
      'oncology.histology': String(oncology['histology'] || ''), 'oncology.stage': String(oncology['stage'] || tnm['stage'] || ''), 'oncology.stageGroup': String(oncology['stage'] || tnm['stage'] || ''),
      'oncology.biomarkers': String(oncology['biomarkers'] || ''), 'oncology.performanceStatus': String(oncology['performanceStatus'] || ''),
      'oncology.tnmT': String(tnm['t'] || oncology['tnmT'] || ''), 'oncology.tnmN': String(tnm['n'] || oncology['tnmN'] || ''), 'oncology.tnmM': String(tnm['m'] || oncology['tnmM'] || ''),
      'oncology.intentAdjuvant': intent.includes('adyuv') && !intent.includes('neoadyuv'), 'oncology.intentNeoadjuvant': intent.includes('neoadyuv'), 'oncology.intentPalliative': intent.includes('paliat') || intent.includes('avanzad'),
      'exam.weightKg': weight ? String(exam['weightKg'] || decimal(weight, 1)) : '', 'exam.heightCm': decimal(heightCm, 0), 'exam.bmi': decimal(bmi, 1), 'exam.bodySurface': decimal(bsa, 2),
      'professional.name': professionalName,
      'professional.specialty': professional?.specialty || String(configuredProfessional['specialty'] || configuredProfessional['especialidad'] || ''),
      'professional.contact': [configuredProfessional['phone'] || configuredProfessional['telephone'], configuredProfessional['email']].filter(Boolean).join(' · '),
      'professional.careLocation': String(configuredProfessional['careLocation'] || configuredProfessional['location'] || configuredProfessional['institution'] || ''),
      today: formattedToday, todayWithCity: [locality, formattedToday].filter(Boolean).join(', '), mendozaToday: `Mendoza, ${formattedToday}`,
      currentYear: String(new Date().getFullYear()), blank: '', alwaysTrue: true
    };
    return values[key] ?? '';
  }

  private fitField(raw: unknown, field: SystemicField): string | boolean {
    if (field.kind === 'checkbox') return raw === true || /^(1|true|sí|si|x)$/i.test(String(raw || '').trim());
    let value = String(raw ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
      .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, Math.max(1, field.maxLines || 1)).join('\n').trim();
    if (field.maxWords) value = value.split(/\s+/).slice(0, field.maxWords).join(' ');
    if (field.maxChars && value.length > field.maxChars) value = value.slice(0, field.maxChars).trim();
    return value;
  }

  private constrainEditedValue(value: string, field: SystemicField): string {
    let constrained = value.replace(/\r\n?/g, '\n');
    const maxLines = Math.max(1, Number(field.maxLines || 1));
    constrained = constrained.split('\n').slice(0, maxLines).join('\n');
    const maxWords = Math.max(0, Number(field.maxWords || 0));
    if (maxWords > 0) {
      const words = constrained.trim().split(/\s+/).filter(Boolean);
      if (words.length > maxWords) constrained = words.slice(0, maxWords).join(' ');
    }
    const maxChars = Math.max(0, Number(field.maxChars || 0));
    if (maxChars > 0 && constrained.length > maxChars) constrained = constrained.slice(0, maxChars);
    return constrained;
  }

  private validateSystemicPreview(preview: SystemicPreview): string {
    for (const field of preview.fields) {
      const value = field.value;
      if (field.required && (field.kind === 'checkbox' ? value !== true : !String(value || '').trim())) {
        return `Complete el campo obligatorio: ${field.label}.`;
      }
      if (typeof value !== 'string') continue;
      if (field.maxChars && value.length > field.maxChars) return `${field.label} supera el máximo de caracteres.`;
      if (field.maxLines && value.replace(/\r\n?/g, '\n').split('\n').length > field.maxLines) return `${field.label} supera el máximo de líneas.`;
      if (field.maxWords && value.trim().split(/\s+/).filter(Boolean).length > field.maxWords) return `${field.label} supera el máximo de palabras.`;
    }
    const elements = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.angular-systemic-field'));
    const overflowing = elements.filter((element) => {
      if (element instanceof HTMLInputElement && element.type === 'checkbox') return false;
      const invalid = element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2;
      element.classList.toggle('is-overflowing', invalid);
      return invalid;
    });
    return overflowing.length
      ? `${overflowing.length} ${overflowing.length === 1 ? 'campo excede' : 'campos exceden'} el espacio disponible. Acorte el texto marcado.`
      : '';
  }

  private normalizeGroups(fields: SystemicPreviewField[]): void {
    const groups = new Map<string, SystemicPreviewField[]>();
    for (const field of fields.filter((item) => item.kind === 'checkbox' && item.group)) groups.set(field.group!, [...(groups.get(field.group!) || []), field]);
    for (const group of groups.values()) if (group.filter((item) => item.value === true).length > 1) group.forEach((item) => { item.value = false; });
  }

  private splitName(value: string): { first: string; last: string } {
    if (value.includes(',')) { const [last, ...first] = value.split(','); return { first: first.join(',').trim(), last: last.trim() }; }
    const parts = value.trim().split(/\s+/); return { first: parts.slice(0, -1).join(' '), last: parts.at(-1) || '' };
  }

  private age(birthDate?: string): string {
    const match = String(birthDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return '';
    const today = new Date();
    let age = today.getFullYear() - Number(match[1]);
    if (today.getMonth() + 1 < Number(match[2])
        || (today.getMonth() + 1 === Number(match[2]) && today.getDate() < Number(match[3]))) age -= 1;
    return age >= 0 && age <= 130 ? String(age) : '';
  }

  private resetDraftsForPatientChange(): void {
    this.medicationSearchRequest += 1;
    this.systemicRequestId += 1;
    this.busy.set(false);
    this.message.set('');
    this.preview.set(null);
    this.systemicPreview.set(null);
    this.systemicPreviewPersisted.set(false);
    this.type.set('medication');
    this.medication = this.blankMedication();
    this.certificate = this.blankCertificate();
    this.fillCertificateTemplate();
    this.study = this.blankStudy();
    this.free = this.blankFree();
    this.medicationQuery.set('');
    this.medicationResults.set([]);
    this.medicationSearching.set(false);
    this.systemicTemplateId.set(this.systemicTemplates()[0]?.id || '');
    this.systemicNotes.set('');
    this.systemicStatusKind.set('ready');
    this.systemicStatus.set(this.systemicTemplates().length ? `${this.systemicTemplates().length} formularios disponibles` : '');
  }

  private blankMedication() { return { generic: '', brand: '', presentation: '', form: '', dose: '', route: 'Oral', frequency: '', duration: '', quantity: '', indication: '', instructions: '' }; }
  private blankCertificate() { const today = this.today(); return { certificateType: 'attendance', from: today, to: today, text: '', includeDiagnosis: false }; }
  private blankStudy() { return { category: 'Laboratorio', priority: 'Programada', name: '', indication: '', notes: '' }; }
  private blankFree() { return { title: '', text: '' }; }
  private today(): string {
    const value = new Date();
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  private id(prefix: string): string { return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
  private escape(value: unknown): string { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char); }
  private openPendingPrintWindow(): Window | null {
    const target = window.open('', '_blank', 'width=1050,height=850');
    if (!target) return null;
    target.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Preparando formulario</title></head><body style="font:14px Arial,sans-serif;color:#40515f;padding:32px">Registrando el formulario antes de imprimir…</body></html>');
    target.document.close();
    return target;
  }
  private writePrintWindow(target: Window, html: string): boolean {
    try {
      if (target.closed) return false;
      target.document.open();
      target.document.write(html);
      target.document.close();
      return true;
    } catch { return false; }
  }
  private openPrintWindow(html: string): boolean { const target = window.open('', '_blank', 'width=1050,height=850'); if (!target) { this.message.set('El navegador bloqueó la ventana de impresión.'); return false; } target.document.write(html); target.document.close(); return true; }
  private error(error: unknown, fallback: string): string { const candidate = error as { error?: { error?: string }; message?: string }; return candidate?.error?.error || candidate?.message || fallback; }
}
