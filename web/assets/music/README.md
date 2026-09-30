# Music samples

Recorded orchestral notes for the game's music (`web/js/audio/music_*.js`), from
**VSCO 2: Community Edition** by Versilian Studios (Sam Gossner, Simon Dalzell),
https://github.com/sgossner/VSCO-2-CE, released under **CC0 1.0 Universal**. Thank you.

Each sample was prepared from the VSCO 2 CE recordings offline: trimmed,
pitch-measured, looped, normalised and encoded as 22.05 kHz mono 16-bit FLAC
(lossless: each file was verified to decode bit-exact).
`manifest.json` lists each note: instrument, midi pitch, tuning (cents) and loop
points (seconds). Whenever the samples change, bump `MUSIC_V` in
`web/js/audio/music_bank.js` (browsers and the CDN cache `assets/`).

| file prefix | instrument (VSCO articulation) |
|---|---|
| vln / vla / vc | violin / viola / cello sections, sustain with vibrato, softest layer |
| cb | solo contrabass, sustain non-vibrato |
| hp | concert harp, mf |
| fl | flute, sustain non-vibrato |
| hn | French horn, sustain |
| tbn / tba | tenor trombone / tuba, sustain |
| tmp | timpani rolls |
| vsp / csp | violin / cello section spiccato |
