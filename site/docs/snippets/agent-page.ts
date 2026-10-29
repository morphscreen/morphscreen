import { connectAgent, loadCore } from "@morphscreen/web";
import "@morphscreen/web/morphscreen.css";

// morphscreen-agent.wasm from the package, served with your page
const core = await loadCore("/morphscreen-agent.wasm");
const chat = connectAgent(document.querySelector<HTMLElement>("#chat")!, { core, url: "/api/agent" });

const form = document.querySelector("form")!;
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = form.querySelector("input")!;
  const text = input.value;
  input.value = "";
  await chat.send(text);
});
