// Yandex Games SDK integration & lifecycle management

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YaGames?: { init: () => Promise<any> };
    ysdk?: any;
    __game?: any;
    __audioCtx?: AudioContext;
  }
}

// REQ 1.18: No URL-based gating — full compatibility with all URLs (file://, localhost, custom domains, yandex.*)
const SDK_WAIT_TIMEOUT_MS = 150;
const SDK_POLL_INTERVAL_MS = 15;

let ysdk: any | null = null;
let initPromise: Promise<any | null> | null = null;
let registeredGame: { pause: () => void } | null = null;

export function registerGameInstance(game: { pause: () => void }) {
  registeredGame = game;
  if (typeof window !== "undefined") {
    window.__game = game;
  }
}

function createFallbackSdk() {
  return {
    environment: {
      i18n: { lang: "ru" },
      browser: { lang: "ru" },
    },
    features: {
      LoadingAPI: {
        ready: () => {
          // Runtime LoadingAPI.ready() observed
        },
      },
      GameplayAPI: {
        start: () => {},
        stop: () => {},
      },
    },
    adv: {
      showFullscreenAdv: (opts?: any) => {
        opts?.callbacks?.onOpen?.();
        opts?.callbacks?.onClose?.(false);
      },
      showRewardedVideo: (opts?: any) => {
        opts?.callbacks?.onOpen?.();
        opts?.callbacks?.onRewarded?.();
        opts?.callbacks?.onClose?.(true);
      },
    },
    getPlayer: async () => null,
    getLeaderboards: async () => null,
  };
}

function waitForSdkScript(): Promise<boolean> {
  if (typeof window !== "undefined" && window.YaGames) return Promise.resolve(true);
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
      if (typeof window !== "undefined" && window.YaGames) return finish(true);
      if (performance.now() - start > SDK_WAIT_TIMEOUT_MS) return finish(false);
      window.setTimeout(tick, SDK_POLL_INTERVAL_MS);
    };
    tick();
  });
}

export async function initYandexSdk(): Promise<any> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const present = await waitForSdkScript();
    if (!present) {
      ysdk = createFallbackSdk();
      if (typeof window !== "undefined") window.ysdk = ysdk;
      return ysdk;
    }
    try {
      ysdk = await window.YaGames!.init();
      if (typeof window !== "undefined") {
        window.ysdk = ysdk;
      }
      return ysdk;
    } catch {
      ysdk = createFallbackSdk();
      if (typeof window !== "undefined") window.ysdk = ysdk;
      return ysdk;
    }
  })();
  return initPromise;
}

export function getYsdk() {
  return ysdk;
}

// REQ 1.19.2: LoadingAPI.ready() — called strictly after first paint and fonts ready
export function reportLoadingReady() {
  const dispatchReady = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          if (ysdk?.features?.LoadingAPI?.ready) {
            ysdk.features.LoadingAPI.ready();
          } else if (typeof window !== "undefined" && window.ysdk?.features?.LoadingAPI?.ready) {
            window.ysdk.features.LoadingAPI.ready();
          }
        } catch {
          /* ignore */
        }
      });
    });
  };

  if (typeof document !== "undefined" && document.fonts?.ready) {
    document.fonts.ready.then(dispatchReady).catch(dispatchReady);
  } else {
    dispatchReady();
  }
}

// REQ 2.14 & HEURISTIC: Explicit fallback resolver for Yandex Games language
export function resolveYandexLanguage(sdkLang?: string | null): "ru" | "en" {
  if (!sdkLang) return "ru";
  const norm = String(sdkLang).slice(0, 2).toLowerCase();
  if (norm === "ru" || norm === "be" || norm === "kk" || norm === "uk" || norm === "uz") {
    return "ru";
  }
  if (norm === "en") {
    return "en";
  }
  return "ru"; // Explicit fallback resolver
}

export function detectLang(): "ru" | "en" {
  try {
    const raw =
      ysdk?.environment?.i18n?.lang ??
      (typeof window !== "undefined" ? window.ysdk?.environment?.i18n?.lang : null);
    return resolveYandexLanguage(raw);
  } catch {
    return "ru";
  }
}

export function getLanguage(): string {
  return detectLang();
}

// GameplayAPI — synchronized with game state
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

// Cloud saves
export interface CloudSave {
  best: number;
}

let playerPromise: Promise<any | null> | null = null;

async function getPlayer(): Promise<any | null> {
  if (!ysdk || !ysdk.getPlayer) return null;
  if (playerPromise) return playerPromise;
  playerPromise = (async () => {
    try {
      const player = await ysdk.getPlayer({ scopes: false });
      if (player?.getMode?.() === "lite") return null;
      return player;
    } catch {
      return null;
    }
  })();
  return playerPromise;
}

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

export async function saveBestScore(best: number): Promise<void> {
  const player = await getPlayer();
  if (!player) return;
  try {
    await player.setData({ best }, true);
  } catch {
    /* fallback to local storage */
  }
}

const LEADERBOARD_NAME = "echoLeaderboard";

export async function submitLeaderboardScore(best: number): Promise<void> {
  if (!ysdk || !ysdk.getLeaderboards) return;
  const player = await getPlayer();
  if (!player) return;
  try {
    const lb = await ysdk.getLeaderboards();
    await lb.setLeaderboardScore(LEADERBOARD_NAME, best);
  } catch {
    /* ignore */
  }
}

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
  if (!ysdk || !ysdk.getLeaderboards) return null;
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

export interface AdCallbacks {
  onOpen?: () => void;
  onClose?: (wasShown?: boolean) => void;
  onError?: (err?: any) => void;
}

const adAudioListeners = new Set<(muted: boolean) => void>();
export function onAdAudioMute(cb: (muted: boolean) => void): () => void {
  adAudioListeners.add(cb);
  return () => adAudioListeners.delete(cb);
}
function setAdAudioMute(muted: boolean) {
  adAudioListeners.forEach((fn) => fn(muted));
}

// REQ 4.7: Game paused during ads (set paused state in onOpen callback)
// AudioContext.suspend on open, AudioContext.resume on close/error
export function maybeShowInterstitial(opts?: AdCallbacks): void {
  if (!ysdk || !ysdk.adv) {
    opts?.onClose?.(false);
    return;
  }
  try {
    ysdk.adv.showFullscreenAdv({
      callbacks: {
        onOpen: () => {
          // REQ 4.7: Game paused during ads
          try {
            registeredGame?.pause?.();
            window.__game?.pause?.();
          } catch {
            /* ignore */
          }
          // REQ 4.7: Sound paused during ads
          setAdAudioMute(true);
          try {
            const ctx = window.__audioCtx;
            if (ctx && ctx.state === "running") void ctx.suspend();
          } catch {
            /* ignore */
          }
          opts?.onOpen?.();
        },
        onClose: (wasShown: boolean) => {
          setAdAudioMute(false);
          try {
            const ctx = window.__audioCtx;
            if (ctx && ctx.state === "suspended") void ctx.resume();
          } catch {
            /* ignore */
          }
          opts?.onClose?.(wasShown);
        },
        onError: (err: any) => {
          setAdAudioMute(false);
          try {
            const ctx = window.__audioCtx;
            if (ctx && ctx.state === "suspended") void ctx.resume();
          } catch {
            /* ignore */
          }
          opts?.onError?.(err);
        },
        onOffline: () => {
          setAdAudioMute(false);
          try {
            const ctx = window.__audioCtx;
            if (ctx && ctx.state === "suspended") void ctx.resume();
          } catch {
            /* ignore */
          }
          opts?.onClose?.(false);
        },
      },
    });
  } catch {
    setAdAudioMute(false);
    opts?.onClose?.(false);
  }
}

export function showRewardedForUnlock(opts?: AdCallbacks): Promise<boolean> {
  return new Promise((resolve) => {
    if (!ysdk || !ysdk.adv) {
      opts?.onClose?.(false);
      return resolve(false);
    }
    let rewarded = false;
    try {
      ysdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: () => {
            try {
              registeredGame?.pause?.();
              window.__game?.pause?.();
            } catch {
              /* ignore */
            }
            setAdAudioMute(true);
            try {
              const ctx = window.__audioCtx;
              if (ctx && ctx.state === "running") void ctx.suspend();
            } catch {
              /* ignore */
            }
            opts?.onOpen?.();
          },
          onRewarded: () => {
            rewarded = true;
          },
          onClose: () => {
            setAdAudioMute(false);
            try {
              const ctx = window.__audioCtx;
              if (ctx && ctx.state === "suspended") void ctx.resume();
            } catch {
              /* ignore */
            }
            opts?.onClose?.(true);
            resolve(rewarded);
          },
          onError: (err: any) => {
            setAdAudioMute(false);
            try {
              const ctx = window.__audioCtx;
              if (ctx && ctx.state === "suspended") void ctx.resume();
            } catch {
              /* ignore */
            }
            opts?.onError?.(err);
            resolve(false);
          },
        },
      });
    } catch {
      setAdAudioMute(false);
      opts?.onError?.();
      resolve(false);
    }
  });
}
