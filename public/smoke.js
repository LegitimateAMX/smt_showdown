import { BattleEngine } from './framework/battle-engine.js';
import { defineGame, GameDataError } from './framework/game-definition.js';
import { DEFAULT_GAME_ID, getGame, listGames } from './games/registry.js';

const checks = document.querySelector('#checks');
const result = document.querySelector('#result');
const GAME = getGame(DEFAULT_GAME_ID);
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

const makeBattle = (options = {}) => new BattleEngine({
  game: GAME,
  playerTeam: options.playerTeam || ['pixie', 'jackFrost', 'oni'],
  enemyTeam: options.enemyTeam || ['nekomata', 'huaPo', 'angel'],
  opponentName: 'Test process',
  seed: options.seed || 'smoke-001',
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
  assert(Object.isFrozen(nocturne), 'Nocturne game definition should be immutable');
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
