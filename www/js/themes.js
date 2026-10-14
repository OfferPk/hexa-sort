/* Cosmetic themes: UI colours (CSS class theme-<id>) + canvas palettes. Unlocked with earned coins only. */
window.THEMES = [
  { id: 'basalt', name: 'Basalt', price: 0,
    plate: ['#2b2338', '#17121f'], rim: '#b8925a', slot: '#1f1829', slotEdge: '#3a3048', stone: ['#4a4552', '#2a2630'], gloss: 0.55,
    tiles: ['#e8384f', '#f28c28', '#f5c93a', '#35c46a', '#1fb8b0', '#3a78f2', '#9a55e8', '#ef6fb3'] },
  { id: 'glacier', name: 'Glacier', price: 250,
    plate: ['#dfe9f2', '#b9c9d8'], rim: '#8aa7c2', slot: '#cbd8e4', slotEdge: '#a9bccd', stone: ['#8e9aa8', '#66717e'], gloss: 0.7,
    tiles: ['#e25a73', '#f09a54', '#e9c85a', '#5cc28e', '#45b7c9', '#4f7fe0', '#8d6fe0', '#e07fb9'] },
  { id: 'ember', name: 'Ember', price: 400,
    plate: ['#2a1c17', '#120b09'], rim: '#e0873a', slot: '#1e1310', slotEdge: '#3b2620', stone: ['#3f3431', '#231b19'], gloss: 0.45,
    tiles: ['#ff4d3d', '#ff8a2a', '#ffc53d', '#8fd14f', '#2ec4a6', '#4d8dff', '#b36bff', '#ff6fa0'] },
  { id: 'jade', name: 'Jade Temple', price: 600,
    plate: ['#16463b', '#0a261f'], rim: '#d9b45a', slot: '#0f352c', slotEdge: '#1f5446', stone: ['#3d5a52', '#22362f'], gloss: 0.6,
    tiles: ['#e0485c', '#e8923a', '#f0d060', '#46d08a', '#2fb7c2', '#4b86e8', '#a071e6', '#f07bb2'] },
  { id: 'lagoon', name: 'Lagoon', price: 300,
    plate: ['#0f4c5c', '#072a35'], rim: '#7fe3d4', slot: '#0b3a47', slotEdge: '#1d5a69', stone: ['#3b6470', '#22404a'], gloss: 0.65,
    tiles: ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#f783ac'] },
  { id: 'sandstone', name: 'Sandstone', price: 500,
    plate: ['#e9d3ae', '#cfb07f'], rim: '#9a6b35', slot: '#dcc196', slotEdge: '#b8945f', stone: ['#a38a68', '#7c6648'], gloss: 0.5,
    tiles: ['#c0392b', '#e67e22', '#d4ac0d', '#27ae60', '#16a085', '#2e86c1', '#7d3c98', '#c2185b'] },
  { id: 'synth', name: 'Synthwave', price: 750,
    plate: ['#2a0f45', '#100420'], rim: '#ff4fd8', slot: '#1d0a33', slotEdge: '#3d1a66', stone: ['#3a2a55', '#1f1533'], gloss: 0.85,
    tiles: ['#ff2e88', '#ff8c42', '#fff275', '#3cff9e', '#29e0ff', '#5a7dff', '#c04dff', '#ff66c4'] },
  { id: 'aurora', name: 'Aurora', price: 900,
    plate: ['#141a33', '#070a17'], rim: '#6ee7ff', slot: '#0f1429', slotEdge: '#27305a', stone: ['#343a55', '#1b1f33'], gloss: 0.8,
    tiles: ['#ff3d77', '#ff9b3d', '#ffe14d', '#3dffa0', '#3de8ff', '#4d7dff', '#b44dff', '#ff66e0'] }
];

if (typeof module !== 'undefined') module.exports = window.THEMES;
