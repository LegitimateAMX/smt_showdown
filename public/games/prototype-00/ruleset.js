const otherSide = (side) => (side === 'player' ? 'enemy' : 'player');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * The complete mechanics implementation for Prototype 00.
 *
 * Future games provide their own Ruleset class with the same public boundary.
 * They may use a different state shape internally, action economy, formulas,
 * resources, targeting model, AI, and victory conditions.
 */
export class PrototypeRuleset {
  constructor(engine) {
    this.engine = engine;
  }

  get state() {
    return this.engine.state;
  }

  get game() {
    return this.engine.game;
  }

  get skills() {
    return this.game.data.skills;
  }

  get affinities() {
    return this.game.affinities;
  }

  get config() {
    return this.game.config;
  }

  createInitialState({ playerTeam, enemyTeam }) {
    if (!Array.isArray(playerTeam) || !Array.isArray(enemyTeam)) {
      throw new Error('Prototype 00 requires playerTeam and enemyTeam arrays.');
    }
    return {
      teams: {
        player: playerTeam.map((id) => this.makeCombatant(id)),
        enemy: enemyTeam.map((id) => this.makeCombatant(id)),
      },
      active: { player: 0, enemy: 0 },
      phase: 'player',
      round: 1,
      bonusAvailable: false,
      bonusUsed: { player: false, enemy: false },
      winner: null,
      events: [],
    };
  }

  onBattleStart() {
    this.addEvent('system', `Contract established. Game: ${this.game.name}. Seed: ${this.engine.seed}.`, { tone: 'system' });
    this.addEvent('summon', `${this.active('player').name} and ${this.active('enemy').name} enter the field.`, { tone: 'system' });
    this.addEvent('turn', 'Round 1 — choose a command.', { tone: 'turn' });
  }

  makeCombatant(id) {
    const source = this.game.data.demons[id];
    if (!source) throw new Error(`Unknown demon "${id}" in game "${this.game.id}".`);
    return {
      id: source.id,
      name: source.name,
      race: source.race,
      level: source.level,
      glyph: source.glyph,
      palette: [...source.palette],
      stats: { ...source.stats },
      affinities: { ...source.affinities },
      skills: [...source.skills],
      hp: source.stats.maxHp,
      mp: source.stats.maxMp,
      stages: { attack: 0, defense: 0, agility: 0 },
      ailment: null,
      guarding: false,
      fainted: false,
    };
  }

  addEvent(...args) {
    return this.engine.addEvent(...args);
  }

  active(side) {
    return this.state.teams[side][this.state.active[side]];
  }

  living(side) {
    return this.state.teams[side].filter((member) => !member.fainted);
  }

  affinityFor(combatant, element) {
    if (element === 'almighty' || element === 'support' || element === 'recovery') return 'normal';
    return combatant.affinities[element] || 'normal';
  }

  stageMultiplier(stage) {
    return this.config.stageMultipliers[clamp(stage, -3, 3) + 3];
  }

  canPay(actor, skill) {
    if (skill.costType === 'hp') return actor.hp > skill.cost;
    return actor.mp >= skill.cost;
  }

  act(side, action) {
    if (this.state.winner) return { ok: false, error: 'This battle has ended.', events: [] };
    if (this.state.phase !== side) return { ok: false, error: 'It is not that side’s turn.', events: [] };

    const eventStart = this.state.events.length;
    const actor = this.active(side);
    const targetSide = otherSide(side);
    const target = this.active(targetSide);

    if (actor.ailment?.type === 'sleep') {
      actor.ailment.turns -= 1;
      if (actor.ailment.turns <= 0 || this.engine.random() < 0.38) {
        actor.ailment = null;
        this.addEvent('status', `${actor.name} woke up!`, { side, tone: 'positive', impact: 'WAKE' });
      } else {
        actor.guarding = false;
        this.addEvent('status', `${actor.name} is fast asleep.`, { side, tone: 'negative', impact: 'ASLEEP' });
        this.finishAction(side, false);
        this.applyEndActionAilments(actor, side);
        return this.engine.resultSince(eventStart);
      }
    }

    if (action.type === 'skill') {
      const skill = this.skills[action.skillId];
      if (!skill || (!actor.skills.includes(skill.id) && skill.id !== 'attack')) {
        return { ok: false, error: 'That skill is not available.', events: [] };
      }
      if (!this.canPay(actor, skill)) {
        return { ok: false, error: `Not enough ${skill.costType.toUpperCase()}.`, events: [] };
      }

      actor.guarding = false;
      this.payCost(actor, skill);
      let earnedBonus = false;
      if (skill.kind === 'damage') earnedBonus = this.resolveDamage(side, actor, targetSide, target, skill);
      if (skill.kind === 'heal') this.resolveHeal(side, actor, skill);
      if (skill.kind === 'buff') this.resolveStage(side, actor, actor, skill);
      if (skill.kind === 'debuff') this.resolveStage(side, actor, target, skill);
      if (skill.kind === 'ailment') this.resolveAilment(side, actor, target, skill);
      this.applyEndActionAilments(actor, side);
      this.finishAction(side, earnedBonus);
    } else if (action.type === 'guard') {
      actor.guarding = true;
      this.addEvent('guard', `${actor.name} braces for the next attack.`, { side, tone: 'positive', impact: 'GUARD' });
      this.applyEndActionAilments(actor, side);
      this.finishAction(side, false);
    } else if (action.type === 'switch') {
      const nextIndex = Number(action.index);
      const next = this.state.teams[side][nextIndex];
      if (!next || next.fainted || nextIndex === this.state.active[side]) {
        return { ok: false, error: 'That switch is not possible.', events: [] };
      }
      actor.guarding = false;
      this.state.active[side] = nextIndex;
      this.addEvent('switch', `${actor.name} returns. ${next.name} is summoned!`, { side, tone: 'system', impact: 'SHIFT' });
      this.finishAction(side, false);
    } else {
      return { ok: false, error: 'Unknown command.', events: [] };
    }

    return this.engine.resultSince(eventStart);
  }

  payCost(actor, skill) {
    if (!skill.cost) return;
    if (skill.costType === 'hp') actor.hp = Math.max(1, actor.hp - skill.cost);
    else actor.mp = Math.max(0, actor.mp - skill.cost);
  }

  resolveDamage(side, actor, targetSide, target, skill) {
    const accuracyStage = this.stageMultiplier(actor.stages.agility) / this.stageMultiplier(target.stages.agility);
    const hitChance = clamp(skill.accuracy * accuracyStage, 55, 100);
    if (this.engine.random() * 100 >= hitChance) {
      this.addEvent('miss', `${actor.name} used ${skill.name}, but missed!`, { side, tone: 'negative', impact: 'MISS' });
      return false;
    }

    const affinity = this.affinityFor(target, skill.element);
    const offenseStat = skill.element === 'physical' || skill.element === 'gun' ? 'attack' : 'magic';
    const offense = actor.stats[offenseStat] * (offenseStat === 'attack' ? this.stageMultiplier(actor.stages.attack) : 1);
    const defense = target.stats.defense * this.stageMultiplier(target.stages.defense);
    const variance = 0.9 + this.engine.random() * 0.16;
    let damage = (skill.power * (offense + 20)) / (defense + 35) + actor.level * 0.35;
    let critical = false;

    if (skill.crit && this.engine.random() * 100 < skill.crit) {
      critical = true;
      damage *= this.config.criticalDamage;
    }
    damage *= this.affinities[affinity].multiplier;
    if (target.guarding) damage *= this.config.guardDamage;
    damage = Math.max(1, Math.round(damage * variance));

    if (affinity === 'null') {
      this.addEvent('null', `${actor.name} used ${skill.name}. ${target.name} nullified it.`, { side, tone: 'negative', impact: 'NULL' });
      return false;
    }
    if (affinity === 'repel') {
      actor.hp = Math.max(0, actor.hp - damage);
      this.addEvent('repel', `${target.name} repelled ${skill.name}! ${actor.name} took ${damage} damage.`, {
        side, tone: 'negative', impact: 'REPEL', amount: damage,
      });
      this.checkFaint(side, targetSide);
      return false;
    }
    if (affinity === 'drain') {
      const restored = Math.min(damage, target.stats.maxHp - target.hp);
      target.hp += restored;
      this.addEvent('drain', `${target.name} drained ${skill.name} and restored ${restored} HP.`, {
        side: targetSide, tone: 'positive', impact: 'DRAIN', amount: restored,
      });
      return false;
    }

    target.hp = Math.max(0, target.hp - damage);
    const tags = [];
    if (affinity === 'weak') tags.push('WEAK');
    if (affinity === 'resist') tags.push('RESIST');
    if (critical) tags.push('CRITICAL');
    this.addEvent('damage', `${actor.name} used ${skill.name}. ${target.name} took ${damage} damage${tags.length ? ` — ${tags.join(' / ')}!` : '.'}`, {
      side,
      tone: affinity === 'weak' || critical ? 'positive' : affinity === 'resist' ? 'muted' : 'damage',
      impact: tags[0] || `${damage}`,
      amount: damage,
      affinity,
      critical,
      targetSide,
    });

    if (target.ailment?.type === 'sleep') {
      target.ailment = null;
      this.addEvent('status', `${target.name} woke from the impact.`, { side: targetSide, tone: 'system' });
    }

    if (skill.ailment && target.hp > 0 && !target.ailment && this.engine.random() * 100 < skill.ailmentChance) {
      target.ailment = { type: skill.ailment, turns: 3 };
      this.addEvent('status', `${target.name} was afflicted with ${this.ailmentLabel(skill.ailment)}!`, {
        side: targetSide, tone: 'negative', impact: this.ailmentLabel(skill.ailment).toUpperCase(),
      });
    }

    this.checkFaint(targetSide, side);
    return target.hp > 0 && (affinity === 'weak' || critical);
  }

  resolveHeal(side, actor, skill) {
    const amount = Math.max(1, Math.round(skill.power + actor.stats.magic * 0.72 + this.engine.random() * 6));
    const restored = Math.min(amount, actor.stats.maxHp - actor.hp);
    actor.hp += restored;
    this.addEvent('heal', `${actor.name} used ${skill.name} and restored ${restored} HP.`, {
      side, tone: 'positive', impact: `+${restored}`, amount: restored,
    });
  }

  resolveStage(side, actor, target, skill) {
    const oldValue = target.stages[skill.stat];
    target.stages[skill.stat] = clamp(oldValue + skill.amount, -3, 3);
    const changed = target.stages[skill.stat] !== oldValue;
    const direction = skill.amount > 0 ? 'rose' : 'fell';
    this.addEvent('stage', `${actor.name} used ${skill.name}. ${target.name}’s ${skill.stat} ${changed ? direction : 'cannot change further'}.`, {
      side, tone: skill.amount > 0 ? 'positive' : 'negative', impact: skill.amount > 0 ? 'BOOST' : 'BREAK',
    });
  }

  resolveAilment(side, actor, target, skill) {
    if (target.ailment) {
      this.addEvent('status', `${actor.name} used ${skill.name}, but ${target.name} is already afflicted.`, { side, tone: 'muted' });
      return;
    }
    const chance = clamp(skill.accuracy + (actor.stats.luck - target.stats.luck) * 1.2, 35, 92);
    if (this.engine.random() * 100 < chance) {
      target.ailment = { type: skill.ailment, turns: 2 + Math.floor(this.engine.random() * 2) };
      this.addEvent('status', `${actor.name} used ${skill.name}. ${target.name} fell asleep!`, {
        side, tone: 'positive', impact: 'SLEEP',
      });
    } else {
      this.addEvent('miss', `${actor.name} used ${skill.name}, but it failed.`, { side, tone: 'negative', impact: 'MISS' });
    }
  }

  applyEndActionAilments(actor, side) {
    if (actor.fainted || actor.ailment?.type !== 'poison') return;
    const damage = Math.max(1, Math.floor(actor.stats.maxHp * this.config.poisonPercent));
    actor.hp = Math.max(0, actor.hp - damage);
    actor.ailment.turns -= 1;
    this.addEvent('status', `${actor.name} took ${damage} poison damage.`, {
      side, tone: 'negative', impact: 'POISON', amount: damage,
    });
    if (actor.ailment.turns <= 0 && actor.hp > 0) {
      actor.ailment = null;
      this.addEvent('status', `${actor.name} recovered from Poison.`, { side, tone: 'positive' });
    }
    this.checkFaint(side, otherSide(side));
  }

  checkFaint(side, victorSide) {
    const combatant = this.active(side);
    if (combatant.hp > 0 || combatant.fainted) return;
    combatant.fainted = true;
    combatant.hp = 0;
    this.addEvent('faint', `${combatant.name} can no longer battle.`, { side, tone: 'negative', impact: 'DOWN' });

    const reserveIndex = this.state.teams[side].findIndex((member) => !member.fainted);
    if (reserveIndex === -1) {
      this.state.winner = victorSide;
      this.state.phase = 'ended';
      this.addEvent('result', victorSide === 'player' ? 'Victory. The rival stock has been exhausted.' : 'Defeat. Your stock has been exhausted.', {
        side: victorSide, tone: victorSide === 'player' ? 'positive' : 'negative', impact: victorSide === 'player' ? 'VICTORY' : 'DEFEAT',
      });
      return;
    }

    this.state.active[side] = reserveIndex;
    const reserve = this.active(side);
    this.addEvent('summon', `${reserve.name} is summoned from the reserve stock.`, { side, tone: 'system', impact: 'SUMMON' });
  }

  finishAction(side, earnedBonus) {
    if (this.state.winner) return;

    if (earnedBonus && !this.state.bonusUsed[side]) {
      this.state.bonusUsed[side] = true;
      this.state.bonusAvailable = true;
      this.state.phase = side;
      this.addEvent('press', `${side === 'player' ? 'You gain' : 'The rival gains'} a bonus action!`, {
        side, tone: side === 'player' ? 'positive' : 'negative', impact: '1 MORE',
      });
      return;
    }

    this.state.bonusAvailable = false;
    if (side === 'player') {
      this.state.phase = 'enemy';
    } else {
      this.state.round += 1;
      this.state.phase = 'player';
      this.state.bonusUsed = { player: false, enemy: false };
      this.addEvent('turn', `Round ${this.state.round} — choose a command.`, { tone: 'turn' });
    }
  }

  chooseAiAction() {
    const actor = this.active('enemy');
    const target = this.active('player');
    const skillPool = [...new Set([...actor.skills, 'attack'])];
    const affordable = skillPool.map((id) => this.skills[id]).filter((skill) => this.canPay(actor, skill));
    if (!affordable.length) return { type: 'guard' };

    const weighted = affordable.map((skill) => {
      let score = 2 + this.engine.random() * 2;
      if (skill.kind === 'damage') {
        const affinity = this.affinityFor(target, skill.element);
        score += skill.power / 20;
        if (affinity === 'weak') score += 8;
        if (affinity === 'resist') score -= 3;
        if (['null', 'repel', 'drain'].includes(affinity)) score -= 20;
      }
      if (skill.kind === 'heal') score += actor.hp / actor.stats.maxHp < 0.4 ? 12 : -4;
      if (skill.kind === 'buff') score += actor.stages[skill.stat] <= 0 ? 3 : -1;
      if (skill.kind === 'debuff') score += target.stages[skill.stat] >= 0 ? 3 : -1;
      if (skill.kind === 'ailment') score += target.ailment ? -8 : 3;
      return { skill, score };
    });

    weighted.sort((a, b) => b.score - a.score);
    const pick = this.engine.random() < 0.76 ? weighted[0] : weighted[Math.min(1, weighted.length - 1)];
    return { type: 'skill', skillId: pick.skill.id };
  }

  ailmentLabel(type) {
    return type === 'poison' ? 'Poison' : type === 'sleep' ? 'Sleep' : type;
  }
}
