import { createRoot } from "react-dom/client";
import { Portal } from "../components/portal";
const routes = {
  "/": "home",
  "/vision": "vision",
  "/plans": "plans",
  "/daily": "daily",
  "/shifts": "shifts",
  "/garbage": "garbage",
  "/self-evaluation": "self-evaluation",
  "/library": "library",
  "/settings": "settings",
} as const;
const root = createRoot(document.getElementById("root")!);
function render() {
  const path = window.location.hash.slice(1) || window.location.pathname;
  if (path && !path.startsWith("/")) return;
  const view = routes[path as keyof typeof routes] ?? "home";
  root.render(<Portal key={view} view={view} />);
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", render);
window.addEventListener("popstate", render);
render();
