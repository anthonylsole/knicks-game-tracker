-- Seed data: the 8 games logged so far.
-- Run this once, after schema.sql, to populate the tables.

-- Games table: one row per game attended
INSERT INTO games (id, game_date, sort_date, opponent, opp_abbr, opp_color, location, venue, competition, result, knicks_score, opp_score, reb, ast, fgm, fga, tpm, tpa, ftm, fta, recap) VALUES
(1, 'Apr 20, 2026', '2026-04-20', 'Atlanta Hawks', 'ATL', '#E03A3E', 'Home — Madison Square Garden', 'Madison Square Garden, New York, NY', 'NBA Playoffs, East First Round — Game 2', 'L', 106, 107, 47, 22, 39, 87, 11, 34, 17, 27, 'New York led by 12 after three quarters, but CJ McCollum scored 32 and put Atlanta ahead for good in the final two minutes. His two missed free throws with 5.6 seconds left gave the Knicks one last chance, but Mikal Bridges'' jumper at the buzzer was off, and the series went back to Atlanta tied 1-1 — a game New York would avenge on the way to the title.'),
(2, 'Nov 13, 2024', '2024-11-13', 'Chicago Bulls', 'CHI', '#CE1141', 'Home — Madison Square Garden', 'Madison Square Garden, New York, NY', 'Regular Season', 'L', 123, 124, 40, 31, 48, 94, 15, 37, 12, 18, 'Towns'' season-high 46 helped erase a 22-point deficit, and Brunson''s bucket put the Knicks up with four seconds left — but Coby White drew a foul and hit all three free throws to steal it back for Chicago.'),
(3, 'Apr 9, 2023', '2023-04-09', 'Indiana Pacers', 'IND', '#002D62', 'Home — Madison Square Garden', 'Madison Square Garden, New York, NY', 'Regular Season — Season Finale', 'L', 136, 141, 53, 29, 52, 108, 15, 40, 17, 22, 'A meaningless finale for a Knicks team that had already locked its playoff seed turned into a track meet. Bennedict Mathurin''s 26 led an Indiana team playing for lottery odds, RJ Barrett fouled out, and Josh Hart was ejected as New York closed the regular season on a loss.'),
(4, 'Oct 24, 2022', '2022-10-24', 'Orlando Magic', 'ORL', '#0077C0', 'Home — Madison Square Garden', 'Madison Square Garden, New York, NY', 'Regular Season', 'W', 115, 102, 50, 24, 43, 93, 11, 37, 18, 25, 'New York ran the young Magic off the floor early in the season, keeping No. 1 pick Paolo Banchero and Orlando winless behind a balanced night from Randle and Brunson.'),
(5, 'Mar 4, 2022', '2022-03-04', 'Phoenix Suns', 'PHX', '#E56020', 'Away — Footprint Center, Phoenix', 'Footprint Center, Phoenix, AZ', 'Regular Season', 'L', 114, 115, 49, 23, 40, 86, 13, 29, 21, 30, 'New York led by 14 after Randle was ejected for shoving Cam Johnson — who answered with a career-high 38, including a buzzer-beating banked three to steal it for the Suns.'),
(6, 'Jan 18, 2022', '2022-01-18', 'Minnesota Timberwolves', 'MIN', '#236192', 'Home — Madison Square Garden', 'Madison Square Garden, New York, NY', 'Regular Season', 'L', 110, 112, 44, 21, 37, 80, 12, 38, 24, 33, 'The Knicks led for most of the fourth quarter, but Anthony Edwards and Karl-Anthony Towns pushed Minnesota back in front late, and a potential game-winning three from Alec Burks came up short.'),
(7, 'Oct 22, 2021', '2021-10-22', 'Orlando Magic', 'ORL', '#0077C0', 'Away — Amway Center, Orlando', 'Amway Center, Orlando, FL', 'Regular Season', 'W', 121, 96, 38, 34, 44, 88, 24, 54, 9, 17, 'New York opened 2-0 for the first time since 2012-13, burying a franchise-record 24 threes in a rout. Fournier, playing his first game back in Orlando after seven years with the Magic, got a warm ovation and knocked down four 3s of his own.'),
(8, 'Apr 11, 2021', '2021-04-11', 'Toronto Raptors', 'TOR', '#753BBD', 'Home — Madison Square Garden', 'Madison Square Garden, New York, NY', 'Regular Season', 'W', 102, 96, 46, 19, 35, 88, 9, 35, 23, 27, 'New York blew an 18-point lead before Barrett''s corner three with 35 seconds left put the Knicks back in front for good, snapping a nine-game skid against Toronto.');

-- Leaders table: top performers per game, in display order
INSERT INTO leaders (game_id, name, stat, sort_order) VALUES
(1, 'Jalen Brunson', '29 pts', 0),
(1, 'Karl-Anthony Towns', '18 pts', 1),
(1, 'Josh Hart', '15 pts, 13 reb, 6 ast', 2),
(2, 'Karl-Anthony Towns', '46 pts, 10 reb', 0),
(2, 'Jalen Brunson', '24 pts', 1),
(2, 'Mikal Bridges', '20 pts', 2),
(3, 'Obi Toppin', '31 pts', 0),
(3, 'Immanuel Quickley', '30 pts', 1),
(3, 'Mitchell Robinson', '20 reb, 5 blk', 2),
(4, 'Julius Randle', '25 pts, 12 reb', 0),
(4, 'Jalen Brunson', '21 pts', 1),
(4, 'RJ Barrett', '20 pts', 2),
(5, 'Julius Randle', '25 pts (ejected, 3Q)', 0),
(5, 'Mitchell Robinson', '17 pts, 15 reb', 1),
(5, 'Alec Burks', '14 pts', 2),
(6, 'Julius Randle', '21 pts, 9 reb, 9 ast, 4 blk', 0),
(6, 'Evan Fournier', '27 pts', 1),
(6, 'RJ Barrett', '17 pts', 2),
(7, 'Julius Randle', '21 pts, 10 reb, 7 ast', 0),
(7, 'Evan Fournier', '18 pts', 1),
(7, 'Immanuel Quickley', '16 pts, 4 threes', 2),
(7, 'Obi Toppin', '13 pts', 3),
(8, 'Julius Randle', '26 pts, 8 reb, 5 ast', 0),
(8, 'RJ Barrett', '19 pts', 1),
(8, 'Nerlens Noel', '9 pts, 13 reb, 4 blk', 2);
