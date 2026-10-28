import { createRoot } from "react-dom/client";
import { Login } from "../components/login";
// GitHub Pages cannot execute server authentication. It only serves the closed entry screen.
createRoot(document.getElementById("root")!).render(
  <Login configured={false} />,
);
