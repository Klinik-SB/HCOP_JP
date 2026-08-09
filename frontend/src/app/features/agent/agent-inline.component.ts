import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { agentInlineTokens } from './agent-presentation';

@Component({
  selector: 'app-agent-inline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (token of tokens(); track $index) {
      @switch (token.kind) {
        @case ('strong') { <strong>{{ token.text }}</strong> }
        @case ('emphasis') { <em>{{ token.text }}</em> }
        @case ('code') { <code>{{ token.text }}</code> }
        @default { {{ token.text }} }
      }
    }
  `,
  styles: `
    :host { display: inline; }
    code {
      border: 1px solid #d9e3e7;
      border-radius: 3px;
      background: #f3f7f9;
      padding: 1px 4px;
      color: #274f67;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: .94em;
    }
  `
})
export class AgentInlineComponent {
  readonly text = input.required<string>();
  readonly tokens = computed(() => agentInlineTokens(this.text()));
}
