/* Weekly challenge goal pool (stats are Achievements.bump keys). 3 are picked per week, same for everyone. */
(function (root) { var POOL = [
  { stat: 'wins', text: 'Win {n} levels', targets: [5, 8, 12] },
  { stat: 'stacks', text: 'Clear {n} stacks', targets: [30, 50, 80] },
  { stat: 'clean_wins', text: 'Win {n} levels without hammer, shuffle or revive', targets: [2, 3, 5] },
  { stat: 'challenges', text: 'Finish {n} Daily Cairns', targets: [2, 3, 4] },
  { stat: 'daily_claims', text: 'Claim the daily reward {n} times', targets: [3, 4, 5] }
]; root.WEEKLY_GOALS = POOL; if (typeof module !== 'undefined') module.exports = POOL; })(typeof window !== 'undefined' ? window : globalThis);
