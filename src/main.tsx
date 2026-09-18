import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { setLocale } from "./i18n";
import { detectLang, initYandexSdk } from "./yandex";

// REQ 1.6.2.7: Блокировка контекстного меню браузера по всей игре (ПКМ на десктопе, лонгтап на тач-устройствах)
if (typeof window !== "undefined") {
  window.addEventListener("contextmenu", (e) => e.preventDefault(), { capture: true });
  // REQ 1.10.2: Предотвращение скролла и pull-to-refresh жестов
  window.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
    },
    { passive: false }
  );
}

// REQ 2.14 & REQ 1.19: Interactivity gated until SDK & language initialization
// Sequence: detectLang() -> applyLang() -> mount App (board & input) -> ready()
async function bootstrap() {
  await initYandexSdk();
  const lang = detectLang();
  setLocale(lang);

  const container = document.getElementById("root");
  if (container) {
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  }
}

void bootstrap();
