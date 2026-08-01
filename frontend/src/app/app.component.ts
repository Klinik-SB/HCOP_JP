import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LegacyVisualContractService } from './core/visual/legacy-visual-contract.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />'
})
export class AppComponent implements OnInit {
  private readonly visualContract = inject(LegacyVisualContractService);
  ngOnInit(): void { this.visualContract.load(); }
}
