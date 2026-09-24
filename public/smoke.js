import { BattleEngine } from './framework/battle-engine.js';
import { defineGame, GameDataError } from './framework/game-definition.js';
import { DEFAULT_GAME_ID, getGame, listGames } from './games/registry.js';

const checks = document.querySelector('#checks');
const result = document.querySelector('#result');
const GAME = getGame(DEFAULT_GAME_ID);
const NOCTURNE_GAME = getGame('smt-iii-nocturne');
let passed = 0;
let failed = 0;

function test(name, callback) {
  const row = document.createElement('li');
  try {
    callback();
    row.className = 'pass';
    row.textContent = `PASS  ${name}`;
    passed += 1;
  } catch (error) {
    row.className = 'fail';
    row.textContent = `FAIL  ${name}: ${error.message}`;
    failed += 1;
  }
  checks.append(row);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNear(actual, expected, message) {
  if (Math.abs(actual - expected) > 0.000001) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

const makeBattle = (options = {}) => new BattleEngine({
  game: GAME,
  playerTeam: options.playerTeam || ['pixie', 'jackFrost', 'oni'],
  enemyTeam: options.enemyTeam || ['nekomata', 'huaPo', 'angel'],
  opponentName: 'Test process',
  seed: options.seed || 'smoke-001',
});

const makeNocturneBattle = (options = {}) => new BattleEngine({
  game: options.game || NOCTURNE_GAME,
  playerTeam: options.playerTeam || ['pixie', 'jackFrost', 'oni'],
  enemyTeam: options.enemyTeam || ['nekomata', 'huaPo', 'angel'],
  opponentName: 'Press Turn test process',
  seed: options.seed || 'press-turn-001',
});

test('registry exposes a validated immutable game profile', () => {
  assert(listGames().some((game) => game.id === DEFAULT_GAME_ID), 'default game should be registered');
  assert(Object.isFrozen(GAME), 'game definition should be immutable');
  assert(Object.isFrozen(GAME.data.demons.pixie.stats), 'nested demon stats should be immutable');
});

test('registry exposes the Nocturne profile shell', () => {
  const nocturne = getGame('smt-iii-nocturne');
  assert(nocturne.name === 'Shin Megami Tensei III: Nocturne', 'Nocturne should use its full title');
  assert(nocturne.dataVersion === 0, 'Nocturne should remain marked as placeholder data');
  assert(nocturne.config.maxTeamSize === 4, 'Nocturne should allow four player units');
  assert(nocturne.data.defaultPlayerTeam.length === 4, 'Nocturne should start with a four-unit player lineup');
  assert(Object.isFrozen(nocturne), 'Nocturne game definition should be immutable');
});

test('Nocturne exposes its title-specific incoming skill types', () => {
  const expected = [
    'physical', 'fire', 'ice', 'electricity', 'force', 'expel',
    'death', 'curse', 'nerve', 'mind', 'almighty',
  ];
  assert(
    JSON.stringify(NOCTURNE_GAME.presentation.incomingTypes) === JSON.stringify(expected),
    'Nocturne incoming types should match the title taxonomy in display order',
  );
  assert(expected.every((type) => NOCTURNE_GAME.elements[type]), 'every incoming type should have presentation metadata');
  assert(!['gun', 'electric', 'light', 'dark'].some((type) => NOCTURNE_GAME.elements[type]), 'Prototype type aliases should not leak into Nocturne');
  assert(NOCTURNE_GAME.data.skills.zio.element === 'electricity', 'Zio should use Electricity');
  assert(NOCTURNE_GAME.data.skills.hama.element === 'expel', 'Hama should use Expel');
  assert(NOCTURNE_GAME.data.skills.mudo.element === 'death', 'Mudo should use Death');
  assert(NOCTURNE_GAME.data.skills.dormina.element === 'mind', 'Dormina should use Mind');
  Object.values(NOCTURNE_GAME.data.demons).forEach((demon) => {
    assert(expected.every((type) => demon.affinities[type]), `${demon.id} should define every Nocturne affinity type`);
  });
  assert(GAME.elements.gun && GAME.elements.electric && GAME.elements.light && GAME.elements.dark, 'Prototype 00 types should remain unchanged');
});

test('Nocturne starts with one full Press Turn icon per living ally', () => {
  const battle = makeNocturneBattle();
  assert(battle.state.pressTurns.player.full === 3, 'player should begin with three full icons');
  assert(battle.state.pressTurns.player.half === 0, 'player should begin without half icons');
  assert(NOCTURNE_GAME.presentation.partyMode === 'turn-order', 'Nocturne should render the full party field');
  assert(NOCTURNE_GAME.presentation.manualTargeting, 'Nocturne should require manual single-target selection');
});

test('Nocturne selects and calculates all four damage formula classes', () => {
  const battle = makeNocturneBattle();
  const actor = battle.state.teams.player[0];
  const basic = NOCTURNE_GAME.data.skills.attack;
  const physical = NOCTURNE_GAME.data.skills.lunge;
  const weapon = { id: 'testWeapon', power: 69.6, damageFormula: 'weapon' };
  const magic = { id: 'testMagic', power: 21, complement: 10, limit: 80, damageFormula: 'magic' };

  assert(battle.rules.damageFormulaFor(basic) === 'basic', 'Attack should use the basic formula');
  assert(battle.rules.damageFormulaFor(physical) === 'physical', 'Physical skills should use the physical formula');
  assertNear(battle.rules.baseDamageFor('player', actor, basic), (7 + 16) * 2 * 1.33 * 0.8, 'basic damage');
  assertNear(battle.rules.baseDamageFor('player', actor, physical), ((7 + 16) * 2 * 58 / 23.2) * 0.8, 'physical damage');
  assertNear(battle.rules.baseDamageFor('player', actor, weapon), 126 * 0.8, 'party weapon damage');
  assertNear(battle.rules.baseDamageFor('enemy', actor, weapon), (7 + 17) * 6 * 0.8, 'enemy weapon damage');

  const effectiveLimit = 10 + 7 * 21 * 2 / 21;
  const expectedMagic = (
    effectiveLimit
    + effectiveLimit / 100 * (27 - (7 / 5 + 4)) * 2.5
  ) * 0.8;
  assertNear(battle.rules.baseDamageFor('player', actor, magic), expectedMagic, 'magic damage');
  assertNear(
    battle.rules.baseDamageFor('player', actor, { ...magic, limit: 20 }),
    (20 + 20 / 100 * (27 - (7 / 5 + 4)) * 2.5) * 0.8,
    'magic damage should respect its skill limit',
  );

  const highLevelActor = { ...actor, level: 200, stats: { ...actor.stats, magic: 80 } };
  assertNear(
    battle.rules.baseDamageFor('player', highLevelActor, { ...magic, limit: 100 }),
    (100 + 100 / 100 * (80 - (160 / 5 + 4)) * 2.5) * 0.8,
    'magic damage should treat levels above 160 as level 160',
  );

  battle.random = () => 0;
  assertNear(battle.rules.damageVarianceFor('physical'), 0.95, 'physical minimum variance');
  assertNear(battle.rules.damageVarianceFor('magic'), 0.9, 'magic minimum variance');
  battle.random = () => 1;
  assertNear(battle.rules.damageVarianceFor('physical'), 1.05, 'physical maximum variance');
  assertNear(battle.rules.damageVarianceFor('magic'), 1.1, 'magic maximum variance');
});

test('Nocturne compendium records use the level-ready demon schema', () => {
  assert(NOCTURNE_GAME.config.maxSkills === 8, 'Nocturne should expose eight usable skill slots');
  const cappedStats = ['strength', 'magic', 'vitality', 'agility', 'luck'];
  Object.entries(NOCTURNE_GAME.data.demons).forEach(([id, demon]) => {
    assert(demon.id === id, `${id} should expose its registry id`);
    assert(Boolean(demon.name && demon.race && demon.glyph), `${id} should expose identity fields`);
    assert(Number.isInteger(demon.baseLevel), `${id} should expose a base level`);
    assert(Array.isArray(demon.palette) && demon.palette.length >= 2, `${id} should expose a palette`);
    assert(Number.isInteger(demon.baseStats.hp) && Number.isInteger(demon.baseStats.mp), `${id} should expose base HP and MP`);
    cappedStats.forEach((stat) => {
      assert(demon.baseStats[stat] <= 40, `${id} ${stat} should not exceed 40`);
    });
    assert(demon.affinities && typeof demon.affinities === 'object', `${id} should expose affinities`);
    assert(Array.isArray(demon.innateSkills), `${id} should expose innate skills`);
    assert(Array.isArray(demon.futureSkills), `${id} should expose future skills`);
    assert(!('stats' in demon) && !('skills' in demon) && !('level' in demon), `${id} should not use the prototype demon schema`);
  });
});

test("Nocturne compendium includes Will O' Wisp's supplied data", () => {
  const demon = NOCTURNE_GAME.data.demons.willOWisp;
  assert(demon.name === "Will O' Wisp" && demon.race === 'Foul', "Will O' Wisp should be a Foul demon");
  assert(demon.baseLevel === 1, "Will O' Wisp should begin at level 1");
  assert(
    JSON.stringify(demon.baseStats) === JSON.stringify({
      hp: 30, mp: 18, strength: 4, magic: 5, vitality: 4, agility: 5, luck: 3,
    }),
    "Will O' Wisp should use the supplied base stats",
  );
  assert(demon.affinities.physical === 'resist', "Will O' Wisp should resist Physical");
  assert(demon.affinities.death === 'null', "Will O' Wisp should Void Death");
  assert(['fire', 'ice', 'electricity', 'force', 'expel'].every(
    (type) => demon.affinities[type] === 'weak',
  ), "Will O' Wisp should be weak to elemental Magic and Expel");
  assert(demon.innateSkills.length === 1 && demon.innateSkills[0] === 'needleRush', 'Needle Rush should be innate');
  assert(
    JSON.stringify(demon.futureSkills) === JSON.stringify([
      { skillId: 'zan', level: 2 },
      { skillId: 'riberama', level: 3 },
      { skillId: 'deathtouch', level: 4 },
      { skillId: 'lastResort', level: 5 },
      { skillId: 'makakaja', level: 6 },
    ]),
    "Will O' Wisp should learn the supplied future skills at levels 2-6",
  );
});

test("Nocturne compendium includes Slime's supplied data", () => {
  const demon = NOCTURNE_GAME.data.demons.slime;
  assert(demon.name === 'Slime' && demon.race === 'Foul', 'Slime should be a Foul demon');
  assert(demon.baseLevel === 6, 'Slime should begin at level 6');
  assert(
    JSON.stringify(demon.baseStats) === JSON.stringify({
      hp: 54, mp: 33, strength: 6, magic: 5, vitality: 3, agility: 5, luck: 7,
    }),
    'Slime should use the supplied base stats',
  );
  assert(demon.affinities.physical === 'resist', 'Slime should resist Physical');
  assert(demon.affinities.death === 'null', 'Slime should Void Death');
  assert(demon.affinities.fire === 'weak' && demon.affinities.expel === 'weak', 'Slime should be weak to Fire and Expel');
  assert(
    JSON.stringify(demon.innateSkills) === JSON.stringify(['deathtouch', 'feralBite']),
    'Death Touch and Feral Bite should be innate',
  );
  assert(
    JSON.stringify(demon.futureSkills) === JSON.stringify([
      { skillId: 'sukunda', level: 7 },
      { skillId: 'lastResort', level: 8 },
      { skillId: 'warCry', level: 9 },
      { skillId: 'sonicWave', level: 10 },
    ]),
    'Slime should learn the supplied future skills at levels 7-10',
  );
});

test('Nocturne compendium includes the supplied Foul demon group', () => {
  const expected = {
    mouRyo: {
      name: 'Mou-Ryo', level: 7,
      stats: { hp: 66, mp: 42, strength: 6, magic: 7, vitality: 4, agility: 5, luck: 5 },
      affinities: { death: 'null', expel: 'weak' },
      innate: ['pulinpa', 'toxicSting'],
      future: [['zan', 8], ['deathtouch', 9], ['manaAid', 10], ['mazan', 11]],
    },
    blob: {
      name: 'Blob', level: 16,
      stats: { hp: 156, mp: 66, strength: 8, magic: 6, vitality: 10, agility: 5, luck: 7 },
      affinities: { death: 'null', physical: 'resist', ice: 'weak', expel: 'weak' },
      innate: ['tarunda', 'lastResort'],
      future: [['toxicSting', 17], ['marinKarin', 18], ['manaDrain', 19], ['zanma', 20]],
    },
    blackOoze: {
      name: 'Black Ooze', level: 28,
      stats: { hp: 264, mp: 111, strength: 11, magic: 9, vitality: 16, agility: 6, luck: 6 },
      affinities: { death: 'null', physical: 'resist', electricity: 'weak', expel: 'weak' },
      innate: ['muteGaze', 'charmBite'],
      future: [['lastResort', 29], ['deathtouch', 30], ['manaDrain', 31], ['panicVoice', 32], ['antiExpel', 33]],
    },
    phantom: {
      name: 'Phantom', level: 42,
      stats: { hp: 336, mp: 177, strength: 9, magic: 17, vitality: 14, agility: 15, luck: 7 },
      affinities: { death: 'null', physical: 'resist', force: 'weak', expel: 'weak' },
      innate: ['manaDrain', 'lastResort'],
      future: [['mazionga', 43], ['kamikaze', 44], ['tarunda', 45], ['dekaja', 46], ['ziodyne', 47]],
    },
    sakahagi: {
      name: 'Sakahagi', level: 45,
      stats: { hp: 360, mp: 186, strength: 17, magic: 17, vitality: 15, agility: 15, luck: 11 },
      affinities: { expel: 'null', death: 'null', curse: 'null', nerve: 'null', mind: 'null' },
      innate: ['maragion', 'mabufula', 'mazionga', 'mazanma', 'panicVoice', 'warCry'],
      future: [['voidForce', 46], ['voidElec', 47]],
    },
    shadow: {
      name: 'Shadow', level: 52,
      stats: { hp: 420, mp: 216, strength: 10, magic: 20, vitality: 18, agility: 16, luck: 8 },
      affinities: { death: 'null', physical: 'resist', force: 'weak', expel: 'weak' },
      innate: ['antiPhys', 'mudoon'],
      future: [['mazionga', 53], ['manaDrain', 54], ['makakaja', 55], ['tarukaja', 56], ['rakukaja', 57], ['sukukaja', 58]],
    },
  };

  Object.entries(expected).forEach(([id, entry]) => {
    const demon = NOCTURNE_GAME.data.demons[id];
    assert(demon.name === entry.name && demon.race === 'Foul', `${entry.name} should be registered as Foul`);
    assert(demon.baseLevel === entry.level, `${entry.name} should use the supplied base level`);
    assert(JSON.stringify(demon.baseStats) === JSON.stringify(entry.stats), `${entry.name} should use the supplied base stats`);
    Object.entries(entry.affinities).forEach(([type, affinity]) => {
      assert(demon.affinities[type] === affinity, `${entry.name} should have the supplied ${type} affinity`);
    });
    assert(JSON.stringify(demon.innateSkills) === JSON.stringify(entry.innate), `${entry.name} should use the supplied innate skills`);
    assert(
      JSON.stringify(demon.futureSkills.map(({ skillId, level }) => [skillId, level])) === JSON.stringify(entry.future),
      `${entry.name} should use the supplied future skill levels`,
    );
  });
});

test('new Nocturne Foul demons are available in player lineups', () => {
  const selectable = [
    'willOWisp', 'slime', 'mouRyo', 'blob',
    'blackOoze', 'phantom', 'sakahagi', 'shadow',
  ];
  assert(selectable.every((id) => NOCTURNE_GAME.data.playerRoster.includes(id)), 'every supplied Foul demon should appear in the player roster');

  for (let start = 0; start < selectable.length; start += 4) {
    const ids = selectable.slice(start, start + 4);
    const battle = makeNocturneBattle({ playerTeam: ids });
    assert(
      battle.state.teams.player.map((demon) => demon.id).join(',') === ids.join(','),
      'selectable Foul demons should construct valid player combatants',
    );
  }
});

test('Nocturne includes the supplied Haunt and Raptor demons as selectable combatants', () => {
  const expected = [
    {
      id: 'preta', name: 'Preta', race: 'Haunt', level: 4,
      stats: [54, 24, 5, 4, 5, 6, 4],
      affinities: { fire: 'weak', ice: 'weak', electricity: 'weak', force: 'weak', death: 'null' },
      innate: ['feralClaw', 'sukukaja'],
      future: [['agi', 5], ['deathtouch', 6], ['venomClaw', 7], ['fogBreath', 8]],
    },
    {
      id: 'choronzon', name: 'Choronzon', race: 'Haunt', level: 11,
      stats: [156, 45, 9, 4, 15, 1, 2],
      affinities: { fire: 'drain', death: 'null', physical: 'resist', force: 'weak', expel: 'weak' },
      innate: ['agi', 'sukunda'],
      future: [['fireBreath', 12], ['berserk', 13], ['trafuri', 14], ['stoneGaze', 15]],
    },
    {
      id: 'yaka', name: 'Yaka', race: 'Haunt', level: 17,
      stats: [150, 81, 8, 10, 8, 5, 6],
      affinities: { death: 'null', ice: 'weak', expel: 'weak' },
      innate: ['deathtouch', 'tarunda'],
      future: [['mazio', 18], ['taunt', 19], ['dia', 20], ['venomClaw', 21], ['diarama', 22]],
    },
    {
      id: 'chatterskull', name: 'Chatterskull', race: 'Haunt', level: 20,
      stats: [156, 96, 7, 12, 6, 7, 8],
      affinities: { fire: 'drain', death: 'null', expel: 'weak', curse: 'weak' },
      innate: ['sukunda', 'stunGaze'],
      future: [['dekaja', 21], ['dormina', 22], ['lastResort', 23], ['hellThrust', 24]],
    },
    {
      id: 'pisaca', name: 'Pisaca', race: 'Haunt', level: 28,
      stats: [270, 114, 8, 10, 17, 7, 6],
      affinities: { death: 'null', curse: 'null', mind: 'null', fire: 'weak' },
      innate: ['venomBite', 'sukunda'],
      future: [['stunGaze', 29], ['lifeDrain', 30], ['sonicWave', 31], ['dekunda', 32], ['mazionga', 33]],
    },
    {
      id: 'legion', name: 'Legion', race: 'Haunt', level: 49,
      stats: [420, 180, 19, 11, 21, 9, 9],
      affinities: { death: 'repel', electricity: 'weak', expel: 'weak' },
      innate: ['tetrakarn', 'deathtouch'],
      future: [['antiPhys', 50], ['tempest', 51], ['hellGaze', 52], ['pulinpa', 53], ['mamudoon', 54]],
    },
    {
      id: 'vetala', name: 'Vetala', race: 'Haunt', level: 63,
      stats: [474, 249, 22, 20, 16, 11, 14],
      affinities: { death: 'repel', electricity: 'weak', expel: 'weak' },
      innate: ['stunClaw', 'sacrifice'],
      future: [['lifeDrain', 64], ['rakunda', 65], ['retaliate', 66], ['megido', 67], ['berserk', 68]],
    },
    {
      id: 'gurulu', name: 'Gurulu', race: 'Raptor', level: 63,
      stats: [492, 255, 18, 22, 19, 24, 12],
      affinities: { death: 'repel', mind: 'null', nerve: 'null', expel: 'weak' },
      innate: ['zandyne', 'fogBreath', 'mazandyne'],
      future: [['mamudoon', 64], ['flatter', 65], ['windCutter', 66], ['boltStorm', 67], ['avenge', 68]],
    },
  ];
  const statKeys = ['hp', 'mp', 'strength', 'magic', 'vitality', 'agility', 'luck'];

  expected.forEach((entry) => {
    const demon = NOCTURNE_GAME.data.demons[entry.id];
    assert(demon.name === entry.name && demon.race === entry.race, `${entry.name} should have the supplied identity`);
    assert(demon.baseLevel === entry.level, `${entry.name} should have the supplied base level`);
    assert(statKeys.every((key, index) => demon.baseStats[key] === entry.stats[index]), `${entry.name} should have the supplied base stats`);
    assert(Object.entries(entry.affinities).every(([type, value]) => demon.affinities[type] === value), `${entry.name} should have the supplied affinities`);
    assert(JSON.stringify(demon.innateSkills) === JSON.stringify(entry.innate), `${entry.name} should have the supplied innate skills`);
    assert(
      JSON.stringify(demon.futureSkills.map(({ skillId, level }) => [skillId, level])) === JSON.stringify(entry.future),
      `${entry.name} should have the supplied future skill levels`,
    );
    assert(NOCTURNE_GAME.data.playerRoster.includes(entry.id), `${entry.name} should be selectable by the player`);
  });
});

test('Nocturne includes the supplied Tyrant, Vile, and Wilder demons as selectable combatants', () => {
  const expected = [
    ['loki', 'Loki', 'Tyrant', 52, [432, 216, 16, 20, 20, 12, 16],
      { physical: 'resist', fire: 'resist', ice: 'resist', electricity: 'resist', force: 'resist', curse: 'resist', nerve: 'resist', mind: 'resist' },
      ['mabufudyne', 'makajamaon'], [['mischief', 53], ['charisma', 54], ['trafuri', 55], ['mudoon', 56], ['manaGain', 57]]],
    ['abaddon', 'Abaddon', 'Tyrant', 69, [564, 279, 26, 24, 25, 13, 15],
      { fire: 'resist', ice: 'resist', electricity: 'resist', force: 'resist', expel: 'null', death: 'repel' },
      ['attackAll', 'panicVoice'], [['mabufudyne', 70], ['intimidate', 71], ['retaliate', 72], ['iceRepel', 73], ['hadesBlast', 74]]],
    ['surt', 'Surt', 'Tyrant', 74, [588, 282, 28, 20, 24, 15, 19],
      { fire: 'drain', ice: 'weak', death: 'null', nerve: 'null', mind: 'null' },
      ['hellfire', 'warCry', 'heatWave'], [['elecDrain', 75], ['attackAll', 76], ['wooing', 77], ['ragnarok', 78]]],
    ['alciel', 'Alciel', 'Tyrant', 77, [624, 306, 29, 25, 27, 14, 16],
      { fire: 'resist', ice: 'resist', electricity: 'resist', force: 'resist', expel: 'null', death: 'repel' },
      ['attackAll', 'panicVoice', 'mabufudyne', 'intimidate', 'retaliate', 'iceRepel', 'hadesBlast'],
      [['lifeSurge', 78], ['tetrakarn', 79], ['hellFang', 80], ['victoryCry', 81]]],
    ['baalZebul', 'Baal Zebul', 'Tyrant', 84, [666, 333, 32, 27, 27, 19, 19],
      { physical: 'resist', ice: 'resist', electricity: 'resist', force: 'resist', expel: 'repel', death: 'repel', curse: 'null', nerve: 'null', mind: 'null' },
      ['maziodyne', 'megidolaon'], [['watchful', 85], ['elecBoost', 86]]],
    ['beelzebub', 'Beelzebub', 'Tyrant', 95, [738, 372, 35, 29, 28, 29, 21],
      { physical: 'resist', ice: 'resist', electricity: 'resist', force: 'resist', expel: 'repel', death: 'repel', curse: 'null', nerve: 'null', mind: 'null' },
      ['maziodyne', 'megidolaon', 'watchful', 'elecBoost'], [['deathFlies', 96], ['victoryCry', 97]]],
    ['mot', 'Mot', 'Tyrant', 91, [732, 369, 25, 32, 31, 16, 19],
      { electricity: 'weak', expel: 'null', death: 'null', curse: 'null', nerve: 'null', mind: 'null' },
      ['maragidyne', 'mazandyne', 'makakaja'], [['beckonCall', 92], ['intimidate', 93], ['forceDrain', 94], ['megidolaon', 95]]],
    ['arahabaki', 'Arahabaki', 'Vile', 30, [294, 120, 14, 10, 19, 6, 9],
      { physical: 'null', fire: 'weak', ice: 'repel', electricity: 'weak', force: 'weak', expel: 'null', death: 'null', curse: 'weak', nerve: 'weak', mind: 'weak' },
      ['lunge', 'focus', 'lifeBonus', 'persuade', 'kamikaze'],
      [['mabufula', 31], ['stoneGaze', 32], ['mudo', 33], ['panicVoice', 34], ['drainAttack', 35]]],
    ['baphomet', 'Baphomet', 'Vile', 33, [300, 150, 8, 17, 17, 9, 10],
      { expel: 'weak', death: 'repel' }, ['makakaja', 'beckonCall', 'darkPledge'],
      [['evilGaze', 34], ['maragion', 35], ['eternalRest', 36], ['dismalTune', 37]]],
    ['pazuzu', 'Pazuzu', 'Vile', 45, [390, 192, 16, 19, 20, 10, 8],
      { ice: 'weak', death: 'null' }, ['hellGaze', 'mediarama', 'intimidate'],
      [['voidForce', 46], ['aridNeedle', 47], ['tentarafoo', 48], ['wetWind', 49]]],
    ['girimekhala', 'Girimekhala', 'Vile', 58, [474, 225, 22, 17, 21, 13, 13],
      { physical: 'repel', death: 'null' }, ['bindingCry', 'chaosBlade'],
      [['dismal', 59], ['shock', 60], ['debilitate', 61], ['tempest', 62]]],
    ['taoTie', 'Tao Tie', 'Vile', 65, [516, 258, 18, 21, 21, 15, 18],
      { death: 'null', curse: 'weak' }, ['megido', 'tetraja', 'loan'],
      [['lifeDrain', 66], ['hellGaze', 67], ['manaAid', 68], ['makajamaon', 69]]],
    ['samael', 'Samael', 'Vile', 73, [576, 297, 19, 26, 23, 19, 16],
      { electricity: 'weak', expel: 'repel', death: 'repel' }, ['mahamaon', 'mamudoon', 'prominence'],
      [['samrecarm', 74], ['tetrakarn', 75], ['avenge', 76], ['physRepel', 77]]],
    ['mada', 'Mada', 'Vile', 83, [678, 312, 30, 21, 30, 14, 16],
      { physical: 'drain', death: 'null', curse: 'weak' }, ['debilitate', 'hadesBlast', 'threaten'],
      [['intoxicate', 84], ['diarahan', 85], ['tarukaja', 86], ['lifeSurge', 87]]],
    ['zhen', 'Zhen', 'Wilder', 6, [72, 36, 4, 6, 6, 5, 5],
      { fire: 'weak', death: 'null', curse: 'resist', nerve: 'resist', mind: 'resist' },
      ['muteGaze', 'posumudi', 'zan'], [['toxicSting', 7], ['warCry', 8], ['wingBuffet', 9], ['mazan', 10], ['voidNerve', 11]]],
    ['bicorn', 'Bicorn', 'Wilder', 15, [150, 63, 10, 6, 10, 5, 4],
      { electricity: 'weak', death: 'null', curse: 'resist', nerve: 'resist', mind: 'resist' },
      ['sukukaja', 'charmBite'], [['maragi', 16], ['brightMight', 17], ['antiNerve', 18], ['pulinpa', 19], ['stunGaze', 20]]],
    ['raijuu', 'Raijuu', 'Wilder', 25, [204, 120, 8, 15, 9, 8, 5],
      { electricity: 'drain', force: 'weak', death: 'null' }, ['zionga', 'lightoma'],
      [['feralClaw', 26], ['shock', 27], ['needleRush', 28], ['elecBoost', 29]]],
    ['nue', 'Nue', 'Wilder', 31, [258, 120, 14, 9, 12, 8, 8],
      { fire: 'weak', ice: 'null', death: 'null' }, ['stunClaw', 'warCry'],
      [['iceBreath', 32], ['panicVoice', 33], ['iceBoost', 34], ['mamudo', 35]]],
    ['mothman', 'Mothman', 'Wilder', 43, [366, 183, 11, 18, 18, 8, 8],
      { fire: 'null', electricity: 'weak', death: 'null' }, ['evilGaze', 'stunClaw'],
      [['trafuri', 44], ['panicVoice', 45], ['fireBreath', 46], ['voidElec', 47]]],
    ['hresvelgr', 'Hresvelgr', 'Wilder', 75, [564, 285, 20, 20, 19, 25, 11],
      { fire: 'weak', ice: 'repel', death: 'null' }, ['mabufudyne', 'iceBoost', 'wingBuffet'],
      [['antiPhys', 76], ['ironClaw', 77], ['lifeRefill', 78], ['elecRepel', 79]]],
  ];
  const statKeys = ['hp', 'mp', 'strength', 'magic', 'vitality', 'agility', 'luck'];

  expected.forEach(([id, name, race, level, stats, affinities, innate, future]) => {
    const demon = NOCTURNE_GAME.data.demons[id];
    assert(demon.name === name && demon.race === race, `${name} should have the supplied identity`);
    assert(demon.baseLevel === level, `${name} should have the supplied base level`);
    assert(statKeys.every((key, index) => demon.baseStats[key] === stats[index]), `${name} should have the supplied base stats`);
    assert(Object.entries(affinities).every(([type, value]) => demon.affinities[type] === value), `${name} should have the supplied affinities`);
    assert(JSON.stringify(demon.innateSkills) === JSON.stringify(innate), `${name} should have the supplied innate skills`);
    assert(
      JSON.stringify(demon.futureSkills.map(({ skillId, level: learnLevel }) => [skillId, learnLevel])) === JSON.stringify(future),
      `${name} should have the supplied future skill levels`,
    );
    assert(NOCTURNE_GAME.data.playerRoster.includes(id), `${name} should be selectable by the player`);
  });
});

test('Nocturne clamps selected levels and unlocks future skills at their learn level', () => {
  const leveledGame = defineGame({
    ...NOCTURNE_GAME,
    id: 'nocturne-level-test',
    data: {
      ...NOCTURNE_GAME.data,
      demons: {
        ...NOCTURNE_GAME.data.demons,
        pixie: {
          ...NOCTURNE_GAME.data.demons.pixie,
          futureSkills: [{ skillId: 'agi', level: 8 }],
        },
      },
    },
  });
  const battle = makeNocturneBattle({
    game: leveledGame,
    playerTeam: [
      { id: 'pixie', level: 255 },
      { id: 'jackFrost', level: 1 },
      { id: 'oni', level: 15 },
    ],
  });
  assert(battle.state.teams.player[0].level === 255, 'level 255 should be selectable');
  assert(battle.state.teams.player[0].skills.includes('agi'), 'future skills should unlock at or above their learn level');
  assert(battle.state.teams.player[1].level === 12, 'levels below base level should clamp to the demon base level');
  assert(['strength', 'magic', 'vitality', 'agility', 'luck'].every(
    (stat) => battle.state.teams.player.every((demon) => demon.stats[stat] <= 40),
  ), 'battle stats should retain the Nocturne stat cap');

  const beforeLearnLevel = makeNocturneBattle({
    game: leveledGame,
    playerTeam: [{ id: 'pixie', level: 7 }, 'jackFrost', 'oni'],
  });
  assert(!beforeLearnLevel.state.teams.player[0].skills.includes('agi'), 'future skills should remain locked below their learn level');
});

test('Nocturne enforces selected eight-skill loadouts against the level skill pool', () => {
  const loadoutGame = defineGame({
    ...NOCTURNE_GAME,
    id: 'nocturne-loadout-test',
    data: {
      ...NOCTURNE_GAME.data,
      demons: {
        ...NOCTURNE_GAME.data.demons,
        pixie: {
          ...NOCTURNE_GAME.data.demons.pixie,
          futureSkills: [
            { skillId: 'agi', level: 8 },
            { skillId: 'bufu', level: 8 },
            { skillId: 'mabufu', level: 8 },
            { skillId: 'zan', level: 8 },
            { skillId: 'hama', level: 8 },
            { skillId: 'mudo', level: 8 },
            { skillId: 'megido', level: 8 },
          ],
        },
      },
    },
  });
  const battle = makeNocturneBattle({
    game: loadoutGame,
    playerTeam: [{
      id: 'pixie',
      level: 255,
      skills: ['zio', 'agi', 'bufu', 'mabufu', 'zan', 'hama', 'mudo', 'megido', 'dia'],
    }, 'jackFrost', 'oni'],
  });
  assert(battle.state.teams.player[0].skills.length === 8, 'a supplied loadout should be capped at eight skills');
  assert(!battle.state.teams.player[0].skills.includes('dia'), 'skills after the eighth valid selection should be omitted');
  assert(!battle.state.teams.player[0].skills.includes('attack'), 'the standard Attack command should not consume a skill slot');

  const restricted = makeNocturneBattle({
    game: loadoutGame,
    playerTeam: [{ id: 'pixie', level: 7, skills: ['zio', 'agi', 'attack'] }, 'jackFrost', 'oni'],
  });
  assert(restricted.state.teams.player[0].skills.length === 1, 'locked and universal commands should be removed from selected skills');
  assert(restricted.state.teams.player[0].skills[0] === 'zio', 'an available selected skill should remain equipped');
});

test('Nocturne always provides Attack and Pass outside the eight skill slots', () => {
  assert(NOCTURNE_GAME.config.maxSkills + 2 === 10, 'eight skills plus Attack and Pass should provide ten maximum actions');
  assert(NOCTURNE_GAME.presentation.allowPass, 'Pass should be exposed by the Nocturne profile');
  assert(NOCTURNE_GAME.presentation.allowGuard === false, 'Guard should not add an eleventh Nocturne action');

  const attackBattle = makeNocturneBattle({
    playerTeam: [{ id: 'pixie', level: 7, skills: [] }, 'jackFrost', 'oni'],
  });
  attackBattle.random = () => 0.5;
  const attack = attackBattle.act('player', { type: 'skill', skillId: 'attack', targetIndex: 0 });
  assert(attack.ok, 'Attack should remain usable with an empty equipped-skill loadout');

  const passBattle = makeNocturneBattle({
    playerTeam: [{ id: 'pixie', level: 7, skills: [] }, 'jackFrost', 'oni'],
  });
  const pass = passBattle.act('player', { type: 'pass' });
  assert(pass.ok, 'Pass should remain usable with an empty equipped-skill loadout');

  const guardBattle = makeNocturneBattle();
  const eventCount = guardBattle.state.events.length;
  const guard = guardBattle.act('player', { type: 'guard' });
  assert(!guard.ok, 'Guard should be rejected by the Nocturne ruleset');
  assert(guardBattle.state.events.length === eventCount, 'a rejected Guard command should not change battle state');
});

test('Nocturne rejects base attributes above the hard cap', () => {
  let error = null;
  try {
    defineGame({
      ...NOCTURNE_GAME,
      id: 'nocturne-invalid-stat-test',
      data: {
        ...NOCTURNE_GAME.data,
        demons: {
          ...NOCTURNE_GAME.data.demons,
          pixie: {
            ...NOCTURNE_GAME.data.demons.pixie,
            baseStats: { ...NOCTURNE_GAME.data.demons.pixie.baseStats, strength: 41 },
          },
        },
      },
    });
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof GameDataError, 'an attribute above 40 should reject the profile');
  assert(error.issues.some((issue) => issue.includes('base strength from 0 to 40')), 'the stat-cap error should identify the invalid attribute');
});

test('Nocturne single-target attacks hit the selected enemy without changing turn order', () => {
  const battle = makeNocturneBattle();
  battle.random = () => 0.5;
  const firstHp = battle.state.teams.enemy[0].hp;
  const secondHp = battle.state.teams.enemy[1].hp;
  battle.act('player', { type: 'skill', skillId: 'zio', targetIndex: 1 });
  assert(battle.state.teams.enemy[0].hp === firstHp, 'unselected enemy should not take damage');
  assert(battle.state.teams.enemy[1].hp < secondHp, 'selected enemy should take damage');
  assert(battle.state.active.enemy === 0, 'selecting a target should not change the enemy action cursor');
});

test('Nocturne single-target recovery can select an ally', () => {
  const battle = makeNocturneBattle();
  const pixieHp = battle.state.teams.player[0].hp;
  const jackFrost = battle.state.teams.player[1];
  jackFrost.hp -= 40;
  const damagedHp = jackFrost.hp;
  battle.random = () => 0.5;
  battle.act('player', { type: 'skill', skillId: 'dia', targetIndex: 1 });
  assert(jackFrost.hp > damagedHp, 'selected ally should recover HP');
  assert(battle.state.teams.player[0].hp === pixieHp, 'the caster should not be healed instead');
});

test('Nocturne pass converts a full icon, then prioritizes an existing half icon', () => {
  const battle = makeNocturneBattle();
  battle.act('player', { type: 'pass' });
  assert(battle.state.pressTurns.player.full === 2, 'first pass should convert one full icon');
  assert(battle.state.pressTurns.player.half === 1, 'first pass should create one half icon');
  assert(battle.active('player').id === 'jackFrost', 'passing should advance to the next ally');

  battle.act('player', { type: 'pass' });
  assert(battle.state.pressTurns.player.full === 2, 'second pass should preserve full icons');
  assert(battle.state.pressTurns.player.half === 0, 'second pass should consume the existing half icon');
  assert(battle.active('player').id === 'oni', 'the acting unit should advance again');
});

test('Nocturne weakness and critical hits create half icons', () => {
  const weakness = makeNocturneBattle({ playerTeam: ['pixie', 'pixie', 'oni'] });
  weakness.random = () => 0.5;
  weakness.act('player', { type: 'skill', skillId: 'zio' });
  weakness.act('player', { type: 'skill', skillId: 'zio' });
  assert(weakness.state.pressTurns.player.full === 1, 'successive weakness hits should convert successive full icons');
  assert(weakness.state.pressTurns.player.half === 2, 'successive weakness hits should preserve two half icons');

  const critical = makeNocturneBattle();
  critical.random = () => 0;
  critical.act('player', { type: 'skill', skillId: 'attack' });
  assert(critical.state.pressTurns.player.half === 1, 'a critical hit should create a half icon');
});

test('Nocturne miss and null outcomes spend two icons with half icons first', () => {
  const miss = makeNocturneBattle();
  miss.act('player', { type: 'pass' });
  miss.random = () => 0.999;
  miss.act('player', { type: 'skill', skillId: 'attack' });
  assert(miss.state.pressTurns.player.full === 1, 'miss should spend one half and one full icon');
  assert(miss.state.pressTurns.player.half === 0, 'miss should consume the available half icon first');

  const nullified = makeNocturneBattle({ playerTeam: ['angel', 'pixie', 'oni'], enemyTeam: ['angel', 'huaPo', 'nekomata'] });
  nullified.random = () => 0.5;
  nullified.act('player', { type: 'skill', skillId: 'hama' });
  assert(nullified.state.pressTurns.player.full === 1, 'nullification should spend two full icons');
});

test('Nocturne Drain immediately ends the acting side turn', () => {
  const battle = makeNocturneBattle({
    playerTeam: ['jackFrost', 'pixie', 'oni'],
    enemyTeam: ['jackFrost', 'huaPo', 'nekomata'],
  });
  battle.random = () => 0.5;
  battle.act('player', { type: 'skill', skillId: 'bufu' });
  assert(battle.state.phase === 'enemy', 'Drain should immediately pass initiative to the enemy');
  assert(battle.state.pressTurns.player.full === 0 && battle.state.pressTurns.player.half === 0, 'Drain should exhaust all player icons');
});

test('Nocturne multi-target attacks use the highest-priority icon outcome', () => {
  const multiTargetGame = defineGame({
    ...NOCTURNE_GAME,
    id: 'nocturne-multi-target-test',
    data: {
      ...NOCTURNE_GAME.data,
      skills: {
        ...NOCTURNE_GAME.data.skills,
        mabufu: { ...NOCTURNE_GAME.data.skills.mabufu, target: 'all' },
      },
    },
  });
  const battle = makeNocturneBattle({
    game: multiTargetGame,
    playerTeam: ['jackFrost', 'pixie', 'oni'],
    enemyTeam: ['huaPo', 'jackFrost', 'nekomata'],
  });
  battle.random = () => 0.5;
  battle.act('player', { type: 'skill', skillId: 'mabufu' });
  assert(battle.state.phase === 'enemy', 'Drain should outrank a simultaneous weakness hit');
  assert(battle.state.pressTurns.player.full === 0 && battle.state.pressTurns.player.half === 0, 'highest-priority Drain result should exhaust all icons');
});

test('Nocturne random multi-hit spells roll once, distribute hits, and pay once', () => {
  const multiHitGame = defineGame({
    ...NOCTURNE_GAME,
    id: 'nocturne-random-multi-hit-test',
    data: {
      ...NOCTURNE_GAME.data,
      skills: {
        ...NOCTURNE_GAME.data.skills,
        zio: {
          ...NOCTURNE_GAME.data.skills.zio,
          target: 'random',
          hits: { min: 5, max: 5 },
          accuracy: 100,
          crit: 0,
        },
      },
    },
  });
  const battle = makeNocturneBattle({ game: multiHitGame });
  const caster = battle.active('player');
  const startingMp = caster.mp;
  battle.random = () => 0;
  const result = battle.act('player', { type: 'skill', skillId: 'zio' });
  const hits = result.events.filter((event) => event.type === 'damage');

  assert(hits.length === 5, 'five-hit spell should resolve five separate damage events');
  assert(hits.map((event) => event.targetIndex).join(',') === '0,0,0,1,1', 'random distribution should cap a target at three hits in a group');
  assert(hits.every((event, index) => event.hitNumber === index + 1 && event.hitCount === 5), 'each event should identify its place in the hit sequence');
  assert(battle.state.teams.enemy[2].hp === battle.state.teams.enemy[2].stats.maxHp, 'an enemy receiving no assigned hits should be untouched');
  assert(caster.mp === startingMp - multiHitGame.data.skills.zio.cost, 'the skill cost should be paid only once');
  assert(battle.state.pressTurns.player.half === 1, 'a weakness on any hit should produce one half icon for the whole cast');
});

test('Nocturne random multi-hit spells cap repeats against a lone target', () => {
  const multiHitGame = defineGame({
    ...NOCTURNE_GAME,
    id: 'nocturne-lone-target-multi-hit-test',
    data: {
      ...NOCTURNE_GAME.data,
      skills: {
        ...NOCTURNE_GAME.data.skills,
        zio: {
          ...NOCTURNE_GAME.data.skills.zio,
          target: 'random',
          hits: { min: 5, max: 5 },
          accuracy: 100,
          crit: 0,
        },
      },
    },
  });
  const battle = makeNocturneBattle({ game: multiHitGame, enemyTeam: ['nekomata'] });
  battle.random = () => 0;
  const result = battle.act('player', { type: 'skill', skillId: 'zio' });
  assert(result.events.filter((event) => event.type === 'damage').length === 2, 'a lone target should receive at most two random hits');
});

test('Nocturne random multi-hit spells honor their variable hit range', () => {
  const multiHitGame = defineGame({
    ...NOCTURNE_GAME,
    id: 'nocturne-variable-multi-hit-test',
    data: {
      ...NOCTURNE_GAME.data,
      skills: {
        ...NOCTURNE_GAME.data.skills,
        zio: {
          ...NOCTURNE_GAME.data.skills.zio,
          target: 'random',
          hits: { min: 2, max: 5, maxPerTarget: 5 },
          accuracy: 100,
          crit: 0,
        },
      },
    },
  });
  const minimum = makeNocturneBattle({ game: multiHitGame, enemyTeam: ['nekomata'] });
  minimum.random = () => 0;
  const minimumResult = minimum.act('player', { type: 'skill', skillId: 'zio' });
  assert(minimumResult.events.filter((event) => event.type === 'damage').length === 2, 'minimum roll should use hits.min');

  const maximum = makeNocturneBattle({ game: multiHitGame, enemyTeam: ['nekomata'] });
  let randomCalls = 0;
  maximum.random = () => (randomCalls++ === 0 ? 0.999 : 0);
  const maximumResult = maximum.act('player', { type: 'skill', skillId: 'zio' });
  assert(maximumResult.events.filter((event) => event.type === 'damage').length === 5, 'maximum roll should use hits.max');
});

test('Nocturne rejects incomplete random multi-hit skill metadata', () => {
  let error = null;
  try {
    defineGame({
      ...NOCTURNE_GAME,
      id: 'nocturne-invalid-multi-hit-test',
      data: {
        ...NOCTURNE_GAME.data,
        skills: {
          ...NOCTURNE_GAME.data.skills,
          zio: { ...NOCTURNE_GAME.data.skills.zio, target: 'random' },
        },
      },
    });
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof GameDataError, 'invalid random-target skill should fail game validation');
  assert(error.issues.some((issue) => issue.includes('hits.min')), 'validation should identify the missing hit range');
});

test('definition validation rejects broken content references', () => {
  let error = null;
  try {
    defineGame({
      id: 'invalid-test', name: 'Invalid', description: 'Invalid fixture', Ruleset: class {},
      elements: { physical: {} }, affinities: { normal: {} }, config: {},
      data: {
        demons: { test: { id: 'test', skills: ['missing'] } },
        skills: {}, playerRoster: ['test'], defaultPlayerTeam: ['test'],
        opponentPresets: [{ id: 'test', name: 'Test', team: ['test'] }],
      },
    });
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof GameDataError, 'broken profile should throw GameDataError');
  assert(error.issues.some((issue) => issue.includes('missing skill')), 'error should identify the bad skill reference');
});

test('creates independent teams and opening state', () => {
  const battle = makeBattle();
  assert(battle.state.phase === 'player', 'player should act first');
  assert(battle.state.round === 1, 'battle should begin at round one');
  assert(battle.living('player').length === 3, 'player team should contain three living members');
  assert(battle.state.events.length === 3, 'opening log should contain three entries');
});

test('allows universal basic attacks', () => {
  const battle = makeBattle();
  assert(!battle.active('player').skills.includes('attack'), 'fixture should not learn Attack');
  battle.random = () => 0.5;
  const before = battle.active('enemy').hp;
  const action = battle.act('player', { type: 'skill', skillId: 'attack' });
  assert(action.ok, 'universal Attack should be accepted');
  assert(battle.active('enemy').hp < before, 'Attack should deal damage');
});

test('weakness grants exactly one bonus action', () => {
  const battle = makeBattle();
  battle.random = () => 0.5;
  battle.act('player', { type: 'skill', skillId: 'zio' });
  assert(battle.state.phase === 'player', 'weakness should retain initiative');
  assert(battle.state.bonusAvailable, 'bonus marker should be active');
  battle.act('player', { type: 'skill', skillId: 'zio' });
  assert(battle.state.phase === 'enemy', 'second action should pass initiative');
});

test('null affinity prevents damage and momentum', () => {
  const battle = makeBattle({ playerTeam: ['angel'], enemyTeam: ['angel'] });
  battle.random = () => 0.5;
  const before = battle.active('enemy').hp;
  battle.act('player', { type: 'skill', skillId: 'hama' });
  assert(battle.active('enemy').hp === before, 'Light-null target should take no damage');
  assert(battle.state.events.some((event) => event.type === 'null'), 'null event should be logged');
  assert(battle.state.phase === 'enemy', 'nullified action should end initiative');
});

test('switching changes the active slot and consumes the action', () => {
  const battle = makeBattle();
  const action = battle.act('player', { type: 'switch', index: 1 });
  assert(action.ok, 'switch should be accepted');
  assert(battle.active('player').id === 'jackFrost', 'requested reserve should be active');
  assert(battle.state.phase === 'enemy', 'switch should pass initiative');
});

test('guard reduces incoming damage', () => {
  const guarded = makeBattle({ seed: 'guard-check' });
  guarded.act('player', { type: 'guard' });
  const guardedStart = guarded.active('player').hp;
  guarded.act('enemy', { type: 'skill', skillId: 'attack' });
  const guardedDamage = guardedStart - guarded.active('player').hp;

  const open = makeBattle({ seed: 'guard-check' });
  open.state.phase = 'enemy';
  const openStart = open.active('player').hp;
  open.act('enemy', { type: 'skill', skillId: 'attack' });
  const openDamage = openStart - open.active('player').hp;
  assert(guardedDamage <= Math.ceil(openDamage / 2), 'guard should halve damage');
});

test('AI returns a legal action', () => {
  const battle = makeBattle();
  battle.state.phase = 'enemy';
  const action = battle.chooseAiAction();
  const result = battle.act('enemy', action);
  assert(result.ok, 'AI action should resolve');
});

test('a full basic-attack simulation terminates', () => {
  const battle = makeBattle({ seed: 'end-to-end' });
  let actions = 0;
  while (!battle.state.winner && actions < 400) {
    battle.act(battle.state.phase, { type: 'skill', skillId: 'attack' });
    actions += 1;
  }
  assert(Boolean(battle.state.winner), 'battle did not terminate within 400 actions');
  assert(battle.state.events.some((event) => event.type === 'result'), 'result should be logged');
});

test('runtime damage never mutates the game catalog', () => {
  const sourceHp = GAME.data.demons.nekomata.stats.maxHp;
  const battle = makeBattle();
  battle.random = () => 0.5;
  battle.act('player', { type: 'skill', skillId: 'attack' });
  assert(battle.active('enemy').hp < sourceHp, 'runtime combatant should take damage');
  assert(GAME.data.demons.nekomata.stats.maxHp === sourceHp, 'source max HP should remain unchanged');
  assert(!Object.hasOwn(GAME.data.demons.nekomata, 'hp'), 'source record should not receive runtime HP');
});

result.textContent = failed ? `${failed} failed · ${passed} passed` : `ALL CHECKS PASSED · ${passed}/${passed}`;
result.dataset.status = failed ? 'failed' : 'passed';
