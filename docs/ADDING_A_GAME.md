# Adding a game profile

Each game is a self-contained package under `public/games/<game-id>/`. Do not put title-specific stats or mechanics in the framework or UI.

## Recommended layout

```text
public/games/example-game/
  index.js                 Profile manifest
  ruleset.js               Turn flow, actions, formulas, AI, and victory rules
  data/
    combat-types.js        Elements and affinity outcomes used by this title
    demons.js              Title-specific demon levels, stats, affinities, and skills
    skills.js              Title-specific skill records
    teams.js               Available roster, defaults, and local opponent presets
```

It is safe—and expected—for the same demon or skill to have different records in different game folders. If a catalog becomes large, split `demons.js` into alphabetical or race-based modules and merge them from a small `data/demons/index.js` barrel.

## Profile manifest

Call `defineGame()` from `public/framework/game-definition.js`. A profile provides:

- Stable `id`, display metadata, and `dataVersion`
- A `Ruleset` constructor
- Its own elements, affinities, configuration, and data catalogs
- A default team, selectable roster, and opponent presets
- Presentation metadata for the compatible UI adapter
- An optional game-specific `validateData()` function

`defineGame()` verifies ids and all demon, skill, element, roster, and opponent references. It then deeply freezes the source definition. Battle state always uses runtime copies, so one match cannot corrupt later matches.

Finally, import and register the profile in `public/games/registry.js`. It will automatically appear in the setup selector.

## Ruleset contract

The generic `BattleEngine` owns only the selected profile, reproducible random-number generator, and event stream. It delegates mechanics to these methods:

```js
class ExampleRuleset {
  constructor(engine) {}
  createInitialState(options) {}
  onBattleStart(options) {}
  act(side, action) {}
  chooseAiAction() {}
}
```

The current `active-stock-v1` presentation adapter also calls:

```js
active(side)
living(side)
affinityFor(combatant, element)
canPay(combatant, skill)
```

A ruleset decides all other behavior, including:

- Sequential, round-based, timeline, or Press Turn action economies
- Party size, active slots, formation, and switching
- Physical/magical formulas, accuracy, criticals, and variance
- HP/MP or alternative resources
- Buff stacks and durations
- Ailments, resistances, instant death, shields, and counters
- Target selection and multi-target effects
- Negotiation, demon summoning, items, transformations, or limit systems
- AI decisions and victory conditions

Every initial state must contain an `events` array. Use `engine.addEvent(type, text, details)` so logs, animations, replays, and future network synchronization can consume the same structured event stream.

## UI adapters

`Prototype 00` uses `presentation.adapter: "active-stock-v1"`. Profiles with a similar one-active-unit party structure can reuse it. A game with materially different presentation needs should add another adapter rather than adding game-id conditionals throughout `app.js`.

The long-term boundary is:

```text
Game data → Ruleset → BattleEngine events/state → Presentation adapter
```

This keeps source data, simulation mechanics, and rendering independently replaceable.
