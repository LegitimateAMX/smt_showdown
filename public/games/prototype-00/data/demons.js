/**
 * Demon records for Prototype 00 only.
 *
 * Stats deliberately live under the game that defines them. A future Nocturne
 * Pixie and SMT V Pixie should be separate records because their levels, stats,
 * affinities, learnsets, and supported fields are different.
 */

const neutralAffinities = {
  physical: 'normal', gun: 'normal', fire: 'normal', ice: 'normal',
  electric: 'normal', force: 'normal', light: 'normal', dark: 'normal', almighty: 'normal',
};

const demon = (definition) => ({
  ...definition,
  affinities: { ...neutralAffinities, ...definition.affinities },
});

export const DEMONS = {
  pixie: demon({
    id: 'pixie', name: 'Pixie', race: 'Fairy', level: 7, glyph: 'P', palette: ['#8fffd9', '#5b6dff'],
    blurb: 'A small nature spirit whose support magic can turn a bad opening around.',
    stats: { maxHp: 126, maxMp: 78, attack: 16, magic: 27, defense: 17, agility: 25, luck: 22 },
    affinities: { electric: 'resist', force: 'resist', ice: 'weak', dark: 'weak' },
    skills: ['zio', 'dia', 'rakukaja', 'dormina'],
  }),
  jackFrost: demon({
    id: 'jackFrost', name: 'Jack Frost', race: 'Fairy', level: 12, glyph: 'J', palette: ['#7fe5ff', '#3762e5'],
    blurb: 'A cheerful winter spirit with excellent Ice pressure and a famous verbal tic.',
    stats: { maxHp: 148, maxMp: 72, attack: 19, magic: 28, defense: 22, agility: 19, luck: 20 },
    affinities: { ice: 'drain', fire: 'weak', light: 'resist' },
    skills: ['bufu', 'mabufu', 'rakunda', 'attack'],
  }),
  oni: demon({
    id: 'oni', name: 'Oni', race: 'Brute', level: 15, glyph: 'O', palette: ['#ff754f', '#6d1c1c'],
    blurb: 'A brutal frontliner with strong physical offense and little patience for magic.',
    stats: { maxHp: 196, maxMp: 45, attack: 33, magic: 14, defense: 28, agility: 16, luck: 17 },
    affinities: { physical: 'resist', electric: 'weak', light: 'weak' },
    skills: ['lunge', 'attack', 'tarukaja', 'rakukaja'],
  }),
  angel: demon({
    id: 'angel', name: 'Angel', race: 'Divine', level: 11, glyph: 'A', palette: ['#fff1b0', '#bb7cff'],
    blurb: 'A divine messenger capable of restoration and Light-aligned offense.',
    stats: { maxHp: 138, maxMp: 84, attack: 18, magic: 29, defense: 19, agility: 21, luck: 24 },
    affinities: { light: 'null', dark: 'weak', force: 'resist' },
    skills: ['hama', 'dia', 'rakukaja', 'zan'],
  }),
  nekomata: demon({
    id: 'nekomata', name: 'Nekomata', race: 'Beast', level: 14, glyph: 'N', palette: ['#ff88bf', '#6f42c1'],
    blurb: 'An agile feline spirit that pressures foes with claws and debilitating magic.',
    stats: { maxHp: 156, maxMp: 62, attack: 27, magic: 22, defense: 20, agility: 31, luck: 23 },
    affinities: { force: 'null', electric: 'weak', physical: 'resist' },
    skills: ['scratchDance', 'zan', 'sukunda', 'dormina'],
  }),
  huaPo: demon({
    id: 'huaPo', name: 'Hua Po', race: 'Jirae', level: 13, glyph: 'H', palette: ['#ffb347', '#f23b66'],
    blurb: 'A spirit born from flame, wielding potent Fire magic and quick support.',
    stats: { maxHp: 140, maxMp: 80, attack: 17, magic: 31, defense: 18, agility: 26, luck: 21 },
    affinities: { fire: 'drain', ice: 'weak', dark: 'resist' },
    skills: ['agi', 'maragi', 'tarukaja', 'dia'],
  }),
  ameNoUzume: demon({
    id: 'ameNoUzume', name: 'Ame-no-Uzume', race: 'Megami', level: 18, glyph: 'U', palette: ['#ffcf70', '#ff5ea8'],
    blurb: 'A radiant goddess who balances Force magic with exceptional recovery.',
    stats: { maxHp: 164, maxMp: 96, attack: 20, magic: 34, defense: 23, agility: 27, luck: 29 },
    affinities: { force: 'null', light: 'resist', electric: 'weak' },
    skills: ['zan', 'media', 'rakunda', 'hama'],
  }),
  mokoi: demon({
    id: 'mokoi', name: 'Mokoi', race: 'Night', level: 9, glyph: 'M', palette: ['#bfa7ff', '#48416d'],
    blurb: 'A nocturnal trickster with disruptive Dark magic and a poisonous touch.',
    stats: { maxHp: 144, maxMp: 65, attack: 23, magic: 23, defense: 19, agility: 20, luck: 28 },
    affinities: { dark: 'null', light: 'weak', fire: 'resist' },
    skills: ['mudo', 'poisonClaw', 'sukunda', 'attack'],
  }),
  preta: demon({
    id: 'preta', name: 'Preta', race: 'Haunt', level: 8, glyph: 'R', palette: ['#b9d67b', '#4c5638'],
    blurb: 'A hungry spirit with unusual resilience and a weakness to exorcising light.',
    stats: { maxHp: 152, maxMp: 58, attack: 24, magic: 20, defense: 22, agility: 15, luck: 16 },
    affinities: { ice: 'resist', dark: 'drain', light: 'weak', fire: 'weak' },
    skills: ['mudo', 'poisonClaw', 'rakunda', 'dia'],
  }),
};
