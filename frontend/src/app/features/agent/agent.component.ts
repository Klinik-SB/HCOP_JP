import { Component, ElementRef, OnDestroy, OnInit, ViewChild, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, Subscription } from 'rxjs';
import { deidentifyClinicalContext, deidentifyClinicalText } from '../../core/clinical/clinical-deidentification';
import { ClinicalFocusService } from '../../core/clinical/clinical-focus.service';
import type { PatientWorkspace } from '../../core/patients/patient-workspace.models';
import { PatientWorkspaceService } from '../../core/patients/patient-workspace.service';
import { AgentArtifact, AgentChartArtifact, AgentChatResponse, AgentConversationMessage, AgentHighlight, AgentStatus, AgentTableArtifact } from './agent.models';
import { agentAnswerBlocks, buildAgentChartView } from './agent-presentation';
import { AgentService } from './agent.service';

interface ApiFailure {
  error?: { error?: string; code?: string; status?: number };
  status?: number;
}

const GREETING = 'Puedo analizar esta historia, crear resúmenes, tablas, gráficos y resaltar datos clínicos en ambos paneles.';
const HIGHLIGHT_COLORS = new Set(['study', 'pathology', 'chemotherapy', 'evolution', 'hormone', 'systemic', 'radiotherapy', 'surgery', 'immunotherapy', 'targeted']);

@Component({
  selector: 'app-agent',
  imports: [FormsModule],
  templateUrl: './agent.component.html',
  styleUrl: './agent.component.scss'
})
export class AgentComponent implements OnInit, OnDestroy {
  readonly workspace = inject(PatientWorkspaceService);
  private readonly agent = inject(AgentService);
  private readonly focus = inject(ClinicalFocusService);

  @ViewChild('agentInput') private inputElement?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('messages') private messagesElement?: ElementRef<HTMLElement>;

  readonly input = signal('');
  readonly busy = signal(false);
  readonly status = signal<AgentStatus | null>(null);
  readonly conversation = signal<AgentConversationMessage[]>([this.greeting()]);
  readonly answerBlocks = agentAnswerBlocks;
  readonly chartView = buildAgentChartView;
  private activeRequest?: Subscription;
  private requestSequence = 0;
  private patientId: string | null = null;
  private patientRevision: number | null = null;

  constructor() {
    effect(() => {
      const current = this.workspace.workspace();
      const patientId = current?.patientId || null;
      const revision = current?.revision ?? null;
      const patientChanged = patientId !== this.patientId;
      const revisionChanged = !patientChanged && patientId !== null
        && this.patientRevision !== null && revision !== this.patientRevision;
      this.patientId = patientId;
      this.patientRevision = revision;
      if (patientChanged) {
        this.resetConversation();
      } else if (revisionChanged) {
        this.resetConversation(
          'La historia clínica se actualizó. Inicié una conversación nueva para analizar únicamente la revisión vigente.'
        );
      }
    });
  }

  ngOnInit(): void {
    this.loadStatus();
  }

  ngOnDestroy(): void {
    this.requestSequence += 1;
    this.activeRequest?.unsubscribe();
    this.activeRequest = undefined;
    this.busy.set(false);
  }

  loadStatus(): void {
    this.agent.status().subscribe({
      next: (status) => this.status.set(status),
      error: () => this.status.set({ ok: false, enabled: false, configured: false })
    });
  }

  statusText(): string {
    const status = this.status();
    if (!status) return 'Comprobando servicio';
    if (!status.configured) return 'Servicio no configurado';
    if (!status.enabled) return 'Servicio desactivado';
    return [status.provider, status.model].filter(Boolean).join(' · ') || 'Servicio disponible';
  }

  useSuggestion(prompt: string): void {
    this.input.set(prompt);
    queueMicrotask(() => { this.inputElement?.nativeElement.focus(); this.inputElement?.nativeElement.setSelectionRange(prompt.length, prompt.length); });
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    this.send();
  }

  send(): void {
    const message = this.input().trim();
    const workspace = this.workspace.workspace();
    if (!message || this.busy()) return;
    if (!workspace) {
      this.appendError('Abra un paciente para consultar su historia clínica.');
      return;
    }

    const history = this.conversation()
      .filter((item) => !item.greeting && !item.error)
      .slice(-12)
      .map((item) => ({ role: item.role, content: deidentifyClinicalText(item.content, workspace.patient) }));
    const safeMessage = deidentifyClinicalText(message, workspace.patient);
    const requestId = ++this.requestSequence;
    const patientId = workspace.patientId;
    const revision = workspace.revision;
    this.activeRequest?.unsubscribe();
    this.input.set('');
    this.busy.set(true);
    this.conversation.update((items) => this.trim([...items, this.message('user', message)]));
    this.scrollToEnd();

    this.activeRequest = this.agent.chat({
      message: safeMessage,
      history,
      clinicalText: this.clinicalText(workspace)
    }).pipe(finalize(() => {
      if (requestId !== this.requestSequence) return;
      this.busy.set(false);
      this.activeRequest = undefined;
    })).subscribe({
      next: (response) => {
        if (!this.isCurrent(requestId, patientId, revision)) return;
        const normalized = this.normalizeResponse(response);
        this.conversation.update((items) => this.trim([...items, normalized]));
        if (normalized.highlights.length) this.focus.highlight(normalized.highlights);
        this.scrollToEnd();
      },
      error: (failure: ApiFailure) => {
        if (!this.isCurrent(requestId, patientId, revision)) return;
        this.appendError(this.failureMessage(failure));
      }
    });
  }

  clearConversation(): void {
    this.resetConversation();
    this.inputElement?.nativeElement.focus();
  }

  useFollowUp(prompt: string): void {
    this.useSuggestion(prompt);
  }

  navigate(value: string): void {
    const text = value.trim();
    if (!text) return;
    const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
    const local = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
    const date = iso || (local ? `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}` : undefined);
    this.focus.focus({ date, text: date ? undefined : text });
  }

  isTable(artifact: AgentArtifact): artifact is AgentTableArtifact { return artifact.type === 'table'; }
  isChart(artifact: AgentArtifact): artifact is AgentChartArtifact { return artifact.type === 'chart'; }
  time(value: string): string {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(parsed);
  }

  private normalizeResponse(response: AgentChatResponse): AgentConversationMessage {
    const artifacts = (Array.isArray(response.artifacts) ? response.artifacts : []).slice(0, 8).map((artifact) => this.normalizeArtifact(artifact)).filter((item): item is AgentArtifact => Boolean(item));
    const followUps = (Array.isArray(response.followUps) ? response.followUps : []).map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8);
    const highlights = (Array.isArray(response.highlights) ? response.highlights : []).slice(0, 20).map((item) => ({
      terms: (Array.isArray(item.terms) ? item.terms : []).map(String).map((term) => term.trim()).filter((term) => term.length >= 3).slice(0, 20),
      color: HIGHLIGHT_COLORS.has(String(item.color || '')) ? String(item.color) : 'study'
    })).filter((item) => item.terms.length);
    return { ...this.message('assistant', String(response.answer || '').trim() || 'El servicio no devolvió una respuesta.'), model: response.model, artifacts, followUps, highlights };
  }

  private normalizeArtifact(artifact: AgentArtifact): AgentArtifact | null {
    if (artifact?.type === 'table') return {
      type: 'table', title: String(artifact.title || ''),
      columns: (Array.isArray(artifact.columns) ? artifact.columns : []).map(String).slice(0, 12),
      rows: (Array.isArray(artifact.rows) ? artifact.rows : []).slice(0, 100).map((row) => (Array.isArray(row) ? row : []).map(String).slice(0, 12))
    };
    if (artifact?.type === 'chart') return {
      type: 'chart', title: String(artifact.title || ''), chartType: ['line', 'bar', 'pie'].includes(String(artifact.chartType)) ? artifact.chartType : 'line', xLabel: String(artifact.xLabel || ''),
      series: (Array.isArray(artifact.series) ? artifact.series : []).slice(0, 8).map((series) => ({ name: String(series.name || ''), color: String(series.color || ''), points: (Array.isArray(series.points) ? series.points : []).slice(0, 100).map((point) => ({ x: String(point.x ?? ''), y: Number(point.y) || 0, label: String(point.label || '') })) }))
    };
    return null;
  }

  private clinicalText(workspace: PatientWorkspace): string {
    const state = workspace.state || {};
    const clinical = {
      oncology: state.oncology || {}, narrative: state.narrative || {}, exam: state.exam || {},
      diagnoses: state.diagnoses || [], studies: [...(state.externalStudies || []), ...(state.studies || [])],
      treatments: state.treatments || [], evolutions: state.evolutions || [], prescriptions: state.prescriptions || [],
      research: state.researchRecords || []
    };
    return deidentifyClinicalContext(clinical, workspace.patient);
  }

  private failureMessage(failure: ApiFailure): string {
    const code = String(failure?.error?.code || '');
    if (code === 'LLM_DISABLED') return 'El servicio LLM está desactivado. Puede habilitarlo en Configuración.';
    if ((failure.status || failure?.error?.status) === 504) return 'El servicio tardó demasiado en responder. Intente nuevamente.';
    if ((failure.status || failure?.error?.status) === 403) return 'Su usuario no tiene permiso para usar el Agente clínico.';
    return failure?.error?.error || 'No se pudo completar la consulta al Agente clínico.';
  }

  private appendError(text: string): void {
    this.conversation.update((items) => this.trim([...items, { ...this.message('assistant', text), error: true }]));
    this.scrollToEnd();
  }

  private isCurrent(requestId: number, patientId: string, revision: number): boolean {
    const current = this.workspace.workspace();
    return requestId === this.requestSequence && current?.patientId === patientId && current.revision === revision;
  }

  private resetConversation(revisionNotice = ''): void {
    this.requestSequence += 1;
    this.activeRequest?.unsubscribe();
    this.activeRequest = undefined;
    this.busy.set(false);
    this.input.set('');
    this.conversation.set([this.greeting(revisionNotice)]);
    this.focus.clear();
    this.scrollToEnd();
  }

  private greeting(revisionNotice = ''): AgentConversationMessage {
    return {
      ...this.message('assistant', [revisionNotice, GREETING].filter(Boolean).join(' ')),
      greeting: true
    };
  }
  private message(role: 'user' | 'assistant', content: string): AgentConversationMessage {
    return { id: globalThis.crypto?.randomUUID?.() || `agent-${Date.now()}-${Math.random().toString(16).slice(2)}`, role, content, createdAt: new Date().toISOString(), artifacts: [], followUps: [], highlights: [] };
  }
  private trim(items: AgentConversationMessage[]): AgentConversationMessage[] { return items.slice(-20); }
  private scrollToEnd(): void { queueMicrotask(() => { const element = this.messagesElement?.nativeElement; if (element) element.scrollTop = element.scrollHeight; }); }
}
