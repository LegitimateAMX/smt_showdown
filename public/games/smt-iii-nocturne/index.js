import { defineGame } from '../../framework/game-definition.js';
import { PROTOTYPE_GAME } from '../prototype-00/index.js';
import { NOCTURNE_DEMONS } from './data/demons.js';
import {
  NOCTURNE_DEFAULT_PLAYER_TEAM,
  NOCTURNE_OPPONENT_PRESETS,
  NOCTURNE_PLAYER_ROSTER,
} from './data/teams.js';
import { NocturneRuleset } from './ruleset.js';

function validateNocturneData(definition) {
  const issues = [];
  const cappedStats = ['strength', 'magic', 'vitality', 'agility', 'luck'];

  if (definition.config.maxSkills !== 8) {
    issues.push('Nocturne demons must have exactly eight usable skill slots.');
  }

  Object.values(definition.data.demons).forEach((demon) => {
    if (!demon.id || !demon.name || !demon.race) {
      issues.push('Every Nocturne demon requires an id, name, and race.');
    }
    if (!Number.isInteger(demon.baseLevel) || demon.baseLevel < 1 || demon.baseLevel > definition.config.maxLevel) {
      issues.push(`Demon "${demon.id}" requires a baseLevel from 1 to ${definition.config.maxLevel}.`);
    }
    if (!demon.glyph || !Array.isArray(demon.palette) || demon.palette.length < 2) {
      issues.push(`Demon "${demon.id}" requires a glyph and a two-color palette.`);
    }
    ['hp', 'mp'].forEach((stat) => {
      if (!Number.isInteger(demon.baseStats?.[stat]) || demon.baseStats[stat] < 0) {
        issues.push(`Demon "${demon.id}" requires a non-negative integer base ${stat.toUpperCase()} value.`);
      }
    });
    cappedStats.forEach((stat) => {
      const value = demon.baseStats?.[stat];
      if (!Number.isInteger(value) || value < 0 || value > definition.config.statCap) {
        issues.push(`Demon "${demon.id}" requires base ${stat} from 0 to ${definition.config.statCap}.`);
      }
    });
    if (!Array.isArray(demon.innateSkills)) {
      issues.push(`Demon "${demon.id}" requires an innateSkills array.`);
    }
    if (!Array.isArray(demon.futureSkills)) {
      issues.push(`Demon "${demon.id}" requires a futureSkills array.`);
    } else {
      demon.futureSkills.forEach((entry) => {
        if (!Number.isInteger(entry?.level)
          || entry.level <= demon.baseLevel
          || entry.level > definition.config.maxLevel) {
          issues.push(`Demon "${demon.id}" has a future skill outside levels ${demon.baseLevel + 1}-${definition.config.maxLevel}.`);
        }
      });
    }
    Object.entries(demon.affinities || {}).forEach(([element, affinity]) => {
      if (!definition.elements[element]) issues.push(`Demon "${demon.id}" has unknown affinity element "${element}".`);
      if (!definition.affinities[affinity]) issues.push(`Demon "${demon.id}" has unknown affinity result "${affinity}".`);
    });
  });

  if (definition.data.defaultPlayerTeam.length !== definition.config.maxTeamSize) {
    issues.push('Default player team must match maxTeamSize.');
  }

  Object.values(definition.data.skills).forEach((skill) => {
    if (skill.target !== 'random') return;
    const min = Number.isInteger(skill.hits) ? skill.hits : skill.hits?.min;
    const max = Number.isInteger(skill.hits) ? skill.hits : skill.hits?.max;
    const maxPerTarget = Number.isInteger(skill.hits) ? undefined : skill.hits?.maxPerTarget;
    if (!Number.isInteger(min) || min < 1) {
      issues.push(`Random-target skill "${skill.id}" requires hits.min to be a positive integer.`);
    }
    if (!Number.isInteger(max) || max < min) {
      issues.push(`Random-target skill "${skill.id}" requires hits.max to be an integer at least as large as hits.min.`);
    }
    if (maxPerTarget !== undefined && (!Number.isInteger(maxPerTarget) || maxPerTarget < 1)) {
      issues.push(`Random-target skill "${skill.id}" requires hits.maxPerTarget to be a positive integer when provided.`);
    }
  });

  return issues;
}

/**
 * Initial profile shell for Shin Megami Tensei III: Nocturne.
 *
 * The Press Turn action economy and damage formulas are title-specific. Catalog
 * data continues to use prototype placeholders until Nocturne values are supplied.
 */
export const SMT_III_NOCTURNE_GAME = defineGame({
  ...PROTOTYPE_GAME,
  id: 'smt-iii-nocturne',
  name: 'Shin Megami Tensei III: Nocturne',
  shortName: 'Nocturne',
  family: 'Press Turn System',
  description: 'Nocturne Press Turn battles with title-specific damage formulas and temporary prototype combatants and skills.',
  dataVersion: 0,
  config: {
    ...PROTOTYPE_GAME.config,
    maxTeamSize: 4,
    maxLevel: 255,
    statCap: 40,
    maxSkills: 8,
  },
  data: {
    demons: NOCTURNE_DEMONS,
    skills: PROTOTYPE_GAME.data.skills,
    playerRoster: NOCTURNE_PLAYER_ROSTER,
    defaultPlayerTeam: NOCTURNE_DEFAULT_PLAYER_TEAM,
    opponentPresets: NOCTURNE_OPPONENT_PRESETS,
  },
  Ruleset: NocturneRuleset,
  validateData: validateNocturneData,
  presentation: {
    ...PROTOTYPE_GAME.presentation,
    fieldProtocol: 'Exploit weaknesses and land critical hits to conserve Press Turn icons.',
    allowPass: true,
    allowGuard: false,
    manualTargeting: true,
    commandTabs: ['skills', 'inspect'],
    partyMode: 'turn-order',
    levelSelection: true,
    skillSelection: true,
    analysisStats: ['strength', 'magic', 'vitality', 'agility', 'luck'],
    compendiumStats: [
      { key: 'strength', label: 'STR', cap: 40 },
      { key: 'magic', label: 'MAG', cap: 40 },
      { key: 'vitality', label: 'VIT', cap: 40 },
      { key: 'agility', label: 'AGI', cap: 40 },
      { key: 'luck', label: 'LUC', cap: 40 },
    ],
    setupInstructions: 'Choose four temporary combatants, set their levels, and configure up to eight skills apiece. Attack and Pass are always available outside those slots.',
    rules: [
      {
        title: 'Build your turn pool',
        body: 'All living party members remain active on the field. Each supplies one full Press Turn icon when your side begins its turn.',
      },
      {
        title: 'Press the advantage',
        body: 'Weakness and critical hits change a full icon into a half icon while any full icons remain. Passing spends an existing half icon first, or changes a full icon when no half icon is available.',
      },
      {
        title: 'Avoid wasted actions',
        body: 'A miss or nullification consumes two icons, spending half icons first. Repelled or drained attacks end the side turn immediately.',
      },
      {
        title: 'Follow the action order',
        body: 'After acting or passing, control moves to the next living party member. Single-target skills let you choose any valid combatant without changing that order.',
      },
      {
        title: 'Resolve multi-hit spells',
        body: 'Random-target spells roll their hit count once, distribute those hits across living enemies, and combine every hit into one Press Turn outcome.',
      },
    ],
  },
});

export { NOCTURNE_DEMONS };
