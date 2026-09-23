import { defineGame } from '../../framework/game-definition.js';
import { AFFINITIES, ELEMENTS } from './data/combat-types.js';
import { DEMONS } from './data/demons.js';
import { SKILLS } from './data/skills.js';
import { DEFAULT_PLAYER_TEAM, OPPONENT_PRESETS, PLAYER_ROSTER } from './data/teams.js';
import { PrototypeRuleset } from './ruleset.js';

export const PROTOTYPE_CONFIG = {
  maxTeamSize: 3,
  maxBonusActions: 1,
  weaknessDamage: 1.5,
  resistanceDamage: 0.55,
  criticalDamage: 1.45,
  guardDamage: 0.5,
  poisonPercent: 0.08,
  stageMultipliers: [0.58, 0.72, 0.85, 1, 1.18, 1.38, 1.62],
};

function validatePrototypeData(definition) {
  const issues = [];
  const requiredStats = ['maxHp', 'maxMp', 'attack', 'magic', 'defense', 'agility', 'luck'];

  Object.values(definition.data.demons).forEach((demon) => {
    requiredStats.forEach((stat) => {
      if (!Number.isFinite(demon.stats?.[stat]) || demon.stats[stat] < 0) {
        issues.push(`Demon "${demon.id}" requires a non-negative numeric ${stat} stat.`);
      }
    });
    Object.entries(demon.affinities || {}).forEach(([element, affinity]) => {
      if (!definition.elements[element]) issues.push(`Demon "${demon.id}" has unknown affinity element "${element}".`);
      if (!definition.affinities[affinity]) issues.push(`Demon "${demon.id}" has unknown affinity result "${affinity}".`);
    });
  });

  if (definition.data.defaultPlayerTeam.length !== definition.config.maxTeamSize) {
    issues.push('Default player team must match maxTeamSize.');
  }
  definition.data.opponentPresets.forEach((preset) => {
    if (preset.team.length !== definition.config.maxTeamSize) {
      issues.push(`Opponent "${preset.id}" must contain ${definition.config.maxTeamSize} demons.`);
    }
  });
  return issues;
}

export const PROTOTYPE_GAME = defineGame({
  id: 'prototype-00',
  name: 'Prototype 00',
  shortName: 'Prototype',
  family: 'Original test rules',
  description: 'A compact active-stock ruleset used to develop and verify the simulator framework.',
  dataVersion: 1,
  Ruleset: PrototypeRuleset,
  elements: ELEMENTS,
  affinities: AFFINITIES,
  config: PROTOTYPE_CONFIG,
  data: {
    demons: DEMONS,
    skills: SKILLS,
    playerRoster: PLAYER_ROSTER,
    defaultPlayerTeam: DEFAULT_PLAYER_TEAM,
    opponentPresets: OPPONENT_PRESETS,
  },
  presentation: {
    adapter: 'active-stock-v1',
    fieldProtocol: 'Exploit affinities to earn one bonus action.',
    excludedAnalysisElements: ['support', 'recovery'],
    rules: [
      {
        title: 'Take the initiative',
        body: 'Your side opens each exchange. Choose a skill, switch your active demon, or guard; the rival responds after your action chain ends.',
      },
      {
        title: 'Read affinities',
        body: 'Weakness hits deal extra damage and grant one immediate bonus action. Resist, Null, Repel, and Drain alter the result.',
      },
      {
        title: 'Control momentum',
        body: 'A side may earn at most one bonus action per exchange. A nullified, repelled, or missed attack ends that side’s momentum.',
      },
      {
        title: 'Keep your stock alive',
        body: 'Switching uses the action. If an active demon falls, the next healthy ally is summoned automatically. Defeat the full rival stock.',
      },
    ],
  },
  validateData: validatePrototypeData,
});

export { AFFINITIES, DEMONS, ELEMENTS, OPPONENT_PRESETS, PLAYER_ROSTER, SKILLS };
