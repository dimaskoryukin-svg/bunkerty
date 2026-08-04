import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

type RoomRow = {
  code: string;
  host_token: string;
  status: string;
  seed: number;
  round: number;
  current_turn: number;
};

type PlayerRow = {
  id: string;
  name: string;
  avatar: string;
  color: string;
  seat: number;
  ready: number;
  eliminated: number;
};

type GlobalWithDb = typeof globalThis & { __bunkerDb?: DatabaseSync };

const colors = ["violet", "coral", "amber", "blue", "green", "violet", "coral", "amber"];
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

function getDb(): DatabaseSync {
  const globalDb = globalThis as GlobalWithDb;
  if (globalDb.__bunkerDb) return globalDb.__bunkerDb;

  const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "bunker.sqlite");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      host_token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'lobby',
      seed INTEGER NOT NULL,
      round INTEGER NOT NULL DEFAULT 1,
      current_turn INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS room_players (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      room_code TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL,
      color TEXT NOT NULL,
      seat INTEGER NOT NULL,
      ready INTEGER NOT NULL DEFAULT 0,
      eliminated INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL,
      FOREIGN KEY(room_code) REFERENCES rooms(code) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_room_players_room_name ON room_players(room_code, name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_room_players_room_seat ON room_players(room_code, seat);
    CREATE TABLE IF NOT EXISTS room_reveals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      player_id TEXT NOT NULL,
      round INTEGER NOT NULL,
      card_index INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_room_reveals_turn ON room_reveals(room_code, player_id, round);
    CREATE TABLE IF NOT EXISTS room_ballots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      player_id TEXT NOT NULL,
      round INTEGER NOT NULL,
      choice TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_room_ballots_turn ON room_ballots(room_code, player_id, round);
    CREATE TABLE IF NOT EXISTS room_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      player_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_room_messages_room_id ON room_messages(room_code, id);
  `);

  globalDb.__bunkerDb = db;
  return db;
}

function roomPayload(code: string) {
  const db = getDb();
  const room = db
    .prepare("SELECT code, host_token, status, seed, round, current_turn FROM rooms WHERE code = ?")
    .get(code) as RoomRow | undefined;
  if (!room) return null;

  const players = db
    .prepare("SELECT id, name, avatar, color, seat, ready, eliminated FROM room_players WHERE room_code = ? ORDER BY seat")
    .all(code) as PlayerRow[];
  const reveals = db
    .prepare("SELECT rr.player_id, rr.round, rr.card_index, rp.name FROM room_reveals rr JOIN room_players rp ON rp.id = rr.player_id WHERE rr.room_code = ? ORDER BY rr.id")
    .all(code);
  const ballots = db
    .prepare("SELECT rb.player_id, rb.choice, rp.name FROM room_ballots rb JOIN room_players rp ON rp.id = rb.player_id WHERE rb.room_code = ? AND rb.round = ? ORDER BY rb.id")
    .all(code, room.round);
  const messages = db
    .prepare("SELECT rm.id, rm.player_id, rp.name, rm.text, rm.created_at FROM room_messages rm JOIN room_players rp ON rp.id = rm.player_id WHERE rm.room_code = ? ORDER BY rm.id DESC LIMIT 100")
    .all(code)
    .reverse();

  return {
    room: {
      code: room.code,
      status: room.status,
      seed: room.seed,
      round: room.round,
      currentTurn: room.current_turn,
    },
    players: players.map((player) => ({
      ...player,
      ready: Boolean(player.ready),
      eliminated: Boolean(player.eliminated),
    })),
    reveals,
    ballots,
    messages,
  };
}

function cleanName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 20);
}

function cleanMessage(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.toUpperCase() ?? "";
  const payload = roomPayload(code);
  return payload ? json(payload) : json({ error: "Комната не найдена" }, 404);
}

export async function POST(request: Request) {
  const db = getDb();
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const name = cleanName(body.name);

  if (action === "create") {
    if (name.length < 2) return json({ error: "Введите имя от 2 символов" }, 400);
    let code = makeCode();
    while (db.prepare("SELECT code FROM rooms WHERE code = ?").get(code)) code = makeCode();

    const token = crypto.randomUUID();
    const playerId = crypto.randomUUID();
    const now = Date.now();
    const seed = Math.floor(Math.random() * 100);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO rooms (code, host_token, status, seed, round, current_turn, created_at) VALUES (?, ?, 'lobby', ?, 1, 0, ?)")
        .run(code, token, seed, now);
      db.prepare("INSERT INTO room_players (id, token, room_code, name, avatar, color, seat, ready, joined_at) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)")
        .run(playerId, token, code, name, name[0].toUpperCase(), colors[0], now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return json({ ...roomPayload(code), token, playerId, isHost: true }, 201);
  }

  if (action === "join") {
    const code = String(body.code ?? "").trim().toUpperCase();
    if (name.length < 2 || code.length !== 4) return json({ error: "Проверьте имя и код комнаты" }, 400);
    const room = db.prepare("SELECT status FROM rooms WHERE code = ?").get(code) as { status: string } | undefined;
    if (!room) return json({ error: "Комната с таким кодом не найдена" }, 404);
    if (room.status !== "lobby") return json({ error: "Игра в этой комнате уже началась" }, 409);

    const count = Number((db.prepare("SELECT COUNT(*) AS count FROM room_players WHERE room_code = ?").get(code) as { count: number }).count);
    if (count >= 8) return json({ error: "В комнате нет свободных мест" }, 409);

    const token = crypto.randomUUID();
    const playerId = crypto.randomUUID();
    try {
      db.prepare("INSERT INTO room_players (id, token, room_code, name, avatar, color, seat, ready, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)")
        .run(playerId, token, code, name, name[0].toUpperCase(), colors[count], count, Date.now());
    } catch {
      return json({ error: "Игрок с таким именем уже находится в комнате" }, 409);
    }
    return json({ ...roomPayload(code), token, playerId, isHost: false }, 201);
  }

  const code = String(body.code ?? "").trim().toUpperCase();
  const token = String(body.token ?? "");
  const player = db.prepare("SELECT id, seat FROM room_players WHERE room_code = ? AND token = ?").get(code, token) as { id: string; seat: number } | undefined;
  const room = db.prepare("SELECT code, host_token, status, round, current_turn FROM rooms WHERE code = ?").get(code) as RoomRow | undefined;
  if (!player || !room) return json({ error: "Сессия игрока не найдена" }, 401);

  if (action === "ready") {
    db.prepare("UPDATE room_players SET ready = ? WHERE id = ?").run(body.ready ? 1 : 0, player.id);
  } else if (action === "start") {
    if (room.host_token !== token) return json({ error: "Запустить игру может только создатель комнаты" }, 403);
    const count = Number((db.prepare("SELECT COUNT(*) AS count FROM room_players WHERE room_code = ?").get(code) as { count: number }).count);
    if (count < 2) return json({ error: "Для начала нужны хотя бы два реальных игрока" }, 409);
    db.prepare("UPDATE rooms SET status = 'briefing' WHERE code = ?").run(code);
  } else if (action === "enter") {
    if (room.host_token !== token) return json({ error: "Переход подтверждает создатель комнаты" }, 403);
    db.prepare("UPDATE rooms SET status = 'game' WHERE code = ?").run(code);
  } else if (action === "reveal") {
    const active = db.prepare("SELECT id FROM room_players WHERE room_code = ? AND eliminated = 0 ORDER BY seat").all(code) as Array<{ id: string }>;
    if (active[room.current_turn]?.id !== player.id) return json({ error: "Сейчас ход другого игрока" }, 409);
    const cardIndex = Math.max(0, Math.min(5, Number(body.cardIndex)));
    try {
      db.prepare("INSERT INTO room_reveals (room_code, player_id, round, card_index, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(code, player.id, room.round, cardIndex, Date.now());
    } catch {
      return json({ error: "В этом раунде карта уже раскрыта" }, 409);
    }
    const played = Number((db.prepare("SELECT COUNT(*) AS count FROM room_reveals WHERE room_code = ? AND round = ?").get(code, room.round) as { count: number }).count);
    if (played < active.length) db.prepare("UPDATE rooms SET current_turn = current_turn + 1 WHERE code = ?").run(code);
  } else if (action === "next-round") {
    if (room.host_token !== token) return json({ error: "Новый раунд запускает создатель комнаты" }, 403);
    db.prepare("UPDATE rooms SET round = MIN(round + 1, 5), current_turn = 0 WHERE code = ?").run(code);
  } else if (action === "round-vote") {
    const choice = body.choice === "yes" ? "yes" : "no";
    db.prepare("INSERT INTO room_ballots (room_code, player_id, round, choice) VALUES (?, ?, ?, ?) ON CONFLICT(room_code, player_id, round) DO UPDATE SET choice = excluded.choice")
      .run(code, player.id, room.round, choice);
  } else if (action === "message") {
    const text = cleanMessage(body.text);
    if (!text) return json({ error: "Введите сообщение" }, 400);
    db.prepare("INSERT INTO room_messages (room_code, player_id, text, created_at) VALUES (?, ?, ?, ?)")
      .run(code, player.id, text, Date.now());
  } else if (action === "eliminate") {
    if (room.host_token !== token) return json({ error: "Исключить игрока может только создатель комнаты" }, 403);
    const playerName = cleanName(body.playerName);
    const target = db.prepare("SELECT id FROM room_players WHERE room_code = ? AND name = ? AND eliminated = 0").get(code, playerName) as { id: string } | undefined;
    if (!target) return json({ error: "Игрок не найден или уже исключён" }, 404);
    if (target.id === player.id) return json({ error: "Создатель не может исключить себя этим действием" }, 409);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE room_players SET eliminated = 1 WHERE id = ?").run(target.id);
      db.prepare("UPDATE rooms SET current_turn = 0 WHERE code = ?").run(code);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } else {
    return json({ error: "Неизвестное действие" }, 400);
  }

  return json(roomPayload(code));
}
