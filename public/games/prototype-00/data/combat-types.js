export const ELEMENTS = {
  physical: { label: 'Physical', short: 'PHY', icon: '✦', color: '#e8e8e8' },
  gun: { label: 'Gun', short: 'GUN', icon: '⌁', color: '#c8d1da' },
  fire: { label: 'Fire', short: 'FIR', icon: '▲', color: '#ff664f' },
  ice: { label: 'Ice', short: 'ICE', icon: '◆', color: '#62c9ff' },
  electric: { label: 'Electric', short: 'ELE', icon: 'ϟ', color: '#ffe268' },
  force: { label: 'Force', short: 'FRC', icon: '≋', color: '#69e5b1' },
  light: { label: 'Light', short: 'LGT', icon: '☼', color: '#fff2b8' },
  dark: { label: 'Dark', short: 'DRK', icon: '◐', color: '#b68cff' },
  almighty: { label: 'Almighty', short: 'ALM', icon: '◉', color: '#f4f4f4' },
  recovery: { label: 'Recovery', short: 'REC', icon: '✚', color: '#7ff2a5' },
  support: { label: 'Support', short: 'SUP', icon: '⬡', color: '#dda0ff' },
};

export const AFFINITIES = {
  weak: { label: 'Weak', multiplier: 1.5, rank: -1, description: '1.5× damage' },
  resist: { label: 'Resist', multiplier: 0.55, rank: 1, description: '0.55× damage' },
  null: { label: 'Null', multiplier: 0, rank: 2, description: 'Negates damage' },
  repel: { label: 'Repel', multiplier: 0, rank: 3, description: 'Returns damage' },
  drain: { label: 'Drain', multiplier: 0, rank: 4, description: 'Restores HP' },
  normal: { label: 'Normal', multiplier: 1, rank: 0, description: '1× damage' },
};
