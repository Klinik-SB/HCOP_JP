import { inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

export const authenticatedGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const redirect = () => router.createUrlTree(['/login'], {
    queryParams: state.url && state.url !== '/' ? { returnUrl: state.url } : undefined
  });
  return auth.load().pipe(
    map((session) => session.authenticated ? true : redirect()),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) auth.expireSession();
      return of(redirect());
    })
  );
};
