// mixin.js -- one class, several files: copies the methods of helper classes onto a class's
// prototype, so a big class (App, TileArt) can be split by topic and still be one object at run time.
export function mixin(target, ...sources) {
  for (const S of sources) {
    for (const key of Object.getOwnPropertyNames(S.prototype)) {
      if (key === 'constructor') continue;
      if (Object.hasOwn(target.prototype, key)) throw new Error(`mixin: ${target.name}.${key} is defined twice`);
      Object.defineProperty(target.prototype, key, Object.getOwnPropertyDescriptor(S.prototype, key));
    }
  }
}
