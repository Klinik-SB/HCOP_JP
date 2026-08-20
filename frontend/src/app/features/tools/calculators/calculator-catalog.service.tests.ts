import '@angular/compiler';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  Injector,
  runInInjectionContext,
  signal,
  ɵChangeDetectionScheduler,
  ɵEffectScheduler,
  ɵINJECTOR_SCOPE
} from '@angular/core';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import type { AuthSession } from '../../../core/auth/auth.models';
import { CalculatorCatalogService } from './calculator-catalog.service';
import { InstitutionalCatalogValidationError } from './institutional-calculator-catalog.validator';

interface TestCase {
  readonly name: string;
  readonly run: () => Promise<void>;
}

const tests: TestCase[] = [];
let assertions = 0;

function test(name: string, run: () => Promise<void>): void {
  tests.push({ name, run });
}

function equal(actual: unknown, expected: unknown, message = ''): void {
  assertions += 1;
  if (!Object.is(actual, expected)) {
    throw new Error(`${message ? `${message}: ` : ''}esperado ${String(expected)}, recibido ${String(actual)}.`);
  }
}

function truthy(value: unknown, message: string): asserts value {
  assertions += 1;
  if (!value) throw new Error(message);
}

class FakeHttpClient {
  readonly requests: Array<{ readonly url: string; readonly withCredentials: boolean; readonly response: Subject<unknown> }> = [];

  get<T>(url: string, options: { readonly withCredentials?: boolean } = {}): Observable<T> {
    const response = new Subject<unknown>();
    this.requests.push({ url, withCredentials: options.withCredentials === true, response });
    return response.asObservable() as Observable<T>;
  }

  response(index: number): Subject<unknown> {
    const request = this.requests[index];
    if (!request) throw new Error(`No existe la solicitud HTTP ${index}.`);
    return request.response;
  }
}

class FakeAuthService {
  readonly session = signal<AuthSession | null>(authenticatedSession());
}

interface ServiceHarness {
  readonly service: CalculatorCatalogService;
  readonly auth: FakeAuthService;
  readonly effectScheduler: ɵEffectScheduler;
}

function serviceWith(http: FakeHttpClient, auth = new FakeAuthService()): ServiceHarness {
  const injector = Injector.create({ providers: [
    { provide: ɵINJECTOR_SCOPE, useValue: 'root' },
    { provide: ɵChangeDetectionScheduler, useValue: { notify(): void {} } },
    { provide: HttpClient, useValue: http },
    { provide: AuthService, useValue: auth }
  ] });
  const service = runInInjectionContext(injector, () => new CalculatorCatalogService());
  const effectScheduler = injector.get(ɵEffectScheduler);
  effectScheduler.flush();
  return { service, auth, effectScheduler };
}

function authenticatedSession(
  id = 'user-1',
  permissions: readonly string[] = ['section.tools.use'],
  roles: readonly string[] = ['oncologo']
): AuthSession {
  return {
    ok: true,
    authenticated: true,
    loginRequired: false,
    activePatientId: null,
    user: { id, username: id, roles: [...roles], permissions: [...permissions] }
  };
}

function validPayload(id = '17'): Record<string, unknown> {
  return {
    ok: true,
    calculators: [{
      id,
      key: `calculator:formula-${id}`,
      name: `Fórmula ${id}`,
      description: 'Definición institucional',
      revision: 1,
      definition: {
        mode: 'formula',
        fields: [{ key: 'peso', label: 'Peso', type: 'number', min: 1, max: 300, step: 0.1 }],
        expression: 'peso * 2'
      }
    }],
    settings: {},
    total: 1
  };
}

async function rejectionOf<T>(stream: Observable<T>): Promise<unknown> {
  try {
    await firstValueFrom(stream);
  } catch (failure) {
    return failure;
  }
  throw new Error('Se esperaba que el observable terminara con error.');
}

test('cachea sólo un catálogo íntegro y conserva invalidate/reload/retry', async () => {
  const http = new FakeHttpClient();
  const { service } = serviceWith(http);
  let invalidations = 0;
  const invalidated = service.invalidated$.subscribe(() => { invalidations += 1; });

  const first = service.load();
  const same = service.load();
  equal(first, same);
  equal(http.requests.length, 1);
  equal(http.requests[0]?.url, '/api/clinical/tools/calculators');
  equal(http.requests[0]?.withCredentials, true);
  const firstResult = firstValueFrom(first);
  http.response(0).next(validPayload());
  http.response(0).complete();
  equal((await firstResult).calculators.length, 1);
  equal(await firstValueFrom(service.load()), await firstValueFrom(first));
  equal(http.requests.length, 1);

  service.invalidate();
  equal(invalidations, 1);
  const afterInvalidate = firstValueFrom(service.load());
  equal(http.requests.length, 2);
  http.response(1).next(validPayload('18'));
  http.response(1).complete();
  equal((await afterInvalidate).calculators[0]?.id, '18');

  const reloaded = firstValueFrom(service.reload());
  equal(http.requests.length, 3);
  http.response(2).next(validPayload('19'));
  http.response(2).complete();
  equal((await reloaded).calculators[0]?.id, '19');

  const retried = firstValueFrom(service.retry());
  equal(http.requests.length, 4);
  http.response(3).next(validPayload('20'));
  http.response(3).complete();
  equal((await retried).calculators[0]?.id, '20');

  invalidated.unsubscribe();
  service.ngOnDestroy();
});

test('rechaza atómicamente cualquier fila inválida y limpia el cache fallido', async () => {
  const http = new FakeHttpClient();
  const { service } = serviceWith(http);
  const failed = rejectionOf(service.load());
  const payload = validPayload();
  payload['calculators'] = [
    ...(payload['calculators'] as readonly unknown[]),
    { id: '', key: 'rota', name: '', revision: 0, definition: {} }
  ];
  payload['total'] = 2;
  http.response(0).next(payload);
  http.response(0).complete();

  const failure = await failed;
  truthy(failure instanceof InstitutionalCatalogValidationError, 'El catálogo parcial no produjo el error tipado esperado.');
  truthy(failure.issues.length > 0, 'El error tipado no conserva sus incidencias de validación.');

  const recovered = firstValueFrom(service.load());
  equal(http.requests.length, 2);
  http.response(1).next(validPayload('18'));
  http.response(1).complete();
  equal((await recovered).calculators[0]?.id, '18');
  service.ngOnDestroy();
});

test('mantiene 403 y errores HTTP como errores y permite reintentar', async () => {
  const http = new FakeHttpClient();
  const { service } = serviceWith(http);
  const forbidden = rejectionOf(service.load());
  http.response(0).error(new HttpErrorResponse({
    status: 403,
    statusText: 'Forbidden',
    url: '/api/clinical/tools/calculators',
    error: { code: 'CALCULATOR_CATALOG_FORBIDDEN', message: 'Acceso denegado por rol.' }
  }));

  const failure = await forbidden as { readonly status?: unknown; readonly code?: unknown; readonly message?: unknown };
  equal(failure.status, 403);
  equal(failure.code, 'CALCULATOR_CATALOG_FORBIDDEN');
  equal(failure.message, 'Acceso denegado por rol.');

  const retried = firstValueFrom(service.retry());
  equal(http.requests.length, 2);
  http.response(1).next(validPayload());
  http.response(1).complete();
  equal((await retried).ok, true);
  service.ngOnDestroy();
});

test('rechaza ok=false y payloads arbitrarios sin sintetizar catálogo vacío', async () => {
  const http = new FakeHttpClient();
  const { service } = serviceWith(http);

  const notOk = rejectionOf(service.load());
  http.response(0).next({ ...validPayload(), ok: false });
  http.response(0).complete();
  truthy(await notOk instanceof InstitutionalCatalogValidationError, 'ok=false no falló de forma cerrada.');

  const arbitrary = rejectionOf(service.reload());
  http.response(1).next('respuesta inválida');
  http.response(1).complete();
  truthy(await arbitrary instanceof InstitutionalCatalogValidationError, 'El payload arbitrario no fue rechazado.');
  service.ngOnDestroy();
});

test('ignora el evento global y sólo invalida ante configuración específica de calculadoras', async () => {
  const eventTarget = new EventTarget();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: eventTarget });
  try {
    const http = new FakeHttpClient();
    const { service } = serviceWith(http);
    let invalidations = 0;
    const subscription = service.invalidated$.subscribe(() => { invalidations += 1; });

    eventTarget.dispatchEvent(new Event('hcop-configuration-updated'));
    eventTarget.dispatchEvent(storageEvent('hcop-configuration-updated'));
    equal(invalidations, 0);

    eventTarget.dispatchEvent(new Event('hcop-calculator-configuration-updated'));
    eventTarget.dispatchEvent(storageEvent('hcop-calculator-configuration-updated'));
    equal(invalidations, 2);

    service.ngOnDestroy();
    eventTarget.dispatchEvent(new Event('hcop-calculator-configuration-updated'));
    equal(invalidations, 2);
    subscription.unsubscribe();
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('vincula el cache a usuario, autenticación, roles y permisos', async () => {
  const http = new FakeHttpClient();
  const { service, auth, effectScheduler } = serviceWith(http);
  let invalidations = 0;
  const subscription = service.invalidated$.subscribe(() => { invalidations += 1; });

  const first = firstValueFrom(service.load());
  http.response(0).next(validPayload());
  http.response(0).complete();
  await first;

  auth.session.set(authenticatedSession('user-1', ['section.tools.use'], ['oncologo']));
  effectScheduler.flush();
  equal(invalidations, 0);
  equal(http.requests.length, 1);

  auth.session.set(authenticatedSession('user-2'));
  service.load();
  equal(http.requests.length, 2);
  effectScheduler.flush();
  equal(invalidations, 0);

  auth.session.set(authenticatedSession('user-2', ['section.tools.use', 'section.tools.view']));
  effectScheduler.flush();
  equal(invalidations, 1);

  auth.session.set(authenticatedSession('user-2', ['section.tools.use', 'section.tools.view'], ['administrador']));
  effectScheduler.flush();
  equal(invalidations, 2);

  auth.session.set(null);
  effectScheduler.flush();
  equal(invalidations, 3);

  subscription.unsubscribe();
  service.ngOnDestroy();
});

function storageEvent(key: string): Event {
  const event = new Event('storage');
  Object.defineProperty(event, 'key', { value: key });
  return event;
}

async function run(): Promise<void> {
  const failures: string[] = [];
  for (const entry of tests) {
    try {
      await entry.run();
    } catch (failure) {
      failures.push(`${entry.name}: ${failure instanceof Error ? failure.stack || failure.message : String(failure)}`);
    }
  }
  if (failures.length) throw new Error(`Fallaron ${failures.length}/${tests.length} pruebas:\n${failures.join('\n')}`);
  console.log(`OK · ${tests.length} pruebas · ${assertions} aserciones del servicio fail-closed`);
}

void run().catch((failure) => {
  queueMicrotask(() => { throw failure; });
});
