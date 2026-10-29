import { AfterViewInit, Component, ElementRef, viewChild } from "@angular/core";
import { createAnswer, loadCore } from "@morphscreen/web";
import { SAMPLE } from "../sample";

@Component({
  selector: "app-root",
  template: `<div #answer></div>`,
})
export class App implements AfterViewInit {
  readonly answerEl = viewChild.required<ElementRef<HTMLElement>>("answer");

  async ngAfterViewInit() {
    const core = await loadCore("/morphscreen.wasm");
    const answer = createAnswer(this.answerEl().nativeElement, { core });
    // Your server's stream goes here; this feeds a saved answer in pieces.
    for (let i = 0; i < SAMPLE.length; i += 24) {
      answer.push(SAMPLE.slice(i, i + 24));
      await new Promise((r) => setTimeout(r, 10));
    }
    answer.end();
  }
}
