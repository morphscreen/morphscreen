<script setup lang="ts">
import { onMounted, ref } from "vue";
import { createAnswer, loadCore } from "@morphscreen/web";
import { SAMPLE } from "../sample";

const el = ref<HTMLElement | null>(null);

onMounted(async () => {
  const core = await loadCore("/morphscreen.wasm");
  const answer = createAnswer(el.value!, { core });
  // Your server's stream goes here; this feeds a saved answer in pieces.
  for (let i = 0; i < SAMPLE.length; i += 24) {
    answer.push(SAMPLE.slice(i, i + 24));
    await new Promise((r) => setTimeout(r, 10));
  }
  answer.end();
});
</script>

<template>
  <div ref="el" />
</template>
