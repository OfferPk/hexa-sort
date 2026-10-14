/* Game-specific achievements (cosmetic coin rewards). Shared ones live in achievements.js. */
window.ACH_DEFS = [
  { "id": "hx_first", "name": "First Cairn", "desc": "Win your first level", "metric": "wins", "goal": 1, "reward": 15 },
  { "id": "hx_wins25", "name": "Cairn Builder", "desc": "Win 25 levels", "metric": "wins", "goal": 25, "reward": 80 },
  { "id": "hx_wins100", "name": "Stack Sage", "desc": "Win 100 levels", "metric": "wins", "goal": 100, "reward": 200 },
  { "id": "hx_lvl10", "name": "Trailhead", "desc": "Reach level 10", "metric": "level", "goal": 10, "reward": 40 },
  { "id": "hx_lvl30", "name": "High Pass", "desc": "Reach level 30", "metric": "level", "goal": 30, "reward": 120 },
  { "id": "hx_clean5", "name": "Bare Hands", "desc": "Win 5 levels without hammer, shuffle or revive", "metric": "clean_wins", "goal": 5, "reward": 90 },
  { "id": "hx_score1k", "name": "Heavy Haul", "desc": "Score 1,000 in a single level", "metric": "best_score", "goal": 1000, "reward": 60 },
  { "id": "hx_merge", "name": "Sorted Out", "desc": "Clear 200 completed stacks", "metric": "stacks", "goal": 200, "reward": 100 },
  { "id": "hx_games50", "name": "Persistent", "desc": "Play 50 levels (wins or losses)", "metric": "games", "goal": 50, "reward": 70 }
]
;
if (typeof module !== 'undefined') module.exports = window.ACH_DEFS;
