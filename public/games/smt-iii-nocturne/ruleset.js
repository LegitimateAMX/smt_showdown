import { PrototypeRuleset } from '../prototype-00/ruleset.js';

const otherSide = (side) => (side === 'player' ? 'enemy' : 'player');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const PRESS_OUTCOME_PRIORITY = {
  normal: 0,
  bonus: 1,
  penalty: 2,
  catastrophic: 3,
};

/**
 * Nocturne's Press Turn action economy and title-specific damage formulas,
 * currently operating on temporary prototype combatant and skill data.
 */
export class NocturneRuleset extends PrototypeRuleset {
  createInitialState(options) {
    const state = super.createInitialState(options);
    state.pressTurns = {
      player: { full: this.livingFromState(state, 'player').length, half: 0 },
      enemy: { full: 0, half: 0 },
    };
    return state;
  }

  livingFromState(state, side) {
    return state.teams[side].filter((member) => !member.fainted);
  }

  makeCombatant(selection) {
    const id = typeof selection === 'string' ? selection : selection?.id;
    const source = this.game.data.demons[id];
    if (!source) throw new Error(`Unknown demon "${id}" in game "${this.game.id}".`);

    const requestedLevel = Number(typeof selection === 'string' ? source.baseLevel : selection.level);
    const level = clamp(
      Number.isInteger(requestedLevel) ? requestedLevel : source.baseLevel,
      source.baseLevel,
      this.config.maxLevel,
    );
    const cappedStat = (stat) => clamp(source.baseStats[stat], 0, this.config.statCap);
    const stats = {
      maxHp: source.baseStats.hp,
      maxMp: source.baseStats.mp,
      strength: cappedStat('strength'),
      magic: cappedStat('magic'),
      vitality: cappedStat('vitality'),
      agility: cappedStat('agility'),
      luck: cappedStat('luck'),
    };
    const usableSkills = this.usableSkillPoolFor(source, level);
    const requestedSkills = typeof selection === 'object' && Array.isArray(selection.skills)
      ? selection.skills
      : usableSkills;
    const skills = [...new Set(requestedSkills)]
      .filter((skillId) => usableSkills.includes(skillId))
      .slice(0, this.config.maxSkills);

    return {
      id: source.id,
      name: source.name,
      race: source.race,
      level,
      glyph: source.glyph,
      palette: [...source.palette],
      stats,
      affinities: { ...source.affinities },
      skills,
      hp: stats.maxHp,
      mp: stats.maxMp,
      stages: { attack: 0, defense: 0, agility: 0 },
      ailment: null,
      guarding: false,
      fainted: false,
    };
  }

  usableSkillPoolFor(demon, level) {
    const learnedSkills = demon.futureSkills
      .filter((entry) => entry.level <= level)
      .map((entry) => entry.skillId);
    // The standard Attack command is universal and does not occupy one of a
    // demon's eight usable skill slots.
    return [...new Set([...demon.innateSkills, ...learnedSkills])]
      .filter((skillId) => skillId !== 'attack');
  }

  onBattleStart() {
    const icons = this.remainingIcons('player');
    this.addEvent('system', `Contract established. Game: ${this.game.name}. Seed: ${this.engine.seed}.`, { tone: 'system' });
    this.addEvent('summon', `${this.living('player').length} allies and ${this.living('enemy').length} rivals enter the field.`, { tone: 'system' });
    this.addEvent('turn', `Round 1 - your side begins with ${icons} Press Turn ${icons === 1 ? 'icon' : 'icons'}.`, { tone: 'turn' });
  }

  act(side, action) {
    if (this.state.winner) return { ok: false, error: 'This battle has ended.', events: [] };
    if (this.state.phase !== side) return { ok: false, error: "It is not that side's turn.", events: [] };
    if (action.type === 'guard') return { ok: false, error: 'Guard is not available in Nocturne.', events: [] };

    const eventStart = this.state.events.length;
    const actor = this.active(side);
    const actorIndex = this.state.active[side];

    if (actor.ailment?.type === 'sleep') {
      actor.ailment.turns -= 1;
      if (actor.ailment.turns <= 0 || this.engine.random() < 0.38) {
        actor.ailment = null;
        this.addEvent('status', `${actor.name} woke up!`, {
          side, targetSide: side, targetIndex: actorIndex, tone: 'positive', impact: 'WAKE',
        });
      } else {
        actor.guarding = false;
        this.addEvent('status', `${actor.name} is fast asleep.`, {
          side, targetSide: side, targetIndex: actorIndex, tone: 'negative', impact: 'ASLEEP',
        });
        this.finishAction(side, 'normal');
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

      const targetSide = this.targetSideForSkill(side, skill);
      const target = this.targetForAction(side, targetSide, actor, skill, action);
      if (!target) return { ok: false, error: 'That target is not available.', events: [] };

      actor.guarding = false;
      this.payCost(actor, skill);
      let outcome = 'normal';
      if (skill.kind === 'damage') outcome = this.resolveDamage(side, actor, targetSide, target, skill);
      if (skill.kind === 'heal') this.resolveHealTarget(side, actor, targetSide, target, skill);
      if (skill.kind === 'buff') this.resolveStage(side, actor, target, skill);
      if (skill.kind === 'debuff') this.resolveStage(side, actor, target, skill);
      if (skill.kind === 'ailment') this.resolveAilment(side, actor, target, skill);
      this.applyEndActionAilments(actor, side);
      this.finishAction(side, outcome);
    } else if (action.type === 'pass') {
      actor.guarding = false;
      this.addEvent('pass', `${actor.name} passed the turn.`, {
        side, targetSide: side, targetIndex: actorIndex, tone: 'system', impact: 'PASS',
      });
      this.applyEndActionAilments(actor, side);
      this.finishAction(side, 'pass');
    } else if (action.type === 'switch') {
      return { ok: false, error: 'All party members are already active.', events: [] };
    } else {
      return { ok: false, error: 'Unknown command.', events: [] };
    }

    return this.engine.resultSince(eventStart);
  }

  targetSideForSkill(side, skill) {
    if (skill.targetSide === 'self' || skill.targetSide === 'ally') return side;
    if (skill.targetSide === 'enemy') return otherSide(side);
    return skill.kind === 'heal' || skill.kind === 'buff' ? side : otherSide(side);
  }

  targetForAction(side, targetSide, actor, skill, action) {
    if (skill.target === 'self') return actor;
    if (Number.isInteger(action.targetIndex)) {
      const selected = this.state.teams[targetSide][action.targetIndex];
      return selected && !selected.fainted ? selected : null;
    }
    return targetSide === side ? actor : this.active(targetSide);
  }

  resolveHealTarget(side, actor, targetSide, target, skill) {
    const amount = Math.max(1, Math.round(skill.power + actor.stats.magic * 0.72 + this.engine.random() * 6));
    const restored = Math.min(amount, target.stats.maxHp - target.hp);
    target.hp += restored;
    this.addEvent('heal', `${actor.name} used ${skill.name}. ${target.name} restored ${restored} HP.`, {
      side,
      targetSide,
      targetIndex: this.state.teams[targetSide].indexOf(target),
      tone: 'positive',
      impact: `+${restored}`,
      amount: restored,
    });
  }

  resolveStage(side, actor, target, skill) {
    const oldValue = target.stages[skill.stat];
    target.stages[skill.stat] = clamp(oldValue + skill.amount, -3, 3);
    const changed = target.stages[skill.stat] !== oldValue;
    const direction = skill.amount > 0 ? 'rose' : 'fell';
    const targetSide = this.state.teams[side].includes(target) ? side : otherSide(side);
    this.addEvent('stage', `${actor.name} used ${skill.name}. ${target.name}'s ${skill.stat} ${changed ? direction : 'cannot change further'}.`, {
      side,
      targetSide,
      targetIndex: this.state.teams[targetSide].indexOf(target),
      tone: skill.amount > 0 ? 'positive' : 'negative',
      impact: skill.amount > 0 ? 'BOOST' : 'BREAK',
    });
  }

  resolveAilment(side, actor, target, skill) {
    const targetSide = otherSide(side);
    const targetIndex = this.state.teams[targetSide].indexOf(target);
    if (target.ailment) {
      this.addEvent('status', `${actor.name} used ${skill.name}, but ${target.name} is already afflicted.`, {
        side, targetSide, targetIndex, tone: 'muted',
      });
      return;
    }
    const chance = clamp(skill.accuracy + (actor.stats.luck - target.stats.luck) * 1.2, 35, 92);
    if (this.engine.random() * 100 < chance) {
      target.ailment = { type: skill.ailment, turns: 2 + Math.floor(this.engine.random() * 2) };
      this.addEvent('status', `${actor.name} used ${skill.name}. ${target.name} fell asleep!`, {
        side, targetSide, targetIndex, tone: 'positive', impact: 'SLEEP',
      });
    } else {
      this.addEvent('miss', `${actor.name} used ${skill.name}, but it failed.`, {
        side, targetSide, targetIndex, tone: 'negative', impact: 'MISS',
      });
    }
  }

  applyEndActionAilments(actor, side) {
    if (actor.fainted || actor.ailment?.type !== 'poison') return;
    const targetIndex = this.state.teams[side].indexOf(actor);
    const damage = Math.max(1, Math.floor(actor.stats.maxHp * this.config.poisonPercent));
    actor.hp = Math.max(0, actor.hp - damage);
    actor.ailment.turns -= 1;
    this.addEvent('status', `${actor.name} took ${damage} poison damage.`, {
      side, targetSide: side, targetIndex, tone: 'negative', impact: 'POISON', amount: damage,
    });
    if (actor.ailment.turns <= 0 && actor.hp > 0) {
      actor.ailment = null;
      this.addEvent('status', `${actor.name} recovered from Poison.`, {
        side, targetSide: side, targetIndex, tone: 'positive',
      });
    }
    this.checkFaint(side, otherSide(side), actor);
  }

  resolveDamage(side, actor, targetSide, target, skill) {
    if (skill.target === 'random') return this.resolveRandomDamage(side, actor, targetSide, skill);

    const targets = skill.target === 'all' ? [...this.living(targetSide)] : [target];
    return this.resolveDamageSequence(side, actor, targetSide, skill, targets);
  }

  resolveRandomDamage(side, actor, targetSide, skill) {
    const profile = this.multiHitProfile(skill);
    const livingTargets = [...this.living(targetSide)];
    const rolledHits = profile.min === profile.max
      ? profile.min
      : profile.min + Math.floor(this.engine.random() * (profile.max - profile.min + 1));
    const perTargetCap = profile.maxPerTarget
      ?? (livingTargets.length === 1 ? 2 : 3);
    const assignments = [];
    const assignedCounts = new Map();

    for (let hit = 0; hit < rolledHits; hit += 1) {
      const candidates = livingTargets.filter((candidate) => (
        (assignedCounts.get(candidate) || 0) < perTargetCap
      ));
      if (!candidates.length) break;
      const selected = candidates[Math.floor(this.engine.random() * candidates.length)];
      assignments.push(selected);
      assignedCounts.set(selected, (assignedCounts.get(selected) || 0) + 1);
    }

    const targetCount = new Set(assignments).size;
    this.addEvent('multi', `${actor.name} used ${skill.name}: ${assignments.length} hits across ${targetCount} ${targetCount === 1 ? 'target' : 'targets'}.`, {
      side,
      tone: 'system',
      hitCount: assignments.length,
      targetCount,
    });
    return this.resolveDamageSequence(side, actor, targetSide, skill, assignments);
  }

  multiHitProfile(skill) {
    // Random-target Nocturne skills use:
    // hits: { min, max, maxPerTarget? }. With no explicit cap, a lone
    // combatant can receive two hits and each member of a group can receive
    // three. A numeric value represents a fixed hit count.
    if (Number.isInteger(skill.hits)) {
      return { min: skill.hits, max: skill.hits, maxPerTarget: undefined };
    }
    return {
      min: skill.hits?.min ?? 1,
      max: skill.hits?.max ?? skill.hits?.min ?? 1,
      maxPerTarget: skill.hits?.maxPerTarget,
    };
  }

  resolveDamageSequence(side, actor, targetSide, skill, targets) {
    let result = 'normal';

    targets.forEach((currentTarget, index) => {
      const targetResult = this.resolveDamageAgainstTarget(side, actor, targetSide, currentTarget, skill, {
        number: index + 1,
        total: targets.length,
      });
      if (PRESS_OUTCOME_PRIORITY[targetResult] > PRESS_OUTCOME_PRIORITY[result]) result = targetResult;
    });

    return result;
  }

  resolveDamageAgainstTarget(side, actor, targetSide, target, skill, hit = { number: 1, total: 1 }) {
    const targetIndex = this.state.teams[targetSide].indexOf(target);
    const hitLabel = hit.total > 1 ? ` [${hit.number}/${hit.total}]` : '';
    const hitDetails = { hitNumber: hit.number, hitCount: hit.total };
    const accuracyStage = this.stageMultiplier(actor.stages.agility) / this.stageMultiplier(target.stages.agility);
    const hitChance = clamp(skill.accuracy * accuracyStage, 55, 100);
    if (this.engine.random() * 100 >= hitChance) {
      this.addEvent('miss', `${actor.name} used ${skill.name}${hitLabel}, but missed ${target.name}!`, {
        side, tone: 'negative', impact: 'MISS', targetSide, targetIndex, ...hitDetails,
      });
      return 'penalty';
    }

    const affinity = this.affinityFor(target, skill.element);
    const damageFormula = this.damageFormulaFor(skill);
    const variance = this.damageVarianceFor(damageFormula);
    let damage = this.baseDamageFor(side, actor, skill);
    let critical = false;

    damage *= this.stageMultiplier(actor.stages.attack);
    damage /= this.stageMultiplier(target.stages.defense);
    if (damageFormula !== 'magic' && skill.crit && this.engine.random() * 100 < skill.crit) {
      critical = true;
      damage *= this.config.criticalDamage;
    }
    if (!['null', 'repel', 'drain'].includes(affinity)) {
      damage *= this.affinities[affinity].multiplier;
    }
    if (target.guarding) damage *= this.config.guardDamage;
    damage = Math.max(1, Math.round(damage * variance));

    if (affinity === 'null') {
      this.addEvent('null', `${actor.name} used ${skill.name}${hitLabel}. ${target.name} nullified it.`, {
        side, tone: 'negative', impact: 'NULL', targetSide, targetIndex, ...hitDetails,
      });
      return 'penalty';
    }
    if (affinity === 'repel') {
      actor.hp = Math.max(0, actor.hp - damage);
      this.addEvent('repel', `${target.name} repelled ${skill.name}${hitLabel}! ${actor.name} took ${damage} damage.`, {
        side,
        tone: 'negative',
        impact: 'REPEL',
        amount: damage,
        targetSide: side,
        targetIndex: this.state.teams[side].indexOf(actor),
        ...hitDetails,
      });
      this.checkFaint(side, targetSide, actor);
      return 'catastrophic';
    }
    if (affinity === 'drain') {
      const restored = Math.min(damage, target.stats.maxHp - target.hp);
      target.hp += restored;
      this.addEvent('drain', `${target.name} drained ${skill.name}${hitLabel} and restored ${restored} HP.`, {
        side: targetSide, tone: 'positive', impact: 'DRAIN', amount: restored, targetSide, targetIndex, ...hitDetails,
      });
      return 'catastrophic';
    }

    target.hp = Math.max(0, target.hp - damage);
    const tags = [];
    if (affinity === 'weak') tags.push('WEAK');
    if (affinity === 'resist') tags.push('RESIST');
    if (critical) tags.push('CRITICAL');
    this.addEvent('damage', `${actor.name} used ${skill.name}${hitLabel}. ${target.name} took ${damage} damage${tags.length ? ` - ${tags.join(' / ')}!` : '.'}`, {
      side,
      tone: affinity === 'weak' || critical ? 'positive' : affinity === 'resist' ? 'muted' : 'damage',
      impact: tags[0] || `${damage}`,
      amount: damage,
      affinity,
      critical,
      targetSide,
      targetIndex,
      ...hitDetails,
    });

    if (target.ailment?.type === 'sleep') {
      target.ailment = null;
      this.addEvent('status', `${target.name} woke from the impact.`, {
        side: targetSide, targetSide, targetIndex, tone: 'system',
      });
    }

    if (skill.ailment && target.hp > 0 && !target.ailment && this.engine.random() * 100 < skill.ailmentChance) {
      target.ailment = { type: skill.ailment, turns: 3 };
      this.addEvent('status', `${target.name} was afflicted with ${this.ailmentLabel(skill.ailment)}!`, {
        side: targetSide,
        targetSide,
        targetIndex,
        tone: 'negative',
        impact: this.ailmentLabel(skill.ailment).toUpperCase(),
      });
    }

    this.checkFaint(targetSide, side, target);
    return affinity === 'weak' || critical ? 'bonus' : 'normal';
  }

  damageFormulaFor(skill) {
    if (['basic', 'physical', 'weapon', 'magic'].includes(skill.damageFormula)) {
      return skill.damageFormula;
    }
    if (skill.id === 'attack') return 'basic';
    if (skill.element === 'physical' || skill.element === 'gun') return 'physical';
    return 'magic';
  }

  damageVarianceFor(formula) {
    return formula === 'magic'
      ? 0.9 + this.engine.random() * 0.2
      : 0.95 + this.engine.random() * 0.1;
  }

  baseDamageFor(side, actor, skill) {
    const formula = this.damageFormulaFor(skill);
    const level = actor.level;
    const strength = actor.stats.strength ?? actor.stats.attack;

    if (formula === 'basic') {
      return (level + strength) * 2 * 1.33 * 0.8;
    }
    if (formula === 'physical') {
      return ((level + strength) * 2 * skill.power / 23.2) * 0.8;
    }
    if (formula === 'weapon') {
      const vitality = actor.stats.vitality ?? actor.stats.defense;
      const maximumHp = side === 'player'
        ? actor.stats.maxHp
        : Math.min((level + vitality) * 6, 999);
      return (maximumHp / 69.6) * skill.power * 0.8;
    }

    const complement = Number.isFinite(skill.complement) ? skill.complement : 0;
    const limit = Number.isFinite(skill.limit) ? skill.limit : Number.POSITIVE_INFINITY;
    const effectiveLimit = Math.min(complement + level * skill.power * 2 / 21, limit);
    const damageLevel = Math.min(level, 160);
    const magic = actor.stats.magic;
    return (
      effectiveLimit
      + effectiveLimit / 100 * (magic - (damageLevel / 5 + 4)) * 2.5
    ) * 0.8;
  }

  checkFaint(side, victorSide, combatant = this.active(side)) {
    if (combatant.hp > 0 || combatant.fainted) return;
    combatant.fainted = true;
    combatant.hp = 0;
    const targetIndex = this.state.teams[side].indexOf(combatant);
    this.addEvent('faint', `${combatant.name} can no longer battle.`, {
      side, targetSide: side, targetIndex, tone: 'negative', impact: 'DOWN',
    });

    const reserveIndex = this.state.teams[side].findIndex((member) => !member.fainted);
    if (reserveIndex === -1) {
      this.state.winner = victorSide;
      this.state.phase = 'ended';
      this.addEvent('result', victorSide === 'player' ? 'Victory. The rival party has been exhausted.' : 'Defeat. Your party has been exhausted.', {
        side: victorSide,
        tone: victorSide === 'player' ? 'positive' : 'negative',
        impact: victorSide === 'player' ? 'VICTORY' : 'DEFEAT',
      });
      return;
    }

    // Keep a defeated acting unit selected until finishAction advances from its
    // slot; changing it here would skip the next unit in the side's sequence.
    const actingCombatant = this.state.teams[side][this.state.active[side]];
    if (this.state.phase !== side && actingCombatant?.fainted) this.state.active[side] = reserveIndex;
  }

  chooseAiAction() {
    const action = super.chooseAiAction();
    if (action.type !== 'skill') return action;

    const skill = this.skills[action.skillId];
    if (!skill || skill.target === 'all' || skill.target === 'self') return action;
    const targetSide = this.targetSideForSkill('enemy', skill);
    const candidates = this.state.teams[targetSide]
      .map((member, index) => ({ member, index }))
      .filter(({ member }) => !member.fainted);
    if (!candidates.length) return action;

    if (skill.kind === 'heal') {
      candidates.sort((a, b) => (a.member.hp / a.member.stats.maxHp) - (b.member.hp / b.member.stats.maxHp));
    } else if (skill.kind === 'buff') {
      const actorIndex = this.state.active.enemy;
      return { ...action, targetIndex: actorIndex };
    } else if (skill.kind === 'damage') {
      candidates.sort((a, b) => {
        const affinityScore = (entry) => {
          const affinity = this.affinityFor(entry.member, skill.element);
          if (affinity === 'weak') return 20;
          if (affinity === 'resist') return -5;
          if (['null', 'repel', 'drain'].includes(affinity)) return -50;
          return 0;
        };
        return (affinityScore(b) - b.member.hp / b.member.stats.maxHp)
          - (affinityScore(a) - a.member.hp / a.member.stats.maxHp);
      });
    }

    return { ...action, targetIndex: candidates[0].index };
  }

  finishAction(side, outcome) {
    if (this.state.winner) return;

    const normalizedOutcome = typeof outcome === 'string' ? outcome : outcome ? 'bonus' : 'normal';
    this.consumeIcons(side, normalizedOutcome);
    this.advanceActor(side);

    if (this.remainingIcons(side) > 0) return;
    this.beginTurn(otherSide(side));
  }

  consumeIcons(side, outcome) {
    const icons = this.state.pressTurns[side];
    if (outcome === 'catastrophic') {
      icons.full = 0;
      icons.half = 0;
      this.addEvent('press', 'Repel or Drain exhausted every remaining Press Turn icon.', {
        side, tone: 'negative', impact: 'TURN LOST',
      });
      return;
    }

    if (outcome === 'pass') {
      if (icons.half > 0) {
        this.spendOneIcon(icons);
      } else if (icons.full > 0) {
        icons.full -= 1;
        icons.half += 1;
        this.addEvent('press', 'Passing changed one full icon into a half icon.', {
          side, tone: 'system', impact: 'HALF TURN',
        });
      }
      return;
    }

    if (outcome === 'bonus') {
      if (icons.full > 0) {
        icons.full -= 1;
        icons.half += 1;
        this.addEvent('press', 'The successful strike changed one full icon into a half icon.', {
          side, tone: 'positive', impact: 'HALF TURN',
        });
      } else {
        this.spendOneIcon(icons);
      }
      return;
    }

    const iconsToSpend = outcome === 'penalty' ? 2 : 1;
    for (let index = 0; index < iconsToSpend; index += 1) this.spendOneIcon(icons);
    if (outcome === 'penalty') {
      this.addEvent('press', 'The miss or nullification cost two Press Turn icons.', {
        side, tone: 'negative', impact: '-2 TURNS',
      });
    }
  }

  spendOneIcon(icons) {
    if (icons.half > 0) icons.half -= 1;
    else if (icons.full > 0) icons.full -= 1;
  }

  remainingIcons(side) {
    const icons = this.state.pressTurns[side];
    return icons.full + icons.half;
  }

  advanceActor(side) {
    const team = this.state.teams[side];
    const current = this.state.active[side];
    for (let offset = 1; offset <= team.length; offset += 1) {
      const index = (current + offset) % team.length;
      if (!team[index].fainted) {
        this.state.active[side] = index;
        return;
      }
    }
  }

  beginTurn(side) {
    const previousSide = otherSide(side);
    this.state.pressTurns[previousSide] = { full: 0, half: 0 };
    this.state.pressTurns[side] = { full: this.living(side).length, half: 0 };
    this.state.active[side] = this.state.teams[side].findIndex((member) => !member.fainted);
    this.state.phase = side;

    if (side === 'player') this.state.round += 1;
    const count = this.remainingIcons(side);
    const label = side === 'player' ? `Round ${this.state.round} - your side` : 'The rival side';
    this.addEvent('turn', `${label} begins with ${count} Press Turn ${count === 1 ? 'icon' : 'icons'}.`, {
      side, tone: 'turn',
    });
  }
}
