import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { clinicalIsTreatmentRecord, clinicalTreatmentProjections } from '../../core/clinical/clinical-treatment-projection';
import { ClinicalRecord, ClinicalState } from '../../core/patients/patient-workspace.models';
import { PatientWorkspaceService } from '../../core/patients/patient-workspace.service';

type TimelineCategory = 'diagnosis' | 'study' | 'pathology' | 'evolution' | 'research' | 'prescription' | 'certificate' | 'study_order' | 'indication' | 'radiotherapy' | 'surgery' | 'chemotherapy' | 'hormone' | 'immunotherapy' | 'targeted' | 'systemic';

interface TimelineEvent {
  id: string;
  date: string;
  category: TimelineCategory;
  kind: string;
  title: string;
  body: string;
  phase: string;
  milestone: boolean;
}

interface TimelineDay { date: string; events: TimelineEvent[]; }
interface TimelineMonth { key: string; label: string; days: TimelineDay[]; events: TimelineEvent[]; }
interface TimelineYear { year: string; months: TimelineMonth[]; events: TimelineEvent[]; }

const CATEGORY_LABELS: Record<TimelineCategory, string> = {
  diagnosis: 'Diagnósticos', study: 'Estudios', pathology: 'Patología', evolution: 'Evoluciones', research: 'Investigación',
  prescription: 'Recetas', certificate: 'Certificados', study_order: 'Solicitudes', indication: 'Indicaciones', radiotherapy: 'Radioterapia',
  surgery: 'Cirugías', chemotherapy: 'Quimioterapia', hormone: 'Hormonoterapia', immunotherapy: 'Inmunoterapia', targeted: 'Terapia dirigida', systemic: 'Sistémicos'
};

@Component({
  selector: 'app-timeline-panel',
  imports: [ReactiveFormsModule],
  templateUrl: './timeline-panel.component.html',
  styleUrl: './timeline-panel.component.scss'
})
export class TimelinePanelComponent {
  readonly workspace = inject(PatientWorkspaceService);
  readonly query = new FormControl('', { nonNullable: true });
  readonly searchTerm = signal('');
  readonly milestonesOnly = signal(false);
  readonly filters = signal<TimelineCategory[]>([]);

  readonly allEntries = computed(() => {
    const workspace = this.workspace.workingWorkspace();
    return this.entriesFrom(workspace?.state, workspace?.treatments?.oncology || []);
  });
  readonly categories = computed(() => [...new Set(this.allEntries().map((entry) => entry.category))]);
  readonly entries = computed(() => {
    const term = this.searchTerm().trim().toLocaleLowerCase('es-AR');
    const filters = this.filters();
    return this.allEntries().filter((entry) => {
      const text = `${entry.date} ${entry.kind} ${entry.title} ${entry.body} ${entry.phase}`.toLocaleLowerCase('es-AR');
      return (!term || text.includes(term)) && (!filters.length || filters.includes(entry.category)) && (!this.milestonesOnly() || entry.milestone);
    });
  });
  readonly years = computed(() => this.group(this.entries()));

  constructor() { this.query.valueChanges.subscribe((value) => this.searchTerm.set(value)); }

  toggleFilter(category: TimelineCategory): void {
    this.filters.update((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
  }
  clearFilters(): void { this.filters.set([]); this.milestonesOnly.set(false); this.query.setValue(''); }
  filterLabel(category: TimelineCategory): string { return CATEGORY_LABELS[category]; }
  monthLabel(key: string): string { if (key === 'sin-fecha') return 'Sin fecha'; const [year, month] = key.split('-').map(Number); return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1)); }
  dateLabel(date: string): string { if (!date) return 'Sin fecha'; const parsed = new Date(`${date}T12:00:00`); return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat('es-AR').format(parsed); }
  icon(category: TimelineCategory): string { return ({ diagnosis: '✚', study: '▧', pathology: '⌕', evolution: '✎', research: '⌬', prescription: '▤', certificate: '▤', study_order: '▧', indication: '▱', radiotherapy: '◉', surgery: '✚', chemotherapy: '◈', hormone: '●', immunotherapy: '⛨', targeted: '◎', systemic: '♥' } as Record<TimelineCategory, string>)[category]; }
  focus(date: string): void {
    if (!date) return;
    const target = [...document.querySelectorAll<HTMLElement>('[data-clinical-date]')].find((node) => node.dataset['clinicalDate'] === date);
    if (!target) return;
    target.classList.add('clinical-period-focus');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => target.classList.remove('clinical-period-focus'), 3500);
  }

  private entriesFrom(state?: ClinicalState, relationalTreatments: readonly ClinicalRecord[] = []): TimelineEvent[] {
    if (!state) return [];
    const entries: TimelineEvent[] = [];
    const add = (source: unknown, category: TimelineCategory, kind: string, title: string, body: string, phase = 'Seguimiento'): void => {
      const record = this.object(source);
      if (record['deleted']) return;
      const date = String(record['date'] || record['startDate'] || record['createdAt'] || '').slice(0, 10);
      entries.push({ id: String(record['id'] || `${category}-${entries.length}`), date, category, kind, title: title || kind, body, phase, milestone: Boolean(record['highlighted'] || record['featured'] || record['destacada']) });
    };
    for (const record of state.diagnoses || []) add(record, 'diagnosis', 'Diagnóstico', this.text(record, 'diagnosis', 'title'), this.text(record, 'text', 'summary'));
    for (const record of [...(state.externalStudies || []), ...(state.studies || [])]) {
      const content = `${this.text(record, 'type')} ${this.text(record, 'title')} ${this.text(record, 'summary')}`;
      add(record, /patolog|biops|histolog|citolog|inmunohisto/i.test(content) ? 'pathology' : 'study', /patolog|biops|histolog|citolog|inmunohisto/i.test(content) ? 'Patología' : 'Estudio', this.text(record, 'title', 'type'), this.text(record, 'summary', 'source'));
    }
    for (const record of state.evolutions || []) {
      if (clinicalIsTreatmentRecord(record)) continue;
      add(record, 'evolution', 'Evolución', this.text(record, 'reason', 'specialty', 'title'), this.text(record, 'text', 'summary'));
    }
    for (const projection of clinicalTreatmentProjections(state, relationalTreatments)) {
      const record = projection.record;
      const category: TimelineCategory = projection.category;
      add(record, category, CATEGORY_LABELS[category].replace(/s$/, ''), this.text(record, 'scheme', 'title', 'reason'), this.text(record, 'text', 'summary', 'notes', 'status'), this.text(record, 'intent') || 'Tratamiento');
    }
    for (const record of state.prescriptions || []) {
      const type = String(record.type || '');
      const category: TimelineCategory = type === 'certificate' ? 'certificate' : type === 'study' ? 'study_order' : type === 'free' ? 'indication' : 'prescription';
      add(record, category, CATEGORY_LABELS[category].replace(/s$/, ''), this.text(record, 'title', 'generic', 'studyName'), this.text(record, 'instructions', 'text', 'summary'));
    }
    for (const record of state.researchRecords || []) add(record, 'research', 'Investigación', this.text(record, 'title', 'type'), this.text(record, 'summary', 'notes'));
    return entries.sort((left, right) => left.date.localeCompare(right.date));
  }
  private group(entries: TimelineEvent[]): TimelineYear[] {
    const years = new Map<string, TimelineEvent[]>();
    for (const entry of entries) { const key = entry.date ? entry.date.slice(0, 4) : 'Sin fecha'; years.set(key, [...(years.get(key) || []), entry]); }
    return [...years.entries()].map(([year, yearEntries]) => {
      const months = new Map<string, TimelineEvent[]>();
      for (const entry of yearEntries) { const key = entry.date ? entry.date.slice(0, 7) : 'sin-fecha'; months.set(key, [...(months.get(key) || []), entry]); }
      return { year, events: yearEntries, months: [...months.entries()].map(([key, monthEntries]) => {
        const days = new Map<string, TimelineEvent[]>();
        for (const entry of monthEntries) { const date = entry.date || 'sin-fecha'; days.set(date, [...(days.get(date) || []), entry]); }
        return { key, label: this.monthLabel(key), events: monthEntries, days: [...days.entries()].map(([date, dayEntries]) => ({ date, events: dayEntries })) };
      }) };
    });
  }
  private object(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}; }
  private text(record: ClinicalRecord, ...keys: string[]): string { for (const key of keys) { const value = record[key]; if (typeof value === 'string' && value.trim()) return value; } return ''; }
}
