// A React app streaming an answer that uses an app-defined component
// (ProductCard) and a live map. Built by sdk/web/example/test.mjs.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadCore, type Action, type Pack } from "../dist/index.js";
import { Answer, type CustomProps } from "../dist/react.js";

const shop: Pack = {
  name: "shop",
  version: "1.0.0",
  components: {
    ProductCard: {
      about: "a product with its price",
      attrs: { name: { type: "string", required: true }, price: { type: "string", required: true } },
      content: "none",
    },
  },
};

function ProductCard({ attrs }: CustomProps) {
  return (
    <div className="product">
      <strong>{String(attrs.name)}</strong> <span>{String(attrs.price)}</span>
    </div>
  );
}

const answer = `# Weekend picks

<ProductCard name="Kettle" price="$40" />

Two shops nearby. <Badge tone="success">Open now</Badge>

<Map title="Shops">
| Shop | Lat | Lng |
|---|---|---|
| Corner Store | 38.7139 | -9.1394 |
| Market Hall | 38.7071 | -9.1453 |
</Map>

<Button ask="Show more picks">More</Button>
`;

const core = await loadCore("/dist/morphscreen.wasm");
(window as any).actions = [] as Action[];

function App() {
  const [text, setText] = useState("");
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i += 12;
      setText(answer.slice(0, i));
      if (i >= answer.length) clearInterval(t);
    }, 15);
    return () => clearInterval(t);
  }, []);
  return (
    <Answer
      core={core}
      text={text}
      done={text.length >= answer.length}
      packs={["device"]}
      custom={[shop]}
      components={{ ProductCard }}
      maplibre={() => import("maplibre-gl")}
      // Any {z}/{x}/{y} tile server with its credit; or the app's own key for Google, Stadia, MapTiler or Thunderforest.
      maps={{ provider: "tiles", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", credit: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' }}
      onAction={(a) => (window as any).actions.push(a)}
    />
  );
}

createRoot(document.getElementById("app")!).render(<App />);
