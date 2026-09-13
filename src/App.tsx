import { useEffect, useRef, useState } from "react";
import { EchoGame, type GameOverInfo, type HudData, type Phase } from "./game/engine";
import Hud from "./components/Hud";
import Overlay from "./components/Overlay";
import Leaderboard from "./components/Leaderboard";
import {
  gameplayStart,
  gameplayStop,
  loadBestScore,
  maybeShowInterstitial,
  saveBestScore,
  submitLeaderboardScore,
} from "./yandex";

const MUTE_KEY = "echo.muted.v1";

const emptyHud: HudData = {
  points: 0,
  gears: 0,
  mult: 1,
  wind: 1,
  dash: 1,
  echoes: 0,
  time: 0,
  phase: "menu",
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<EchoGame | null>(null);

  const [hud, setHud] = useState<HudData>(emptyHud);
  const [phase, setPhase] = useState<Phase>("menu");
  const [over, setOver] = useState<GameOverInfo | null>(null);
  const [best, setBest] = useState(0);
  const [canRestart, setCanRestart] = useState(true);
  const [muted, setMuted] = useState(false);
  const canRestartRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const game = new EchoGame(canvas, {
      onHud: setHud,
      onOver: (info) => {
        setOver(info);
        setBest(info.best);
        setCanRestart(false);
        canRestartRef.current = false;
        window.setTimeout(() => {
          canRestartRef.current = true;
          setCanRestart(true);
        }, 800);
        if (info.newBest) {
          void saveBestScore(info.best); // облако; localStorage уже записан движком
          void submitLeaderboardScore(info.best);
        }
        // показ — после остановки геймплея (onPhase->gameplayStop уже отработал),
        // не чаще раза в N смертей
        maybeShowInterstitial();
      },
      onPhase: (p) => {
        setPhase(p);
        if (p === "playing") gameplayStart();
        else gameplayStop();
      },
    });
    gameRef.current = game;
    setBest(game.getBest());

    // облако + локальный кэш — берём максимум, тихий fallback уже внутри loadBestScore
    void loadBestScore(game.getBest()).then((best) => {
      game.applyExternalBest(best);
      setBest(game.getBest());
    });

    let stored = false;
    try {
      stored = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      stored = false;
    }
    setMuted(stored);
    game.setMuted(stored);

    const ro = new ResizeObserver(() => game.resize());
    ro.observe(canvas);
    const onWinResize = () => game.resize();
    window.addEventListener("resize", onWinResize);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Enter" || e.code === "NumpadEnter") {
        const ph = game.phase;
        if (ph === "menu") {
          setOver(null);
          game.start();
        } else if (ph === "over" && canRestartRef.current) {
          setOver(null);
          game.start();
        } else if (ph === "paused") game.togglePause();
      }
      if (e.code === "KeyR" && game.phase !== "playing" && canRestartRef.current) {
        setOver(null);
        game.start();
      }
      if (e.code === "KeyM") {
        setMuted((m) => {
          const next = !m;
          game.setMuted(next);
          try {
            localStorage.setItem(MUTE_KEY, next ? "1" : "0");
          } catch {
            /* ignore */
          }
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onWinResize);
      ro.disconnect();
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  const start = () => {
    setOver(null);
    gameRef.current?.start();
  };

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      gameRef.current?.setMuted(next);
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-paper-3">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* бумажная фактура поверх холста */}
      <div className="grain pointer-events-none absolute inset-0 z-10" />

      {/* уголки-винты для «приборной» рамки */}
      <div className="pointer-events-none absolute inset-0 z-10 hidden sm:block">
        {[
          ["left-3 top-3", ""],
          ["right-3 top-3", ""],
          ["left-3 bottom-3", ""],
          ["right-3 bottom-3", ""],
        ].map(([pos], i) => (
          <div
            key={i}
            className={`absolute ${pos} h-3 w-3 rounded-full border border-ink/30 bg-paper-2 shadow-[inset_0_1px_1px_rgba(46,35,24,0.35)]`}
          />
        ))}
      </div>

      {/* absolute, вне потока — не влияет на позицию центрированного контента;
          z-30 — выше подложки Overlay (z-20), иначе на меню/проигрыше уходил
          под затемнение и был не виден; скрыт на мобильных (мало места). */}
      <div className="pointer-events-none absolute inset-y-0 left-3 z-30 hidden items-center sm:flex">
        <Leaderboard />
      </div>

      <Hud
        hud={hud}
        best={best}
        muted={muted}
        onMute={toggleMute}
        onPause={() => gameRef.current?.pause()}
        onDash={() => gameRef.current?.dash()}
      />

      <Overlay
        phase={phase}
        over={over}
        best={best}
        canRestart={canRestart}
        onStart={start}
        onResume={() => gameRef.current?.togglePause()}
        onMenu={() => {
          setOver(null);
          gameRef.current?.goMenu();
        }}
      />
    </div>
  );
}
