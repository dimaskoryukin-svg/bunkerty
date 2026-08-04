"use client";

import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
import { catastrophes, getHostEvents, type Catastrophe } from "./game-content";

type Screen = "home" | "lobby" | "briefing" | "game";
type Theme = "ember" | "ice" | "signal";
type SideTab = "chat" | "events" | "players";
type Player = { name: string; role: string; avatar: string; ready: boolean; color: string };
type EventCard = { title: string; message: string; consequence: string; number: number };
type RoomPayload = {
  room: { code: string; status: string; seed: number; round: number; currentTurn: number };
  players: Array<{ id: string; name: string; avatar: string; color: string; ready: boolean; eliminated: boolean }>;
  reveals: Array<{ player_id: string; round: number; card_index: number; name: string }>;
  ballots: Array<{ player_id: string; choice: "yes" | "no"; name: string }>;
  messages: Array<{ id: number; player_id: string; name: string; text: string; created_at: number }>;
  token?: string;
  playerId?: string;
  isHost?: boolean;
};

const traits = [
  { id: "profession", icon: "⚒", suit: "♠", rank: "K", label: "Профессия", hint: "Навык и призвание" },
  { id: "health", icon: "♥", suit: "♥", rank: "Q", label: "Здоровье", hint: "Состояние организма" },
  { id: "biology", icon: "⚥", suit: "♦", rank: "A", label: "Биология", hint: "Пол и возраст" },
  { id: "hobby", icon: "♣", suit: "♣", rank: "J", label: "Хобби", hint: "Полезное увлечение" },
  { id: "baggage", icon: "▣", suit: "♦", rank: "10", label: "Багаж", hint: "Предмет с собой" },
  { id: "special", icon: "✦", suit: "★", rank: "J", label: "Особенность", hint: "Скрытая черта" },
];

const characterDecks: Record<string, string[]> = {
  Алекс: ["Пилот гражданской авиации", "Старая травма плеча", "Мужчина, 42 года", "Авиамоделизм", "Навигационный планшет", "Не теряется в кризисе"],
  Вера: ["Архитектор убежищ", "Полностью здорова", "Женщина, 38 лет", "Керамика", "Чертежи вентиляции", "Не прощает предательства"],
  Роман: ["Инструктор по выживанию", "Тиннитус", "Мужчина, 45 лет", "Ориентирование", "Аварийный радиомаяк", "Всегда берёт ответственность"],
  Дана: ["Биоинженер", "Непереносимость лактозы", "Женщина, 32 года", "Игра на виолончели", "Криоконтейнер образцов", "Скрывает важное открытие"],
  Мира: ["Инженер-энергетик", "Астма", "Женщина, 31 год", "Гидропоника", "Набор семян", "Феноменальная память"],
  Тимур: ["Спасатель МЧС", "Близорукость", "Мужчина, 36 лет", "Радиолюбитель", "Рация", "Боится замкнутых пространств"],
  Соня: ["Вирусолог", "Полностью здорова", "Женщина, 27 лет", "Садоводство", "Фильтр для воды", "Умеет убеждать"],
  Костя: ["Повар-технолог", "Диабет I типа", "Мужчина, 44 года", "Столярное дело", "Набор инструментов", "Боится крови"],
  Лев: ["Геолог", "Мигрень", "Мужчина, 39 лет", "Спелеология", "Карта подземных вод", "Не умеет лгать"],
  Алина: ["Фельдшер", "Аллергия на пыль", "Женщина, 29 лет", "Шитьё", "Полевой хирургический набор", "Спит по четыре часа"],
  Глеб: ["Агроном", "Глухота на одно ухо", "Мужчина, 52 года", "Пчеловодство", "Контейнер удобрений", "Конфликтный характер"],
  Илья: ["Электромеханик", "Абсолютно здоров", "Мужчина, 25 лет", "Дрон-рейсинг", "Солнечная панель", "Боится темноты"],
  Ника: ["Психолог", "Бессонница", "Женщина, 34 года", "Первая помощь", "Набор настольных игр", "Читает микромимику"],
  Олег: ["Химик", "Гипертония", "Мужчина, 47 лет", "Консервирование", "Респираторы", "Одержим порядком"],
  Артём: ["Строитель", "Повреждение колена", "Мужчина, 33 года", "Охота", "Трос и карабины", "Принимает решения мгновенно"],
  Яна: ["Метеоролог", "Слабое зрение", "Женщина, 41 год", "Картография", "Барометр", "Никому не доверяет"],
  Марк: ["Программист робототехники", "Тремор рук", "Мужчина, 28 лет", "Ремонт часов", "Набор микросхем", "Идеальный слух"],
};

const deckPool = Object.values(characterDecks);
const makeCards = (players: Player[], seed: number) => Object.fromEntries(players.map((player, index) => [player.name, deckPool[(seed + index) % deckPool.length]])) as Record<string, string[]>;
const emptyReveals = (players: Player[]) => Object.fromEntries(players.filter((player) => player.role === "Игрок").map((player) => [player.name, [] as number[]])) as Record<string, number[]>;

const initialEvents = [{ time: "Сейчас", text: "Игра подготовлена", detail: "Сценарий и персонажи распределены случайно" }];

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [prologueStep, setPrologueStep] = useState(0);
  const [theme, setTheme] = useState<Theme>("ember");
  const [gameSeed, setGameSeed] = useState(0);
  const [scenario, setScenario] = useState<Catastrophe>(catastrophes[0]);
  const [gamePlayers, setGamePlayers] = useState<Player[]>([]);
  const [characterCards, setCharacterCards] = useState<Record<string, string[]>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [ready, setReady] = useState(false);
  const [playerToken, setPlayerToken] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomError, setRoomError] = useState("");
  const [round, setRound] = useState(1);
  const [seconds, setSeconds] = useState(60);
  const [running, setRunning] = useState(true);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [revealedCards, setRevealedCards] = useState<Record<string, number[]>>({});
  const [roundRevealed, setRoundRevealed] = useState<string[]>([]);
  const [messages, setMessages] = useState<Array<{ id: number; who: string; text: string; mine: boolean }>>([]);
  const [message, setMessage] = useState("");
  const [voteOpen, setVoteOpen] = useState(false);
  const [vote, setVote] = useState<string | null>(null);
  const [eliminatedPlayers, setEliminatedPlayers] = useState<string[]>([]);
  const [roundVoteOpen, setRoundVoteOpen] = useState(false);
  const [roundVoteChoice, setRoundVoteChoice] = useState<"yes" | "no" | null>(null);
  const [roundBallots, setRoundBallots] = useState<Record<string, "yes" | "no">>({});
  const [roundVoteResult, setRoundVoteResult] = useState<"yes" | "no" | null>(null);
  const [roundVotePrompted, setRoundVotePrompted] = useState<number[]>([]);
  const [voteFromRoundEnd, setVoteFromRoundEnd] = useState(false);
  const [endingOpen, setEndingOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [eventNonce, setEventNonce] = useState(0);
  const [eventCard, setEventCard] = useState<EventCard | null>(null);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [liveEvents, setLiveEvents] = useState(initialEvents);
  const [activeTab, setActiveTab] = useState<SideTab>("chat");
  const [handOpen, setHandOpen] = useState(true);
  const turnPlayers = gamePlayers.filter((player) => player.role === "Игрок" && !eliminatedPlayers.includes(player.name));
  const currentPlayer = turnPlayers[currentTurn] ?? turnPlayers[0];
  const isMyTurn = currentPlayer?.name === name;
  const roundComplete = turnPlayers.length > 0 && turnPlayers.every((player) => roundRevealed.includes(player.name));
  const bunkerCapacity = Math.max(1, Math.floor(gamePlayers.length * (gameSeed % 2 === 0 ? 0.4 : 0.5)));
  const myCards = characterCards[name] ?? [];
  const myRevealedCards = revealedCards[name] ?? [];

  useEffect(() => {
    const saved = localStorage.getItem("bunker-theme") as Theme | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    if (!running || screen !== "game" || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [running, screen, seconds]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);


  useEffect(() => {
    if (screen !== "game" || !roundComplete || roundVotePrompted.includes(round)) return;
    setRoundVotePrompted((items) => [...items, round]);
    window.setTimeout(() => {
      setRoundVoteOpen(true);
    }, 650);
  }, [screen, roundComplete, round, roundVotePrompted]);

  useEffect(() => {
    if (!code || !playerToken || screen === "home") return;
    const sync = () => void fetch(`/api/rooms?code=${encodeURIComponent(code)}`, { cache: "no-store" }).then(async (response) => {
      if (response.ok) hydrateRoom(await response.json() as RoomPayload);
    }).catch(() => undefined);
    sync();
    const timer = window.setInterval(sync, 1500);
    return () => window.clearInterval(timer);
  }, [code, playerToken, screen, name, playerId]);

  const time = useMemo(() => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`, [seconds]);

  function chooseTheme(next: Theme) {
    setTheme(next);
    localStorage.setItem("bunker-theme", next);
  }

  function hydrateRoom(payload: RoomPayload) {
    const selfId = payload.playerId ?? playerId;
    const players = payload.players.map((player) => ({ name: player.name, role: "Игрок", avatar: player.avatar, ready: player.ready, color: player.color }));
    const seed = payload.room.seed % catastrophes.length;
    const revealMap = emptyReveals(players);
    for (const reveal of payload.reveals) revealMap[reveal.name] = [...(revealMap[reveal.name] ?? []), reveal.card_index];
    const ballots = Object.fromEntries(payload.ballots.map((ballot) => [ballot.name, ballot.choice])) as Record<string, "yes" | "no">;
    const activeCount = payload.players.filter((player) => !player.eliminated).length;
    const yesCount = Object.values(ballots).filter((choice) => choice === "yes").length;
    setCode(payload.room.code);
    setGameSeed(seed);
    setScenario(catastrophes[seed]);
    setGamePlayers(players);
    setCharacterCards(makeCards(players, seed));
    setRevealedCards(revealMap);
    setEliminatedPlayers(payload.players.filter((player) => player.eliminated).map((player) => player.name));
    setRound(payload.room.round);
    setCurrentTurn(payload.room.currentTurn);
    setRoundRevealed(payload.reveals.filter((reveal) => reveal.round === payload.room.round).map((reveal) => reveal.name));
    setRoundBallots(ballots);
    const ownBallot = payload.ballots.find((ballot) => ballot.player_id === playerId)?.choice ?? null;
    setRoundVoteChoice(ownBallot);
    setRoundVoteResult(payload.ballots.length >= activeCount && activeCount > 0 ? (yesCount > activeCount - yesCount ? "yes" : "no") : null);
    setMessages((payload.messages ?? []).map((item) => ({ id: item.id, who: item.name, text: item.text, mine: item.player_id === selfId })));
    if (payload.token) {
      setPlayerToken(payload.token);
      setPlayerId(payload.playerId ?? "");
      setIsHost(Boolean(payload.isHost));
    }
    if (payload.room.status === "briefing" && screen === "lobby") { setPrologueStep(0); setRunning(false); setScreen("briefing"); }
    if (payload.room.status === "game" && screen !== "game") { setSeconds(60); setRunning(true); setScreen("game"); }
  }

  async function submitRoom(action: string, extra: Record<string, unknown> = {}) {
    const response = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, code, token: playerToken, ...extra }) });
    const payload = await response.json() as RoomPayload & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Не удалось обновить комнату");
    hydrateRoom(payload);
    return payload;
  }

  async function createRoom(event: FormEvent) {
    event.preventDefault(); setRoomLoading(true); setRoomError("");
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", name }) });
      const payload = await response.json() as RoomPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось создать комнату");
      hydrateRoom(payload); setReady(true); setShowCreate(false); setScreen("lobby"); setToast(`Комната ${payload.room.code} создана`);
    } catch (error) { setRoomError(error instanceof Error ? error.message : "Ошибка создания комнаты"); } finally { setRoomLoading(false); }
  }

  async function joinRoom(event?: FormEvent) {
    event?.preventDefault(); setRoomLoading(true); setRoomError("");
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "join", code, name }) });
      const payload = await response.json() as RoomPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось войти в комнату");
      hydrateRoom(payload); setReady(false); setShowJoin(false); setScreen("lobby"); setToast(`Вы вошли в комнату ${payload.room.code}`);
    } catch (error) { setRoomError(error instanceof Error ? error.message : "Ошибка подключения"); } finally { setRoomLoading(false); }
  }

  async function beginBriefing() {
    try { await submitRoom("start"); } catch (error) { setToast(error instanceof Error ? error.message : "Не удалось начать игру"); }
  }

  async function enterGame() {
    try { await submitRoom("enter"); } catch (error) { setToast(error instanceof Error ? error.message : "Не удалось войти в бункер"); }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setMessage("");
    try { await submitRoom("message", { text }); } catch (error) { setMessage(text); setToast(error instanceof Error ? error.message : "Сообщение не отправлено"); }
  }

  async function nextRound() {
    if (!roundComplete || round >= 5) return;
    const next = Math.min(round + 1, 5);
    try { await submitRoom("next-round"); } catch (error) { setToast(error instanceof Error ? error.message : "Не удалось начать раунд"); return; }
    setSeconds(60); setRunning(true); setRoundVoteOpen(false); setRoundVotePrompted([]);
    setToast(`Раунд ${next}: первым ходит ${turnPlayers[0]?.name ?? "игрок"}`);
    setLiveEvents((items) => [{ time: "Сейчас", text: `Начался раунд ${next}`, detail: "Все действия выполняют реальные игроки комнаты" }, ...items].slice(0, 30));
  }

  async function castRoundVote(choice: "yes" | "no") {
    try { await submitRoom("round-vote", { choice }); } catch (error) { setToast(error instanceof Error ? error.message : "Голос не принят"); }
  }

  function continueAfterRoundVote() {
    if (roundVoteResult === "yes") {
      setRoundVoteOpen(false);
      setVoteFromRoundEnd(true);
      setVote(null);
      setVoteOpen(true);
      return;
    }
    setRoundVoteOpen(false);
    if (round >= 5) setEndingOpen(true);
    else void nextRound();
  }

  async function confirmElimination() {
    if (!vote || !isHost) return;
    const eliminated = vote;
    try {
      await submitRoom("eliminate", { playerName: eliminated });
      setVoteOpen(false);
      setToast(`${eliminated} исключён из бункера решением группы`);
      if (voteFromRoundEnd) {
        setVoteFromRoundEnd(false);
        window.setTimeout(() => round >= 5 ? setEndingOpen(true) : void nextRound(), 0);
      }
      setVote(null);
    } catch (error) { setToast(error instanceof Error ? error.message : "Не удалось исключить игрока"); }
  }

  async function revealCard(playerName: string, cardIndex: number) {
    if (playerName !== name || !isMyTurn || roundRevealed.includes(playerName) || revealedCards[playerName]?.includes(cardIndex)) return;
    try {
      await submitRoom("reveal", { cardIndex });
      const label = traits[cardIndex].label;
      const value = characterCards[playerName][cardIndex];
      setSeconds(60);
      setLiveEvents((items) => [{ time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }), text: `${playerName} раскрыл карту`, detail: `${label}: ${value}` }, ...items].slice(0, 30));
      setToast(`${playerName}: раскрыто «${label}»`);
    } catch (error) { setToast(error instanceof Error ? error.message : "Карта не раскрыта"); }
  }

  function drawEvent() {
    if (!isHost) return;
    const events = getHostEvents(scenario);
    const nextNumber = eventNonce + 1;
    const event = events[eventNonce % events.length];
    const now = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    setEventNonce(nextNumber);
    setEventCard({ title: event.title, message: event.message, consequence: event.event, number: nextNumber });
    setLiveEvents((items) => [{ time: now, text: event.title, detail: event.event }, ...items].slice(0, 30));
    setRunning(false);
  }

  function prepareNewGame() {
    window.location.assign("/");
  }

  const gameEnding = useMemo(() => {
    const survivors = gamePlayers.filter((player) => !eliminatedPlayers.includes(player.name));
    const profile = survivors.flatMap((player) => characterCards[player.name] ?? []).join(" ").toLowerCase();
    const hasMedicine = /врач|фельдшер|вирусолог|биоинженер|психолог|антибиотик/.test(profile);
    const hasEngineering = /инженер|электро|строитель|архитектор|программист|пилот|инструмент/.test(profile);
    const hasFood = /агроном|повар|семян|гидропоник|удобрени|консерв/.test(profile);
    const hasExplorer = /спасатель|геолог|инструктор|метеоролог|океанолог|картограф/.test(profile);
    let title = "ДОЛГАЯ НОЧЬ";
    let verdict = "Команда пережила закрытие шлюза, но каждый новый день остаётся борьбой за ресурсы и доверие.";
    if (survivors.length <= 2) {
      title = "ПОСЛЕДНИЙ ОТСЕК";
      verdict = "Людей осталось слишком мало. Бункер выстоит, но цена одиночества может оказаться выше цены спасения.";
    } else if (hasMedicine && hasEngineering && hasFood) {
      title = "НОВЫЙ РАССВЕТ";
      verdict = "В убежище есть знания, энергия, лечение и пища. Эта группа не просто выживет — она сможет вернуть жизнь на поверхность.";
    } else if (hasEngineering && hasFood) {
      title = "ЖЕЛЕЗНАЯ ВЕСНА";
      verdict = "Команда наладила энергию и выращивание пищи. Бункер становится первым работающим поселением нового мира.";
    } else if (hasMedicine && hasExplorer) {
      title = "ЭКСПЕДИЦИЯ НАДЕЖДЫ";
      verdict = "Выжившие готовы лечить раненых и исследовать поверхность. Первый выход назначен сразу после стихания угрозы.";
    }
    return { survivors, title, verdict, hasMedicine, hasEngineering, hasFood };
  }, [gamePlayers, eliminatedPlayers, characterCards]);

  return (
    <main className={`app theme-${theme}`}>
      <header className="topbar">
        <button className="brand" onClick={() => setScreen("home")} aria-label="На главную">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>БУНКЕР<small>остаться человеком</small></span>
        </button>
        <div className="top-actions">
          {screen !== "home" && <span className="room-chip"><span className="live-dot" /> Комната <b>{code}</b></span>}
          <div className="themes" aria-label="Выбор темы">
            <button className={theme === "ember" ? "active ember" : "ember"} onClick={() => chooseTheme("ember")} aria-label="Тема Уголь" />
            <button className={theme === "ice" ? "active ice" : "ice"} onClick={() => chooseTheme("ice")} aria-label="Тема Лёд" />
            <button className={theme === "signal" ? "active signal" : "signal"} onClick={() => chooseTheme("signal")} aria-label="Тема Сигнал" />
          </div>
          <button className="sound" aria-label="Звук">◖))</button>
          <div className="mini-avatar">{name.trim().charAt(0).toUpperCase() || "?"}</div>
        </div>
      </header>

      {screen === "home" && (
        <section className="home-screen">
          <div className="hero-copy">
            <span className="eyebrow"><span className="live-dot" /> Онлайн-игра для 2–8 человек</span>
            <h1>Кому достанется<br /><em>место в бункере?</em></h1>
            <p>Катастрофа уже случилась. Убеди остальных, что именно ты нужен новому миру — пока дверь не закрылась.</p>
            <div className="hero-actions">
              <button className="primary big" onClick={() => { setRoomError(""); setShowCreate(true); }}>Создать комнату <span>→</span></button>
              <button className="secondary big" onClick={() => { setRoomError(""); setShowJoin(true); }}>Войти по коду</button>
            </div>
            <div className="trust-row"><span><b>10 000+</b> игр сыграно</span><i /><span><b>4,9</b> рейтинг игроков</span><i /><span>Без установки</span></div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="radar"><span /><span /><span /><b>5</b></div>
            <div className="hazard-card">
              <div className="hazard-top"><span>СЦЕНАРИЙ #047</span><b>УРОВЕНЬ: КРИТИЧЕСКИЙ</b></div>
              <div className="hazard-icon">☢</div>
              <h3>ЯДЕРНАЯ ЗИМА</h3>
              <p>Серия взрывов уничтожила 73% инфраструктуры. Температура падает.</p>
              <div className="hazard-stats"><span><small>В БУНКЕРЕ</small><b>5 мест</b></span><span><small>ПРЕТЕНДЕНТОВ</small><b>8 человек</b></span><span><small>СРОК</small><b>10 лет</b></span></div>
            </div>
            <div className="float-card fc-one"><span>◉</span><small>ПРОФЕССИЯ</small><b>Хирург</b></div>
            <div className="float-card fc-two"><span>◈</span><small>БАГАЖ</small><b>Аптечка</b></div>
            <div className="scan-line" />
          </div>
          <div className="how-strip">
            <b>Как это работает</b>
            <span><i>01</i> Соберите команду</span>
            <span><i>02</i> Получите персонажа</span>
            <span><i>03</i> Докажите свою ценность</span>
            <span><i>04</i> Проголосуйте</span>
          </div>
        </section>
      )}

      {screen === "lobby" && (
        <section className="lobby-screen page-shell">
          <div className="section-head">
            <div><span className="eyebrow">Комната готова</span><h1>Собираем выживших</h1><p>Отправьте код друзьям. Начните партию, когда все будут готовы.</p></div>
            <div className="code-card"><small>КОД КОМНАТЫ</small><b>{code}</b><button onClick={() => { navigator.clipboard?.writeText(code); setToast("Код скопирован"); }}>Копировать</button></div>
          </div>
          <div className="lobby-grid">
            <div className="panel player-panel">
              <div className="panel-title"><h2>Игроки <span>{gamePlayers.length} / 8</span></h2><span className="status-good">{gamePlayers.filter((player) => player.ready).length} готовы</span></div>
              <div className="player-list">
                {gamePlayers.map((player, index) => (
                  <div className="player-row" key={player.name}>
                    <div className={`avatar ${player.color}`}>{player.avatar}</div>
                    <div><b>{player.name}</b><small>Реальный игрок{player.name === name ? " · это вы" : ""}</small></div>
                    {index === 0 && <span className="host-badge">◆ Создатель</span>}
                    <span className={player.ready ? "ready" : "waiting"}>{player.ready ? "✓ Готов" : "Ожидает"}</span>
                  </div>
                ))}
                {Array.from({ length: Math.max(0, 8 - gamePlayers.length) }, (_, slot) => <div className="player-row empty" key={slot}><div className="avatar">+</div><span>Свободное место · подключение по коду</span></div>)}
              </div>
            </div>
            <aside className="lobby-side">
              <div className="panel settings-card">
                <div className="panel-title"><h2>Параметры игры</h2><span>⚙</span></div>
                <dl><div><dt>Сценарий</dt><dd>{scenario.title}</dd></div><div><dt>Мест в бункере</dt><dd>{bunkerCapacity} из {gamePlayers.length}</dd></div><div><dt>События</dt><dd>Запускает создатель</dd></div><div><dt>Катастроф в каталоге</dt><dd>100</dd></div><div><dt>Время на ход</dt><dd>1 минута</dd></div></dl>
              </div>
              <button className={ready ? "ready-toggle active" : "ready-toggle"} onClick={async () => { const next = !ready; try { await submitRoom("ready", { ready: next }); setReady(next); } catch (error) { setToast(error instanceof Error ? error.message : "Статус не обновлён"); } }}><span>{ready ? "✓" : "○"}</span><b>{ready ? "Вы готовы" : "Нажмите, когда готовы"}</b><small>{ready ? "Ждём остальных игроков" : "Ваш статус увидят все в комнате"}</small></button>
              {isHost ? <button className="primary start" disabled={gamePlayers.length < 2} onClick={() => void beginBriefing()}>{gamePlayers.length < 2 ? "Ждём ещё одного игрока" : "Открыть пролог"} <span>→</span></button> : <div className="multiplayer-wait"><span className="live-dot" /> Создатель комнаты запустит игру</div>}
              <p className="demo-note">Только реальные участники · синхронизация комнаты включена</p>
            </aside>
          </div>
        </section>
      )}

      {screen === "briefing" && (
        <section className="story-screen" aria-label="Предыстория катастрофы">
          <div className="story-atmosphere" aria-hidden="true"><span>{scenario.icon}</span><i /><i /><i /></div>
          <div className="story-frame">
            <div className="story-topline">
              <span>АРХИВ «КОВЧЕГ»</span>
              <span>ДЕЛО {String(gameSeed + 1).padStart(3, "0")} / 100</span>
              <span className="story-classified">РАССЕКРЕЧЕНО</span>
            </div>
            <div className="story-layout">
              <aside className="story-index">
                <div className="story-glyph">{scenario.icon}</div>
                <small>КАТАСТРОФА</small>
                <b>{scenario.title}</b>
                <div className="story-meta"><span><small>ДАТА НУЛЕВОГО ДНЯ</small>{scenario.backstory.date}</span><span><small>АВТОНОМНОСТЬ</small>{scenario.detail.split(";")[0].replace("Автономность ", "")}</span><span><small>ГЛАВНЫЙ ДЕФИЦИТ</small>{scenario.resource}</span></div>
              </aside>
              <article className="story-copy" key={`${scenario.id}-${prologueStep}`}>
                <span className="story-chapter">{scenario.backstory.format.toUpperCase()} · {scenario.backstory.chapterTitles[prologueStep]}</span>
                <h1>{scenario.backstory.headlines[prologueStep]}</h1>
                <p>{scenario.backstory.chapters[prologueStep]}</p>
                <blockquote><span>ПОСЛЕДНИЙ ПРИНЯТЫЙ СИГНАЛ</span>{scenario.backstory.finalWords}</blockquote>
              </article>
            </div>
            <div className="story-controls">
              <div className="story-progress" aria-label={`Сцена ${prologueStep + 1} из 3`}>{[0, 1, 2].map((step) => <button key={step} className={step === prologueStep ? "active" : step < prologueStep ? "done" : ""} onClick={() => setPrologueStep(step)} aria-label={`Открыть сцену ${step + 1}`}><i />0{step + 1}</button>)}</div>
              <div className="story-actions">
                {prologueStep > 0 && <button className="story-back" onClick={() => setPrologueStep((step) => step - 1)}>← Назад</button>}
                {prologueStep < 2 ? <button className="primary story-next" onClick={() => setPrologueStep((step) => step + 1)}>Продолжить хронику <span>→</span></button> : isHost ? <button className="primary story-next" onClick={() => void enterGame()}>Войти в бункер <span>→</span></button> : <span className="story-wait"><i className="live-dot" /> Ожидаем создателя комнаты…</span>}
              </div>
            </div>
          </div>
          {isHost && <button className="story-skip" onClick={() => void enterGame()}>Пропустить пролог</button>}
        </section>
      )}

      {screen === "game" && (
        <section className="game-screen">
          <div className="game-status">
            <div><span className="eyebrow">Раунд {round} из 5</span><h2>{round === 1 ? "Первое знакомство" : round === 2 ? "Раскрытие деталей" : "Решающий аргумент"}</h2></div>
            <div className="round-progress">{[1,2,3,4,5].map((item) => <span className={item <= round ? "done" : ""} key={item}>{item}</span>)}</div>
            <div className="timer"><button onClick={() => setRunning(!running)}>{running ? "Ⅱ" : "▶"}</button><div><small>ВРЕМЯ ХОДА</small><b>{time}</b></div></div>
          </div>
          <div className="game-grid">
            <div className="game-main">
              <div className="scenario-banner threat-plate">
                <span className="metal-bolt bolt-one" /><span className="metal-bolt bolt-two" /><span className="metal-bolt bolt-three" /><span className="metal-bolt bolt-four" />
                <div className="threat-alarm"><i /><span>ТРЕВОГА</span></div>
                <span className="scenario-symbol">{scenario.icon}</span>
                <div className="threat-copy"><small>ПРОТОКОЛ КАТАСТРОФЫ · {gameSeed + 1} ИЗ 100</small><b>{scenario.title}</b><p>{scenario.summary}</p></div>
                <div className="threat-capacity"><small>МЕСТ В БУНКЕРЕ</small><b>{bunkerCapacity}</b><span>НА {gamePlayers.length} ПРЕТЕНДЕНТОВ</span></div>
                <div className="threat-level"><small>УРОВЕНЬ УГРОЗЫ</small><b>СМЕРТЕЛЬНЫЙ</b><span>НАРУЖНАЯ СРЕДА НЕПРИГОДНА</span></div>
                <button onClick={() => setDossierOpen(true)}>Открыть досье</button>
              </div>
              <div className="ai-host metal-ai-host panel">
                <span className="metal-bolt bolt-one" /><span className="metal-bolt bolt-two" /><span className="metal-bolt bolt-three" /><span className="metal-bolt bolt-four" />
                <div className="ai-host-head">
                  <div className="ai-core"><span /><span /><b>LIVE</b></div>
                  <div><small>КОМНАТА {code} · ТОЛЬКО РЕАЛЬНЫЕ ИГРОКИ</small><h2>Протокол партии</h2></div>
                  <span className="ai-status local">● {gamePlayers.length} В КОМНАТЕ</span>
                </div>
                <div className="ai-host-body">
                  <div className="ai-transcript">
                    <article><div><b>ЖИВАЯ КОМНАТА</b><time>Сейчас</time></div><p>Боты и автоматический ведущий отключены. Каждый участник входит по коду и выполняет свои действия самостоятельно.</p></article>
                    <article><div><b>ТЕКУЩИЙ ХОД</b><time>Раунд {round}</time></div><p>{roundComplete ? "Все реальные игроки завершили ход." : `Карту раскрывает ${currentPlayer?.name ?? "игрок"}. Остальные ожидают своей очереди.`}</p></article>
                  </div>
                  <div className="ai-host-controls">
                    <div className="ai-quick-actions">
                      {isHost ? <button onClick={drawEvent}>◇ Вытянуть событие</button> : <button disabled>◇ Событие запускает создатель</button>}
                      <button onClick={() => { navigator.clipboard?.writeText(code); setToast("Код комнаты скопирован"); }}>Копировать код {code}</button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="overhead-room" aria-label="Игровой стол, вид сверху">
                <div className="floor-grid" aria-hidden="true" />
                <div className="ceiling-projector"><span>◇</span><b>КОВЧЕГ</b><small>ЖИВАЯ КОМНАТА · {code}</small></div>
                <div className="survival-table">
                  <div className="table-rim" aria-hidden="true" />
                  <div className="table-center-console">
                    <span>{scenario.icon}</span><small>ПРОТОКОЛ · РАУНД {round} / 5</small>
                    <b>{roundComplete ? "Раунд завершён" : `Ход: ${currentPlayer.name}`}</b>
                    <p>{roundComplete ? "Все карты разыграны" : isMyTurn ? "Выберите карту из руки" : "Ожидайте ход игрока"}</p>
                  </div>
                  {gamePlayers.map((player, playerIndex) => {
                    const isSelf = player.name === name;
                    const angle = 180 + (360 / Math.max(1, gamePlayers.length)) * playerIndex;
                    const seatStyle = { "--seat-angle": `${angle}deg`, "--seat-counter": `${-angle}deg` } as CSSProperties;
                    const isCurrent = !roundComplete && player.name === currentPlayer?.name;
                    const hasPlayed = roundRevealed.includes(player.name);
                    const eliminated = eliminatedPlayers.includes(player.name);
                    return <div className={`table-seat ${isSelf ? "seat-self" : ""} ${isCurrent ? "current" : ""} ${hasPlayed ? "played" : ""} ${eliminated ? "eliminated" : ""}`} style={seatStyle} key={player.name}>
                      <div className="seat-chair" aria-hidden="true" /><div className="seat-person"><div className={`avatar ${player.color}`}>{eliminated ? "×" : hasPlayed ? "✓" : player.avatar}</div><span><b>{player.name}</b><small>{eliminated ? "ИСКЛЮЧЁН" : isSelf ? "Вы" : isCurrent ? "Сейчас ходит" : hasPlayed ? "Ход сделан" : "Ожидает"}</small></span></div>
                      <div className="player-card-rack" aria-label={`Карты игрока ${player.name}`}>
                        {traits.map((trait, index) => {
                          const opened = revealedCards[player.name]?.includes(index);
                          return <div className={`table-card-mini trait-${trait.id} ${opened ? "face-up" : "face-down"}`} key={trait.id} title={opened ? `${trait.label}: ${characterCards[player.name][index]}` : `${trait.label}: карта перевёрнута`}>
                            <span className="card-back-mark">{trait.suit}</span><span className="card-front-mini"><i>{trait.icon}</i><small>{trait.label}</small><b>{opened ? characterCards[player.name][index] : ""}</b></span>
                          </div>;
                        })}
                      </div>
                    </div>;
                  })}
                </div>
              </div>
              <details className="character-panel central-character-panel panel">
                <summary><span><small>Подробности партии</small><b>Таблица характеристик</b></span><em>Открыть таблицу ↓</em></summary>
                <div className="character-table-wrap">
                  <table className="character-table">
                    <thead><tr><th>Игрок</th>{traits.map((trait) => <th key={trait.label}><span className={`table-trait-icon trait-${trait.id}`}>{trait.icon}</span>{trait.label}</th>)}</tr></thead>
                    <tbody>{turnPlayers.map((player) => <tr key={player.name}>
                      <th><div className={`avatar ${player.color}`}>{player.avatar}</div><span>{player.name}{player.name === name && <small>Вы</small>}</span></th>
                      {traits.map((trait, index) => {
                        const opened = revealedCards[player.name]?.includes(index);
                        return <td className={`${opened ? "open" : "closed"} trait-cell trait-${trait.id}`} key={trait.label}>{opened ? <><b>{characterCards[player.name][index]}</b><small>{trait.icon} {trait.label}</small></> : <><span>{trait.icon}</span><small>{trait.label} · скрыто</small></>}</td>;
                      })}
                    </tr>)}</tbody>
                  </table>
                </div>
              </details>
            </div>
            <aside className="game-side">
              <button className="standalone-vote-button" disabled={!isHost} onClick={() => { setVoteFromRoundEnd(false); setVote(null); setVoteOpen(true); }}><span>⚖</span><b>Голосование</b><small>Выбрать игрока на исключение</small></button>
              <div className="tabs" role="tablist" aria-label="Боковая панель"><button role="tab" aria-selected={activeTab === "chat"} className={activeTab === "chat" ? "active" : ""} onClick={() => setActiveTab("chat")}>Чат</button><button role="tab" aria-selected={activeTab === "events"} className={activeTab === "events" ? "active" : ""} onClick={() => setActiveTab("events")}>События <span>{liveEvents.length}</span></button><button role="tab" aria-selected={activeTab === "players"} className={activeTab === "players" ? "active" : ""} onClick={() => setActiveTab("players")}>Игроки</button></div>
              {activeTab === "chat" && <div className="chat panel">
                <div className="messages">{messages.map((item) => <div className={item.mine ? "message mine" : "message"} key={item.id}><b>{item.who}</b><p>{item.text}</p></div>)}</div>
                <form onSubmit={sendMessage}><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Сообщение игрокам…" aria-label="Сообщение" /><button aria-label="Отправить">↑</button></form>
              </div>}
              {activeTab === "events" && <div className="events side-tab-panel panel"><div className="panel-title"><h2>Колода событий</h2><span>{liveEvents.length} карт</span></div><div className="event-deck-list">{liveEvents.map((event, index) => <article className="event-mini-card" key={`${event.time}-${index}`}><span className="event-mini-index">{String(liveEvents.length - index).padStart(2, "0")}</span><time>{event.time}</time><b>{event.text}</b><small>{event.detail}</small><i>{scenario.icon}</i></article>)}</div></div>}
              {activeTab === "players" && <div className="side-players side-tab-panel panel">{gamePlayers.map((player) => <div className={`side-player ${eliminatedPlayers.includes(player.name) ? "eliminated" : ""}`} key={player.name}><div className={`avatar ${player.color}`}>{eliminatedPlayers.includes(player.name) ? "×" : player.avatar}</div><span><b>{player.name}</b><small>{eliminatedPlayers.includes(player.name) ? "Исключён из бункера" : roundRevealed.includes(player.name) ? "Ход сделан" : player.name === currentPlayer?.name ? "Сейчас ходит" : "В игре"}</small></span><i className={player.ready && !eliminatedPlayers.includes(player.name) ? "online" : ""}>{player.ready && !eliminatedPlayers.includes(player.name) ? "●" : "○"}</i></div>)}</div>}
              <div className="host-panel panel">
                <div className="panel-title"><h2>◆ Пульт партии</h2><span>{isHost ? "Создатель комнаты" : "Ожидание создателя"}</span></div>
                <button disabled={!isHost} onClick={() => setRunning(!running)}>{running ? "Ⅱ Поставить на паузу" : "▶ Продолжить таймер"}</button>
                {isHost ? <button className="primary" disabled={!roundComplete} onClick={() => round >= 5 ? setEndingOpen(true) : void nextRound()}>{round >= 5 ? "Показать финал" : roundComplete ? "Следующий раунд →" : `Осталось ходов: ${turnPlayers.filter((player) => !roundRevealed.includes(player.name)).length}`}</button> : <div className="multiplayer-wait"><span className="live-dot" /> Ходы других игроков нельзя разыграть за них</div>}
              </div>
            </aside>
          </div>
          <div className={`card-hand-dock ${handOpen ? "open" : "collapsed"}`}>
            <button className="hand-toggle" onClick={() => setHandOpen((value) => !value)} aria-expanded={handOpen} aria-label={handOpen ? "Свернуть карты персонажа" : "Развернуть карты персонажа"}>
              <span>{handOpen ? "⌄" : "⌃"}</span><b>Ваши карты · {name || "Игрок"}</b><small>{isMyTurn && !roundRevealed.includes(name) ? "Выберите одну карту" : "Следите за очередью хода"}</small>
            </button>
            <div className="hand-fan" aria-hidden={!handOpen}>
              {traits.map((trait, index) => {
                const revealed = myRevealedCards.includes(index);
                const canReveal = isMyTurn && !roundRevealed.includes(name) && !revealed;
                return <button disabled={!canReveal} tabIndex={handOpen ? 0 : -1} key={trait.label} className={`hand-card trait-${trait.id} ${revealed ? "revealed" : "locked"} ${canReveal ? "available" : ""}`} onClick={() => void revealCard(name, index)} aria-label={`${trait.label}: ${revealed ? myCards[index] : "не раскрыто"}`}>
                  <span className="hand-corner"><b>{trait.rank}</b>{trait.suit}</span>
                  <span className="hand-symbol">{trait.icon}</span>
                  <span className="hand-card-copy"><small>{trait.label}</small><b>{revealed ? myCards[index] : "Не раскрыто"}</b></span>
                  {canReveal && <i>ВАШ ХОД</i>}
                </button>;
              })}
            </div>
          </div>
        </section>
      )}

      {showCreate && <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}><form className="modal" onSubmit={createRoom} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="close" onClick={() => setShowCreate(false)}>×</button><span className="eyebrow">Новая комната</span><h2>Создать комнату</h2><p>Введите имя. После создания вы получите код для приглашения реальных игроков.</p><label>Ваше имя<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={20} autoFocus /></label>{roomError && <p className="room-error">{roomError}</p>}<button className="primary big" type="submit" disabled={roomLoading}>{roomLoading ? "Создаём…" : "Создать комнату"} <span>→</span></button></form></div>}

      {showJoin && <div className="modal-backdrop" onMouseDown={() => setShowJoin(false)}><form className="modal" onSubmit={joinRoom} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="close" onClick={() => setShowJoin(false)}>×</button><span className="eyebrow">Подключение</span><h2>Войти в комнату</h2><p>Введите имя и четырёхсимвольный код от создателя комнаты.</p><label>Ваше имя<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={20} /></label><label>Код комнаты<input className="code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} required minLength={4} maxLength={4} /></label>{roomError && <p className="room-error">{roomError}</p>}<button className="primary big" type="submit" disabled={roomLoading}>{roomLoading ? "Подключаем…" : "Присоединиться"} <span>→</span></button></form></div>}

      {dossierOpen && <div className="modal-backdrop dossier-backdrop" onMouseDown={() => setDossierOpen(false)}><article className="catastrophe-dossier" role="dialog" aria-modal="true" aria-label={`Досье катастрофы: ${scenario.title}`} onMouseDown={(event) => event.stopPropagation()}>
        <span className="paper-fold dossier-fold-one" /><span className="paper-fold dossier-fold-two" /><span className="paper-stain dossier-stain-one" /><span className="paper-stain dossier-stain-two" />
        <button className="dossier-close" onClick={() => setDossierOpen(false)} aria-label="Закрыть досье">×</button>
        <header><span>{scenario.icon}</span><div><small>АРХИВ «КОВЧЕГ» · ДЕЛО {String(gameSeed + 1).padStart(3, "0")}</small><h2>{scenario.title}</h2><p>ПРОТОКОЛ КАТАСТРОФЫ · ДОПУСК КРАСНЫЙ</p></div></header>
        <div className="dossier-stamp">РАССЕКРЕЧЕНО</div>
        <section className="dossier-lead"><span>СВОДКА</span><p>{scenario.opening}</p></section>
        <div className="dossier-grid"><section><small>ЧТО ПРОИЗОШЛО</small><p>{scenario.summary}. {scenario.detail}.</p></section><section><small>ОБСТАНОВКА СНАРУЖИ</small><p>{scenario.outside}. Главная угроза — {scenario.threat}.</p></section><section><small>ГЛАВНЫЙ ДЕФИЦИТ</small><b>{scenario.resource}</b></section><section><small>ВМЕСТИМОСТЬ</small><b>{bunkerCapacity} места на {gamePlayers.length} человек</b></section></div>
        <blockquote>{scenario.backstory.finalWords}</blockquote>
        <footer><span>ДАТА НУЛЕВОГО ДНЯ · {scenario.backstory.date}</span><button onClick={() => setDossierOpen(false)}>Закрыть документ</button></footer>
      </article></div>}

      {roundVoteOpen && <div className="modal-backdrop vote-decision-backdrop"><div className="modal round-vote-modal" role="dialog" aria-modal="true" aria-label="Решение о голосовании"><span className="metal-bolt bolt-one" /><span className="metal-bolt bolt-two" /><span className="metal-bolt bolt-three" /><span className="metal-bolt bolt-four" /><span className="eyebrow">РАУНД {round} ЗАВЕРШЁН</span><h2>Проводим голосование?</h2><p>Каждый оставшийся игрок отвечает «да» или «нет». Голосование за исключение начнётся только при большинстве голосов.</p>{!roundVoteChoice ? <div className="round-vote-actions"><button className="vote-yes" onClick={() => castRoundVote("yes")}>ДА<small>Нужно исключение</small></button><button className="vote-no" onClick={() => castRoundVote("no")}>НЕТ<small>Продолжить игру</small></button></div> : <><div className="ballot-grid">{turnPlayers.map((player) => <div key={player.name}><span className={`avatar ${player.color}`}>{player.avatar}</span><b>{player.name}</b><i className={roundBallots[player.name]}>{roundBallots[player.name] === "yes" ? "ДА" : "НЕТ"}</i></div>)}</div><div className={`majority-result ${roundVoteResult}`}><small>РЕШЕНИЕ БОЛЬШИНСТВА</small><b>{roundVoteResult === "yes" ? "ГОЛОСОВАНИЮ БЫТЬ" : "ГРУППА ПРОДОЛЖАЕТ БЕЗ ИСКЛЮЧЕНИЯ"}</b><span>{Object.values(roundBallots).filter((item) => item === "yes").length} за · {Object.values(roundBallots).filter((item) => item === "no").length} против</span></div>{isHost ? <button className="primary big" onClick={continueAfterRoundVote}>{roundVoteResult === "yes" ? "Выбрать, кто покинет бункер →" : round >= 5 ? "Узнать судьбу команды →" : "Перейти к следующему раунду →"}</button> : <div className="multiplayer-wait"><span className="live-dot" /> Создатель комнаты продолжит игру</div>}</>}</div></div>}

      {voteOpen && <div className="modal-backdrop" onMouseDown={() => { setVoteOpen(false); setVoteFromRoundEnd(false); }}><div className="modal vote-modal" onMouseDown={(e) => e.stopPropagation()}><button className="close" onClick={() => { setVoteOpen(false); setVoteFromRoundEnd(false); }}>×</button><span className="eyebrow">Голосование</span><h2>Кто покинет бункер?</h2><p>Выберите игрока. Решение нельзя изменить после подтверждения.</p><div className="vote-list">{turnPlayers.filter((player) => player.name !== name).map((player) => <button className={vote === player.name ? "selected" : ""} key={player.name} onClick={() => setVote(player.name)}><div className={`avatar ${player.color}`}>{player.avatar}</div><b>{player.name}</b><span>{vote === player.name ? "✓" : "○"}</span></button>)}</div><button className="primary big" disabled={!vote || !isHost} onClick={() => void confirmElimination()}>Исключить игрока</button></div></div>}

      {endingOpen && <div className="modal-backdrop ending-backdrop"><div className="modal ending-modal" role="dialog" aria-modal="true" aria-label="Финал игры"><span className="metal-bolt bolt-one" /><span className="metal-bolt bolt-two" /><span className="metal-bolt bolt-three" /><span className="metal-bolt bolt-four" /><div className="ending-seal">{scenario.icon}</div><span className="eyebrow">ПРОТОКОЛ «КОВЧЕГ» · ФИНАЛ</span><h2>{gameEnding.title}</h2><p>{gameEnding.verdict}</p><div className="survivor-list"><small>ДВЕРЬ БУНКЕРА ЗАКРЫЛАСЬ ЗА</small>{gameEnding.survivors.map((player) => <article key={player.name}><div className={`avatar ${player.color}`}>{player.avatar}</div><span><b>{player.name}</b><small>{characterCards[player.name]?.[0]}</small></span></article>)}</div><div className="ending-systems"><span className={gameEnding.hasMedicine ? "online" : "offline"}>✚ Медицина</span><span className={gameEnding.hasEngineering ? "online" : "offline"}>⚙ Инженерия</span><span className={gameEnding.hasFood ? "online" : "offline"}>♨ Пища</span></div><blockquote>«Снаружи — {scenario.title.toLowerCase()}. Внутри — последний шанс человечества»</blockquote><div className="ending-actions"><button className="secondary big" onClick={() => { setEndingOpen(false); setScreen("home"); }}>На главную</button><button className="primary big" onClick={() => prepareNewGame()}>Новая партия →</button></div></div></div>}
      {eventCard && <div className="event-reveal-backdrop" role="dialog" aria-modal="true" aria-label={`Событие: ${eventCard.title}`}>
        <div className="event-playing-card">
          <span className="paper-fold fold-one" /><span className="paper-fold fold-two" /><span className="paper-stain stain-one" /><span className="paper-stain stain-two" />
          <span className="event-card-corner top"><b>{String(eventCard.number).padStart(2, "0")}</b>{scenario.icon}</span>
          <div className="event-card-stamp">СОБЫТИЕ РАУНДА {round}</div>
          <span className="event-card-kicker">КОЛОДА «{scenario.title.split(":")[0]}»</span>
          <div className="event-card-symbol">{scenario.icon}</div>
          <h2>{eventCard.title}</h2>
          <p>{eventCard.message}</p>
          <div className="event-consequence"><small>ПОСЛЕДСТВИЕ</small><b>{eventCard.consequence}</b></div>
          <button onClick={() => { setEventCard(null); setRunning(true); }}>Принять событие <span>→</span></button>
          <span className="event-card-corner bottom"><b>{String(eventCard.number).padStart(2, "0")}</b>{scenario.icon}</span>
        </div>
      </div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}
