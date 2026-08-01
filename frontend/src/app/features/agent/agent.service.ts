import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AgentChatRequest, AgentChatResponse, AgentStatus } from './agent.models';

@Injectable({ providedIn: 'root' })
export class AgentService {
  private readonly http = inject(HttpClient);

  status(): Observable<AgentStatus> {
    return this.http.get<AgentStatus>('/api/llm/status', { withCredentials: true });
  }

  chat(request: AgentChatRequest): Observable<AgentChatResponse> {
    return this.http.post<AgentChatResponse>('/api/agent/chat', request, { withCredentials: true });
  }
}
