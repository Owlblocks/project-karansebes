// Must load before Dexie so it picks up this IndexedDB implementation.
import 'fake-indexeddb/auto'

// Tests run in Node rather than jsdom: the storage code only needs
// localStorage from the DOM, and jsdom's File hands back ArrayBuffers from
// its own realm that Node's crypto.subtle rejects.
class MemoryStorage implements Storage {
  #items = new Map<string, string>()
  get length() { return this.#items.size }
  clear() { this.#items.clear() }
  getItem(key: string) { return this.#items.get(key) ?? null }
  key(index: number) { return [...this.#items.keys()][index] ?? null }
  removeItem(key: string) { this.#items.delete(key) }
  setItem(key: string, value: string) { this.#items.set(key, String(value)) }
}
Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })
