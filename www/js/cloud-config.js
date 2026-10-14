/* Play Games cloud save: OFF until John finishes SETUP_PLAY_GAMES.md. Never put a guessed ID here. */
window.CLOUD_CONFIG = {
  ENABLED: false,
  PLAY_GAMES_APP_ID: 'REPLACE_WITH_PLAY_GAMES_APP_ID', // numeric "App ID" from Play Console > Play Games Services > Configuration
  PLUGIN_NAME: 'PlayGamesSaves',                        // native bridge name (see SETUP_PLAY_GAMES.md)
  SNAPSHOT_NAME: 'hexcairn-progress',
  KEYS: ['hexcairn.save.v1', 'hexcairn.daily.v1', 'hexcairn.ach.v1']             // progress, coins, purchases (save), daily state, achievements
};
if (typeof module !== 'undefined') module.exports = window.CLOUD_CONFIG;
