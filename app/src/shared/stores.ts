// The stores the app supports, in sidebar order. The single place a new
// integration registers itself: the store id type, the sidebar entries and
// which views get a Library section all derive from this list.
//
// No imports on purpose: the renderer and the sandboxed preload may both pull
// this file in, and the preload can't require npm packages.
//
// `hasLibrary`: whether the app can list games the user owns but hasn't
// installed. Epic can't (no Epic login, by Epic's terms), so its views show
// only the Installed section.
export const STORES = [
  { id: 'steam', name: 'Steam', hasLibrary: true },
  { id: 'epic', name: 'Epic', hasLibrary: false }
] as const satisfies readonly { id: string; name: string; hasLibrary: boolean }[]

export type StoreId = (typeof STORES)[number]['id']

// How a game is identified across stores: `<store>:<id>`. Ids from different
// stores can collide, so the bare id never identifies a game. The renderer's
// card keys and main's saved favorites both use this one spelling.
export function gameKey(store: StoreId, id: string): string {
  return `${store}:${id}`
}
