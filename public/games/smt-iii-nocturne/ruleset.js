import { PrototypeRuleset } from '../prototype-00/ruleset.js';

const otherSide = (side) => (side === 'player' ? 'enemy' : 'player');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const PRESS_OUTCOME_PRIORITY = {
  normal: 0,
  bonus: 1,
  penalty: 2,
  catastrophic: 3,
};

const ZERO_PHYSICAL_EVASION_AILMENTS = new Set(['sleep', 'freeze', 'shock']);
const TEMPORARY_AILMENTS = new Set(['freeze', 'shock']);
const FLY_REDUCED_STATS = new Set(['strength', 'magic', 'vitality', 'luck', 'attack', 'defense']);
const STONE_REDUCED_DAMAGE_ELEMENTS = new Set(['fire', 'ice', 'electricity']);
const ALMIGHTY_PHYSICAL_SKILL_IDS = new Set([
  'lastResort', 'kamikaze', 'sacrifice', 'freikugel', 'stinger', 'tekisatsu',
]);

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
    state.actionSequence = 0;
    return state;
  }

  livingFromState(state, side) {
    return state.teams[side].filter((member) => !member.fainted && !member.fled);
  }

  living(side) {
    return this.livingFromState(this.state, side);
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
      fled: false,
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

    const statusResult = actor.statusActionSequence === this.state.actionSequence
      ? { handled: false }
      : this.resolveStartOfActionStatus(side, actor, actorIndex);
    actor.statusActionSequence = this.state.actionSequence;
    if (statusResult.handled) {
      actor.guarding = false;
      if (!this.state.winner) this.finishAction(side, statusResult.outcome || 'normal');
      return this.engine.resultSince(eventStart);
    }

    if (action.type === 'skill') {
      const skill = this.skills[action.skillId];
      if (!skill || (!actor.skills.includes(skill.id) && skill.id !== 'attack')) {
        return { ok: false, error: 'That skill is not available.', events: [] };
      }
      if (skill.implemented === false) {
        return { ok: false, error: `${skill.name} battle mechanics have not been implemented yet.`, events: [] };
      }
      if (actor.ailment?.type === 'mute' && skill.id !== 'attack') {
        return { ok: false, error: `${actor.name} is muted and cannot use skills.`, events: [] };
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
      this.finishAction(side, outcome);
    } else if (action.type === 'pass') {
      actor.guarding = false;
      this.addEvent('pass', `${actor.name} passed the turn.`, {
        side, targetSide: side, targetIndex: actorIndex, tone: 'system', impact: 'PASS',
      });
      this.finishAction(side, 'pass');
    } else if (action.type === 'summon') {
      const summonIndex = Number(action.index);
      const summoned = this.state.teams[side][summonIndex];
      if (!summoned || summoned.fainted || !summoned.fled) {
        return { ok: false, error: 'That unit cannot be resummoned.', events: [] };
      }
      actor.guarding = false;
      summoned.fled = false;
      this.addEvent('summon', `${actor.name} resummoned ${summoned.name} from stock.`, {
        side,
        targetSide: side,
        targetIndex: summonIndex,
        tone: 'positive',
        impact: 'SUMMON',
      });
      this.finishAction(side, 'normal');
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
      return selected && !selected.fainted && !selected.fled ? selected : null;
    }
    return targetSide === side ? actor : this.active(targetSide);
  }

  resolveStartOfActionStatus(side, actor, actorIndex) {
    const type = actor.ailment?.type;
    if (!type) return { handled: false };

    if (type === 'poison') {
      const damage = Math.max(1, Math.floor(actor.stats.maxHp * this.config.poisonPercent));
      actor.hp = Math.max(0, actor.hp - damage);
      this.addEvent('status', `${actor.name} lost ${damage} HP to Poison.`, {
        side, targetSide: side, targetIndex: actorIndex, tone: 'negative', impact: 'POISON', amount: damage,
      });
      this.checkFaint(side, otherSide(side), actor);
      return { handled: actor.fainted };
    }

    if (type === 'sleep') {
      const hpRestored = Math.min(Math.max(1, Math.floor(actor.stats.maxHp * 0.1)), actor.stats.maxHp - actor.hp);
      const mpRestored = Math.min(Math.max(1, Math.floor(actor.stats.maxMp * 0.1)), actor.stats.maxMp - actor.mp);
      actor.hp += hpRestored;
      actor.mp += mpRestored;
      this.addEvent('status', `${actor.name} restored ${hpRestored} HP and ${mpRestored} MP while sleeping.`, {
        side, targetSide: side, targetIndex: actorIndex, tone: 'positive', impact: 'REST',
        hpRestored, mpRestored,
      });
      if (this.tryNaturalRecovery(actor, side, actorIndex, 100)) return { handled: false };
      this.addEvent('status', `${actor.name} is fast asleep and cannot act.`, {
        side, targetSide: side, targetIndex: actorIndex, tone: 'negative', impact: 'ASLEEP',
      });
      return { handled: true };
    }

    if (type === 'freeze' || type === 'shock') {
      this.addEvent('status', `${actor.name} is ${type === 'freeze' ? 'frozen' : 'shocked'} and cannot act.`, {
        side, targetSide: side, targetIndex: actorIndex, tone: 'negative', impact: type.toUpperCase(),
      });
      return { handled: true };
    }

    if (type === 'stone') {
      this.addEvent('status', `${actor.name} is petrified and cannot act.`, {
        side, targetSide: side, targetIndex: actorIndex, tone: 'negative', impact: 'STONE',
      });
      return { handled: true };
    }

    if (type === 'charm') {
      if (this.tryNaturalRecovery(actor, side, actorIndex, 200)) return { handled: false };
      return { handled: true, outcome: this.resolveCharmAction(side, actor, actorIndex) };
    }

    if (type === 'bind') {
      if (this.tryNaturalRecovery(actor, side, actorIndex, 150)) return { handled: false };
      this.addEvent('status', `${actor.name} is bound and cannot act.`, {
        side, targetSide: side, targetIndex: actorIndex, tone: 'negative', impact: 'BOUND',
      });
      return { handled: true };
    }

    if (type === 'panic') {
      if (this.tryNaturalRecovery(actor, side, actorIndex, 150)) return { handled: false };
      if (this.engine.random() >= 0.5) return { handled: false };
      this.resolvePanicAction(side, actor, actorIndex);
      return { handled: true };
    }

    return { handled: false };
  }

  naturalRecoveryChance(actor, factor) {
    return clamp(factor * this.effectiveStat(actor, 'luck') / (20 + actor.level), 0, 100);
  }

  tryNaturalRecovery(actor, side, actorIndex, factor) {
    const chance = this.naturalRecoveryChance(actor, factor);
    if (this.engine.random() * 100 >= chance) return false;
    const label = this.ailmentLabel(actor.ailment.type);
    actor.ailment = null;
    this.addEvent('status', `${actor.name} naturally recovered from ${label}.`, {
      side, targetSide: side, targetIndex: actorIndex, tone: 'positive', impact: 'RECOVER', chance,
    });
    return true;
  }

  resolveCharmAction(side, actor, actorIndex) {
    const choice = Math.floor(this.engine.random() * 3);
    if (choice === 0) {
      const allies = this.living(side).filter((member) => member !== actor);
      if (!allies.length) {
        this.addEvent('status', `${actor.name} is charmed, but has no ally to attack.`, {
          side, targetSide: side, targetIndex: actorIndex, tone: 'negative', impact: 'CHARMED',
        });
        return 'normal';
      }
      const target = allies[Math.floor(this.engine.random() * allies.length)];
      this.addEvent('status', `${actor.name} is charmed and turns on ${target.name}!`, {
        side, targetSide: side, targetIndex: this.state.teams[side].indexOf(target), tone: 'negative', impact: 'CHARMED',
      });
      return this.resolveDamage(side, actor, side, target, this.skills.attack);
    }

    if (choice === 1) {
      const supportSkills = actor.skills
        .map((id) => this.skills[id])
        .filter((skill) => skill
          && ['heal', 'buff'].includes(skill.kind)
          && skill.implemented !== false
          && this.canPay(actor, skill));
      const targets = this.living(otherSide(side));
      if (!supportSkills.length || !targets.length) {
        this.addEvent('status', `${actor.name} is charmed and tries to aid the enemy, but cannot.`, {
          side, targetSide: side, targetIndex: actorIndex, tone: 'negative', impact: 'CHARMED',
        });
        return 'normal';
      }
      const skill = supportSkills[Math.floor(this.engine.random() * supportSkills.length)];
      const target = targets[Math.floor(this.engine.random() * targets.length)];
      const targetSide = otherSide(side);
      this.addEvent('status', `${actor.name} is charmed and aids ${target.name}!`, {
        side, targetSide, targetIndex: this.state.teams[targetSide].indexOf(target), tone: 'negative', impact: 'CHARMED',
      });
      this.payCost(actor, skill);
      if (skill.kind === 'heal') this.resolveHealTarget(side, actor, targetSide, target, skill);
      else this.resolveStage(side, actor, target, skill);
      return 'normal';
    }

    this.addEvent('status', `${actor.name} is charmed and does nothing.`, {
      side, targetSide: side, targetIndex: actorIndex, tone: 'negative', impact: 'CHARMED',
    });
    return 'normal';
  }

  resolvePanicAction(side, actor, actorIndex) {
    const choice = Math.floor(this.engine.random() * 3);
    if (choice === 0) {
      this.addEvent('status', `${actor.name} panicked and threw away money!`, {
        side, targetSide: side, targetIndex: actorIndex, tone: 'negative', impact: 'MONEY LOST',
      });
      return;
    }
    if (choice === 1) {
      this.addEvent('status', `${actor.name} stood dumbfounded in panic.`, {
        side, targetSide: side, targetIndex: actorIndex, tone: 'negative', impact: 'PANIC',
      });
      return;
    }

    if (this.living(side).length <= 1) {
      this.addEvent('status', `${actor.name} tried to flee in panic, but no ally remained on the field.`, {
        side, targetSide: side, targetIndex: actorIndex, tone: 'negative', impact: 'PANIC',
      });
      return;
    }
    actor.fled = true;
    this.addEvent('switch', `${actor.name} fled the active party and returned to stock!`, {
      side, targetSide: side, targetIndex: actorIndex, tone: 'negative', impact: 'FLED',
    });
  }

  applyAilment(target, type, targetSide, sourceSide) {
    const ailment = { type };
    if (TEMPORARY_AILMENTS.has(type)) ailment.expiresAfterSide = sourceSide;
    target.ailment = ailment;
    return ailment;
  }

  effectiveStat(combatant, stat) {
    if (combatant.ailment?.type === 'fly' && FLY_REDUCED_STATS.has(stat)) return 1;
    return combatant.stats[stat];
  }

  canUseCounter(combatant) {
    return !combatant.fainted && !combatant.fled && combatant.ailment?.type !== 'stun';
  }

  resolveHealTarget(side, actor, targetSide, target, skill) {
    const amount = Math.max(1, Math.round(skill.power + this.effectiveStat(actor, 'magic') * 0.72 + this.engine.random() * 6));
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
    const targetSide = this.state.teams[side].includes(target) ? side : otherSide(side);
    const targetIndex = this.state.teams[targetSide].indexOf(target);
    if (target.ailment) {
      this.addEvent('status', `${actor.name} used ${skill.name}, but ${target.name} is already afflicted.`, {
        side, targetSide, targetIndex, tone: 'muted',
      });
      return;
    }
    let chance = clamp(
      skill.accuracy + (this.effectiveStat(actor, 'luck') - this.effectiveStat(target, 'luck')) * 1.2,
      35,
      92,
    );
    if (actor.ailment?.type === 'stun') chance *= 0.75;
    if (this.engine.random() * 100 < chance) {
      this.applyAilment(target, skill.ailment, targetSide, side);
      const label = this.ailmentLabel(skill.ailment);
      this.addEvent('status', `${actor.name} used ${skill.name}. ${target.name} was afflicted with ${label}!`, {
        side, targetSide, targetIndex, tone: 'positive', impact: label.toUpperCase(),
      });
    } else {
      this.addEvent('miss', `${actor.name} used ${skill.name}, but it failed.`, {
        side, targetSide, targetIndex, tone: 'negative', impact: 'MISS',
      });
    }
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
    const physicalAttack = this.isPhysicalAttack(skill);
    const hitChance = this.hitChanceFor(actor, target, skill);
    if (this.engine.random() * 100 >= hitChance) {
      this.addEvent('miss', `${actor.name} used ${skill.name}${hitLabel}, but missed ${target.name}!`, {
        side, tone: 'negative', impact: 'MISS', targetSide, targetIndex, ...hitDetails,
      });
      return 'penalty';
    }

    if (target.ailment?.type === 'stone' && (physicalAttack || skill.element === 'force')) {
      const damage = target.hp;
      target.hp = 0;
      target.ailment = null;
      this.addEvent('damage', `${actor.name} used ${skill.name}${hitLabel}. ${target.name} shattered!`, {
        side,
        tone: 'positive',
        impact: 'SHATTER',
        amount: damage,
        affinity: 'normal',
        critical: false,
        targetSide,
        targetIndex,
        ...hitDetails,
      });
      this.checkFaint(targetSide, otherSide(targetSide), target);
      return 'normal';
    }

    let affinity = this.affinityFor(target, skill.element);
    if (target.ailment?.type === 'freeze'
      && physicalAttack
      && ['null', 'repel', 'drain'].includes(affinity)) {
      affinity = 'normal';
    }
    if (target.ailment?.type === 'stone' && STONE_REDUCED_DAMAGE_ELEMENTS.has(skill.element)) {
      affinity = 'normal';
    }
    const damageFormula = this.damageFormulaFor(skill);
    const variance = this.damageVarianceFor(damageFormula);
    let damage = this.baseDamageFor(side, actor, skill);
    let critical = false;

    damage *= this.stageMultiplier(actor.stages.attack);
    damage /= this.stageMultiplier(target.stages.defense);
    if (physicalAttack && actor.ailment?.type === 'poison') damage *= 0.5;
    if (actor.ailment?.type === 'fly') damage *= 0.1;
    const criticalChance = this.criticalChanceFor(target, skill);
    if (criticalChance > 0 && this.engine.random() * 100 < criticalChance) {
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
      this.checkFaint(side, otherSide(side), actor);
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

    if (target.ailment?.type === 'fly') damage = Math.max(1, Math.round(damage * 2));
    if (target.ailment?.type === 'stone' && STONE_REDUCED_DAMAGE_ELEMENTS.has(skill.element)) {
      damage = Math.max(1, Math.round(damage * 0.1));
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
      this.applyAilment(target, skill.ailment, targetSide, side);
      this.addEvent('status', `${target.name} was afflicted with ${this.ailmentLabel(skill.ailment)}!`, {
        side: targetSide,
        targetSide,
        targetIndex,
        tone: 'negative',
        impact: this.ailmentLabel(skill.ailment).toUpperCase(),
      });
    }

    this.checkFaint(targetSide, otherSide(targetSide), target);
    return affinity === 'weak' || critical ? 'bonus' : 'normal';
  }

  isPhysicalAttack(skill) {
    return this.damageFormulaFor(skill) !== 'magic';
  }

  hitChanceFor(actor, target, skill) {
    const accuracyStage = this.stageMultiplier(actor.stages.agility) / this.stageMultiplier(target.stages.agility);
    let hitChance = clamp(skill.accuracy * accuracyStage, 55, 100);
    if (actor.ailment?.type === 'stun') hitChance *= 0.75;
    if (this.isPhysicalAttack(skill) && ZERO_PHYSICAL_EVASION_AILMENTS.has(target.ailment?.type)) {
      return 100;
    }
    return clamp(hitChance, 0, 100);
  }

  criticalChanceFor(target, skill) {
    if (!this.isPhysicalAttack(skill)) return 0;
    if (ZERO_PHYSICAL_EVASION_AILMENTS.has(target.ailment?.type)) return 100;
    if (target.ailment?.type === 'bind') return 60;
    return skill.crit || 0;
  }

  damageFormulaFor(skill) {
    if (['basic', 'physical', 'weapon', 'magic'].includes(skill.damageFormula)) {
      return skill.damageFormula;
    }
    if (skill.id === 'attack') return 'basic';
    if (ALMIGHTY_PHYSICAL_SKILL_IDS.has(skill.id)) return 'physical';
    if (skill.element === 'physical') return 'physical';
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
    const strength = this.effectiveStat(actor, 'strength') ?? this.effectiveStat(actor, 'attack');

    if (formula === 'basic') {
      return (level + strength) * 2 * 1.33 * 0.8;
    }
    if (formula === 'physical') {
      return ((level + strength) * 2 * skill.power / 23.2) * 0.8;
    }
    if (formula === 'weapon') {
      const vitality = this.effectiveStat(actor, 'vitality') ?? this.effectiveStat(actor, 'defense');
      const maximumHp = side === 'player'
        ? actor.stats.maxHp
        : Math.min((level + vitality) * 6, 999);
      return (maximumHp / 69.6) * skill.power * 0.8;
    }

    const complement = Number.isFinite(skill.complement) ? skill.complement : 0;
    const limit = Number.isFinite(skill.limit) ? skill.limit : Number.POSITIVE_INFINITY;
    const effectiveLimit = Math.min(complement + level * skill.power * 2 / 21, limit);
    const damageLevel = Math.min(level, 160);
    const magic = this.effectiveStat(actor, 'magic');
    return (
      effectiveLimit
      + effectiveLimit / 100 * (magic - (damageLevel / 5 + 4)) * 2.5
    ) * 0.8;
  }

  checkFaint(side, victorSide, combatant = this.active(side)) {
    if (combatant.hp > 0 || combatant.fainted) return;
    combatant.fainted = true;
    combatant.fled = false;
    combatant.ailment = null;
    combatant.hp = 0;
    const targetIndex = this.state.teams[side].indexOf(combatant);
    this.addEvent('faint', `${combatant.name} can no longer battle.`, {
      side, targetSide: side, targetIndex, tone: 'negative', impact: 'DOWN',
    });

    let reserveIndex = this.state.teams[side].findIndex((member) => !member.fainted && !member.fled);
    if (reserveIndex === -1) {
      reserveIndex = this.state.teams[side].findIndex((member) => !member.fainted);
      if (reserveIndex !== -1) {
        const returned = this.state.teams[side][reserveIndex];
        returned.fled = false;
        this.addEvent('summon', `${returned.name} was automatically resummoned because no ally remained on the field.`, {
          side, targetSide: side, targetIndex: reserveIndex, tone: 'system', impact: 'SUMMON',
        });
      }
    }
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
    const fledIndex = this.state.teams.enemy.findIndex((member) => !member.fainted && member.fled);
    if (fledIndex !== -1) return { type: 'summon', index: fledIndex };
    if (this.active('enemy').ailment?.type === 'mute') return { type: 'skill', skillId: 'attack' };

    const action = super.chooseAiAction();
    if (action.type !== 'skill') return action;

    const skill = this.skills[action.skillId];
    if (skill?.implemented === false) return { type: 'skill', skillId: 'attack' };
    if (!skill || skill.target === 'all' || skill.target === 'self') return action;
    const targetSide = this.targetSideForSkill('enemy', skill);
    const candidates = this.state.teams[targetSide]
      .map((member, index) => ({ member, index }))
      .filter(({ member }) => !member.fainted && !member.fled);
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

    this.state.actionSequence += 1;
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
      if (!team[index].fainted && !team[index].fled) {
        this.state.active[side] = index;
        return;
      }
    }
  }

  beginTurn(side) {
    const previousSide = otherSide(side);
    this.clearTemporaryAilmentsAfter(previousSide);
    this.state.pressTurns[previousSide] = { full: 0, half: 0 };
    this.state.pressTurns[side] = { full: this.living(side).length, half: 0 };
    this.state.active[side] = this.state.teams[side].findIndex((member) => !member.fainted && !member.fled);
    this.state.phase = side;

    if (side === 'player') this.state.round += 1;
    const count = this.remainingIcons(side);
    const label = side === 'player' ? `Round ${this.state.round} - your side` : 'The rival side';
    this.addEvent('turn', `${label} begins with ${count} Press Turn ${count === 1 ? 'icon' : 'icons'}.`, {
      side, tone: 'turn',
    });
  }

  clearTemporaryAilmentsAfter(completedSide) {
    ['player', 'enemy'].forEach((ownerSide) => {
      this.state.teams[ownerSide].forEach((member, targetIndex) => {
        if (!TEMPORARY_AILMENTS.has(member.ailment?.type)) return;
        const expiresAfterSide = member.ailment.expiresAfterSide ?? otherSide(ownerSide);
        if (expiresAfterSide !== completedSide) return;
        const label = this.ailmentLabel(member.ailment.type);
        member.ailment = null;
        this.addEvent('status', `${member.name} recovered from ${label} at the end of the opposing turn.`, {
          side: ownerSide,
          targetSide: ownerSide,
          targetIndex,
          tone: 'positive',
          impact: 'RECOVER',
        });
      });
    });
  }

  ailmentLabel(type) {
    return type ? `${type.charAt(0).toUpperCase()}${type.slice(1)}` : 'Ailment';
  }
}
