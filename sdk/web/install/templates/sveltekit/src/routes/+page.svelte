<script lang="ts">
  import { onMount } from "svelte";
  import { createAnswer, loadCore } from "@morphscreen/web";
  import "@morphscreen/web/morphscreen.css";
  import wasm from "@morphscreen/web/morphscreen.wasm?url";
  import { SAMPLE } from "../lib/sample";

  let el: HTMLElement;

  // onMount runs in the browser only, so the core never loads on the server.
  onMount(async () => {
    const core = await loadCore(wasm);
    const answer = createAnswer(el, { core });
    // Your server's stream goes here; this feeds a saved answer in pieces.
    for (let i = 0; i < SAMPLE.length; i += 24) {
      answer.push(SAMPLE.slice(i, i + 24));
      await new Promise((r) => setTimeout(r, 10));
    }
    answer.end();
  });
</script>

<div bind:this={el}></div>
