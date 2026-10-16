// Cloudflare Worker entry point.
//
// Routes
//   GET    /api/games            list attended games (newest first) with top performers
//   POST   /api/games            add an attended game; pass fromUpcomingId to promote an upcoming game
//   POST   /api/games/:id/boxscore  fetch and store the full player box score from ESPN for a game
//   GET    /api/upcoming         list upcoming games (soonest first)
//   POST   /api/upcoming         add an upcoming game
//   DELETE /api/upcoming/:id     remove an upcoming game
//   POST   /api/upcoming/:id/sync  pull the final score and box score from ESPN, turn the
//                                  upcoming game into a played game, and remove it from upcoming
//
// Everything else is served from the static assets in /public (env.ASSETS).
//
// There is no login: anyone who has the site's address can read and change the data.

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

        const boxMatch = path.match(/^\/api\/games\/(\d+)\/boxscore$/);
        if (boxMatch) {
          if (request.method === "POST") return await loadBoxScore(env, Number(boxMatch[1]));
          return json({ error: "Method not allowed" }, 405);
        }

        if (path === "/api/upcoming") {
          if (request.method === "GET") return await listUpcoming(env);
          if (request.method === "POST") return await addUpcoming(request, env);
          return json({ error: "Method not allowed" }, 405);
        }

        const syncMatch = path.match(/^\/api\/upcoming\/(\d+)\/sync$/);
        if (syncMatch) {
          if (request.method === "POST") return await syncUpcoming(env, Number(syncMatch[1]));
          return json({ error: "Method not allowed" }, 405);
        }

        const match = path.match(/^\/api\/upcoming\/(\d+)$/);
        if (match) {
          if (request.method === "DELETE") return await removeUpcoming(request, env, Number(match[1]));
          return json({ error: "Method not allowed" }, 405);
        }

        return json({ error: "Not found" }, 404);
      } catch (err) {
        if (err instanceof HttpError) return json({ error: err.message }, err.status);
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
    recap: g.recap,
    boxScore: parseBoxScore(g.box_json)
  }));

  return json(games);
}

async function addGame(request, env) {
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
  await env.DB.prepare(`DELETE FROM upcoming_games WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

/* ---------- ESPN ---------- */

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";

async function espn(path) {
  const res = await fetch(ESPN + path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new HttpError(`ESPN didn't answer (status ${res.status}). Try again in a minute.`, 502);
  return res.json();
}

function boxStat(team, name) {
  const s = (team.statistics || []).find(x => x.name === name);
  return s ? String(s.displayValue) : "";
}

function madeAtt(team, name) {
  const [m, a] = boxStat(team, name).split("-").map(Number);
  if (!Number.isInteger(m) || !Number.isInteger(a)) throw new HttpError("ESPN's box score is missing shooting numbers.", 502);
  return [m, a];
}

function parseBoxScore(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

// Player columns kept for the card's box score, in display order.
const BOX_COLUMNS = ["MIN", "PTS", "REB", "AST", "FG", "3PT", "FT", "STL", "BLK", "TO", "PF", "+/-"];

function buildBoxScore(summary) {
  const teams = [];
  for (const t of (summary.boxscore || {}).players || []) {
    const block = (t.statistics || [])[0];
    if (!block) continue;
    const idx = BOX_COLUMNS.map(c => (block.names || []).indexOf(c));
    const pick = arr => idx.map(i => (i >= 0 && arr && arr[i] !== undefined ? String(arr[i]) : ""));
    const players = (block.athletes || []).map(a => {
      const dnp = Boolean(a.didNotPlay) || !(a.stats && a.stats.length);
      return {
        name: (a.athlete && (a.athlete.displayName || a.athlete.shortName)) || "Unknown",
        pos: (a.athlete && a.athlete.position && a.athlete.position.abbreviation) || "",
        starter: Boolean(a.starter),
        dnp,
        reason: dnp ? String(a.reason || "") : "",
        s: dnp ? [] : pick(a.stats)
      };
    });
    teams.push({
      abbr: t.team.abbreviation,
      name: t.team.displayName || t.team.abbreviation,
      players,
      totals: pick(block.totals)
    });
  }
  const ny = teams.findIndex(t => t.abbr === "NY");
  if (ny < 0 || teams.length < 2) return null;
  if (ny > 0) teams.unshift(...teams.splice(ny, 1));
  return { columns: BOX_COLUMNS, teams };
}

// Looks up the finished Knicks game on a date. Throws a friendly error when it isn't available.
async function findFinalGame(sortDate, label) {
  const board = await espn(`/scoreboard?dates=${sortDate.replace(/-/g, "")}`);
  const event = (board.events || []).find(e =>
    (((e.competitions || [])[0] || {}).competitors || []).some(c => c.team && c.team.abbreviation === "NY")
  );
  if (!event) throw new HttpError(`ESPN has no Knicks game on ${label}.`, 404);

  const comp = event.competitions[0];
  const ny = comp.competitors.find(c => c.team.abbreviation === "NY");
  const opp = comp.competitors.find(c => c.team.abbreviation !== "NY");
  const status = (event.status && event.status.type) || {};
  if (!status.completed) {
    throw new HttpError(`That game isn't final yet (${status.shortDetail || status.description || "not started"}). Try again after it ends.`, 409);
  }

  const knicksScore = Number(ny.score);
  const oppScore = Number(opp.score);
  if (!Number.isInteger(knicksScore) || !Number.isInteger(oppScore) || knicksScore === oppScore) {
    throw new HttpError("ESPN returned an unusable final score.", 502);
  }

  const summary = await espn(`/summary?event=${event.id}`);
  return { knicksScore, oppScore, summary };
}

function knicksLeaders(summary) {
  const entry = (summary.leaders || []).find(l => l.team && l.team.abbreviation === "NY");
  if (!entry) return [];
  const labels = { points: "pts", rebounds: "reb", assists: "ast" };
  const order = [];
  const byName = {};
  for (const cat of ["points", "rebounds", "assists"]) {
    const group = (entry.leaders || []).find(c => c.name === cat);
    const top = group && group.leaders && group.leaders[0];
    if (!top || !top.athlete) continue;
    const name = top.athlete.displayName || top.athlete.fullName;
    const value = Number(top.value);
    if (!name || !Number.isFinite(value)) continue;
    if (!byName[name]) { byName[name] = []; order.push(name); }
    byName[name].push(`${value} ${labels[cat]}`);
  }
  return order.map(name => ({ name, stat: byName[name].join(", ") }));
}

/* ---------- sync an upcoming game ---------- */

async function syncUpcoming(env, id) {
  const row = await env.DB.prepare(`SELECT * FROM upcoming_games WHERE id = ?`).bind(id).first();
  if (!row) throw new HttpError("That upcoming game isn't in the list anymore.", 404);

  const { knicksScore, oppScore, summary } = await findFinalGame(row.sort_date, row.game_date);

  const team = ((summary.boxscore || {}).teams || []).find(t => t.team && t.team.abbreviation === "NY");
  if (!team) throw new HttpError("ESPN's box score isn't available yet. Try again in a few minutes.", 502);

  const [fgm, fga] = madeAtt(team, "fieldGoalsMade-fieldGoalsAttempted");
  const [tpm, tpa] = madeAtt(team, "threePointFieldGoalsMade-threePointFieldGoalsAttempted");
  const [ftm, fta] = madeAtt(team, "freeThrowsMade-freeThrowsAttempted");
  const reb = Number(boxStat(team, "totalRebounds"));
  const ast = Number(boxStat(team, "assists"));
  if (!Number.isInteger(reb) || !Number.isInteger(ast)) throw new HttpError("ESPN's box score is missing rebounds or assists.", 502);

  const box = buildBoxScore(summary);
  const result = knicksScore > oppScore ? "W" : "L";
  const recap = `Knicks ${result === "W" ? "won" : "lost"} ${knicksScore}-${oppScore} ${row.location.startsWith("Away") ? "at" : "against"} the ${row.opponent}. Box score synced automatically.`;

  const insert = await env.DB.prepare(
    `INSERT INTO games
      (game_date, sort_date, opponent, opp_abbr, opp_color, location, venue,
       competition, result, knicks_score, opp_score, reb, ast, fgm, fga, tpm, tpa, ftm, fta, recap, box_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.game_date, row.sort_date, row.opponent, row.opp_abbr, row.opp_color,
    row.location, row.venue, row.competition, result, knicksScore, oppScore,
    reb, ast, fgm, fga, tpm, tpa, ftm, fta, recap, box ? JSON.stringify(box) : null
  ).run();
  const gameId = insert.meta.last_row_id;

  const followUps = knicksLeaders(summary).map((l, i) =>
    env.DB.prepare(`INSERT INTO leaders (game_id, name, stat, sort_order) VALUES (?, ?, ?, ?)`)
      .bind(gameId, l.name, l.stat, i)
  );
  followUps.push(env.DB.prepare(`DELETE FROM upcoming_games WHERE id = ?`).bind(id));
  await env.DB.batch(followUps);

  return json({ id: gameId, result, knicksScore, oppScore }, 201);
}

/* ---------- load a box score for a game that's already a card ---------- */

async function loadBoxScore(env, id) {
  const row = await env.DB.prepare(`SELECT * FROM games WHERE id = ?`).bind(id).first();
  if (!row) throw new HttpError("That game isn't in the list anymore.", 404);

  const { knicksScore, oppScore, summary } = await findFinalGame(row.sort_date, row.game_date);
  if (knicksScore !== row.knicks_score || oppScore !== row.opp_score) {
    throw new HttpError(
      `ESPN has the ${row.game_date} game at ${knicksScore}-${oppScore}, which doesn't match the ${row.knicks_score}-${row.opp_score} saved here, so nothing was changed.`,
      409
    );
  }

  const box = buildBoxScore(summary);
  if (!box) throw new HttpError("ESPN doesn't have player stats for that game.", 404);

  await env.DB.prepare(`UPDATE games SET box_json = ? WHERE id = ?`).bind(JSON.stringify(box), id).run();
  return json(box);
}
