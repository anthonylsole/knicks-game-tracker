// Cloudflare Worker entry point.
//
// Routes
//   GET    /api/games            list attended games (newest first) with top performers
//   POST   /api/games            add an attended game; pass fromUpcomingId to promote an upcoming game
//   GET    /api/upcoming         list upcoming games (soonest first)
//   POST   /api/upcoming         add an upcoming game
//   DELETE /api/upcoming/:id     remove an upcoming game
//
// Everything else is served from the static assets in /public (env.ASSETS).
//
// Reading is public. Every write (POST / DELETE) must send the passcode in an
// "X-Passcode" header, which has to match the ADMIN_PASSCODE secret set on the
// Worker in the Cloudflare dashboard.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path.startsWith("/api/")) {
      try {
        if (path === "/api/games") {
          if (request.method === "GET") return await listGames(env);
          if (request.method === "POST") return await addGame(request, env);
          return json({ error: "Method not allowed" }, 405);
        }

        if (path === "/api/upcoming") {
          if (request.method === "GET") return await listUpcoming(env);
          if (request.method === "POST") return await addUpcoming(request, env);
          return json({ error: "Method not allowed" }, 405);
        }

        const match = path.match(/^\/api\/upcoming\/(\d+)$/);
        if (match) {
          if (request.method === "DELETE") return await removeUpcoming(request, env, Number(match[1]));
          return json({ error: "Method not allowed" }, 405);
        }

        return json({ error: "Not found" }, 404);
      } catch (err) {
        return json({ error: err && err.message ? err.message : String(err) }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};

/* ---------- helpers ---------- */

function json(body, status = 200) {
  return Response.json(body, { status });
}

// Compare two strings without bailing out at the first mismatch.
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// Returns a Response when the request must be rejected, otherwise null.
function checkPasscode(request, env) {
  if (!env.ADMIN_PASSCODE) {
    return json({ error: "No ADMIN_PASSCODE secret is set on the Worker yet, so saving is switched off." }, 503);
  }
  const given = request.headers.get("X-Passcode") || "";
  if (!safeEqual(given, String(env.ADMIN_PASSCODE))) {
    return json({ error: "Wrong passcode." }, 401);
  }
  return null;
}

async function readBody(request) {
  try {
    const body = await request.json();
    if (body && typeof body === "object") return body;
  } catch (_) { /* fall through */ }
  throw new HttpError("Request body must be JSON.", 400);
}

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function text(value, field, max, { required = true } = {}) {
  const s = value === undefined || value === null ? "" : String(value).trim();
  if (required && !s) throw new HttpError(`Missing field: ${field}`, 400);
  if (s.length > max) throw new HttpError(`${field} is too long (max ${max} characters).`, 400);
  return s;
}

function count(value, field) {
  const n = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isInteger(n) || n < 0 || n > 400) {
    throw new HttpError(`${field} must be a whole number of 0 or more.`, 400);
  }
  return n;
}

function isoDate(value) {
  const s = text(value, "sortDate", 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new HttpError("Date must look like 2026-04-20.", 400);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new HttpError("That date doesn't exist.", 400);
  return s;
}

function displayDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function color(value) {
  const s = value === undefined || value === null ? "" : String(value).trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : "#4A5B7A";
}

// Fields shared by an upcoming game and a completed game.
function readMatchup(body) {
  const sortDate = isoDate(body.sortDate);
  return {
    sortDate,
    date: displayDate(sortDate),
    opponent: text(body.opponent, "opponent", 60),
    oppAbbr: text(body.oppAbbr, "oppAbbr", 4).toUpperCase(),
    oppColor: color(body.oppColor),
    location: text(body.location, "location", 120),
    venue: text(body.venue, "venue", 120),
    competition: text(body.competition, "competition", 120)
  };
}

/* ---------- games ---------- */

async function listGames(env) {
  const gamesResult = await env.DB.prepare(
    `SELECT * FROM games ORDER BY sort_date DESC, id DESC`
  ).all();

  const leadersResult = await env.DB.prepare(
    `SELECT * FROM leaders ORDER BY game_id, sort_order`
  ).all();

  const leadersByGame = {};
  for (const l of leadersResult.results) {
    if (!leadersByGame[l.game_id]) leadersByGame[l.game_id] = [];
    leadersByGame[l.game_id].push({ name: l.name, stat: l.stat });
  }

  const games = gamesResult.results.map(g => ({
    id: g.id,
    date: g.game_date,
    sortDate: g.sort_date,
    opponent: g.opponent,
    oppAbbr: g.opp_abbr,
    oppColor: g.opp_color,
    location: g.location,
    venue: g.venue,
    competition: g.competition,
    result: g.result,
    knicksScore: g.knicks_score,
    oppScore: g.opp_score,
    box: {
      reb: g.reb,
      ast: g.ast,
      fgm: g.fgm,
      fga: g.fga,
      tpm: g.tpm,
      tpa: g.tpa,
      ftm: g.ftm,
      fta: g.fta
    },
    leaders: leadersByGame[g.id] || [],
    recap: g.recap
  }));

  return json(games);
}

async function addGame(request, env) {
  const denied = checkPasscode(request, env);
  if (denied) return denied;

  try {
    const body = await readBody(request);
    const matchup = readMatchup(body);

    const knicksScore = count(body.knicksScore, "Knicks score");
    const oppScore = count(body.oppScore, "Opponent score");
    if (knicksScore === oppScore) throw new HttpError("NBA games can't end tied. Check the scores.", 400);
    const result = knicksScore > oppScore ? "W" : "L";

    const box = body.box || {};
    const b = {
      reb: count(box.reb, "Rebounds"),
      ast: count(box.ast, "Assists"),
      fgm: count(box.fgm, "Field goals made"),
      fga: count(box.fga, "Field goals attempted"),
      tpm: count(box.tpm, "Threes made"),
      tpa: count(box.tpa, "Threes attempted"),
      ftm: count(box.ftm, "Free throws made"),
      fta: count(box.fta, "Free throws attempted")
    };
    if (b.fgm > b.fga) throw new HttpError("Field goals made can't be more than attempted.", 400);
    if (b.tpm > b.tpa) throw new HttpError("Threes made can't be more than attempted.", 400);
    if (b.ftm > b.fta) throw new HttpError("Free throws made can't be more than attempted.", 400);
    if (b.tpm > b.fgm) throw new HttpError("Threes made can't be more than field goals made.", 400);

    const recap = text(body.recap, "recap", 2000, { required: false });

    const leaders = (Array.isArray(body.leaders) ? body.leaders : [])
      .map(l => ({
        name: text(l && l.name, "leader name", 60, { required: false }),
        stat: text(l && l.stat, "leader stat line", 80, { required: false })
      }))
      .filter(l => l.name)
      .slice(0, 6);

    let fromUpcomingId = null;
    if (body.fromUpcomingId !== undefined && body.fromUpcomingId !== null && body.fromUpcomingId !== "") {
      fromUpcomingId = Number(body.fromUpcomingId);
      if (!Number.isInteger(fromUpcomingId) || fromUpcomingId < 1) {
        throw new HttpError("fromUpcomingId must be a number.", 400);
      }
    }

    const insert = await env.DB.prepare(
      `INSERT INTO games
        (game_date, sort_date, opponent, opp_abbr, opp_color, location, venue,
         competition, result, knicks_score, opp_score, reb, ast, fgm, fga, tpm, tpa, ftm, fta, recap)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      matchup.date, matchup.sortDate, matchup.opponent, matchup.oppAbbr, matchup.oppColor,
      matchup.location, matchup.venue, matchup.competition, result,
      knicksScore, oppScore,
      b.reb, b.ast, b.fgm, b.fga, b.tpm, b.tpa, b.ftm, b.fta,
      recap
    ).run();

    const gameId = insert.meta.last_row_id;

    // Top performers and the upcoming-game cleanup go in one batch, which D1
    // runs as a single transaction.
    const followUps = leaders.map((l, i) =>
      env.DB.prepare(
        `INSERT INTO leaders (game_id, name, stat, sort_order) VALUES (?, ?, ?, ?)`
      ).bind(gameId, l.name, l.stat, i)
    );
    if (fromUpcomingId !== null) {
      followUps.push(env.DB.prepare(`DELETE FROM upcoming_games WHERE id = ?`).bind(fromUpcomingId));
    }
    if (followUps.length) await env.DB.batch(followUps);

    return json({ id: gameId, result }, 201);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    throw err;
  }
}

/* ---------- upcoming games ---------- */

async function listUpcoming(env) {
  const result = await env.DB.prepare(
    `SELECT * FROM upcoming_games ORDER BY sort_date ASC, id ASC`
  ).all();

  return json(result.results.map(u => ({
    id: u.id,
    date: u.game_date,
    sortDate: u.sort_date,
    opponent: u.opponent,
    oppAbbr: u.opp_abbr,
    oppColor: u.opp_color,
    location: u.location,
    venue: u.venue,
    competition: u.competition
  })));
}

async function addUpcoming(request, env) {
  const denied = checkPasscode(request, env);
  if (denied) return denied;

  try {
    const body = await readBody(request);
    const m = readMatchup(body);

    const insert = await env.DB.prepare(
      `INSERT INTO upcoming_games
        (game_date, sort_date, opponent, opp_abbr, opp_color, location, venue, competition)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(m.date, m.sortDate, m.opponent, m.oppAbbr, m.oppColor, m.location, m.venue, m.competition).run();

    return json({ id: insert.meta.last_row_id }, 201);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    throw err;
  }
}

async function removeUpcoming(request, env, id) {
  const denied = checkPasscode(request, env);
  if (denied) return denied;

  await env.DB.prepare(`DELETE FROM upcoming_games WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
