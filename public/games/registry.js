import { PROTOTYPE_GAME } from './prototype-00/index.js';
import { SMT_III_NOCTURNE_GAME } from './smt-iii-nocturne/index.js';

const profiles = new Map();

function register(game) {
  if (profiles.has(game.id)) throw new Error(`Duplicate game profile id: ${game.id}`);
  profiles.set(game.id, game);
}

// Add future imports and registrations here. Keeping registration explicit makes
// the shipped game list deterministic and lets build tools discover every title.
register(PROTOTYPE_GAME);
register(SMT_III_NOCTURNE_GAME);

export const DEFAULT_GAME_ID = PROTOTYPE_GAME.id;

export function getGame(gameId) {
  const game = profiles.get(gameId);
  if (!game) throw new Error(`Unknown game profile: ${gameId}`);
  return game;
}

export function listGames() {
  return [...profiles.values()];
}

export function hasGame(gameId) {
  return profiles.has(gameId);
}
