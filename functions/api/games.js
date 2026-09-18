// Cloudflare Pages Function — routes to /api/games
// Requires a D1 binding named DB (see wrangler.toml).

export async function onRequestGet(context) {
  const { env } = context;

  const gamesResult = await env.DB.prepare(
    `SELECT * FROM games ORDER BY sort_date DESC`
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

  return Response.json(games);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json();

  const required = [
    "date", "sortDate", "opponent", "oppAbbr", "oppColor",
    "location", "venue", "competition", "result",
    "knicksScore", "oppScore", "box", "recap"
  ];
  for (const field of required) {
    if (body[field] === undefined) {
      return new Response(`Missing field: ${field}`, { status: 400 });
    }
  }

  const insertGame = await env.DB.prepare(
    `INSERT INTO games
      (game_date, sort_date, opponent, opp_abbr, opp_color, location, venue,
       competition, result, knicks_score, opp_score, reb, ast, fgm, fga, tpm, tpa, ftm, fta, recap)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.date, body.sortDate, body.opponent, body.oppAbbr, body.oppColor,
    body.location, body.venue, body.competition, body.result,
    body.knicksScore, body.oppScore,
    body.box.reb, body.box.ast, body.box.fgm, body.box.fga,
    body.box.tpm, body.box.tpa, body.box.ftm, body.box.fta,
    body.recap
  ).run();

  const gameId = insertGame.meta.last_row_id;

  if (Array.isArray(body.leaders)) {
    const stmts = body.leaders.map((l, i) =>
      env.DB.prepare(
        `INSERT INTO leaders (game_id, name, stat, sort_order) VALUES (?, ?, ?, ?)`
      ).bind(gameId, l.name, l.stat, i)
    );
    if (stmts.length) await env.DB.batch(stmts);
  }

  return Response.json({ id: gameId }, { status: 201 });
}
