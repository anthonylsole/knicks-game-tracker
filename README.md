# Knicks Tracker

A small app that tracks the Knicks games you've attended in person — flippable
cards with box-score detail, plus aggregate stats up top. Data lives in a
Cloudflare D1 database so it persists across sessions instead of being
hardcoded in the page.

- `public/index.html` — the frontend. It fetches games from `/api/games`
  on load; if that call fails (e.g. you open the file directly, or the
  backend isn't deployed yet), it falls back to the embedded sample data
  so the page still works standalone.
- `functions/api/games.js` — a Cloudflare Pages Function. `GET /api/games`
  returns all games with their leaders joined; `POST /api/games` adds one.
- `schema.sql` — table definitions for D1.
- `seed.sql` — INSERT statements for the 8 games already logged, so the
  database starts populated with the same data currently in the page.
- `wrangler.toml` — Pages + D1 configuration.

## Prerequisites

- A free Cloudflare account.
- Node.js installed locally.
- The Wrangler CLI: `npm install -g wrangler` (or use `npx wrangler ...`
  for every command below without installing it globally).

## 1. Log in to Cloudflare

```bash
wrangler login
```

This opens a browser window to authorize the CLI against your account.

## 2. Create the D1 database

```bash
wrangler d1 create knicks-tracker-db
```

This prints a block like:

```toml
[[d1_databases]]
binding = "DB"
database_name = "knicks-tracker-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` value into `wrangler.toml` in this repo, replacing
`REPLACE_WITH_YOUR_DATABASE_ID`.

## 3. Run the SQL to create the tables and load the existing games

Run the schema first, then the seed data. Do this once against the
**remote** database (the one Cloudflare will actually serve from):

```bash
wrangler d1 execute knicks-tracker-db --remote --file=./schema.sql
wrangler d1 execute knicks-tracker-db --remote --file=./seed.sql
```

Sanity check it worked:

```bash
wrangler d1 execute knicks-tracker-db --remote --command="SELECT game_date, opponent, result FROM games ORDER BY sort_date DESC"
```

You should see all 8 games listed.

(If you want to test locally first, drop `--remote` — Wrangler will use a
local SQLite copy under `.wrangler/` instead. Just remember to also run the
`--remote` versions before your real deployment, since local and remote
databases are separate.)

## 4. Create the Pages project and deploy

```bash
wrangler pages project create knicks-tracker
wrangler pages deploy public --project-name=knicks-tracker
```

Wrangler will print a `*.pages.dev` URL when this finishes — that's your
live site.

## 5. Bind the D1 database to the Pages project

The `[[d1_databases]]` block in `wrangler.toml` tells Wrangler about the
binding, but Pages projects also need the binding attached on the
Cloudflare dashboard side:

1. Go to **Cloudflare dashboard → Workers & Pages → knicks-tracker →
   Settings → Functions**.
2. Under **D1 database bindings**, click **Add binding**.
3. Set **Variable name** to `DB` (must match `functions/api/games.js`,
   which reads `env.DB`).
4. Select the `knicks-tracker-db` database.
5. Save, then re-run the deploy command from step 4 so the new binding
   takes effect:

```bash
wrangler pages deploy public --project-name=knicks-tracker
```

## 6. Verify

Visit your `*.pages.dev` URL. The page should load the 8 games from the
database (network tab: a `GET /api/games` call returning JSON). Adding a
game via `POST /api/games` (see the request shape in
`functions/api/games.js`) will persist it — refreshing, or opening the
site from another device, will show it too.

## Adding games going forward

The current UI doesn't have an "add game" form built in — the `POST`
endpoint exists, but you'd add a game either by:

- `wrangler d1 execute knicks-tracker-db --remote --command="INSERT INTO games (...) VALUES (...)"`, or
- calling `POST /api/games` with a JSON body shaped like:

```json
{
  "date": "May 3, 2026",
  "sortDate": "2026-05-03",
  "opponent": "Boston Celtics",
  "oppAbbr": "BOS",
  "oppColor": "#007A33",
  "location": "Home — Madison Square Garden",
  "venue": "Madison Square Garden, New York, NY",
  "competition": "NBA Playoffs, East Semifinals — Game 1",
  "result": "W",
  "knicksScore": 110,
  "oppScore": 104,
  "box": { "reb": 45, "ast": 26, "fgm": 42, "fga": 90, "tpm": 13, "tpa": 35, "ftm": 13, "fta": 16 },
  "recap": "...",
  "leaders": [{ "name": "Jalen Brunson", "stat": "30 pts" }]
}
```

If you want an actual form in the page for this, that's a follow-up build —
just ask.
