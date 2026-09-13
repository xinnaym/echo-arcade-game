import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { setLocale, localeFromUrl } from "./i18n";
import { getLanguage, initYandexSdk, reportLoadingReady } from "./yandex";

async function bootstrap() {
  // Ждём инициализации SDK (или тихого оффлайн-таймаута) ДО первого рендера,
  // чтобы язык интерфейса сразу был верным, а не мигал рус->eng.
  await initYandexSdk();
  // ?lang= в URL — форсирует язык (работает в дебаге Яндекса и локально,
  // где иначе язык не выбрать никак); без параметра — ysdk.environment.i18n.lang.
  setLocale(localeFromUrl() ?? getLanguage());

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  // ready() — только после реальной отрисовки интерфейса (двойной rAF внутри)
  reportLoadingReady();
}

void bootstrap();
