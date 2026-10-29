// The docs' tabs, their groups and pages, in sidebar order. A page's Markdown
// is site/docs/content/<path after /docs/>.md; the Components and HTTP API
// pages are generated (components.mjs, reference.mjs).

const PACKS = ["core", "data", "commerce", "device", "docs", "inputs", "interactive", "media", "scheduling"];
const NAMES = { core: "Core", data: "Data", commerce: "Commerce", device: "Device", docs: "Docs", inputs: "Inputs", interactive: "Interactive", media: "Media", scheduling: "Scheduling" };

export const NAV = [
  {
    name: "Docs",
    groups: [
      {
        title: "Get started",
        pages: [
          { path: "/docs", title: "Introduction" },
          { path: "/docs/quickstart", title: "Quick start" },
          { path: "/docs/comparison", title: "MorphScreen vs others" },
          { path: "/docs/coding-agents", title: "Coding agent setup" },
        ],
      },
      {
        title: "The format",
        pages: [
          { path: "/docs/format", title: "Overview" },
          { path: "/docs/format/packs", title: "Components and packs" },
          { path: "/docs/format/custom-components", title: "Your own components" },
          { path: "/docs/format/system-prompt", title: "The system prompt" },
          { path: "/docs/format/validation", title: "Validation and repair" },
          { path: "/docs/format/actions", title: "Actions and state" },
          { path: "/docs/format/media", title: "Pictures, icons and maps" },
          { path: "/docs/format/theming", title: "Theming" },
          { path: "/docs/format/streaming", title: "How streaming works" },
        ],
      },
      {
        title: "Build agents",
        pages: [
          { path: "/docs/agents", title: "Overview" },
          { path: "/docs/agents/ag-ui", title: "AG-UI agents" },
          { path: "/docs/agents/langgraph", title: "LangGraph" },
          { path: "/docs/agents/openai-compatible", title: "OpenAI-compatible clients" },
        ],
      },
      {
        title: "Production",
        pages: [
          { path: "/docs/production", title: "Overview" },
          { path: "/docs/production/limits", title: "Limits and errors" },
          { path: "/docs/production/security", title: "Security" },
          { path: "/docs/production/dashboard", title: "The dashboard" },
          { path: "/docs/production/troubleshooting", title: "Troubleshooting" },
        ],
      },
    ],
  },
  {
    name: "Integrations",
    groups: [
      {
        title: "In the browser",
        pages: [
          { path: "/docs/integrations", title: "Overview" },
          { path: "/docs/integrations/react", title: "React" },
          { path: "/docs/integrations/nextjs", title: "Next.js" },
          { path: "/docs/integrations/vue", title: "Vue and Nuxt" },
          { path: "/docs/integrations/svelte", title: "Svelte and SvelteKit" },
          { path: "/docs/integrations/angular", title: "Angular" },
          { path: "/docs/integrations/vanilla", title: "Plain JavaScript" },
          { path: "/docs/integrations/webpack", title: "webpack" },
        ],
      },
      {
        title: "On your server",
        pages: [
          { path: "/docs/integrations/node", title: "Node.js" },
          { path: "/docs/integrations/python", title: "Python" },
          { path: "/docs/integrations/html", title: "HTML without JavaScript" },
        ],
      },
    ],
  },
  {
    name: "Components",
    groups: [
      { title: "Components", pages: [{ path: "/docs/components", title: "All components" }] },
      { title: "Packs", pages: PACKS.map((p) => ({ path: `/docs/components/${p}`, title: NAMES[p] })) },
    ],
  },
  {
    name: "API reference",
    groups: [
      {
        title: "HTTP API",
        pages: [
          { path: "/docs/reference/api", title: "Overview" },
          { path: "/docs/reference/api/chat-completions", title: "POST /v1/chat/completions" },
          { path: "/docs/reference/api/ui", title: "POST /v1/ui" },
          { path: "/docs/reference/api/render", title: "POST /v1/render" },
          { path: "/docs/reference/api/prompt", title: "POST /v1/prompt" },
          { path: "/docs/reference/api/health", title: "GET /v1/health" },
        ],
      },
      {
        title: "Web SDK",
        pages: [
          { path: "/docs/reference/web", title: "@morphscreen/web" },
          { path: "/docs/reference/react", title: "@morphscreen/web/react" },
          { path: "/docs/reference/agent", title: "connectAgent" },
          { path: "/docs/reference/theme", title: "@morphscreen/web/theme" },
        ],
      },
      {
        title: "Protocol",
        pages: [
          { path: "/docs/reference/ops", title: "The op stream" },
          { path: "/docs/reference/specification", title: "Format specification" },
          { path: "/docs/reference/versioning", title: "Versions and deprecation" },
        ],
      },
    ],
  },
];

export { NAMES as PACK_NAMES, PACKS };
