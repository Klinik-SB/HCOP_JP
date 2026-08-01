import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { catchError, map, of, Subject, Subscription, switchMap } from 'rxjs';
import {
  ProtocolApiFailure,
  ProtocolCatalog,
  ProtocolDetail,
  ProtocolDrug,
  ProtocolPreparation,
  ProtocolPresentation,
  ProtocolSource
} from './protocol.models';
import { ProtocolService } from './protocol.service';

interface CatalogRequest {
  readonly source: ProtocolSource;
  readonly sequence: number;
  readonly force: boolean;
}

interface CatalogResult extends CatalogRequest {
  readonly catalog?: ProtocolCatalog;
  readonly failure?: ProtocolApiFailure;
}

interface DetailRequest {
  readonly source: ProtocolSource;
  readonly id: string;
  readonly sequence: number;
  readonly force: boolean;
}

interface DetailResult extends DetailRequest {
  readonly detail?: ProtocolDetail;
  readonly failure?: ProtocolApiFailure;
  readonly cancelled?: boolean;
}

@Component({
  selector: 'app-protocol-explorer',
  host: {
    id: 'rightPanelProtocols',
    class: 'right-tab-panel active',
    'data-right-panel': 'protocols',
    role: 'tabpanel',
    'aria-labelledby': 'rightTabProtocols'
  },
  templateUrl: './protocol.component.html',
  styleUrl: './protocol.component.scss'
})
export class ProtocolExplorerComponent implements OnInit, OnDestroy {
  private readonly protocols = inject(ProtocolService);
  private readonly subscriptions = new Subscription();
  private readonly catalogRequests = new Subject<CatalogRequest>();
  private readonly detailRequests = new Subject<DetailRequest>();
  private catalogSequence = 0;
  private detailSequence = 0;

  readonly source = signal<ProtocolSource>('clinical');
  readonly category = signal('');
  readonly schemeId = signal('');
  readonly drugIndex = signal<number | null>(null);
  readonly catalog = signal<ProtocolCatalog | null>(null);
  readonly detail = signal<ProtocolDetail | null>(null);
  readonly catalogLoading = signal(false);
  readonly detailLoading = signal(false);
  readonly catalogError = signal('');
  readonly detailError = signal('');

  readonly filteredSchemes = computed(() => {
    const category = this.category();
    const items = this.catalog()?.items ?? [];
    return category ? items.filter((item) => item.category === category) : items;
  });
  readonly selectedDrug = computed(() => {
    const index = this.drugIndex();
    return index === null ? null : this.detail()?.drugs[index] ?? null;
  });

  ngOnInit(): void {
    this.subscriptions.add(this.catalogRequests.pipe(
      switchMap((request) => this.protocols.catalog(request.source, request.force).pipe(
        map((catalog): CatalogResult => ({ ...request, catalog })),
        catchError((failure: ProtocolApiFailure) => of<CatalogResult>({ ...request, failure }))
      ))
    ).subscribe((result) => this.acceptCatalog(result)));

    this.subscriptions.add(this.detailRequests.pipe(
      switchMap((request) => request.id
        ? this.protocols.detail(request.source, request.id, request.force).pipe(
            map((detail): DetailResult => ({ ...request, detail })),
            catchError((failure: ProtocolApiFailure) => of<DetailResult>({ ...request, failure }))
          )
        : of<DetailResult>({ ...request, cancelled: true }))
    ).subscribe((result) => this.acceptDetail(result)));

    this.subscriptions.add(this.protocols.invalidated$.subscribe(() => this.loadCatalog(true)));
    this.loadCatalog(false);
  }

  ngOnDestroy(): void {
    this.catalogSequence += 1;
    this.detailSequence += 1;
    this.subscriptions.unsubscribe();
  }

  changeSource(value: string): void {
    const source: ProtocolSource = value === 'seer' ? 'seer' : 'clinical';
    if (source === this.source()) return;
    this.source.set(source);
    this.cancelDetailRequest(true);
    this.category.set('');
    this.catalog.set(null);
    this.loadCatalog(false);
  }

  changeCategory(value: string): void {
    this.category.set(value);
    this.clearSelection();
  }

  changeScheme(value: string): void {
    const id = value.trim();
    this.cancelDetailRequest(true);
    this.schemeId.set(id);
    if (!id) return;
    this.loadDetail(id, false);
  }

  changeDrug(value: string): void {
    const parsed = Number(value);
    this.drugIndex.set(value !== '' && Number.isInteger(parsed) && parsed >= 0 ? parsed : null);
  }

  selectDrug(index: number): void {
    this.drugIndex.set(index);
  }

  retryCatalog(): void {
    this.protocols.invalidateSource(this.source(), false);
    this.loadCatalog(true);
  }

  retryDetail(): void {
    const id = this.schemeId();
    if (id) this.loadDetail(id, true);
  }

  countText(): string {
    if (this.catalogLoading()) return 'Cargando...';
    const catalog = this.catalog();
    if (!catalog) return 'No disponible';
    return `${catalog.total} ${catalog.total === 1 ? 'esquema' : 'esquemas'}`;
  }

  doseText(drug: ProtocolDrug): string {
    return [drug.dose, drug.doseUnit, drug.doseCalculation].filter(Boolean).join(' ') || '—';
  }

  drugSummary(drug: ProtocolDrug): string {
    const dose = [drug.dose, drug.doseUnit, drug.doseCalculation].filter(Boolean).join(' ');
    return [dose, drug.route].filter(Boolean).join(' · ') || 'Sin dosis ni vía registradas';
  }

  preparationLine(item: ProtocolPreparation): string {
    return [
      item.route,
      item.reconstituent ? `Reconst. ${item.reconstituent}` : '',
      item.diluent ? `Diluyente ${item.diluent}` : '',
      item.finalVolume,
      item.concentration
    ].filter(Boolean).join(' · ');
  }

  preparationNotes(item: ProtocolPreparation): string {
    return [
      item.infusionGuide,
      item.preparationObservations,
      item.labelObservations,
      item.stabilityRoomTemperature ? `Estabilidad ambiente: ${item.stabilityRoomTemperature}` : '',
      item.stabilityRefrigerated ? `Estabilidad refrigerada: ${item.stabilityRefrigerated}` : '',
      item.photosensitive === true ? 'Fotosensible' : '',
      item.laboratory ? `Laboratorio: ${item.laboratory}` : ''
    ].filter(Boolean).join(' · ');
  }

  presentationText(item: ProtocolPresentation): string {
    const label = item.label || item.amount || 'Presentación';
    const formPresent = item.form === 'Liofilizado'
      ? /liof|liofilizado/i.test(label)
      : item.form === 'Solución'
        ? /(?:^|\s)sol(?:\s|$)|soluci[oó]n/i.test(label)
        : normalizeText(label).includes(normalizeText(item.form));
    const vialPresent = /frasco|vial|fco\s*amp/i.test(label);
    return [
      label,
      item.amount && !normalizeText(label).includes(normalizeText(item.amount)) ? item.amount : '',
      item.form && !formPresent ? item.form : '',
      item.vial === true && !vialPresent ? 'frasco ampolla' : ''
    ].filter(Boolean).join(' · ');
  }

  private clearSelection(): void {
    this.cancelDetailRequest(true);
  }

  private loadCatalog(force: boolean): void {
    if (force) this.cancelDetailRequest(true);
    const request: CatalogRequest = { source: this.source(), sequence: ++this.catalogSequence, force };
    this.catalogLoading.set(true);
    this.catalogError.set('');
    this.catalogRequests.next(request);
  }

  private loadDetail(id: string, force: boolean): void {
    const request: DetailRequest = { source: this.source(), id, sequence: ++this.detailSequence, force };
    this.detailLoading.set(true);
    this.detailError.set('');
    this.detailRequests.next(request);
  }

  private acceptCatalog(result: CatalogResult): void {
    if (result.sequence !== this.catalogSequence || result.source !== this.source()) return;
    this.catalogLoading.set(false);
    if (result.failure || !result.catalog) {
      this.catalog.set(null);
      this.catalogError.set(this.failureMessage(result.failure, 'No se pudo cargar el catálogo de protocolos.'));
      return;
    }
    this.catalog.set(result.catalog);
    this.catalogError.set('');
    if (this.category() && !result.catalog.categories.includes(this.category())) this.category.set('');
    const selectedId = this.schemeId();
    if (selectedId && result.catalog.items.some((item) => item.id === selectedId)) {
      this.loadDetail(selectedId, result.force);
    } else if (selectedId) {
      this.clearSelection();
    }
  }

  private acceptDetail(result: DetailResult): void {
    if (result.sequence !== this.detailSequence || result.source !== this.source() || result.id !== this.schemeId()) return;
    this.detailLoading.set(false);
    if (result.cancelled) return;
    if (result.failure || !result.detail) {
      this.detail.set(null);
      this.drugIndex.set(null);
      this.detailError.set(this.failureMessage(result.failure, 'No se pudo abrir el esquema seleccionado.'));
      return;
    }
    this.detail.set(result.detail);
    this.drugIndex.set(null);
    this.detailError.set('');
  }

  private failureMessage(failure: ProtocolApiFailure | undefined, fallback: string): string {
    const status = failure?.status ?? failure?.error?.status;
    if (status === 401) return 'La sesión finalizó. Ingrese nuevamente para consultar protocolos.';
    if (status === 403) return 'Su usuario no tiene permiso para consultar protocolos.';
    if (status === 404) return 'El protocolo solicitado ya no está disponible. Actualice el catálogo.';
    return failure?.error?.error || failure?.error?.message || failure?.message || fallback;
  }

  private cancelDetailRequest(clear: boolean): void {
    const request: DetailRequest = {
      source: this.source(),
      id: '',
      sequence: ++this.detailSequence,
      force: false
    };
    this.detailLoading.set(false);
    if (clear) {
      this.schemeId.set('');
      this.drugIndex.set(null);
      this.detail.set(null);
      this.detailError.set('');
    }
    this.detailRequests.next(request);
  }
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
}
