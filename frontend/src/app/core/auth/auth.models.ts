export interface AuthenticatedUser {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
  specialty?: string;
  roles: string[];
  permissions: string[];
}

export interface AuthSession {
  ok: boolean;
  authenticated: boolean;
  loginRequired: boolean;
  activePatientId: string | null;
  user?: AuthenticatedUser;
}

export interface LoginRequest {
  username: string;
  password: string;
}
