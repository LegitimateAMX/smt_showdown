import { defineGame } from '../../framework/game-definition.js';
import { PROTOTYPE_GAME } from '../prototype-00/index.js';

/**
 * Initial profile shell for Shin Megami Tensei III: Nocturne.
 *
 * Until its title-specific rules and data are supplied, this profile inherits
 * the playable prototype so selecting it remains safe and functional. Keeping
 * the placeholder here gives future Nocturne work a stable profile id without
 * presenting any of the prototype values as final Nocturne data.
 */
export const SMT_III_NOCTURNE_GAME = defineGame({
  ...PROTOTYPE_GAME,
  id: 'smt-iii-nocturne',
  name: 'Shin Megami Tensei III: Nocturne',
  shortName: 'Nocturne',
  family: 'Shin Megami Tensei III',
  description: 'Nocturne profile shell. Title-specific battle mechanics and content are coming next.',
  dataVersion: 0,
});
