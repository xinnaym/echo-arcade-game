import type { GameOverInfo, Phase } from "../game/engine";
import { t } from "../i18n";

function GearMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none">
      <g stroke="currentColor" strokeWidth="4">
        <circle cx="50" cy="50" r="20" />
        <circle cx="50" cy="50" r="33" strokeDasharray="6 9" />
      </g>
      <circle cx="50" cy="50" r="7" fill="currentColor" />
    </svg>
  );
}

function Btn({
  children,
  onClick,
  variant = "primary",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "ghost";
  disabled?: boolean;
}) {
  const base =
    "rounded-xl px-6 py-3 font-display text-lg font-bold tracking-wide transition active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        variant === "primary"
          ? `${base} border-2 border-ink/70 bg-gradient-to-b from-brass-l to-brass text-ink shadow-[0_4px_0_rgba(46,35,24,0.6)] hover:brightness-105`
          : `${base} border-2 border-ink/30 bg-paper/70 text-ink/70 shadow-[0_3px_0_rgba(46,35,24,0.22)] hover:bg-paper hover:text-ink`
      }
    >
      {children}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-rise relative max-h-full w-full max-w-lg overflow-y-auto">
      <div className="relative overflow-hidden rounded-2xl border-2 border-ink/70 bg-paper p-6 shadow-[0_18px_50px_-12px_rgba(46,35,24,0.55)] sm:p-8">
        <div className="pointer-events-none absolute inset-1.5 rounded-xl border border-ink/25" />
        <div className="grain pointer-events-none absolute inset-0" />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-ink/20 bg-paper-2/60 px-3 py-2 text-center">
      <div className="text-xs font-semibold tracking-[0.18em] text-ink/65">{label}</div>
      <div className={"tabnum font-display text-2xl font-bold " + (accent ? "text-copper" : "text-ink")}>{value}</div>
    </div>
  );
}

function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Overlay({
  phase,
  over,
  best,
  canRestart,
  onStart,
  onResume,
  onMenu,
}: {
  phase: Phase;
  over: GameOverInfo | null;
  best: number;
  canRestart: boolean;
  onStart: () => void;
  onResume: () => void;
  onMenu: () => void;
}) {
  if (phase === "playing") return null;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-[3px]">
      {phase === "menu" && (
        <Card>
          <div className="flex flex-col items-center gap-3 text-center">
            <GearMark className="animate-spin-slow h-14 w-14 shrink-0 text-brass" />
            <div>
              <h1 className="font-display text-5xl leading-none font-bold tracking-[0.18em] text-ink sm:text-6xl">
                {t("menu.title")}
              </h1>
              <p className="mt-1 text-xs font-semibold tracking-[0.28em] text-ink/65 uppercase">
                {t("menu.subtitle")}
              </p>
            </div>
          </div>

          <div className="my-5 h-px bg-gradient-to-r from-transparent via-ink/30 to-transparent" />

          <ul className="mx-auto max-w-md space-y-3 text-left text-base leading-relaxed text-ink/85">
            <li className="flex gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-ink/30 bg-brass/25 font-sans text-xs font-bold leading-none text-ink">
                1
              </span>
              <span>
                {t("menu.rule1", { gear: t("menu.gear") })}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-ink/30 bg-brass/25 font-sans text-xs font-bold leading-none text-ink">
                2
              </span>
              <span>
                {t("menu.rule2", { echo: t("menu.echo") })}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-ink/30 bg-brass/25 font-sans text-xs font-bold leading-none text-ink">
                3
              </span>
              <span>
                {t("menu.rule3", { dash: t("menu.dash"), key: t("menu.key") })}
              </span>
            </li>
          </ul>

          <div className="mt-6 flex flex-col items-center gap-3">
            <Btn onClick={onStart}>{t("menu.start")}</Btn>
            <div className="text-center text-xs leading-relaxed tracking-wide text-ink/65">
              <div>{t("menu.controlsMouse")}</div>
              <div>{t("menu.controlsDash")}</div>
              {best > 0 && (
                <div className="tabnum mt-1 font-semibold text-copper">{t("menu.best", { n: best })}</div>
              )}
            </div>
          </div>
        </Card>
      )}

      {phase === "paused" && (
        <Card>
          <div className="flex flex-col items-center text-center">
            <h2 className="font-display text-4xl font-bold tracking-[0.12em] text-ink">{t("paused.title")}</h2>
            <p className="mt-2 text-base text-ink/70">{t("paused.subtitle")}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Btn onClick={onResume}>{t("paused.resume")}</Btn>
              <Btn variant="ghost" onClick={onStart}>
                {t("paused.restart")}
              </Btn>
              <Btn variant="ghost" onClick={onMenu}>
                {t("paused.menu")}
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {phase === "over" && over && (
        <Card>
          <div className="flex flex-col items-center gap-2 text-center">
            <GearMark className="animate-spin-slow-rev h-12 w-12 shrink-0 text-rust" />
            <div>
              <h2 className="font-display text-4xl leading-none font-bold tracking-[0.08em] text-ink">
                {t("over.title")}
              </h2>
              <p className="mt-1.5 text-base font-semibold tracking-wide text-rust">{over.reason}</p>
            </div>
          </div>

          {over.newBest && (
            <div className="mt-4 rounded-lg border border-brass/70 bg-brass/20 px-3 py-2 text-center font-display text-lg font-bold tracking-wide text-copper">
              {t("over.newBest")}
            </div>
          )}

          <div className="mx-auto mt-5 grid max-w-md grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={t("over.points")} value={String(over.points)} accent />
            <Stat label={t("over.gears")} value={String(over.gears)} />
            <Stat label={t("over.time")} value={fmtTime(over.time)} />
            <Stat label={t("over.best")} value={String(over.best)} />
          </div>

          <p className="mx-auto mt-4 max-w-md text-center text-sm leading-relaxed text-ink/70 italic">
            {over.hint}
          </p>

          <div className="mt-6 flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Btn onClick={onStart} disabled={!canRestart}>
                {t("over.again")}
              </Btn>
              <Btn variant="ghost" onClick={onMenu}>
                {t("over.menu")}
              </Btn>
            </div>
            <span className="hidden text-xs tracking-wide text-ink/50 sm:block">{t("over.enterHint")}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
