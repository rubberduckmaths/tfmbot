# TFMBot

The web client behind **[tfmbot.com](https://tfmbot.com/)**: play Terraforming Mars against TFMBot, a
search-based AI, on a 3D globe of Mars (or a flat 2D map on small screens).

- The **rules engine** is written in C and runs in your browser as WebAssembly (`web/wasm/`, prebuilt).
- **TFMBot** runs on the tfmbot.com server; the client sends it the game position and gets its move back.
- Everything you see is plain JavaScript modules on top of [three.js](https://threejs.org/), with no
  framework and no build step in development.

A fan-made project, not affiliated with FryxGames. *Terraforming Mars* is a trademark of FryxGames.

## Run it

Requires Node.js 20+.

```bash
npm install
npm start          # http://127.0.0.1:8080/
```

`npm start` serves `web/` as it is and forwards the bot's requests to tfmbot.com, so a local copy plays
the same TFMBot as the site. Edit a file, reload the page.

To host a copy elsewhere (GitHub Pages, any static host), build it and point the page at the hosted bot:

```bash
npm run build      # -> dist/
```

then set `<meta name="tfmbot-api" content="https://tfmbot.com/api/">` in `dist/index.html`. The bot and the
win-chance meter accept requests from other sites. Please be kind to the server: the bot's search is
real work on real CPUs.

Handy URL flags: `?new` (ignore the saved game), `?fast` (short animations), `?sims=N` (bot strength),
`?map=0|1|2|7` (Tharsis, Hellas, Elysium, Vastitas Borealis Novus), `?board=2d|3d`, `?tiles=standard|varied`,
`?gallery` (every tile type side by side), `?replay=<id>` (watch a recorded game).

## How it fits together

```
web/
  index.html          the page: HUD skeleton, loading screen
  js/
    main.js           entry: error reporting, language, loading screen, then the App
    worker.js         the engine (WebAssembly) in a Web Worker; asks the bot server for TFMBot's moves
    protocol.js       ids of the engine's views: decision kinds, action kinds
    app/              the UI controller (App), split by topic: app.js (message loop, present()),
                      anim.js (fly-bys, animations), hud.js (tracks, player boards, panels), hand.js,
                      log.js, dialogs.js, flows.js (a click -> a legal move), chrome.js (menus, settings)
    board/            the globe (board3d.js), the 2D map (board2d.js), camera, moons, effects
      tiles/          the 3D art of every tile, one file per tile family
    cards/            card faces and their art
    audio/            sound effects and the generative music
    replay/           recording and watching games
    i18n.js           75 languages (web/i18n/), English built in
  css/app.css
  assets/             icons, map textures, music samples
  wasm/               the rules engine (prebuilt)
  i18n/, data/        translations, card texts
tools/                dev server, production build, browser tests
```

Big classes (`App`, `TileArt`) are split across files as mixins (`js/mixin.js`): each file holds one
topic's methods and they all share one object at run time.

## Tests

The browser tests drive a headless Chromium (set `CHROMIUM=/path/to/chrome` if it isn't `/usr/bin/chromium`)
against a running `npm start`:

```bash
npm run check      # the tile gallery and a game start load without errors
npm run e2e        # plays a whole game through the real UI, clicking at random, against the bot
```

## Credits

- Resource, tag and tile icons: the open-source Terraforming Mars app,
  [terraforming-mars/terraforming-mars](https://github.com/terraforming-mars/terraforming-mars) (GPL-3.0).
- Music samples: [VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE) by Versilian Studios (CC0).
- Mars textures: NASA / USGS (public domain); see `web/assets/maps/README.md`.
- [three.js](https://threejs.org/) (MIT), vendored in `web/vendor/`.

## License

GPL-3.0; see [LICENSE](LICENSE).
