// save_migrate.js -- saved games from older engine layouts, re-laid out byte for byte so they load into this build.
// Each step maps one layout to the next; a save is walked through every step after its own layout.
// Layouts are measured from wasm32 builds of the commits named (sizeof / offsetof of TwSession, TfmState, TfmPlayer).

// tfmc a650976 (S163, tfm-web 864d77f): TfmPlayer grew 1208 -> 1216 bytes -- Valley Trust's drawn bonus preludes
// (bonus_preludes_n + bonus_preludes[3]) right after `flags`, its first 1203 bytes unchanged -- in both game states
// the session holds: su.st at 0 and play_tmp (83896 -> 83936). 5 player slots each. The new fields start zeroed:
// "no first action pending", which is what every pre-S163 game had (its first actions ran through pending_first).
const S162 = { sess: 93184, states: [0, 83896], state: 7192, psize: 1208 };
const S163 = { sess: 93264, states: [0, 83936], state: 7232, psize: 1216 };
export const S163_INNER = 292224969;      // tw_layout_inner() of the S163 layout (its saves carry it as meta.inner)
const PKEEP = 1203, MAXP = 5;

function s162to163(old) {
  const out = new Uint8Array(S163.sess);
  let o = 0, n = 0;                                     // read / write positions
  const copy = (len) => { out.set(old.subarray(o, o + len), n); o += len; n += len; };
  for (let k = 0; k < 2; k++) {
    copy(S162.states[k] - o);                           // everything up to this game state
    for (let p = 0; p < MAXP; p++) {
      out.set(old.subarray(o, o + PKEEP), n);           // the player as it was; the new tail stays zero
      o += S162.psize; n += S163.psize;
    }
    copy(S162.state - MAXP * S162.psize);               // the rest of the state (board, deck, globals...)
  }
  copy(S162.sess - o);
  if (o !== S162.sess || n !== S163.sess) throw new Error('s163 migration: bad layout walk');
  return out;
}

// bytes + meta of a save -> { bytes, meta } in the S163-or-later layout, or null if no step applies.
// A pre-S163 save has no meta.inner and is exactly 93184 bytes.
export function migrateSave(bytes, meta = {}) {
  if (meta.inner != null) return { bytes, meta };
  if (bytes.byteLength === S162.sess) return { bytes: s162to163(bytes), meta: { ...meta, inner: S163_INNER, migrated: 's163' } };
  return null;
}
