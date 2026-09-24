import { BattleEngine, hpPercent, mpPercent } from './framework/battle-engine.js';
import { DEFAULT_GAME_ID, getGame, listGames } from './games/registry.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const ui = {
  setupModal: $('#setup-modal'),
  setupRoster: $('#setup-roster'),
  setupSkills: $('#setup-skills'),
  setupInstructions: $('#setup-instructions'),
  selectionCounter: $('#selection-counter'),
  gameProfile: $('#game-profile'),
  opponentPreset: $('#opponent-preset'),
  battleSeed: $('#battle-seed'),
  startBattle: $('#start-battle'),
  battleStage: $('#battle-stage'),
  battleLog: $('#battle-log'),
  commandContent: $('#command-content'),
  commandDeck: $('#command-deck'),
  impactBanner: $('#impact-banner'),
};

let activeGame = getGame(DEFAULT_GAME_ID);
let ELEMENTS = activeGame.elements;
let AFFINITIES = activeGame.affinities;
let DEMONS = activeGame.data.demons;
let SKILLS = activeGame.data.skills;
let PLAYER_ROSTER = activeGame.data.playerRoster;
let OPPONENT_PRESETS = activeGame.data.opponentPresets;
let RULES_PROFILE = activeGame.config;
let selectedTeam = [...activeGame.data.defaultPlayerTeam];
let selectedLevels = createLevelSelections(activeGame);
let selectedSkillLoadouts = createSkillSelections(activeGame, selectedLevels);
let engine = null;
let activeCommandTab = 'skills';
let pendingAction = null;
let interactionLocked = false;
let compendiumFilter = 'All';
let soundEnabled = false;
let audioContext = null;

function demonBaseLevel(demon) {
  return demon.baseLevel ?? demon.level;
}

function demonBaseStats(demon) {
  if (demon.baseStats) return demon.baseStats;
  return {
    hp: demon.stats.maxHp,
    mp: demon.stats.maxMp,
    attack: demon.stats.attack,
    magic: demon.stats.magic,
    defense: demon.stats.defense,
    agility: demon.stats.agility,
    luck: demon.stats.luck,
  };
}

function demonInnateSkills(demon) {
  return demon.innateSkills || demon.skills;
}

function demonFutureSkills(demon) {
  return demon.futureSkills || [];
}

function demonSkillIds(demon) {
  return [...new Set([
    ...demonInnateSkills(demon),
    ...demonFutureSkills(demon).map((entry) => entry.skillId),
  ])];
}

function selectableSkillOptions(demon) {
  const options = new Map();
  demonInnateSkills(demon).forEach((skillId) => {
    if (skillId !== 'attack') options.set(skillId, { skillId, level: demonBaseLevel(demon), innate: true });
  });
  demonFutureSkills(demon).forEach(({ skillId, level }) => {
    if (skillId !== 'attack' && !options.has(skillId)) options.set(skillId, { skillId, level, innate: false });
  });
  return [...options.values()];
}

function usableSkillIds(demon, level) {
  return selectableSkillOptions(demon)
    .filter((entry) => entry.level <= level)
    .map((entry) => entry.skillId);
}

function createLevelSelections(game) {
  return Object.fromEntries(game.data.playerRoster.map((id) => [id, demonBaseLevel(game.data.demons[id])]));
}

function createSkillSelections(game, levels) {
  const maximum = game.config.maxSkills || Number.POSITIVE_INFINITY;
  return Object.fromEntries(game.data.playerRoster.map((id) => [
    id,
    usableSkillIds(game.data.demons[id], levels[id]).slice(0, maximum),
  ]));
}

function normalizedSelectedLevel(id, value = selectedLevels[id]) {
  const baseLevel = demonBaseLevel(DEMONS[id]);
  const maximum = RULES_PROFILE.maxLevel || baseLevel;
  const numericLevel = Number(value);
  return Math.max(baseLevel, Math.min(maximum, Number.isInteger(numericLevel) ? numericLevel : baseLevel));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function makeSeed() {
  const fragments = ['magatama', 'amala', 'tokyo', 'gaia', 'mantra', 'karma', 'cocytus', 'macca'];
  const prefix = fragments[Math.floor(Math.random() * fragments.length)];
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function setup() {
  ui.battleSeed.value = makeSeed();
  ui.gameProfile.innerHTML = listGames().map(
    (game) => `<option value="${game.id}">${escapeHtml(game.name)} — ${escapeHtml(game.family)}</option>`,
  ).join('');
  ui.gameProfile.value = activeGame.id;
  renderOpponentOptions();
  renderSetupRoster();
  renderCompendiumFilters();
  renderCompendium();
  renderRulesPage();
  configureProfileUi();
  bindEvents();
  renderEmptyBattle();
  if (new URLSearchParams(window.location.search).has('demo')) startBattle();
}

function renderOpponentOptions() {
  ui.opponentPreset.innerHTML = OPPONENT_PRESETS.map(
    (preset) => `<option value="${preset.id}">${escapeHtml(preset.name)} — ${escapeHtml(preset.subtitle)}</option>`,
  ).join('');
}

function activateGame(gameId) {
  pendingAction = null;
  activeGame = getGame(gameId);
  ELEMENTS = activeGame.elements;
  AFFINITIES = activeGame.affinities;
  DEMONS = activeGame.data.demons;
  SKILLS = activeGame.data.skills;
  PLAYER_ROSTER = activeGame.data.playerRoster;
  OPPONENT_PRESETS = activeGame.data.opponentPresets;
  RULES_PROFILE = activeGame.config;
  selectedTeam = [...activeGame.data.defaultPlayerTeam];
  selectedLevels = createLevelSelections(activeGame);
  selectedSkillLoadouts = createSkillSelections(activeGame, selectedLevels);
  compendiumFilter = 'All';
  renderOpponentOptions();
  renderSetupRoster();
  renderCompendiumFilters();
  renderCompendium();
  renderRulesPage();
  configureProfileUi();
  $('#field-protocol').textContent = activeGame.presentation.fieldProtocol;
}

function availableCommandTabs() {
  return activeGame.presentation.commandTabs || ['skills', 'switch', 'inspect'];
}

function configureProfileUi() {
  const availableTabs = availableCommandTabs();
  if (!availableTabs.includes(activeCommandTab)) activeCommandTab = availableTabs[0];
  $$('.command-tab').forEach((tab) => {
    const available = availableTabs.includes(tab.dataset.commandTab);
    const active = available && tab.dataset.commandTab === activeCommandTab;
    tab.hidden = !available;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  ui.setupInstructions.textContent = activeGame.presentation.setupInstructions
    || 'Choose three demons. The first becomes your lead; order the rest as your reserve stock.';
}

function renderSetupRoster() {
  ui.setupRoster.innerHTML = PLAYER_ROSTER.map((id) => {
    const demon = DEMONS[id];
    const selectedIndex = selectedTeam.indexOf(id);
    const isSelected = selectedIndex >= 0;
    const baseLevel = demonBaseLevel(demon);
    const innateSkills = demonInnateSkills(demon);
    const levelControl = activeGame.presentation.levelSelection ? `
      <label class="roster-card__level">
        <span>Battle level</span>
        <input
          data-roster-level="${id}"
          type="number"
          min="${baseLevel}"
          max="${RULES_PROFILE.maxLevel}"
          value="${normalizedSelectedLevel(id)}"
          aria-label="${escapeHtml(demon.name)} battle level"
          ${isSelected ? '' : 'disabled'}
        />
      </label>` : '';
    return `
      <article class="roster-card${isSelected ? ' is-selected' : ''}">
        <button class="roster-card__select" data-roster-id="${id}" type="button" aria-pressed="${isSelected}">
          <span class="mini-sigil" style="--c1:${demon.palette[0]};--c2:${demon.palette[1]}">${demon.glyph}</span>
          <span class="roster-card__copy">
            <small>${escapeHtml(demon.race)} · ${activeGame.presentation.levelSelection ? 'Base ' : ''}Lv. ${baseLevel}</small>
            <strong>${escapeHtml(demon.name)}</strong>
            <span>${innateSkills.slice(0, 2).map((skillId) => SKILLS[skillId].name).join(' · ')}</span>
          </span>
          <span class="selection-order">${isSelected ? selectedIndex + 1 : '+'}</span>
        </button>
        ${levelControl}
      </article>
    `;
  }).join('');

  ui.selectionCounter.textContent = `${selectedTeam.length} / ${RULES_PROFILE.maxTeamSize} selected`;
  ui.startBattle.disabled = selectedTeam.length !== RULES_PROFILE.maxTeamSize;
  renderSetupSkillLoadouts();
}

function renderSetupSkillLoadouts() {
  if (!activeGame.presentation.skillSelection) {
    ui.setupSkills.hidden = true;
    ui.setupSkills.innerHTML = '';
    return;
  }

  ui.setupSkills.hidden = false;
  ui.setupSkills.innerHTML = selectedTeam.map((id) => {
    const demon = DEMONS[id];
    const level = normalizedSelectedLevel(id);
    const options = selectableSkillOptions(demon);
    const selected = selectedSkillLoadouts[id] || [];
    const atCapacity = selected.length >= RULES_PROFILE.maxSkills;
    return `
      <section class="loadout-card">
        <div class="loadout-card__heading">
          <span class="mini-sigil" style="--c1:${demon.palette[0]};--c2:${demon.palette[1]}">${demon.glyph}</span>
          <span><strong>${escapeHtml(demon.name)}</strong><small>Lv. ${level}</small></span>
          <em>${selected.length} / ${RULES_PROFILE.maxSkills}</em>
        </div>
        <div class="loadout-skills">
          ${options.length ? options.map(({ skillId, level: learnLevel, innate }) => {
            const skill = SKILLS[skillId];
            const available = learnLevel <= level;
            const isSelected = selected.includes(skillId);
            return `
              <button
                class="loadout-skill${isSelected ? ' is-selected' : ''}${available ? '' : ' is-locked'}"
                data-loadout-demon="${id}"
                data-loadout-skill="${skillId}"
                type="button"
                aria-pressed="${isSelected}"
                style="--skill-color:${ELEMENTS[skill.element].color}"
                ${!available || (atCapacity && !isSelected) ? 'disabled' : ''}
              >
                <span>${ELEMENTS[skill.element].icon}</span>
                <strong>${escapeHtml(skill.name)}</strong>
                <small>${innate ? 'Innate' : `Lv. ${learnLevel}`}</small>
              </button>`;
          }).join('') : '<p class="loadout-empty">Only the standard Attack command is currently available.</p>'}
        </div>
        <p class="loadout-card__fixed">Attack + Pass are always available outside these slots.</p>
      </section>`;
  }).join('');
}

function bindEvents() {
  ui.gameProfile.addEventListener('change', () => activateGame(ui.gameProfile.value));

  ui.setupRoster.addEventListener('click', (event) => {
    const card = event.target.closest('[data-roster-id]');
    if (!card) return;
    const id = card.dataset.rosterId;
    if (selectedTeam.includes(id)) selectedTeam = selectedTeam.filter((entry) => entry !== id);
    else if (selectedTeam.length < RULES_PROFILE.maxTeamSize) selectedTeam.push(id);
    else showToast('Your stock is full. Remove a demon before adding another.');
    renderSetupRoster();
  });

  ui.setupRoster.addEventListener('change', (event) => {
    const input = event.target.closest('[data-roster-level]');
    if (!input) return;
    const id = input.dataset.rosterLevel;
    const previousAvailable = new Set(usableSkillIds(DEMONS[id], selectedLevels[id]));
    selectedLevels[id] = normalizedSelectedLevel(id, input.value);
    const available = usableSkillIds(DEMONS[id], selectedLevels[id]);
    const retained = (selectedSkillLoadouts[id] || []).filter((skillId) => available.includes(skillId));
    const newlyUnlocked = available.filter((skillId) => !previousAvailable.has(skillId));
    selectedSkillLoadouts[id] = [...new Set([...retained, ...newlyUnlocked])].slice(0, RULES_PROFILE.maxSkills);
    input.value = selectedLevels[id];
    renderSetupSkillLoadouts();
  });

  ui.setupSkills.addEventListener('click', (event) => {
    const button = event.target.closest('[data-loadout-demon][data-loadout-skill]');
    if (!button || button.disabled) return;
    const id = button.dataset.loadoutDemon;
    const skillId = button.dataset.loadoutSkill;
    const selected = selectedSkillLoadouts[id] || [];
    if (selected.includes(skillId)) {
      selectedSkillLoadouts[id] = selected.filter((entry) => entry !== skillId);
    } else if (selected.length < RULES_PROFILE.maxSkills) {
      selectedSkillLoadouts[id] = [...selected, skillId];
    }
    renderSetupSkillLoadouts();
  });

  $('#reroll-seed').addEventListener('click', () => {
    ui.battleSeed.value = makeSeed();
  });

  ui.startBattle.addEventListener('click', startBattle);
  $('#new-match-button').addEventListener('click', openSetup);

  $$('.nav-item').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.view));
  });

  $$('.command-tab').forEach((button) => {
    button.addEventListener('click', () => {
      pendingAction = null;
      activeCommandTab = button.dataset.commandTab;
      $$('.command-tab').forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      renderCommands();
    });
  });

  ui.commandContent.addEventListener('click', (event) => {
    const targetButton = event.target.closest('[data-target-side][data-target-index]');
    const cancelTarget = event.target.closest('[data-action="cancel-target"]');
    const skillButton = event.target.closest('[data-skill-id]');
    const switchButton = event.target.closest('[data-switch-index]');
    if (targetButton) choosePendingTarget(targetButton.dataset.targetSide, Number(targetButton.dataset.targetIndex));
    if (cancelTarget) cancelTargetSelection();
    if (skillButton) selectPlayerSkill(skillButton.dataset.skillId);
    if (switchButton) issuePlayerAction({ type: 'switch', index: Number(switchButton.dataset.switchIndex) });
    if (event.target.closest('[data-action="guard"]')) issuePlayerAction({ type: 'guard' });
    if (event.target.closest('[data-action="pass"]')) issuePlayerAction({ type: 'pass' });
    if (event.target.closest('[data-action="rematch"]')) startBattle();
    if (event.target.closest('[data-action="new-team"]')) openSetup();
  });

  ui.battleStage.addEventListener('click', (event) => {
    const target = event.target.closest('[data-field-side][data-field-index]');
    if (!target || !target.classList.contains('is-targetable')) return;
    choosePendingTarget(target.dataset.fieldSide, Number(target.dataset.fieldIndex));
  });

  $('#player-party-list').addEventListener('click', (event) => {
    if (!event.target.closest('.party-member') || !availableCommandTabs().includes('switch')) return;
    activeCommandTab = 'switch';
    $$('.command-tab').forEach((tab) => {
      const active = tab.dataset.commandTab === 'switch';
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    renderCommands();
  });

  $('#copy-log').addEventListener('click', copyBattleLog);
  $('#compendium-search').addEventListener('input', renderCompendium);
  $('#compendium-filters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    compendiumFilter = button.dataset.filter;
    renderCompendiumFilters();
    renderCompendium();
  });

  $('#audio-toggle').addEventListener('click', (event) => {
    soundEnabled = !soundEnabled;
    event.currentTarget.classList.toggle('is-active', soundEnabled);
    event.currentTarget.setAttribute('aria-pressed', String(soundEnabled));
    showToast(soundEnabled ? 'Interface sounds enabled.' : 'Interface sounds muted.');
    if (soundEnabled) playTone('positive');
  });

  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, select, textarea')) return;
    if (event.key === 'Escape' && pendingAction) {
      cancelTargetSelection();
      return;
    }
    const number = Number(event.key);
    if (!engine || number < 1 || number > 4 || interactionLocked || engine.state.phase !== 'player') return;
    const actor = engine.active('player');
    const skillId = actor.skills[number - 1];
    if (skillId) selectPlayerSkill(skillId);
  });
}

function navigate(viewName) {
  $$('.view').forEach((view) => view.classList.toggle('is-active', view.id === `${viewName}-view`));
  $$('.nav-item').forEach((button) => button.classList.toggle('is-active', button.dataset.view === viewName));
  window.history.replaceState(null, '', `#${viewName}`);
  if (viewName === 'compendium') renderCompendium();
}

function openSetup() {
  pendingAction = null;
  ui.setupModal.classList.add('is-open');
  ui.setupModal.removeAttribute('aria-hidden');
  renderSetupRoster();
  window.setTimeout(() => $('[data-roster-id]', ui.setupRoster)?.focus(), 50);
}

function startBattle() {
  const opponent = OPPONENT_PRESETS.find((preset) => preset.id === ui.opponentPreset.value) || OPPONENT_PRESETS[0];
  const playerTeam = activeGame.presentation.levelSelection
    ? selectedTeam.map((id) => ({
      id,
      level: normalizedSelectedLevel(id),
      skills: [...(selectedSkillLoadouts[id] || [])],
    }))
    : selectedTeam;
  engine = new BattleEngine({
    game: activeGame,
    playerTeam,
    enemyTeam: opponent.team,
    seed: ui.battleSeed.value.trim() || makeSeed(),
    opponentName: opponent.name,
  });
  interactionLocked = false;
  pendingAction = null;
  activeCommandTab = 'skills';
  configureProfileUi();
  ui.setupModal.classList.remove('is-open');
  ui.setupModal.setAttribute('aria-hidden', 'true');
  navigate('battle');
  renderBattle();
  showToast(`Contract opened against ${opponent.name}.`);
  playTone('summon');
}

function renderEmptyBattle() {
  $('#player-party-list').innerHTML = `
    <div class="empty-party">
      <span>◌</span>
      <p>No active contract</p>
    </div>`;
  ui.battleLog.innerHTML = `
    <li class="log-entry log-entry--system">
      <span class="log-index">00</span>
      <p>Summoning program ready. Initialize a battle to begin.</p>
    </li>`;
  ui.commandContent.innerHTML = `<div class="empty-command">Select <strong>New match</strong> to configure a battle.</div>`;
}

function renderBattle() {
  if (!engine) return;
  const state = engine.state;
  const player = engine.active('player');
  const enemy = engine.active('enemy');

  $('#match-label').textContent = `${activeGame.shortName} · ${engine.opponentName} · ${engine.seed}`;
  $('#round-number').textContent = String(state.round).padStart(2, '0');
  $('#player-party-count').textContent = `${engine.living('player').length} / ${state.teams.player.length}`;

  const usesPartyField = activeGame.presentation.partyMode === 'turn-order';
  $('#player-combatant').hidden = usesPartyField;
  $('#enemy-combatant').hidden = usesPartyField;
  $('#player-field-party').hidden = !usesPartyField;
  $('#enemy-field-party').hidden = !usesPartyField;
  if (usesPartyField) {
    renderFieldParty('player');
    renderFieldParty('enemy');
  } else {
    renderCombatant('player', player);
    renderCombatant('enemy', enemy);
  }
  renderParty();
  renderTurnBanner();
  renderCommands();
  renderLog();
}

function renderCombatant(side, combatant) {
  $(`#${side}-name`).textContent = combatant.name;
  $(`#${side}-level`).textContent = `Lv. ${combatant.level}`;
  $(`#${side}-glyph`).textContent = combatant.glyph;
  $(`#${side}-hp-value`).textContent = `${combatant.hp} / ${combatant.stats.maxHp}`;
  $(`#${side}-hp-bar`).style.width = `${hpPercent(combatant)}%`;
  if (side === 'player') {
    $('#player-mp-value').textContent = `${combatant.mp} / ${combatant.stats.maxMp}`;
    $('#player-mp-bar').style.width = `${mpPercent(combatant)}%`;
  }
  const summon = $(`#${side}-summon`);
  summon.style.setProperty('--demon-primary', combatant.palette[0]);
  summon.style.setProperty('--demon-secondary', combatant.palette[1]);
  summon.classList.toggle('is-fainted', combatant.fainted);
  $(`#${side}-conditions`).innerHTML = renderConditions(combatant);
}

function renderFieldParty(side) {
  const state = engine.state;
  const targetSide = pendingAction?.targetSide;
  const fieldParty = $(`#${side}-field-party`);
  fieldParty.style.setProperty('--party-size', state.teams[side].length);
  fieldParty.innerHTML = state.teams[side].map((combatant, index) => {
    const acting = state.phase === side && state.active[side] === index && !combatant.fainted;
    const targetable = targetSide === side && !combatant.fainted && !interactionLocked;
    const status = combatant.fainted ? 'Down' : acting ? 'Acting' : targetable ? 'Select target' : 'Ready';
    return `
      <button
        class="field-unit${acting ? ' is-acting' : ''}${targetable ? ' is-targetable' : ''}${combatant.fainted ? ' is-fainted' : ''}"
        id="${side}-field-unit-${index}"
        data-field-side="${side}"
        data-field-index="${index}"
        type="button"
        aria-label="${escapeHtml(combatant.name)}: ${status}"
        ${targetable ? '' : 'tabindex="-1"'}
      >
        <span class="field-unit__summon" style="--demon-primary:${combatant.palette[0]};--demon-secondary:${combatant.palette[1]}">
          <span class="field-unit__glyph">${combatant.glyph}</span>
        </span>
        <span class="field-unit__card">
          <span class="field-unit__heading"><strong>${escapeHtml(combatant.name)}</strong><small>Lv. ${combatant.level}</small></span>
          <span class="field-unit__status">${status}</span>
          <span class="field-unit__resource"><small>HP</small><i><b style="width:${hpPercent(combatant)}%"></b></i><em>${combatant.hp}/${combatant.stats.maxHp}</em></span>
          ${side === 'player' ? `<span class="field-unit__resource field-unit__resource--mp"><small>MP</small><i><b style="width:${mpPercent(combatant)}%"></b></i><em>${combatant.mp}/${combatant.stats.maxMp}</em></span>` : ''}
        </span>
      </button>`;
  }).join('');
}

function renderConditions(combatant) {
  const chips = [];
  if (combatant.guarding) chips.push('<span class="condition condition--guard">Guard</span>');
  if (combatant.ailment) chips.push(`<span class="condition condition--ailment">${escapeHtml(combatant.ailment.type)}</span>`);
  Object.entries(combatant.stages).forEach(([stat, stage]) => {
    if (stage) chips.push(`<span class="condition ${stage > 0 ? 'condition--up' : 'condition--down'}">${stat.slice(0, 3)} ${stage > 0 ? '+' : ''}${stage}</span>`);
  });
  return chips.length ? chips.join('') : '<span class="condition condition--clear">No conditions</span>';
}

function renderParty() {
  const state = engine.state;
  const usesTurnOrder = activeGame.presentation.partyMode === 'turn-order';
  $('#player-party-list').innerHTML = state.teams.player.map((member, index) => {
    const active = state.active.player === index;
    const stateLabel = member.fainted ? 'Down' : usesTurnOrder ? active ? 'Acting' : 'Ready' : active ? 'Active' : 'Reserve';
    return `
      <button class="party-member${active ? ' is-active' : ''}${member.fainted ? ' is-fainted' : ''}" type="button" ${member.fainted ? 'disabled' : ''}>
        <span class="mini-sigil" style="--c1:${member.palette[0]};--c2:${member.palette[1]}">${member.glyph}</span>
        <span class="party-member__body">
          <span><strong>${escapeHtml(member.name)}</strong><small>${stateLabel}</small></span>
          <span class="mini-meter"><i style="width:${hpPercent(member)}%"></i></span>
          <span class="party-hp">${member.hp} / ${member.stats.maxHp}</span>
        </span>
      </button>
    `;
  }).join('');
}

function renderTurnBanner() {
  const state = engine.state;
  const eyebrow = $('#turn-eyebrow');
  const prompt = $('#turn-prompt');
  const turns = $('#press-turns');

  if (state.winner) {
    eyebrow.textContent = 'Simulation complete';
    prompt.textContent = state.winner === 'player' ? 'Contract fulfilled' : 'Stock exhausted';
    turns.innerHTML = '<span class="turn-orb is-spent"></span>';
    return;
  }

  if (state.pressTurns) {
    const side = state.phase;
    const icons = state.pressTurns[side];
    const enemyClass = side === 'enemy' ? ' turn-orb--enemy' : '';
    const fullIcons = Array.from({ length: icons.full }, () => (
      `<span class="turn-orb is-active${enemyClass}" title="Full Press Turn"></span>`
    ));
    const halfIcons = Array.from({ length: icons.half }, () => (
      `<span class="turn-orb turn-orb--half is-active${enemyClass}" title="Half Press Turn"></span>`
    ));
    const remaining = icons.full + icons.half;
    eyebrow.textContent = side === 'player' ? 'Your Press Turn' : 'Rival Press Turn';
    const selectedSkill = pendingAction ? SKILLS[pendingAction.skillId] : null;
    prompt.textContent = side === 'player'
      ? selectedSkill ? `Select a target for ${selectedSkill.name}` : `What will ${engine.active('player').name} do?`
      : `${engine.active('enemy').name} is calculating...`;
    turns.setAttribute('aria-label', `${remaining} Press Turn ${remaining === 1 ? 'icon' : 'icons'} remaining`);
    turns.innerHTML = [...halfIcons, ...fullIcons].join('');
    return;
  }

  if (state.phase === 'player') {
    eyebrow.textContent = state.bonusAvailable ? 'Bonus action' : 'Your initiative';
    prompt.textContent = state.bonusAvailable ? 'Press the advantage' : `What will ${engine.active('player').name} do?`;
    turns.innerHTML = `
      <span class="turn-orb is-active" title="Current action"></span>
      ${state.bonusAvailable ? '<span class="turn-orb turn-orb--bonus is-active" title="Bonus action">+</span>' : ''}
    `;
  } else {
    eyebrow.textContent = 'Rival process';
    prompt.textContent = `${engine.active('enemy').name} is calculating…`;
    turns.innerHTML = '<span class="turn-orb turn-orb--enemy is-active"></span>';
  }
}

function renderCommands() {
  if (!engine) return;
  const state = engine.state;
  const actor = engine.active('player');
  const disabled = interactionLocked || state.phase !== 'player';

  if (state.winner) {
    ui.commandContent.innerHTML = `
      <div class="result-card result-card--${state.winner}">
        <div class="result-sigil">${state.winner === 'player' ? '✦' : '×'}</div>
        <div>
          <span class="eyebrow">Final result</span>
          <h3>${state.winner === 'player' ? 'Victory registered' : 'Defeat registered'}</h3>
          <p>${state.winner === 'player' ? 'The rival stock has been exhausted.' : 'Reconfigure your party or challenge the process again.'}</p>
        </div>
        <div class="result-actions">
          <button class="secondary-button" data-action="new-team" type="button">Change party</button>
          <button class="primary-button primary-button--small" data-action="rematch" type="button">Rematch</button>
        </div>
      </div>`;
    return;
  }

  if (pendingAction && state.phase === 'player') {
    ui.commandContent.innerHTML = renderTargetSelection();
    return;
  }

  if (activeCommandTab === 'skills') {
    ui.commandContent.innerHTML = `
      <div class="skill-grid${disabled ? ' is-disabled' : ''}">
        ${actor.skills.map((id, index) => renderSkillButton(actor, SKILLS[id], index, disabled)).join('')}
      </div>
      <div class="utility-actions">
        ${actor.skills.includes('attack') ? '' : `
          <button class="guard-button" data-skill-id="attack" type="button" ${disabled ? 'disabled' : ''}>
            <span class="skill-icon element-physical">${ELEMENTS.physical.icon}</span>
            <span><strong>Attack</strong><small>Basic physical strike</small></span>
            <span class="skill-cost">No cost</span>
          </button>`}
        ${activeGame.presentation.allowGuard === false ? '' : `
          <button class="guard-button" data-action="guard" type="button" ${disabled ? 'disabled' : ''}>
            <span class="skill-icon element-support">◇</span>
            <span><strong>Guard</strong><small>Halve incoming damage until your next action</small></span>
            <span class="skill-cost">No cost</span>
          </button>`}
        ${activeGame.presentation.allowPass ? `
          <button class="guard-button" data-action="pass" type="button" ${disabled ? 'disabled' : ''}>
            <span class="skill-icon element-support">&#9655;</span>
            <span><strong>Pass</strong><small>Move to the next ally using half a turn</small></span>
            <span class="skill-cost">Half turn</span>
          </button>` : ''}
      </div>`;
  } else if (activeCommandTab === 'switch') {
    ui.commandContent.innerHTML = `
      <div class="switch-grid${disabled ? ' is-disabled' : ''}">
        ${state.teams.player.map((member, index) => renderSwitchButton(member, index, disabled)).join('')}
      </div>
      <p class="command-note">Switching consumes your current action.</p>`;
  } else {
    ui.commandContent.innerHTML = renderAnalysis();
  }
}

function renderSkillButton(actor, skill, index, disabled) {
  const payable = engine.canPay(actor, skill);
  const element = ELEMENTS[skill.element];
  const target = engine.active('enemy');
  const affinity = skill.kind === 'damage' && !activeGame.presentation.manualTargeting
    ? engine.affinityFor(target, skill.element)
    : null;
  const affinityTag = affinity && affinity !== 'normal' ? `<span class="affinity-hint affinity-${affinity}">${AFFINITIES[affinity].label}</span>` : '';
  return `
    <button class="skill-button" data-skill-id="${skill.id}" type="button" ${disabled || !payable ? 'disabled' : ''} style="--element:${element.color}">
      <span class="key-hint">${index + 1}</span>
      <span class="skill-icon element-${skill.element}">${element.icon}</span>
      <span class="skill-copy">
        <span><strong>${escapeHtml(skill.name)}</strong>${affinityTag}</span>
        <small>${escapeHtml(skill.description)}</small>
      </span>
      <span class="skill-cost${!payable ? ' is-insufficient' : ''}">${skill.cost || '—'} ${skill.cost ? skill.costType.toUpperCase() : ''}</span>
    </button>`;
}

function targetSideForSkill(skill) {
  if (skill.targetSide === 'self' || skill.targetSide === 'ally') return 'player';
  if (skill.targetSide === 'enemy') return 'enemy';
  return skill.kind === 'heal' || skill.kind === 'buff' ? 'player' : 'enemy';
}

function skillNeedsTarget(skill) {
  return activeGame.presentation.manualTargeting
    && !['all', 'random', 'self'].includes(skill.target);
}

function selectPlayerSkill(skillId) {
  if (!engine || interactionLocked || engine.state.phase !== 'player' || engine.state.winner) return;
  const actor = engine.active('player');
  const skill = SKILLS[skillId];
  if (!skill || (!actor.skills.includes(skill.id) && skill.id !== 'attack')) return;
  if (!engine.canPay(actor, skill)) {
    showToast(`Not enough ${skill.costType.toUpperCase()}.`);
    return;
  }
  if (!skillNeedsTarget(skill)) {
    issuePlayerAction({ type: 'skill', skillId });
    return;
  }

  pendingAction = { type: 'skill', skillId, targetSide: targetSideForSkill(skill) };
  renderBattle();
}

function choosePendingTarget(side, index) {
  if (!pendingAction || pendingAction.targetSide !== side || interactionLocked) return;
  const target = engine.state.teams[side]?.[index];
  if (!target || target.fainted) return;
  issuePlayerAction({ ...pendingAction, targetIndex: index });
}

function cancelTargetSelection() {
  if (!pendingAction || interactionLocked) return;
  pendingAction = null;
  renderBattle();
}

function renderTargetSelection() {
  const skill = SKILLS[pendingAction.skillId];
  const targets = engine.state.teams[pendingAction.targetSide];
  return `
    <div class="target-selection">
      <div class="target-selection__heading">
        <div><span class="eyebrow">Choose target</span><strong>${escapeHtml(skill.name)}</strong></div>
        <button class="text-button" data-action="cancel-target" type="button">Cancel</button>
      </div>
      <div class="target-selection__grid">
        ${targets.map((target, index) => {
          const affinity = skill.kind === 'damage' ? engine.affinityFor(target, skill.element) : null;
          const affinityLabel = affinity ? AFFINITIES[affinity].label : `${target.hp} / ${target.stats.maxHp} HP`;
          return `
            <button class="target-option" data-target-side="${pendingAction.targetSide}" data-target-index="${index}" type="button" ${target.fainted ? 'disabled' : ''}>
              <span class="mini-sigil" style="--c1:${target.palette[0]};--c2:${target.palette[1]}">${target.glyph}</span>
              <span><strong>${escapeHtml(target.name)}</strong><small>${escapeHtml(affinityLabel)}</small></span>
            </button>`;
        }).join('')}
      </div>
      <p class="command-note">Select a highlighted combatant on the field or choose one here.</p>
    </div>`;
}

function renderSwitchButton(member, index, disabled) {
  const active = engine.state.active.player === index;
  return `
    <button class="switch-button${active ? ' is-active' : ''}" data-switch-index="${index}" type="button" ${disabled || active || member.fainted ? 'disabled' : ''}>
      <span class="mini-sigil" style="--c1:${member.palette[0]};--c2:${member.palette[1]}">${member.glyph}</span>
      <span>
        <small>${escapeHtml(member.race)} · Lv. ${member.level}</small>
        <strong>${escapeHtml(member.name)}</strong>
        <span class="switch-resources">HP ${member.hp}/${member.stats.maxHp} · MP ${member.mp}/${member.stats.maxMp}</span>
      </span>
      <span class="switch-state">${active ? 'Active' : member.fainted ? 'Down' : 'Summon'}</span>
    </button>`;
}

function renderAnalysis() {
  const player = engine.active('player');
  const enemy = engine.active('enemy');
  const excludedElements = activeGame.presentation.excludedAnalysisElements || [];
  const combatElements = Object.keys(ELEMENTS).filter((key) => !excludedElements.includes(key));
  const analysisStats = activeGame.presentation.analysisStats || ['attack', 'magic', 'defense', 'agility', 'luck'];
  return `
    <div class="analysis-grid">
      <div class="analysis-unit">
        <span class="eyebrow">Active comparison</span>
        <div class="stat-compare">
          ${analysisStats.map((stat) => `
            <div><span>${stat.slice(0, 3).toUpperCase()}</span><strong>${player.stats[stat]}</strong><i></i><strong>${enemy.stats[stat]}</strong></div>
          `).join('')}
        </div>
        <div class="compare-names"><span>${escapeHtml(player.name)}</span><span>${escapeHtml(enemy.name)}</span></div>
      </div>
      <div class="analysis-unit">
        <span class="eyebrow">Observed affinities · ${escapeHtml(enemy.name)}</span>
        <div class="affinity-grid">
          ${combatElements.map((element) => {
            const affinity = engine.affinityFor(enemy, element);
            return `<div class="affinity-cell affinity-${affinity}" title="${ELEMENTS[element].label}: ${AFFINITIES[affinity].label}">
              <span>${ELEMENTS[element].icon}</span><small>${ELEMENTS[element].short}</small><strong>${AFFINITIES[affinity].label}</strong>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

function renderLog() {
  ui.battleLog.innerHTML = engine.state.events.map((event) => `
    <li class="log-entry log-entry--${event.tone || event.type}">
      <span class="log-index">${String(event.id).padStart(2, '0')}</span>
      <div><small>R${String(event.round).padStart(2, '0')} · ${escapeHtml(event.type)}</small><p>${escapeHtml(event.text)}</p></div>
    </li>
  `).join('');
  ui.battleLog.scrollTop = ui.battleLog.scrollHeight;
  $('#log-status').textContent = engine.state.winner ? 'Simulation closed' : engine.state.phase === 'player' ? 'Awaiting your command' : 'Rival process active';
}

async function issuePlayerAction(action) {
  if (!engine || interactionLocked || engine.state.phase !== 'player' || engine.state.winner) return;
  interactionLocked = true;
  const result = engine.act('player', action);
  if (!result.ok) {
    interactionLocked = false;
    showToast(result.error);
    renderBattle();
    return;
  }

  pendingAction = null;
  renderBattle();
  await animateEvents(result.events);
  if (engine.state.winner) {
    interactionLocked = false;
    renderBattle();
    return;
  }

  while (engine.state.phase === 'enemy' && !engine.state.winner) {
    await delay(520);
    const aiAction = engine.chooseAiAction();
    const aiResult = engine.act('enemy', aiAction);
    renderBattle();
    await animateEvents(aiResult.events);
  }

  interactionLocked = false;
  renderBattle();
}

async function animateEvents(events) {
  const notable = events.filter((event) => event.impact).slice(-3);
  for (const event of notable) {
    const target = event.targetSide || event.side;
    const combatant = target
      ? activeGame.presentation.partyMode === 'turn-order'
        ? $(`#${target}-field-unit-${event.targetIndex ?? engine.state.active[target]}`)
        : $(`#${target}-combatant`)
      : null;
    ui.impactBanner.textContent = event.impact;
    ui.impactBanner.className = `impact-banner is-visible impact-banner--${event.tone || 'system'}`;
    if (combatant && ['damage', 'repel', 'status', 'faint'].includes(event.type)) combatant.classList.add('is-hit');
    if (event.type === 'heal' || event.type === 'stage') combatant?.classList.add('is-boosted');
    playTone(event.tone || event.type);
    await delay(330);
    combatant?.classList.remove('is-hit');
    $$('.combatant').forEach((node) => node.classList.remove('is-boosted'));
    ui.impactBanner.classList.remove('is-visible');
    await delay(80);
  }
}

function renderCompendiumFilters() {
  const races = ['All', ...new Set(Object.values(DEMONS).map((entry) => entry.race))];
  $('#compendium-filters').innerHTML = races.map((race) => `
    <button class="filter-chip${compendiumFilter === race ? ' is-active' : ''}" data-filter="${race}" type="button">${escapeHtml(race)}</button>
  `).join('');
}

function renderCompendium() {
  const query = ($('#compendium-search')?.value || '').trim().toLowerCase();
  const demons = Object.values(DEMONS).filter((demon) => {
    const matchesFilter = compendiumFilter === 'All' || demon.race === compendiumFilter;
    const searchable = `${demon.name} ${demon.race} ${demonSkillIds(demon).map((id) => SKILLS[id].name).join(' ')}`.toLowerCase();
    return matchesFilter && searchable.includes(query);
  });

  const statDefinitions = activeGame.presentation.compendiumStats || [
    { key: 'attack', label: 'ATK', cap: 37 },
    { key: 'magic', label: 'MAG', cap: 37 },
    { key: 'defense', label: 'DEF', cap: 37 },
    { key: 'agility', label: 'AGI', cap: 37 },
    { key: 'luck', label: 'LUC', cap: 37 },
  ];

  $('#compendium-grid').innerHTML = demons.length ? demons.map((demon) => {
    const baseStats = demonBaseStats(demon);
    const innateSkills = demonInnateSkills(demon);
    const futureSkills = demonFutureSkills(demon);
    return `
      <article class="compendium-card">
        <div class="compendium-card__visual" style="--c1:${demon.palette[0]};--c2:${demon.palette[1]}">
          <span>${demon.glyph}</span>
          <small>No. ${String(Object.keys(DEMONS).indexOf(demon.id) + 1).padStart(3, '0')}</small>
        </div>
        <div class="compendium-card__body">
          <div class="compendium-title">
            <div><small>${escapeHtml(demon.race)}</small><h2>${escapeHtml(demon.name)}</h2></div>
            <span>${activeGame.presentation.levelSelection ? 'Base ' : ''}Lv. ${demonBaseLevel(demon)}</span>
          </div>
          <p>${escapeHtml(demon.blurb || 'Compendium details pending.')}</p>
          <div class="compendium-resources"><span>HP <strong>${baseStats.hp}</strong></span><span>MP <strong>${baseStats.mp}</strong></span></div>
          <div class="stat-pips">
            ${statDefinitions.map(({ key, label, cap }) => `
              <div><span>${label}</span><i><b style="width:${Math.min(100, baseStats[key] / cap * 100)}%"></b></i><strong>${baseStats[key]}</strong></div>
            `).join('')}
          </div>
          <div class="skill-tags">
            ${innateSkills.map((id) => `<span style="--tag-color:${ELEMENTS[SKILLS[id].element].color}">${ELEMENTS[SKILLS[id].element].icon} ${escapeHtml(SKILLS[id].name)}</span>`).join('')}
            ${futureSkills.map(({ skillId, level }) => `<span class="is-future" style="--tag-color:${ELEMENTS[SKILLS[skillId].element].color}">${ELEMENTS[SKILLS[skillId].element].icon} ${escapeHtml(SKILLS[skillId].name)} · Lv. ${level}</span>`).join('')}
          </div>
        </div>
      </article>`;
  }).join('') : '<div class="empty-results"><span>⌕</span><h2>No entries found</h2><p>Try another race or search term.</p></div>';
}

function renderRulesPage() {
  $('#rules-profile-label').textContent = `${activeGame.family} · data v${activeGame.dataVersion}`;
  $('#rules-title').textContent = activeGame.name;
  $('#rules-description').textContent = activeGame.description;
  $('#rules-layout').innerHTML = activeGame.presentation.rules.map((rule, index) => `
    <article class="rule-card${index === 0 ? ' rule-card--feature' : ''}">
      <span class="rule-number">${String(index + 1).padStart(2, '0')}</span>
      <h2>${escapeHtml(rule.title)}</h2>
      <p>${escapeHtml(rule.body)}</p>
    </article>
  `).join('');

  $('#affinity-legend').innerHTML = `
    <div><span class="eyebrow">Affinity language</span><h2>Read the outcome</h2></div>
    ${Object.entries(AFFINITIES).map(([id, affinity]) => `
      <div class="legend-item affinity-${id}"><span>${affinity.rank > 0 ? '◆' : affinity.rank < 0 ? '!' : '○'}</span><strong>${escapeHtml(affinity.label)}</strong><small>${escapeHtml(affinity.description || 'Game-defined interaction')}</small></div>
    `).join('')}`;
}

async function copyBattleLog() {
  if (!engine) return showToast('There is no battle log to copy.');
  const text = engine.state.events.map((event) => `[Round ${event.round}] ${event.text}`).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    showToast('Battle log copied to clipboard.');
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    showToast('Battle log copied to clipboard.');
  }
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  $('#toast-region').append(toast);
  window.setTimeout(() => toast.classList.add('is-visible'), 10);
  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 250);
  }, 2600);
}

function playTone(tone) {
  if (!soundEnabled) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const frequency = tone === 'negative' || tone === 'damage' ? 150 : tone === 'positive' ? 520 : 300;
    oscillator.type = tone === 'negative' ? 'sawtooth' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.25, audioContext.currentTime + 0.08);
    gain.gain.setValueAtTime(0.035, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.1);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.11);
  } catch {
    soundEnabled = false;
  }
}

setup();
