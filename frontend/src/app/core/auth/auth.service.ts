import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AuthSession, LoginRequest } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly session = signal<AuthSession | null>(null);

  load(): Observable<AuthSession> {
    return this.http.get<AuthSession>('/api/auth/me', { withCredentials: true }).pipe(
      tap((session) => this.session.set(session))
    );
  }

  login(request: LoginRequest): Observable<AuthSession> {
    return this.http.post<AuthSession>('/api/auth/login', request, { withCredentials: true }).pipe(
      tap((session) => this.session.set(session))
    );
  }

  logout(): Observable<AuthSession> {
    return this.http.post<AuthSession>('/api/auth/logout', {}, { withCredentials: true }).pipe(
      tap((session) => this.session.set(session))
    );
  }

  hasPermission(permission: string): boolean {
    return Boolean(this.session()?.user?.permissions?.includes(permission));
  }
}
