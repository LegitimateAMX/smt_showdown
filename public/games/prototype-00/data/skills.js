/**
 * Skill records for Prototype 00.
 *
 * Keep title-specific values here. Another game may use the same skill name
 * with different power, cost, targeting, effects, or even a different schema.
 */
export const SKILLS = {
  attack: {
    id: 'attack', name: 'Attack', element: 'physical', power: 34, accuracy: 96,
    cost: 0, costType: 'mp', crit: 12, kind: 'damage', description: 'A basic physical strike.',
  },
  lunge: {
    id: 'lunge', name: 'Lunge', element: 'physical', power: 58, accuracy: 89,
    cost: 8, costType: 'hp', crit: 18, kind: 'damage', description: 'Heavy physical damage with an increased critical rate.',
  },
  scratchDance: {
    id: 'scratchDance', name: 'Scratch Dance', element: 'physical', power: 48, accuracy: 94,
    cost: 6, costType: 'hp', crit: 22, kind: 'damage', description: 'A flurry of claws with a high critical rate.',
  },
  agi: {
    id: 'agi', name: 'Agi', element: 'fire', power: 46, accuracy: 97,
    cost: 5, costType: 'mp', crit: 4, kind: 'damage', description: 'Light Fire damage to one foe.',
  },
  maragi: {
    id: 'maragi', name: 'Maragi', element: 'fire', power: 58, accuracy: 94,
    cost: 10, costType: 'mp', crit: 3, kind: 'damage', description: 'Medium Fire damage. Tuned for single-active combat in this prototype.',
  },
  bufu: {
    id: 'bufu', name: 'Bufu', element: 'ice', power: 46, accuracy: 97,
    cost: 5, costType: 'mp', crit: 4, kind: 'damage', description: 'Light Ice damage to one foe.',
  },
  mabufu: {
    id: 'mabufu', name: 'Mabufu', element: 'ice', power: 58, accuracy: 94,
    cost: 10, costType: 'mp', crit: 3, kind: 'damage', description: 'Medium Ice damage. Tuned for single-active combat in this prototype.',
  },
  zio: {
    id: 'zio', name: 'Zio', element: 'electric', power: 46, accuracy: 97,
    cost: 5, costType: 'mp', crit: 4, kind: 'damage', description: 'Light Electric damage to one foe.',
  },
  mazio: {
    id: 'mazio', name: 'Mazio', element: 'electric', power: 58, accuracy: 94,
    cost: 10, costType: 'mp', crit: 3, kind: 'damage', description: 'Medium Electric damage. Tuned for single-active combat in this prototype.',
  },
  zan: {
    id: 'zan', name: 'Zan', element: 'force', power: 46, accuracy: 97,
    cost: 5, costType: 'mp', crit: 4, kind: 'damage', description: 'Light Force damage to one foe.',
  },
  hama: {
    id: 'hama', name: 'Hama', element: 'light', power: 50, accuracy: 92,
    cost: 7, costType: 'mp', crit: 3, kind: 'damage', description: 'Light-aligned damage to one foe.',
  },
  mudo: {
    id: 'mudo', name: 'Mudo', element: 'dark', power: 50, accuracy: 92,
    cost: 7, costType: 'mp', crit: 3, kind: 'damage', description: 'Dark-aligned damage to one foe.',
  },
  megido: {
    id: 'megido', name: 'Megido', element: 'almighty', power: 62, accuracy: 99,
    cost: 14, costType: 'mp', crit: 0, kind: 'damage', description: 'Medium Almighty damage that ignores elemental affinities.',
  },
  dia: {
    id: 'dia', name: 'Dia', element: 'recovery', power: 52, accuracy: 100,
    cost: 7, costType: 'mp', crit: 0, kind: 'heal', description: 'Restore a moderate amount of the user’s HP.',
  },
  media: {
    id: 'media', name: 'Media', element: 'recovery', power: 72, accuracy: 100,
    cost: 12, costType: 'mp', crit: 0, kind: 'heal', description: 'Restore a large amount of the user’s HP in this prototype.',
  },
  tarukaja: {
    id: 'tarukaja', name: 'Tarukaja', element: 'support', power: 0, accuracy: 100,
    cost: 6, costType: 'mp', crit: 0, kind: 'buff', stat: 'attack', amount: 1,
    description: 'Raise the user’s Attack by one rank (maximum three).',
  },
  rakukaja: {
    id: 'rakukaja', name: 'Rakukaja', element: 'support', power: 0, accuracy: 100,
    cost: 6, costType: 'mp', crit: 0, kind: 'buff', stat: 'defense', amount: 1,
    description: 'Raise the user’s Defense by one rank (maximum three).',
  },
  rakunda: {
    id: 'rakunda', name: 'Rakunda', element: 'support', power: 0, accuracy: 100,
    cost: 6, costType: 'mp', crit: 0, kind: 'debuff', stat: 'defense', amount: -1,
    description: 'Lower the foe’s Defense by one rank (minimum negative three).',
  },
  sukunda: {
    id: 'sukunda', name: 'Sukunda', element: 'support', power: 0, accuracy: 100,
    cost: 6, costType: 'mp', crit: 0, kind: 'debuff', stat: 'agility', amount: -1,
    description: 'Lower the foe’s Agility by one rank (minimum negative three).',
  },
  dormina: {
    id: 'dormina', name: 'Dormina', element: 'support', power: 0, accuracy: 72,
    cost: 8, costType: 'mp', crit: 0, kind: 'ailment', ailment: 'sleep',
    description: 'Attempt to put one foe to sleep. Damage wakes a sleeping target.',
  },
  poisonClaw: {
    id: 'poisonClaw', name: 'Poison Claw', element: 'physical', power: 39, accuracy: 91,
    cost: 7, costType: 'hp', crit: 10, kind: 'damage', ailment: 'poison', ailmentChance: 38,
    description: 'Physical damage with a chance to inflict Poison.',
  },
};
