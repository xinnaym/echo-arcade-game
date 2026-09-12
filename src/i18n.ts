// Локализация. Источник языка на платформе — ysdk.environment.i18n.lang
// (см. src/yandex.ts). Локально без SDK используется дефолт DEV_LOCALE —
// удобнее для скриншотов/видео и разработки "на себе".

export type Locale = "ru" | "en";

const DEV_LOCALE: Locale = "en";
const SUPPORTED: Locale[] = ["ru", "en"];

type Dict = Record<string, string>;

const ru: Dict = {
  "menu.title": "ЭХО",
  "menu.subtitle": "заводная мастерская",
  "menu.rule1": "Собирайте {gear} — каждая подкручивает пружину. Опустеет «завод» — механизм встанет.",
  "menu.rule2":
    "Но каждая шестерня оживляет {echo} — двойника, который вечно повторяет путь, только что пройденный вами. Мастерская наполняется вашим прошлым.",
  "menu.rule3": "Касание эха — конец. {dash} даёт миг неуязвимости, а редкий {key} рассыпает всех двойников разом.",
  "menu.gear": "шестерни",
  "menu.echo": "эхо",
  "menu.dash": "Проскок",
  "menu.key": "ключ",
  "menu.start": "ЗАВЕСТИ МЕХАНИЗМ",
  "menu.controlsMouse": "мышь / WASD — движение",
  "menu.controlsDash": "пробел (или двойное касание) — проскок",
  "menu.best": "рекорд · {n}",
  "paused.title": "ПАУЗА",
  "paused.subtitle": "Механизм замер. Шестерни ждут.",
  "paused.resume": "ПРОДОЛЖИТЬ",
  "paused.restart": "Заново",
  "paused.menu": "В меню",
  "over.title": "МЕХАНИЗМ ВСТАЛ",
  "over.newBest": "✦ новый рекорд мастерской ✦",
  "over.points": "ОЧКИ",
  "over.gears": "ШЕСТЕРНИ",
  "over.time": "ВРЕМЯ",
  "over.best": "РЕКОРД",
  "over.again": "ЕЩЁ РАЗ",
  "over.menu": "В меню",
  "over.enterHint": "Enter — заново",
  "hud.points": "ОЧКИ",
  "hud.record": "рекорд {n}",
  "hud.wind": "ЗАВОД",
  "hud.mult": "связка",
  "hud.chrono": "ХРОНО",
  "hud.gearsEchoes": "шестерни {gears} · эхо {echoes}",
  "hud.muteOn": "Включить звук",
  "hud.muteOff": "Выключить звук",
  "hud.pause": "Пауза",
  "hud.controlsMove": "мышь или WASD — движение",
  "hud.controlsDash": "пробел — проскок · Esc — пауза",
  "hud.dash": "Проскок",
  "over.reason.spring": "Завод кончился",
  "over.hint.spring": "Пружина слабеет всё быстрее — не задерживайтесь между шестернями.",
  "over.reason.echo": "Столкновение с эхом",
  "over.hint.echo": "Проскок (Пробел) даёт мгновение неуязвимости — проходите сквозь эхо.",
  "leaderboard.title": "Лидеры мастерской",
  "leaderboard.you": "Вы",
  "leaderboard.empty": "Пока пусто",
  "shop.unlockWithAd": "Открыть за рекламу",
};

const en: Dict = {
  "menu.title": "ECHO",
  "menu.subtitle": "clockwork workshop",
  "menu.rule1": "Collect {gear} — each one winds the spring. Run out of \"wind\" and the mechanism stops.",
  "menu.rule2":
    "But every gear brings an {echo} to life — a double that endlessly retraces the path you just walked. The workshop fills with your own past.",
  "menu.rule3": "Touching an echo ends the run. {dash} grants a moment of invulnerability, and a rare {key} scatters every double at once.",
  "menu.gear": "gears",
  "menu.echo": "echo",
  "menu.dash": "Dash",
  "menu.key": "key",
  "menu.start": "WIND THE MECHANISM",
  "menu.controlsMouse": "mouse / WASD — move",
  "menu.controlsDash": "space (or double tap) — dash",
  "menu.best": "best · {n}",
  "paused.title": "PAUSED",
  "paused.subtitle": "The mechanism is still. Gears are waiting.",
  "paused.resume": "RESUME",
  "paused.restart": "Restart",
  "paused.menu": "Menu",
  "over.title": "MECHANISM STOPPED",
  "over.newBest": "✦ new workshop record ✦",
  "over.points": "POINTS",
  "over.gears": "GEARS",
  "over.time": "TIME",
  "over.best": "BEST",
  "over.again": "AGAIN",
  "over.menu": "Menu",
  "over.enterHint": "Enter — restart",
  "hud.points": "POINTS",
  "hud.record": "best {n}",
  "hud.wind": "WIND",
  "hud.mult": "chain",
  "hud.chrono": "TIME",
  "hud.gearsEchoes": "gears {gears} · echoes {echoes}",
  "hud.muteOn": "Unmute",
  "hud.muteOff": "Mute",
  "hud.pause": "Pause",
  "hud.controlsMove": "mouse or WASD — move",
  "hud.controlsDash": "space — dash · Esc — pause",
  "hud.dash": "Dash",
  "over.reason.spring": "Out of wind",
  "over.hint.spring": "The spring weakens faster and faster — don't linger between gears.",
  "over.reason.echo": "Collided with an echo",
  "over.hint.echo": "Dash (Space) grants a moment of invulnerability — pass right through echoes.",
  "leaderboard.title": "Workshop leaders",
  "leaderboard.you": "You",
  "leaderboard.empty": "Nothing yet",
  "shop.unlockWithAd": "Unlock with an ad",
};

const dicts: Record<Locale, Dict> = { ru, en };

let current: Locale = DEV_LOCALE;

export function setLocale(l: string | undefined | null) {
  const norm = (l ?? "").slice(0, 2).toLowerCase();
  current = (SUPPORTED as string[]).includes(norm) ? (norm as Locale) : DEV_LOCALE;
}

export function getLocale(): Locale {
  return current;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = dicts[current] ?? dicts[DEV_LOCALE];
  let s = dict[key] ?? dicts.ru[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}
