import { defineGame } from '../../framework/game-definition.js';
import { PROTOTYPE_GAME } from '../prototype-00/index.js';
import { NocturneRuleset } from './ruleset.js';

function validateNocturneData(definition) {
  const issues = PROTOTYPE_GAME.validateData(definition);

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
 * The Press Turn action economy is title-specific. Combat formulas and catalog
 * data continue to use the prototype placeholders until their Nocturne values
 * are supplied.
 */
export const SMT_III_NOCTURNE_GAME = defineGame({
  ...PROTOTYPE_GAME,
  id: 'smt-iii-nocturne',
  name: 'Shin Megami Tensei III: Nocturne',
  shortName: 'Nocturne',
  family: 'Press Turn System',
  description: 'Nocturne Press Turn battles with temporary prototype combatants, skills, and formulas.',
  dataVersion: 0,
  Ruleset: NocturneRuleset,
  validateData: validateNocturneData,
  presentation: {
    ...PROTOTYPE_GAME.presentation,
    fieldProtocol: 'Exploit weaknesses and land critical hits to conserve Press Turn icons.',
    allowPass: true,
    manualTargeting: true,
    commandTabs: ['skills', 'inspect'],
    partyMode: 'turn-order',
    setupInstructions: 'Choose three temporary combatants. All enter the field, and their lineup order determines their action sequence.',
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
