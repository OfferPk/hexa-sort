global.window = global.window || {};
require('../www/js/themes.js');
const S = require('../www/js/shopcore.js');
module.exports = { groups: [ { name: 'themes', theme: true, items: window.THEMES.map(t => ({ id: t.id, name: t.name, price: t.price })) }, { name: 'backgrounds', items: S.BACKGROUNDS } ] };
