-- Knicks tracker schema for Cloudflare D1
-- Run this once when the database is first created.

DROP TABLE IF EXISTS leaders;
DROP TABLE IF EXISTS games;

CREATE TABLE games (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  game_date      TEXT    NOT NULL,   -- display date, e.g. 'Apr 20, 2026'
  sort_date      TEXT    NOT NULL,   -- ISO date, e.g. '2026-04-20', used for ordering
  opponent       TEXT    NOT NULL,   -- e.g. 'Atlanta Hawks'
  opp_abbr       TEXT    NOT NULL,   -- e.g. 'ATL'
  opp_color      TEXT    NOT NULL,   -- hex color for the opponent badge
  location       TEXT    NOT NULL,   -- e.g. 'Home — Madison Square Garden'
  venue          TEXT    NOT NULL,   -- e.g. 'Madison Square Garden, New York, NY'
  competition    TEXT    NOT NULL,   -- e.g. 'Regular Season' or a playoff round
  result         TEXT    NOT NULL CHECK (result IN ('W', 'L')),
  knicks_score   INTEGER NOT NULL,
  opp_score      INTEGER NOT NULL,
  reb            INTEGER NOT NULL,   -- team rebounds
  ast            INTEGER NOT NULL,   -- team assists
  fgm            INTEGER NOT NULL,   -- field goals made
  fga            INTEGER NOT NULL,   -- field goals attempted
  tpm            INTEGER NOT NULL,   -- three-pointers made
  tpa            INTEGER NOT NULL,   -- three-pointers attempted
  ftm            INTEGER NOT NULL,   -- free throws made
  fta            INTEGER NOT NULL,   -- free throws attempted
  recap          TEXT    NOT NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE leaders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,      -- e.g. 'Jalen Brunson'
  stat        TEXT    NOT NULL,      -- e.g. '29 pts'
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_leaders_game_id ON leaders(game_id);
CREATE INDEX idx_games_sort_date ON games(sort_date);
