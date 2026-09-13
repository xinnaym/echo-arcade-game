// Обёртка над Yandex Games SDK.
// Все пункты чек-листа раздел 1/3/4/5 сведены сюда, чтобы остальной код
// не разбирался с деталями SDK и мог тихо работать в оффлайн-режиме,
// если игра запущена не на платформе (sdk.js не подключился).

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YaGames?: { init: () => Promise<any> };
  }
}

const SDK_WAIT_TIMEOUT_MS = 8000;
const SDK_POLL_INTERVAL_MS = 50;

let ysdk: any | null = null;
let initPromise: Promise<any | null> | null = null;

// ждём реальной загрузки sdk.js (async-тег), а не разового чтения window.YaGames.
// Слушаем 'error' самого тега, чтобы локальная разработка без платформы
// (sdk.js недоступен, 404) не висела на полном таймауте, а поллинг остаётся
// фолбэком на случай, если тег отсутствует или событие не долетело.
function waitForSdkScript(): Promise<boolean> {
  if (window.YaGames) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
    };

    const script = document.querySelector<HTMLScriptElement>('script[src="/sdk.js"]');
    script?.addEventListener("error", () => finish(false), { once: true });

    const start = performance.now();
    const tick = () => {
      if (done) return;
      if (window.YaGames) return finish(true);
      if (performance.now() - start > SDK_WAIT_TIMEOUT_MS) return finish(false);
      window.setTimeout(tick, SDK_POLL_INTERVAL_MS);
    };
    tick();
  });
}

export async function initYandexSdk(): Promise<any | null> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const present = await waitForSdkScript();
    if (!present) return null; // локальная разработка / SDK недоступен — тихий оффлайн-режим
    try {
      ysdk = await window.YaGames!.init();
      return ysdk;
    } catch {
      return null;
    }
  })();
  return initPromise;
}

export function getYsdk() {
  return ysdk;
}

// LoadingAPI.ready() — только когда интерфейс реально отрисован (двойной rAF
// гарантирует минимум один прошедший paint) и после того, как SDK готов.
export function reportLoadingReady() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        ysdk?.features?.LoadingAPI?.ready?.();
      } catch {
        /* ignore */
      }
    });
  });
}

export function getLanguage(): string | null {
  try {
    return ysdk?.environment?.i18n?.lang ?? null;
  } catch {
    return null;
  }
}

// GameplayAPI — синхронно со сменой фазы игры (playing => start, иначе stop)
export function gameplayStart() {
  try {
    ysdk?.features?.GameplayAPI?.start?.();
  } catch {
    /* ignore */
  }
}
export function gameplayStop() {
  try {
    ysdk?.features?.GameplayAPI?.stop?.();
  } catch {
    /* ignore */
  }
}

// ——— облачные сохранения ———

export interface CloudSave {
  best: number;
}

let playerPromise: Promise<any | null> | null = null;

async function getPlayer(): Promise<any | null> {
  if (!ysdk) return null;
  if (playerPromise) return playerPromise;
  playerPromise = (async () => {
    try {
      const player = await ysdk.getPlayer({ scopes: false });
      if (player.getMode() === "lite") return null; // гость — нет доступа к облаку
      return player;
    } catch {
      return null;
    }
  })();
  return playerPromise;
}

// Читает и облако, и локальный кэш, берёт максимум. Если не авторизован
// или SDK недоступен — тихий fallback на переданное локальное значение.
export async function loadBestScore(localBest: number): Promise<number> {
  const player = await getPlayer();
  if (!player) return localBest;
  try {
    const data = (await player.getData(["best"])) as Partial<CloudSave>;
    const cloudBest = Number(data?.best ?? 0) || 0;
    return Math.max(cloudBest, localBest);
  } catch {
    return localBest;
  }
}

// Пишем в облако, если доступно, и ВСЕГДА в localStorage (делает вызывающий
// код) — здесь только попытка облака, без блокировки геймплея при ошибке.
export async function saveBestScore(best: number): Promise<void> {
  const player = await getPlayer();
  if (!player) return;
  try {
    await player.setData({ best }, true);
  } catch {
    /* локальный кэш уже сохранён вызывающим кодом — не блокируем игру */
  }
}

// ——— лидерборды ———
// Техническое имя ДОЛЖНО дословно совпадать с именем в консоли Яндекс Игр.
// Подчёркивания в имени лидерборда запрещены платформой — camelCase.
const LEADERBOARD_NAME = "echoLeaderboard";

export async function submitLeaderboardScore(best: number): Promise<void> {
  if (!ysdk) return;
  const player = await getPlayer();
  if (!player) return; // лидерборд недоступен гостям
  try {
    const lb = await ysdk.getLeaderboards();
    await lb.setLeaderboardScore(LEADERBOARD_NAME, best);
  } catch {
    /* ignore */
  }
}

// Оповещение о новом рекорде — Leaderboard.tsx перечитывает данные сразу
// после проигрыша, без необходимости перезагружать страницу.
const scoreListeners = new Set<() => void>();
export function notifyScoreUpdated() {
  scoreListeners.forEach((fn) => fn());
}
export function onScoreUpdated(cb: () => void): () => void {
  scoreListeners.add(cb);
  return () => scoreListeners.delete(cb);
}

export interface LeaderboardRow {
  rank: number;
  name: string;
  score: number;
  isMe: boolean;
}

export async function fetchLeaderboard(): Promise<LeaderboardRow[] | null> {
  if (!ysdk) return null;
  try {
    const lb = await ysdk.getLeaderboards();
    const res = await lb.getLeaderboardEntries(LEADERBOARD_NAME, {
      quantityTop: 5,
      includeUser: true,
      quantityAround: 1,
    });
    const entries = (res?.entries ?? []) as any[];
    return entries.map((e) => ({
      rank: e.rank,
      name: e.player?.publicName || e.player?.uniqueID || "—",
      score: e.score,
      isMe: !!e.player?.isMe,
    }));
  } catch {
    return null;
  }
}

// ——— реклама ———
// interstitial и rewarded — разные механики: interstitial не даёт награды.

// Вызывать ПОСЛЕ остановки геймплея (GameplayAPI.stop() уже произошёл).
// По требованию — показывается после каждого проигрыша, без ограничения частоты.
export function maybeShowInterstitial(): void {
  if (!ysdk) return;
  try {
    ysdk.adv.showFullscreenAdv({
      callbacks: {
        onClose: () => {},
        onError: () => {},
      },
    });
  } catch {
    /* ignore */
  }
}

// Rewarded-анлок засчитывается ТОЛЬКО по колбэку onRewarded — не по onClose.
export function showRewardedForUnlock(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!ysdk) return resolve(false);
    let rewarded = false;
    try {
      ysdk.adv.showRewardedVideo({
        callbacks: {
          onRewarded: () => {
            rewarded = true;
          },
          onClose: () => resolve(rewarded),
          onError: () => resolve(false),
        },
      });
    } catch {
      resolve(false);
    }
  });
}
