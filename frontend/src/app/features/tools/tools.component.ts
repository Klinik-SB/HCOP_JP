import { Component, Injector, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { catchError, debounceTime, map, of, Subject, Subscription, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  AjccAxis,
  AjccCatalog,
  AjccSiteDetail,
  AjccStageRequest,
  AjccStageResult,
  GuideCatalog,
  GuideItem,
  ToolPane,
  ToolsApiError
} from './tools.models';
import { ToolsService } from './tools.service';
import { CalculatorWorkspaceComponent } from './calculators/calculator-workspace.component';

interface GuideRequest {
  readonly sequence: number;
  readonly force: boolean;
}

interface GuideRequestResult extends GuideRequest {
  readonly catalog?: GuideCatalog;
  readonly failure?: ToolsApiError;
}

interface CatalogRequest {
  readonly sequence: number;
  readonly force: boolean;
}

interface CatalogRequestResult extends CatalogRequest {
  readonly catalog?: AjccCatalog;
  readonly failure?: ToolsApiError;
}

interface SiteRequest {
  readonly sequence: number;
  readonly id: string;
  readonly force: boolean;
}

interface SiteRequestResult extends SiteRequest {
  readonly detail?: AjccSiteDetail;
  readonly failure?: ToolsApiError;
  readonly cancelled?: boolean;
}

interface StageCalculationRequest {
  readonly sequence: number;
  readonly fingerprint: string;
  readonly payload: AjccStageRequest | null;
}

interface StageCalculationResult extends StageCalculationRequest {
  readonly result?: AjccStageResult;
  readonly failure?: ToolsApiError;
  readonly cancelled?: boolean;
}

interface SiteGroup {
  readonly name: string;
  readonly sites: AjccCatalog['sites'];
}

const PRIMARY_AXES = ['T', 'N', 'M'] as const;
const INTERNAL_AXES = new Set(['T', 'N', 'M', 'Classification', 'DescY', 'DescR', 'DescM']);

@Component({
  selector: 'app-tools',
  imports: [CalculatorWorkspaceComponent],
  host: {
    id: 'rightPanelTools',
    class: 'right-tab-panel active',
    'data-right-panel': 'tools',
    role: 'tabpanel',
    'aria-labelledby': 'rightTabTools'
  },
  templateUrl: './tools.component.html',
  styleUrl: './tools.component.scss'
})
export class ToolsComponent implements OnDestroy {
  readonly auth = inject(AuthService);
  private readonly tools = inject(ToolsService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly injector = inject(Injector);
  private readonly subscriptions = new Subscription();
  private readonly guideRequests = new Subject<GuideRequest>();
  private readonly catalogRequests = new Subject<CatalogRequest>();
  private readonly siteRequests = new Subject<SiteRequest>();
  private readonly stageRequests = new Subject<StageCalculationRequest>();
  private guideSequence = 0;
  private catalogSequence = 0;
  private siteSequence = 0;
  private stageSequence = 0;
  private authorizedStarted = false;

  readonly canView = computed(() => this.auth.hasPermission('section.tools.view'));
  readonly canUse = computed(() => this.auth.hasPermission('section.tools.use'));
  readonly activePane = signal<ToolPane>('guides');

  readonly guideCatalog = signal<GuideCatalog | null>(null);
  readonly guideLoading = signal(false);
  readonly guideError = signal('');
  readonly guideSearch = signal('');
  readonly selectedGuide = signal<GuideItem | null>(null);
  readonly guideUrl = signal('');
  readonly guideResourceUrl = signal<SafeResourceUrl | null>(null);
  readonly filteredGuides = computed(() => {
    const query = normalizeSearch(this.guideSearch());
    const guides = this.guideCatalog()?.guides ?? [];
    if (!query) return guides;
    return guides.filter((guide) => normalizeSearch([
      guide.title,
      guide.site,
      guide.source,
      guide.audience,
      ...guide.tags
    ].join(' ')).includes(query));
  });

  readonly ajccCatalog = signal<AjccCatalog | null>(null);
  readonly ajccCatalogLoading = signal(false);
  readonly ajccCatalogError = signal('');
  readonly selectedSiteId = signal('');
  readonly selectedSite = signal<AjccSiteDetail | null>(null);
  readonly siteLoading = signal(false);
  readonly siteError = signal('');
  readonly prefix = signal('c');
  readonly stagingDate = signal(today());
  readonly axisValues = signal<Readonly<Record<string, string>>>({});
  readonly stageResult = signal<AjccStageResult | null>(null);
  readonly stageLoading = signal(false);
  readonly stageError = signal('');

  readonly siteGroups = computed<readonly SiteGroup[]>(() => {
    const groups = new Map<string, AjccCatalog['sites'][number][]>();
    for (const site of this.ajccCatalog()?.sites ?? []) {
      const rows = groups.get(site.group) ?? [];
      rows.push(site);
      groups.set(site.group, rows);
    }
    return [...groups.entries()].map(([name, sites]) => ({ name, sites }));
  });
  readonly extraAxes = computed<readonly { key: string; axis: AjccAxis }[]>(() =>
    Object.entries(this.selectedSite()?.axes ?? {})
      .filter(([key]) => !INTERNAL_AXES.has(key))
      .map(([key, axis]) => ({ key, axis }))
  );
  readonly selectedTnm = computed(() => PRIMARY_AXES
    .map((axis) => this.axisValues()[axis] ?? '')
    .filter(Boolean)
    .join(' '));
  readonly tnmComplete = computed(() => PRIMARY_AXES.every((axis) => Boolean(this.axisValues()[axis])));

  constructor() {
    this.subscriptions.add(this.guideRequests.pipe(
      switchMap((request) => this.tools.guides(request.force).pipe(
        map((catalog): GuideRequestResult => ({ ...request, catalog })),
        catchError((failure: ToolsApiError) => of<GuideRequestResult>({ ...request, failure }))
      ))
    ).subscribe((result) => this.acceptGuides(result)));

    this.subscriptions.add(this.siteRequests.pipe(
      switchMap((request) => request.id
        ? this.tools.ajccDetail(request.id, request.force).pipe(
            map((detail): SiteRequestResult => ({ ...request, detail })),
            catchError((failure: ToolsApiError) => of<SiteRequestResult>({ ...request, failure }))
          )
        : of<SiteRequestResult>({ ...request, cancelled: true }))
    ).subscribe((result) => this.acceptSite(result)));

    this.subscriptions.add(this.catalogRequests.pipe(
      switchMap((request) => this.tools.ajccCatalog(request.force).pipe(
        map((catalog): CatalogRequestResult => ({ ...request, catalog })),
        catchError((failure: ToolsApiError) => of<CatalogRequestResult>({ ...request, failure }))
      ))
    ).subscribe((result) => this.acceptCatalog(result)));

    this.subscriptions.add(this.stageRequests.pipe(
      debounceTime(80),
      switchMap((request) => request.payload
        ? this.tools.stage(request.payload).pipe(
            map((result): StageCalculationResult => ({ ...request, result })),
            catchError((failure: ToolsApiError) => of<StageCalculationResult>({ ...request, failure }))
          )
        : of<StageCalculationResult>({ ...request, cancelled: true }))
    ).subscribe((result) => this.acceptStage(result)));

    this.subscriptions.add(this.tools.invalidated$.subscribe(() => {
      if (this.canView() && this.activePane() === 'guides') this.loadGuides(true);
    }));

    effect(() => {
      const allowed = this.canView();
      const canCalculate = this.canUse();
      if (allowed && !this.authorizedStarted) {
        this.authorizedStarted = true;
        this.loadGuides(false);
      }
      if (!allowed) {
        this.authorizedStarted = false;
        this.activePane.set('guides');
        this.cancelRequests();
      }
      if (!canCalculate) {
        if (this.activePane() === 'calculators') this.activePane.set('guides');
        this.cancelStage('Puede consultar las definiciones TNM, pero no calcular sin el permiso de uso de herramientas.');
      }
    }, { injector: this.injector });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  selectPane(pane: ToolPane): void {
    if (!this.canView()) return;
    if (pane === 'calculators' && !this.canUse()) return;
    this.activePane.set(pane);
    if (pane === 'guides' && !this.guideCatalog() && !this.guideLoading()) this.loadGuides(false);
    if (pane === 'tnm' && !this.ajccCatalog() && !this.ajccCatalogLoading()) this.loadAjccCatalog(false);
  }

  loadGuides(force = false): void {
    if (!this.canView()) return;
    const sequence = ++this.guideSequence;
    this.guideLoading.set(true);
    this.guideError.set('');
    this.guideRequests.next({ sequence, force });
  }

  updateGuideSearch(event: Event): void {
    this.guideSearch.set(inputValue(event));
  }

  openGuide(guide: GuideItem): void {
    if (!this.canView() || !guide.url.startsWith('/api/guides/file?name=')) return;
    this.selectedGuide.set(guide);
    this.guideUrl.set(guide.url);
    this.guideResourceUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(guide.url));
  }

  closeGuide(): void {
    this.selectedGuide.set(null);
    this.guideUrl.set('');
    this.guideResourceUrl.set(null);
  }

  loadAjccCatalog(force = false): void {
    if (!this.canView()) return;
    this.ajccCatalogLoading.set(true);
    this.ajccCatalogError.set('');
    const sequence = ++this.catalogSequence;
    this.catalogRequests.next({ sequence, force });
  }

  changeSite(event: Event): void {
    const id = inputValue(event);
    const sequence = ++this.siteSequence;
    this.selectedSiteId.set(id);
    this.selectedSite.set(null);
    this.siteError.set('');
    this.siteLoading.set(Boolean(id));
    this.axisValues.set({});
    this.cancelStage('');
    this.siteRequests.next({ sequence, id, force: false });
  }

  retrySite(): void {
    const id = this.selectedSiteId();
    if (!id || !this.canView()) return;
    const sequence = ++this.siteSequence;
    this.siteLoading.set(true);
    this.siteError.set('');
    this.siteRequests.next({ sequence, id, force: true });
  }

  changePrefix(event: Event): void {
    this.prefix.set(inputValue(event) || 'c');
    const current = { ...this.axisValues() };
    for (const axis of PRIMARY_AXES) {
      if (!this.axisCategories(axis).some((category) => category.code === current[axis])) current[axis] = '';
    }
    this.axisValues.set(current);
    this.queueStage();
  }

  changeDate(event: Event): void {
    this.stagingDate.set(inputValue(event) || today());
  }

  changeAxis(axis: string, event: Event): void {
    this.axisValues.update((values) => ({ ...values, [axis]: inputValue(event) }));
    this.queueStage();
  }

  axisCategories(axis: string): AjccAxis['categories'] {
    const categories = this.selectedSite()?.axes[axis]?.categories ?? [];
    if (axis !== 'T' || !categories.some((category) => /^[cp]T/i.test(category.code))) return categories;
    const classification = this.prefix().includes('p') ? 'p' : 'c';
    return categories.filter((category) => category.code.toLowerCase().startsWith(`${classification}t`));
  }

  axisLabel(axis: string): string {
    return this.selectedSite()?.axes[axis]?.label || axis;
  }

  axisDefinition(axis: string): string {
    const value = this.axisValues()[axis];
    if (!value) return '';
    const category = this.selectedSite()?.axes[axis]?.categories.find((item) => item.code === value);
    return category ? `${category.code} = ${category.description}` : '';
  }

  stageContext(): string {
    const site = this.selectedSite();
    return site ? `${site.name} · ${site.edition} · cálculo local` : 'Resultado';
  }

  stageDetail(): string {
    if (!this.canUse()) return 'No tiene permiso para ejecutar cálculos clínicos.';
    if (!this.tnmComplete()) return 'Complete los tres componentes para agrupar el estadio.';
    if (this.stageLoading()) return 'Calculando con las reglas locales…';
    if (this.stageError()) return this.stageError();
    const result = this.stageResult();
    if (result?.stage) {
      return result.sourceRow
        ? `Agrupación determinística según la matriz del sitio · regla ${result.sourceRow}.`
        : 'Agrupación determinística según la matriz del sitio.';
    }
    if (result?.missing.length) return `Faltan datos: ${result.missing.join(' · ')}`;
    return 'La combinación seleccionada no está contemplada por la matriz local.';
  }

  formatFileSize(bytes: number): string {
    if (bytes <= 0) return '0 KB';
    return bytes >= 1_048_576
      ? `${(bytes / 1_048_576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  }

  private acceptGuides(request: GuideRequestResult): void {
    if (request.sequence !== this.guideSequence || !this.canView()) return;
    this.guideLoading.set(false);
    if (request.failure) {
      this.guideError.set(errorMessage(request.failure, 'No se pudo abrir la biblioteca de guías.'));
      return;
    }
    this.guideCatalog.set(request.catalog ?? { guides: [], count: 0 });
  }

  private acceptCatalog(request: CatalogRequestResult): void {
    if (request.sequence !== this.catalogSequence || !this.canView()) return;
    this.ajccCatalogLoading.set(false);
    if (request.failure) {
      this.ajccCatalogError.set(errorMessage(request.failure, 'No se pudo cargar el catálogo AJCC 8.'));
      return;
    }
    this.ajccCatalog.set(request.catalog ?? { edition: 'AJCC 8', source: '', sites: [], count: 0 });
  }

  private acceptSite(request: SiteRequestResult): void {
    if (request.sequence !== this.siteSequence || request.id !== this.selectedSiteId() || !this.canView()) return;
    this.siteLoading.set(false);
    if (request.cancelled) return;
    if (request.failure) {
      this.siteError.set(errorMessage(request.failure, 'No se pudo abrir el sitio AJCC 8.'));
      return;
    }
    const detail = request.detail ?? null;
    this.selectedSite.set(detail);
    this.axisValues.set({});
    this.queueStage();
  }

  private queueStage(): void {
    const sequence = ++this.stageSequence;
    this.stageResult.set(null);
    this.stageError.set('');
    const payload = this.stagePayload();
    const fingerprint = this.stageFingerprint(payload);
    if (!payload) this.stageLoading.set(false);
    else this.stageLoading.set(true);
    this.stageRequests.next({ sequence, fingerprint, payload });
  }

  private stagePayload(): AjccStageRequest | null {
    const site = this.selectedSite();
    const axes = this.axisValues();
    if (!site || !this.canUse() || !PRIMARY_AXES.every((axis) => Boolean(axes[axis]))) return null;
    const prefix = this.prefix();
    const values: Record<string, string> = {
      T: axes['T'] ?? '',
      N: axes['N'] ?? '',
      M: axes['M'] ?? '',
      Classification: prefix.includes('p') ? 'p' : 'c',
      DescY: prefix.includes('y') ? 'Yes' : 'No',
      DescR: prefix === 'r' ? 'Yes' : 'No',
      DescM: 'No'
    };
    for (const { key } of this.extraAxes()) values[key] = axes[key] ?? '';
    return { id: site.id, values };
  }

  private stageFingerprint(payload: AjccStageRequest | null): string {
    if (!payload) return `${this.selectedSiteId()}|incomplete|${this.stageSequence}`;
    return `${payload.id}|${Object.entries(payload.values).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}:${value}`).join('|')}`;
  }

  private acceptStage(request: StageCalculationResult): void {
    if (request.sequence !== this.stageSequence || request.fingerprint !== this.stageFingerprint(request.payload)) return;
    this.stageLoading.set(false);
    if (request.cancelled) return;
    if (request.failure) {
      this.stageError.set(errorMessage(request.failure, 'No se pudo calcular el estadio AJCC.'));
      return;
    }
    this.stageResult.set(request.result ?? { stage: '', missing: [], sourceRow: null });
  }

  private cancelStage(message: string): void {
    const sequence = ++this.stageSequence;
    this.stageResult.set(null);
    this.stageLoading.set(false);
    this.stageError.set(message);
    this.stageRequests.next({ sequence, fingerprint: `${this.selectedSiteId()}|cancelled|${sequence}`, payload: null });
  }

  private cancelRequests(): void {
    this.guideSequence += 1;
    this.catalogSequence += 1;
    this.siteSequence += 1;
    this.guideLoading.set(false);
    this.ajccCatalogLoading.set(false);
    this.siteLoading.set(false);
    this.cancelStage('');
    this.closeGuide();
  }
}

function inputValue(event: Event): string {
  const target = event.target;
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement ? target.value : '';
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim();
}

function errorMessage(failure: ToolsApiError | undefined, fallback: string): string {
  if (!failure) return fallback;
  if (failure.status === 401) return 'La sesión venció. Ingrese nuevamente para continuar.';
  if (failure.status === 403) return 'No tiene permiso para acceder a esta herramienta.';
  return failure.message || fallback;
}

function today(): string {
  const value = new Date();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}
