# SMT Showdown

A zero-install, locally hosted battle prototype inspired by the interaction model of Pokemon Showdown and the combat language of Shin Megami Tensei.

This first playable slice is intentionally data-driven. It demonstrates the user experience and a replaceable game-profile layer; it is **not** an attempt to claim that one ruleset represents every SMT title.

## Run it

Requires Node.js 18 or newer. From the project directory, run:

```sh
npm start
```

Then visit <http://localhost:4173/>. Stop the server with `Ctrl+C`.

No `npm install` step is required because the server has no external dependencies. On Windows, `start-showdown.cmd` runs the same command.

Add `?demo` to the URL to bypass team preview with the current default selections.

To use another port in PowerShell:

```powershell
$env:PORT = 8080
npm start
```

The original PowerShell launcher remains available as a fallback:

```powershell
npm run start:powershell
```

No package installation, build step, account, or internet connection is needed.

## Current prototype

- Team preview and selectable player lineup
- Turn-based battle against a lightweight local AI
- Physical, Gun, Fire, Ice, Electric, Force, Light, Dark, and Support skills
- Weak, resist, null, repel, and drain affinities
- A compact Press Turn-inspired bonus-action system
- Critical hits, misses, MP costs, healing, guard, buffs/debuffs, and sleep
- Manual switching, forced switching after a knockout, win/loss states, and rematches
- Battle log, inspector panel, tooltips, responsive layout, and a searchable compendium
- Seedable random number generation, making a match reproducible from its seed

## Project shape

```text
server.mjs    Dependency-free Node development server
public/
  framework/
    battle-engine.js       Mechanics-agnostic battle host
    game-definition.js     Profile contract and data validation
  games/
    registry.js            Installed game profiles
    prototype-00/
      index.js             Profile manifest and configuration
      ruleset.js           Prototype-specific battle mechanics
      data/
        demons.js          Game-specific demon stats and learnsets
        skills.js          Game-specific skill data
        combat-types.js    Elements and affinity outcomes
        teams.js           Rosters and opponent presets
  index.html               Application shell
  styles.css               Responsive visual design
  app.js                   Rendering and interaction layer
```

Each title owns its data and mechanics, so equivalent demons and skills can have completely different values across games without conditionals or collisions. The generic engine delegates state, actions, damage, action economy, ailments, AI, and victory rules to the selected profile.

See [Adding a game profile](docs/ADDING_A_GAME.md) for the extension contract and recommended data layout.

## Scope and assets

This is a fan-made technical prototype. It contains no extracted game assets, music, sprites, or proprietary source code. The abstract sigils and interface are original CSS/HTML.
