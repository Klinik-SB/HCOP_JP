import { Injectable, signal } from '@angular/core';

export interface ClinicalHighlight {
  terms: string[];
  color?: string;
}

export interface ClinicalFocusRequest {
  id: number;
  date?: string;
  text?: string;
  highlights: ClinicalHighlight[];
}

@Injectable({ providedIn: 'root' })
export class ClinicalFocusService {
  private sequence = 0;
  readonly request = signal<ClinicalFocusRequest>({ id: 0, highlights: [] });

  focus(value: { date?: string; text?: string; highlights?: ClinicalHighlight[] }): void {
    const highlights = value.highlights === undefined ? this.request().highlights : value.highlights;
    this.request.set({ id: ++this.sequence, date: value.date, text: value.text, highlights });
  }

  highlight(highlights: ClinicalHighlight[]): void {
    this.focus({ highlights });
  }

  clear(): void {
    this.focus({ highlights: [] });
  }
}
