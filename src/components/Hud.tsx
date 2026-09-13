import type { HudData } from "../game/engine";
import { t } from "../i18n";

function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Plate({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-xl border border-ink/25 bg-paper/80 px-3 py-1.5 shadow-[0_2px_0_rgba(46,35,24,0.18)] backdrop-blur-[2px] " +
        className
      }
    >
      {children}
    </div>
  );
}

export default function Hud({
  hud,
  best,
  muted,
  onMute,
  onPause,
  onDash,
}: {
  hud: HudData;
  best: number;
  muted: boolean;
  onMute: () => void;
  onPause: () => void;
  onDash: () => void;
}) {
  const playing = hud.phase === "playing";
  const low = hud.wind < 0.26;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none-all p-3 sm:p-5">
      {/* верхняя панель */}
      <div className="flex items-start justify-between gap-2">
        <Plate className="min-w-[104px]">
          <div className="text-xs font-semibold tracking-[0.22em] text-ink/70">{t("hud.points")}</div>
          <div className="tabnum font-display text-3xl leading-none font-bold text-ink sm:text-4xl">{hud.points}</div>
          <div className="tabnum mt-0.5 text-xs tracking-wide text-ink/60">{t("hud.record", { n: best })}</div>
        </Plate>

        <div className="flex flex-1 flex-col items-center gap-1.5">
          <Plate className="w-full max-w-[260px]">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs font-semibold tracking-[0.22em] text-ink/70">{t("hud.wind")}</span>
              <span
                className={
                  "tabnum text-xs font-semibold " + (low ? "animate-pulse text-rust" : "text-ink/60")
                }
              >
                {Math.round(hud.wind * 100)}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full border border-ink/20 bg-ink/10">
              <div
                className="h-full rounded-full transition-[width] duration-100 ease-linear"
                style={{
                  width: `${Math.max(0, hud.wind) * 100}%`,
                  background: low
                    ? "linear-gradient(90deg,#8c3b23,#c2603a)"
                    : hud.wind < 0.55
                      ? "linear-gradient(90deg,#a9542f,#d59a4e)"
                      : "linear-gradient(90deg,#a87730,#e3ba6c)",
                }}
              />
            </div>
          </Plate>

          {/* заряд проскока — отдельный прогресс-бар, раньше был виден только
              по едва заметной заливке круглой кнопки в углу */}
          <Plate className="w-full max-w-[260px]">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs font-semibold tracking-[0.22em] text-ink/70">{t("hud.dash")}</span>
              <span className={"tabnum text-xs font-semibold " + (hud.dash >= 1 ? "text-copper" : "text-ink/60")}>
                {hud.dash >= 1 ? t("hud.dashReady") : `${Math.round(hud.dash * 100)}%`}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full border border-ink/20 bg-ink/10">
              <div
                className={
                  "h-full rounded-full transition-[width] duration-100 ease-linear " +
                  (hud.dash >= 1 ? "bg-copper" : "bg-ink/35")
                }
                style={{ width: `${Math.max(0, Math.min(1, hud.dash)) * 100}%` }}
              />
            </div>
          </Plate>

          {hud.mult > 1 && playing && (
            <div className="animate-rise rounded-full border border-brass/60 bg-brass/15 px-2.5 py-0.5 font-display text-sm font-bold text-copper">
              ×{hud.mult} {t("hud.mult")}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <Plate className="text-right">
            <div className="text-xs font-semibold tracking-[0.22em] text-ink/70">{t("hud.chrono")}</div>
            <div className="tabnum font-display text-2xl leading-none font-bold text-ink sm:text-3xl">
              {fmtTime(hud.time)}
            </div>
            <div className="tabnum mt-0.5 text-xs tracking-wide text-ink/60">
              {t("hud.gearsEchoes", { gears: hud.gears, echoes: hud.echoes })}
            </div>
          </Plate>
          <div className="pointer-events-auto flex gap-1.5">
            <button
              onClick={onMute}
              aria-label={muted ? t("hud.muteOn") : t("hud.muteOff")}
              className="grid h-8 w-8 place-items-center rounded-lg border border-ink/25 bg-paper/80 text-ink/70 transition hover:bg-paper hover:text-ink active:scale-95"
            >
              {muted ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5 6 9H3v6h3l5 4z" />
                  <path d="m17 9 4 6M21 9l-4 6" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5 6 9H3v6h3l5 4z" />
                  <path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <button
              onClick={onPause}
              aria-label={t("hud.pause")}
              disabled={!playing}
              className="grid h-8 w-8 place-items-center rounded-lg border border-ink/25 bg-paper/80 text-ink/70 transition hover:bg-paper hover:text-ink disabled:opacity-40 active:scale-95"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* нижняя панель */}
      <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3 sm:inset-x-5 sm:bottom-5">
        <div className="hidden text-xs leading-relaxed tracking-wide text-ink/60 sm:block">
          <div>{t("hud.controlsMove")}</div>
          <div>{t("hud.controlsDash")}</div>
        </div>

        <button
          onPointerDown={(e) => {
            e.preventDefault();
            onDash();
          }}
          disabled={!playing}
          className="pointer-events-auto relative ml-auto grid h-16 w-16 place-items-center overflow-hidden rounded-full border-2 border-ink/30 bg-paper/85 shadow-[0_3px_0_rgba(46,35,24,0.25)] transition active:translate-y-0.5 active:shadow-none disabled:opacity-40 sm:h-14 sm:w-14"
          aria-label={t("hud.dash")}
        >
          <svg
            className={"relative " + (hud.dash >= 1 ? "text-copper" : "text-ink/40")}
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m13 2-9 12h7l-1 8 9-12h-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
