import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';

type RightPane = 'studies' | 'care' | 'prescription' | 'agent' | 'research' | 'timeline' | 'protocols' | 'tools';

@Component({
  selector: 'app-clinical-shell',
  templateUrl: './clinical-shell.component.html',
  styleUrl: './clinical-shell.component.scss'
})
export class ClinicalShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly selectedPane = signal<RightPane>('studies');
  readonly searchExpanded = signal(false);

  ngOnInit(): void {
    this.auth.load().subscribe({ error: () => this.auth.session.set({ ok: false, authenticated: false, loginRequired: true, activePatientId: null }) });
  }

  selectPane(pane: RightPane): void { this.selectedPane.set(pane); }
  openLogin(): void { this.router.navigateByUrl('/login'); }
  logout(): void { this.auth.logout().subscribe({ next: () => this.router.navigateByUrl('/login') }); }
  print(): void { window.print(); }
  legacyFallback(): void { window.location.assign('/'); }
  initial(): string { return (this.auth.session()?.user?.displayName || this.auth.session()?.user?.username || 'U').slice(0, 1).toUpperCase(); }
}
