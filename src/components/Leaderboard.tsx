import { useEffect, useState } from "react";
import { fetchLeaderboard, onScoreUpdated, type LeaderboardRow } from "../yandex";
import { BEST_KEY } from "../game/engine";
import { t } from "../i18n";

export default function Leaderboard() {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchLeaderboard().then((r) => {
        if (cancelled) return;
        if (r) {
          setRows(r);
          return;
        }
        // нет SDK / не удалось получить с платформы — показываем локальный
        // рекорд, чтобы виджет не был просто невидимым при локальном тесте
        let best = 0;
        try {
          best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
        } catch {
          best = 0;
        }
        setRows([{ rank: 1, name: t("leaderboard.you"), score: best, isMe: true }]);
      });
    };
    load();
    // перечитываем сразу после нового рекорда (см. App.tsx:onOver) — без этого
    // виджет показывал старое значение до перезагрузки страницы
    const unsubscribe = onScoreUpdated(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!rows) return null; // ждём ответа — просто не занимаем места

  return (
    <div className="pointer-events-auto w-48 rounded-xl border border-ink/25 bg-paper/85 p-3 shadow-[0_2px_0_rgba(46,35,24,0.18)] backdrop-blur-[2px]">
      <div className="mb-2 text-xs font-semibold tracking-[0.18em] text-ink/70">{t("leaderboard.title")}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-ink/55">{t("leaderboard.empty")}</div>
      ) : (
        <ol className="space-y-1">
          {rows.map((r) => (
            <li
              key={`${r.rank}-${r.name}`}
              className={
                "flex items-center justify-between gap-2 rounded px-1 py-0.5 text-xs " +
                (r.isMe ? "bg-brass/20 font-semibold text-copper" : "text-ink/80")
              }
            >
              <span className="truncate">
                {r.rank}. {r.name}
              </span>
              <span className="tabnum shrink-0">{r.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
