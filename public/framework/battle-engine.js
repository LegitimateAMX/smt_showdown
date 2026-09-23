function hashSeed(input) {
  let hash = 2166136261;
  for (const character of String(input)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mechanics-agnostic battle host.
 *
 * The engine owns reproducible randomness and the event stream. Everything
 * game-specific—state shape, turns, actions, damage, AI, resources, targeting,
 * and victory conditions—is delegated to the selected profile's Ruleset.
 */
export class BattleEngine {
  constructor({ game, seed, opponentName, ...battleOptions }) {
    if (!game?.Ruleset) throw new Error('A registered game profile is required.');

    this.game = game;
    this.seed = String(seed || 'demifiend');
    this.opponentName = opponentName || 'Rival program';
    this.random = mulberry32(hashSeed(this.seed));
    this.rules = new game.Ruleset(this);
    this.state = this.rules.createInitialState({ opponentName: this.opponentName, ...battleOptions });

    if (!this.state || !Array.isArray(this.state.events)) {
      throw new Error(`Ruleset "${game.id}" must create state with an events array.`);
    }
    this.rules.onBattleStart?.({ opponentName: this.opponentName, ...battleOptions });
  }

  addEvent(type, text, detail = {}) {
    const event = {
      id: this.state.events.length + 1,
      round: this.state.round ?? 0,
      type,
      text,
      ...detail,
    };
    this.state.events.push(event);
    return event;
  }

  resultSince(index) {
    return { ok: true, events: this.state.events.slice(index), state: this.state };
  }

  active(...args) {
    return this.rules.active(...args);
  }

  living(...args) {
    return this.rules.living(...args);
  }

  affinityFor(...args) {
    return this.rules.affinityFor(...args);
  }

  canPay(...args) {
    return this.rules.canPay(...args);
  }

  act(...args) {
    return this.rules.act(...args);
  }

  chooseAiAction(...args) {
    return this.rules.chooseAiAction(...args);
  }
}

function resourcePercent(current, maximum) {
  if (!Number.isFinite(maximum) || maximum <= 0) return 0;
  return Math.max(0, Math.min(100, (current / maximum) * 100));
}

export function hpPercent(combatant) {
  return resourcePercent(combatant.hp, combatant.stats.maxHp);
}

export function mpPercent(combatant) {
  return resourcePercent(combatant.mp, combatant.stats.maxMp);
}
