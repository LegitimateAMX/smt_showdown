import { BattleEngine, hpPercent, mpPercent } from './framework/battle-engine.js';
import { DEFAULT_GAME_ID, getGame, listGames } from './games/registry.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const ui = {
  setupModal: $('#setup-modal'),
  setupRoster: $('#setup-roster'),
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
let engine = null;
let activeCommandTab = 'skills';
let interactionLocked = false;
let compendiumFilter = 'All';
let soundEnabled = false;
let audioContext = null;

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
  activeGame = getGame(gameId);
  ELEMENTS = activeGame.elements;
  AFFINITIES = activeGame.affinities;
  DEMONS = activeGame.data.demons;
  SKILLS = activeGame.data.skills;
  PLAYER_ROSTER = activeGame.data.playerRoster;
  OPPONENT_PRESETS = activeGame.data.opponentPresets;
  RULES_PROFILE = activeGame.config;
  selectedTeam = [...activeGame.data.defaultPlayerTeam];
  compendiumFilter = 'All';
  renderOpponentOptions();
  renderSetupRoster();
  renderCompendiumFilters();
  renderCompendium();
  renderRulesPage();
  $('#field-protocol').textContent = activeGame.presentation.fieldProtocol;
}

function renderSetupRoster() {
  ui.setupRoster.innerHTML = PLAYER_ROSTER.map((id) => {
    const demon = DEMONS[id];
    const selectedIndex = selectedTeam.indexOf(id);
    const isSelected = selectedIndex >= 0;
    return `
      <button class="roster-card${isSelected ? ' is-selected' : ''}" data-roster-id="${id}" type="button" aria-pressed="${isSelected}">
        <span class="mini-sigil" style="--c1:${demon.palette[0]};--c2:${demon.palette[1]}">${demon.glyph}</span>
        <span class="roster-card__copy">
          <small>${escapeHtml(demon.race)} · Lv. ${demon.level}</small>
          <strong>${escapeHtml(demon.name)}</strong>
          <span>${demon.skills.slice(0, 2).map((skillId) => SKILLS[skillId].name).join(' · ')}</span>
        </span>
        <span class="selection-order">${isSelected ? selectedIndex + 1 : '+'}</span>
      </button>
    `;
  }).join('');

  ui.selectionCounter.textContent = `${selectedTeam.length} / ${RULES_PROFILE.maxTeamSize} selected`;
  ui.startBattle.disabled = selectedTeam.length !== RULES_PROFILE.maxTeamSize;
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
    const skillButton = event.target.closest('[data-skill-id]');
    const switchButton = event.target.closest('[data-switch-index]');
    if (skillButton) issuePlayerAction({ type: 'skill', skillId: skillButton.dataset.skillId });
    if (switchButton) issuePlayerAction({ type: 'switch', index: Number(switchButton.dataset.switchIndex) });
    if (event.target.closest('[data-action="guard"]')) issuePlayerAction({ type: 'guard' });
    if (event.target.closest('[data-action="rematch"]')) startBattle();
    if (event.target.closest('[data-action="new-team"]')) openSetup();
  });

  $('#player-party-list').addEventListener('click', (event) => {
    if (!event.target.closest('.party-member')) return;
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
    const number = Number(event.key);
    if (!engine || number < 1 || number > 4 || interactionLocked || engine.state.phase !== 'player') return;
    const actor = engine.active('player');
    const skillId = actor.skills[number - 1];
    if (skillId) issuePlayerAction({ type: 'skill', skillId });
  });
}

function navigate(viewName) {
  $$('.view').forEach((view) => view.classList.toggle('is-active', view.id === `${viewName}-view`));
  $$('.nav-item').forEach((button) => button.classList.toggle('is-active', button.dataset.view === viewName));
  window.history.replaceState(null, '', `#${viewName}`);
  if (viewName === 'compendium') renderCompendium();
}

function openSetup() {
  ui.setupModal.classList.add('is-open');
  ui.setupModal.removeAttribute('aria-hidden');
  renderSetupRoster();
  window.setTimeout(() => $('[data-roster-id]', ui.setupRoster)?.focus(), 50);
}

function startBattle() {
  const opponent = OPPONENT_PRESETS.find((preset) => preset.id === ui.opponentPreset.value) || OPPONENT_PRESETS[0];
  engine = new BattleEngine({
    game: activeGame,
    playerTeam: selectedTeam,
    enemyTeam: opponent.team,
    seed: ui.battleSeed.value.trim() || makeSeed(),
    opponentName: opponent.name,
  });
  interactionLocked = false;
  activeCommandTab = 'skills';
  $$('.command-tab').forEach((tab) => {
    const active = tab.dataset.commandTab === 'skills';
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
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

  renderCombatant('player', player);
  renderCombatant('enemy', enemy);
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
  $('#player-party-list').innerHTML = state.teams.player.map((member, index) => {
    const active = state.active.player === index;
    return `
      <button class="party-member${active ? ' is-active' : ''}${member.fainted ? ' is-fainted' : ''}" type="button" ${member.fainted ? 'disabled' : ''}>
        <span class="mini-sigil" style="--c1:${member.palette[0]};--c2:${member.palette[1]}">${member.glyph}</span>
        <span class="party-member__body">
          <span><strong>${escapeHtml(member.name)}</strong><small>${active ? 'Active' : member.fainted ? 'Down' : 'Reserve'}</small></span>
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
        <button class="guard-button" data-action="guard" type="button" ${disabled ? 'disabled' : ''}>
          <span class="skill-icon element-support">◇</span>
          <span><strong>Guard</strong><small>Halve incoming damage until your next action</small></span>
          <span class="skill-cost">No cost</span>
        </button>
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
  const affinity = skill.kind === 'damage' ? engine.affinityFor(target, skill.element) : null;
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
  return `
    <div class="analysis-grid">
      <div class="analysis-unit">
        <span class="eyebrow">Active comparison</span>
        <div class="stat-compare">
          ${['attack', 'magic', 'defense', 'agility', 'luck'].map((stat) => `
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
    const combatant = target ? $(`#${target}-combatant`) : null;
    ui.impactBanner.textContent = event.impact;
    ui.impactBanner.className = `impact-banner is-visible impact-banner--${event.tone || 'system'}`;
    if (combatant && ['damage', 'repel', 'status', 'faint'].includes(event.type)) combatant.classList.add('is-hit');
    if (event.type === 'heal' || event.type === 'stage') $(`#${event.side}-combatant`)?.classList.add('is-boosted');
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
    const searchable = `${demon.name} ${demon.race} ${demon.skills.map((id) => SKILLS[id].name).join(' ')}`.toLowerCase();
    return matchesFilter && searchable.includes(query);
  });

  $('#compendium-grid').innerHTML = demons.length ? demons.map((demon) => `
    <article class="compendium-card">
      <div class="compendium-card__visual" style="--c1:${demon.palette[0]};--c2:${demon.palette[1]}">
        <span>${demon.glyph}</span>
        <small>No. ${String(Object.keys(DEMONS).indexOf(demon.id) + 1).padStart(3, '0')}</small>
      </div>
      <div class="compendium-card__body">
        <div class="compendium-title">
          <div><small>${escapeHtml(demon.race)}</small><h2>${escapeHtml(demon.name)}</h2></div>
          <span>Lv. ${demon.level}</span>
        </div>
        <p>${escapeHtml(demon.blurb)}</p>
        <div class="stat-pips">
          ${['attack', 'magic', 'defense', 'agility', 'luck'].map((stat) => `
            <div><span>${stat.slice(0, 3)}</span><i><b style="width:${Math.min(100, demon.stats[stat] * 2.7)}%"></b></i><strong>${demon.stats[stat]}</strong></div>
          `).join('')}
        </div>
        <div class="skill-tags">
          ${demon.skills.map((id) => `<span style="--tag-color:${ELEMENTS[SKILLS[id].element].color}">${ELEMENTS[SKILLS[id].element].icon} ${escapeHtml(SKILLS[id].name)}</span>`).join('')}
        </div>
      </div>
    </article>
  `).join('') : '<div class="empty-results"><span>⌕</span><h2>No entries found</h2><p>Try another race or search term.</p></div>';
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
