import { useEffect, useState } from "react";
import { fetchLeaderboard, type LeaderboardRow } from "../yandex";
import { t } from "../i18n";

export default function Leaderboard() {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchLeaderboard().then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows) return null; // нет SDK / не удалось получить — виджет просто не занимает места

  return (
    <div className="pointer-events-auto w-44 rounded-xl border border-ink/25 bg-paper/85 p-2.5 shadow-[0_2px_0_rgba(46,35,24,0.18)] backdrop-blur-[2px]">
      <div className="mb-1.5 text-[10px] font-semibold tracking-[0.18em] text-ink/55">{t("leaderboard.title")}</div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-ink/45">{t("leaderboard.empty")}</div>
      ) : (
        <ol className="space-y-1">
          {rows.map((r) => (
            <li
              key={`${r.rank}-${r.name}`}
              className={
                "flex items-center justify-between gap-2 rounded px-1 py-0.5 text-[11px] " +
                (r.isMe ? "bg-brass/20 font-semibold text-copper" : "text-ink/75")
              }
            >
              <span className="truncate">
                {r.rank}. {r.isMe ? t("leaderboard.you") : r.name}
              </span>
              <span className="tabnum shrink-0">{r.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
