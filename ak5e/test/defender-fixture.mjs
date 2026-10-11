/** Emulates Foundry's force-replace keys ("==name") used by the Reaction store. */
function forceKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key.replace(/^==/, ""), forceKeys(entry)]));
}
function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  if (last.startsWith("-=")) delete target[last.slice(2)];
  else target[last] = forceKeys(structuredClone(value));
}
export function fixture({ level = 12, branch = null, res = null, enabled = true, owner = true } = {}) {
  const actor = {
    id: "def", uuid: "Actor.def", documentName: "Actor", type: "character", name: "Defender", isOwner: owner,
    flags: { ak5e: { defender: { version: 1, enabled, operations: [], events: [], uses: {}, rulings: {} },
      resourcePools: res === null ? {} : { resilience: { value: res } } } },
    system: { abilities: { str: { value: 18, mod: 4 }, con: { value: 16, mod: 3 } }, attributes: { prof: 4, movement: { walk: 30 }, hp: { value: 50, max: 80, temp: 0 } } },
    items: new Map(), writes: [],
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    getActiveTokens() { return []; }, getRollData() { return {}; },
    async update(changes) { this.writes.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; }
  };
  const get = { getFlag(s, k) { return this.flags?.[s]?.[k]; } };
  actor.items.set("class", { id: "class", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-defender" } }, ...get });
  if (branch) actor.items.set("branch", { id: "branch", type: "subclass", system: {}, flags: { ak5e: { chapterThreeId: `subclass-defender-${branch}` } }, ...get });
  return actor;
}
export function world(combat = null) {
  const documents = new Map();
  globalThis.game = { user: { id: "player", isGM: false, targets: new Set() }, combat, time: { worldTime: 0 },
    settings: { get: () => false }, actors: new Map(), scenes: new Map(), users: [], messages: [] };
  globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => documents.get(uuid) ?? null;
  globalThis.foundry = { utils: { randomID: () => "random-operation" } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => { const message = { ...data, getFlag(scope, key) { return this.flags?.[scope]?.[key]; } }; game.messages.push(message); return message; } } };
  globalThis.Hooks = { on() {} };
  return documents;
}

export const setup = actor => {
  actor.effects = new Map(); actor.created = [];
  actor.createEmbeddedDocuments = async (type, data) => {
    const docs = data.map((entry, i) => ({ ...structuredClone(entry), id: `fx${actor.effects.size + i}`, type,
      getFlag(s, k) { return this.flags?.[s]?.[k]; }, async delete() { actor.effects.delete(this.id); }, async update(changes) { for (const [k, v] of Object.entries(changes)) { if (k.startsWith("flags.")) setPath(this, k, v); else this[k] = v; } } }));
    docs.forEach(d => actor.effects.set(d.id, d)); actor.created.push(...docs); return docs;
  };
  return actor;
};

