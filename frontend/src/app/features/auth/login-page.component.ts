import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss'
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly username = new FormControl('', { nonNullable: true });
  readonly password = new FormControl('', { nonNullable: true });
  readonly submitting = signal(false);
  readonly error = signal('');

  submit(): void {
    if (!this.username.value.trim() || !this.password.value) {
      this.error.set('Ingrese usuario y contraseña.');
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    this.auth.login({ username: this.username.value.trim(), password: this.password.value }).subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: (response: { error?: { error?: string } }) => {
        this.error.set(response?.error?.error || 'No se pudo iniciar la sesión.');
        this.submitting.set(false);
      },
      complete: () => this.submitting.set(false)
    });
  }
}
