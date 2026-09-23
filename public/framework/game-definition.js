/**
 * The stable contract between game content, mechanics, and the simulator shell.
 * A game profile is immutable after registration so battles cannot accidentally
 * modify source data shared by later matches.
 */

export class GameDataError extends Error {
  constructor(gameId, issues) {
    super(`Game profile "${gameId}" is invalid:\n- ${issues.join('\n- ')}`);
    this.name = 'GameDataError';
    this.gameId = gameId;
    this.issues = issues;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((entry) => deepFreeze(entry, seen));
  return Object.freeze(value);
}

function validateReferences(definition, issues) {
  const { demons, skills, playerRoster, defaultPlayerTeam, opponentPresets } = definition.data;

  Object.entries(demons).forEach(([key, demon]) => {
    if (demon.id !== key) issues.push(`Demon key "${key}" does not match its id "${demon.id}".`);
    if (!Array.isArray(demon.skills)) issues.push(`Demon "${key}" must have a skills array.`);
    else demon.skills.forEach((skillId) => {
      if (!skills[skillId]) issues.push(`Demon "${key}" references missing skill "${skillId}".`);
    });
  });

  Object.entries(skills).forEach(([key, skill]) => {
    if (skill.id !== key) issues.push(`Skill key "${key}" does not match its id "${skill.id}".`);
    if (!definition.elements[skill.element]) {
      issues.push(`Skill "${key}" references missing element "${skill.element}".`);
    }
  });

  playerRoster.forEach((demonId) => {
    if (!demons[demonId]) issues.push(`Player roster references missing demon "${demonId}".`);
  });
  defaultPlayerTeam.forEach((demonId) => {
    if (!demons[demonId]) issues.push(`Default team references missing demon "${demonId}".`);
  });
  opponentPresets.forEach((preset) => {
    if (!preset.id || !preset.name || !Array.isArray(preset.team)) {
      issues.push('Every opponent preset requires an id, name, and team array.');
      return;
    }
    preset.team.forEach((demonId) => {
      if (!demons[demonId]) issues.push(`Opponent "${preset.id}" references missing demon "${demonId}".`);
    });
  });
}

/**
 * Validate and freeze a profile. Game-specific validators may enforce whatever
 * additional stat/resource schema that title needs.
 */
export function defineGame(definition) {
  const issues = [];
  const id = definition?.id || 'unknown';

  if (!isRecord(definition)) throw new GameDataError(id, ['Definition must be an object.']);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) issues.push('id must use lowercase letters, numbers, and hyphens.');
  if (!definition.name) issues.push('name is required.');
  if (!definition.description) issues.push('description is required.');
  if (typeof definition.Ruleset !== 'function') issues.push('Ruleset must be a constructor.');
  if (!isRecord(definition.elements) || !Object.keys(definition.elements).length) issues.push('elements must be a non-empty object.');
  if (!isRecord(definition.affinities) || !Object.keys(definition.affinities).length) issues.push('affinities must be a non-empty object.');
  if (!isRecord(definition.config)) issues.push('config is required.');
  if (!isRecord(definition.data)) issues.push('data is required.');

  if (isRecord(definition.data)) {
    const requiredCollections = ['demons', 'skills'];
    const requiredLists = ['playerRoster', 'defaultPlayerTeam', 'opponentPresets'];
    requiredCollections.forEach((key) => {
      if (!isRecord(definition.data[key])) issues.push(`data.${key} must be an object.`);
    });
    requiredLists.forEach((key) => {
      if (!Array.isArray(definition.data[key])) issues.push(`data.${key} must be an array.`);
    });

    if (requiredCollections.every((key) => isRecord(definition.data[key]))
      && requiredLists.every((key) => Array.isArray(definition.data[key]))) {
      validateReferences(definition, issues);
    }
  }

  if (typeof definition.validateData === 'function') {
    const gameIssues = definition.validateData(definition) || [];
    issues.push(...gameIssues);
  }

  if (issues.length) throw new GameDataError(id, issues);
  return deepFreeze(definition);
}
