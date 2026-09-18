import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { setLocale, localeFromUrl } from "./i18n";
import { getLanguage, initYandexSdk, reportLoadingReady } from "./yandex";

// Блокировка контекстного меню браузера по всей игре (ПКМ на десктопе, лонгтап на тач-устройствах)
if (typeof window !== "undefined") {
  window.addEventListener("contextmenu", (e) => e.preventDefault(), { capture: true });
}

// ?lang= в URL — форсирует язык (работает в дебаге Яндекса и локально, где
// иначе язык не выбрать никак). Без параметра — дефолт разработки, пока SDK
// не ответит; на платформе почти всегда успевает до первого осмысленного
// взаимодействия, а не блокирует сам рендер (см. ниже).
const urlLang = localeFromUrl();
setLocale(urlLang);

// Рендерим СРАЗУ, не дожидаясь SDK — раньше bootstrap блокировал первый
// рендер на initYandexSdk(), а локально (без платформы) ожидание падало на
// полный таймаут в 8с из-за гонки: 'error' у тега sdk.js мог сработать
// раньше, чем наш код успевал на него подписаться. Экран не должен несколько
// секунд простаивать пустым из-за деталей загрузки стороннего скрипта.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// SDK и язык платформы подтягиваются в фоне; если язык не был форсирован
// через URL и отличается от дефолта — переключаем (i18n сам оповестит
// подписанные компоненты через onLocaleChange, см. App.tsx).
void (async () => {
  await initYandexSdk();
  if (!urlLang) setLocale(getLanguage());
  reportLoadingReady(); // после первой реальной отрисовки (двойной rAF внутри)
})();
