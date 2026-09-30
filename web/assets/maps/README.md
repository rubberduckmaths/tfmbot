# Per-map Mars globes

`<key>/` for each board (`tharsis`, `hellas`, `elysium`, `vastitas-borealis-novus`):

| file | what |
|---|---|
| `globe.webp` | 2048×1024 equirectangular colour, in the game's planet frame (board centre = +Z, up = +Y) |
| `globe_h.webp` | 1024×512 height, grey 0..255 = −9..+22 km (MOLA, cleaned of the poster's graticule and print noise; lit as relief by `js/board/terrain_fx.js`) |
| `region.webp` | 2048×2048 azimuthal-equidistant colour about the board centre, radius 62° |
| `region_h.webp` | 1024×1024 height, same projection |
| `globe_1k.webp`, `region_1k.webp`, `region_h_1k.webp` | the light set for phones / small screens (1024×512, 1024², 512²) |
| `thumb.jpg` | map-chooser preview (a render of that globe from the home view) |

The textures were baked offline from the public-domain sources below (with
ImageMagick and python3 + numpy). Each map's real region is
placed under its board by a rotation plus a radial zoom fitted to the board's
named spaces (volcanoes, landers, poles), then every named feature is pulled
exactly onto its hex centre: a smooth, fold-free local warp (a flow of small
compactly supported radial-basis steps, fading out a few hexes away) for the
big ones, and a "transplant" for a feature the board spreads much further from
its neighbours than Mars does (VBN's Hecates Tholus and the Uranius group, and
the Viking landing sites): lifted out whole onto its hex, its real spot
cloned over with nearby plains, tone-matched so no seam shows. Colour and
height go through the same mapping.

The textures are served from `assets/`, which browsers and the CDN cache for a
week: whenever the textures change, bump `MAP_TEX_V` in `js/board/layout.js` so players fetch the
new globe.

## Sources and credit

Both sources are public domain (NASA / USGS); they are not shipped, only the
derived textures above.

- **Colour:** Viking MDIM 2.1 colour mosaic (`mdim21_color_1km.jpg`,
  21339×10670, simple cylindrical) — NASA / USGS Astrogeology Science
  Center.
- **Height:** "The Topography of Mars by the Mars Orbiter Laser Altimeter
  (MOLA)" colour-coded map (`mola_topo.jpg`) — NASA / Goddard Space Flight
  Center, MOLA Science Team. Heights are recovered from its colour legend
  (−8..14 km), from the Mercator panel (±70°) and the two polar
  stereographic insets; the poster's graticule, the spikes where the polar
  insets meet the Mercator panel, and its fine print noise are removed
  before the heights are used for relief lighting.

## Loading

`js/board/board3d.js` `setTerrain` fetches only the textures of the map being played, and the globe stays hidden until they are
baked (`board.terrainReady`). Per map: ~0.97 MB on desktop (globe + globe_h +
region + region_h), ~0.37 MB on phones / small screens (innerWidth ×
devicePixelRatio < 1400: globe_1k + globe_h + region_1k + region_h_1k).
