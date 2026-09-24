/** Incoming damage and ailment types used by Shin Megami Tensei III: Nocturne. */
export const NOCTURNE_DAMAGE_TYPES = [
  'physical',
  'fire',
  'ice',
  'electricity',
  'force',
  'expel',
  'death',
  'curse',
  'nerve',
  'mind',
  'almighty',
];

export const NOCTURNE_ELEMENTS = {
  physical: { label: 'Physical', short: 'PHY', icon: '✦', color: '#e8e8e8' },
  fire: { label: 'Fire', short: 'FIR', icon: '▲', color: '#ff664f' },
  ice: { label: 'Ice', short: 'ICE', icon: '◆', color: '#62c9ff' },
  electricity: { label: 'Electricity', short: 'ELE', icon: 'ϟ', color: '#ffe268' },
  force: { label: 'Force', short: 'FRC', icon: '≋', color: '#69e5b1' },
  expel: { label: 'Expel', short: 'EXP', icon: '☼', color: '#fff2b8' },
  death: { label: 'Death', short: 'DTH', icon: '◐', color: '#b68cff' },
  curse: { label: 'Curse', short: 'CUR', icon: '⛧', color: '#d770ff' },
  nerve: { label: 'Nerve', short: 'NRV', icon: '⌁', color: '#ff9c66' },
  mind: { label: 'Mind', short: 'MND', icon: '◉', color: '#ff77bd' },
  almighty: { label: 'Almighty', short: 'ALM', icon: '✺', color: '#f4f4f4' },
  recovery: { label: 'Recovery', short: 'REC', icon: '✚', color: '#7ff2a5' },
  support: { label: 'Support', short: 'SUP', icon: '⬡', color: '#dda0ff' },
};

export const NOCTURNE_AFFINITIES = {
  weak: { label: 'Weak', multiplier: 1.5, rank: -1, description: '1.5× damage' },
  resist: { label: 'Resist', multiplier: 0.55, rank: 1, description: '0.55× damage' },
  null: { label: 'Void', multiplier: 0, rank: 2, description: 'Negates the effect' },
  repel: { label: 'Repel', multiplier: 0, rank: 3, description: 'Returns the effect' },
  drain: { label: 'Absorb', multiplier: 0, rank: 4, description: 'Absorbs the effect' },
  normal: { label: 'Normal', multiplier: 1, rank: 0, description: 'Standard effectiveness' },
};
