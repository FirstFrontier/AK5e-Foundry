/** Test fixture helper for Guard tests. Emulates Actor, World, and Foundry globals. */

function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  if (last.startsWith("-=")) delete target[last.slice(2)];
  else target[last] = structuredClone(value);
}

export function guardFixture({ level = 5, branch = null, aggression = 4, unrelenting = 1, enabled = true, owner = true } = {}) {
  const actor = {
    id: "guard1",
    uuid: "Actor.guard1",
    documentName: "Actor",
    type: "character",
    name: "Guard",
    isOwner: owner,
    flags: {
      ak5e: {
        guard: { version: 1, enabled, operations: [], events: [], uses: {}, rulings: {} },
        resourcePools: {
          aggression: { value: aggression, max: 4 },
          unrelenting: { value: unrelenting, max: 1 }
        }
      }
    },
    system: {
      abilities: { str: { value: 18, mod: 4 }, dex: { value: 14, mod: 2 }, con: { value: 16, mod: 3 }, cha: { value: 12, mod: 1 } },
      attributes: { prof: 3, movement: { walk: 30 }, hp: { value: 45, max: 45, temp: 0 } },
      skills: { itm: { value: 1, total: 4, mod: 4 } }
    },
    items: new Map(),
    writes: [],
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    getActiveTokens() { return []; },
    getRollData() { return {}; },
    testUserPermission() { return true; },
    async update(changes) {
      this.writes.push(structuredClone(changes));
      for (const [path, value] of Object.entries(changes)) setPath(this, path, value);
      return this;
    }
  };

  const get = { getFlag(s, k) { return this.flags?.[s]?.[k]; } };
  actor.items.set("class", {
    id: "class",
    type: "class",
    name: "Guard",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: "class-guard" } },
    ...get
  });

  if (branch) {
    actor.items.set("branch", {
      id: "branch",
      type: "subclass",
      name: `Guard: ${branch.charAt(0).toUpperCase() + branch.slice(1)}`,
      system: {},
      flags: { ak5e: { chapterThreeId: `subclass-guard-${branch}` } },
      ...get
    });
  }

  actor.effects = new Map();
  actor.created = [];
  actor.createEmbeddedDocuments = async (type, data) => {
    const docs = data.map((entry, i) => ({
      ...structuredClone(entry),
      id: `it${actor.items.size + i}`,
      type,
      getFlag(s, k) { return this.flags?.[s]?.[k]; },
      async delete() { actor.items.delete(this.id); },
      async update(changes) {
        for (const [k, v] of Object.entries(changes)) {
          if (k.startsWith("flags.")) setPath(this, k, v);
          else this[k] = v;
        }
      }
    }));
    docs.forEach(d => actor.items.set(d.id, d));
    actor.created.push(...docs);
    return docs;
  };

  return actor;
}

export function world(combat = null) {
  const documents = new Map();
  globalThis.game = {
    user: { id: "player", isGM: false, targets: new Set() },
    combat,
    time: { worldTime: 0 },
    settings: { get: () => false },
    i18n: { localize: s => s, format: (s, d) => s },
    actors: new Map(),
    scenes: new Map(),
    users: [],
    messages: []
  };
  globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => documents.get(uuid) ?? null;
  globalThis.foundry = {
    utils: {
      randomID: () => "rnd-" + Math.random().toString(36).slice(2, 8),
      flattenObject(obj) {
        const out = {};
        const walk = (v, prefix) => {
          if (v && typeof v === "object" && !Array.isArray(v)) {
            for (const [k, val] of Object.entries(v)) walk(val, prefix ? `${prefix}.${k}` : k);
          } else out[prefix] = v;
        };
        walk(obj, "");
        return out;
      },
      hasProperty(obj, path) {
        return path.split(".").reduce((v, k) => v?.[k], obj) !== undefined;
      }
    }
  };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.ChatMessage = {
    implementation: {
      getSpeaker: () => ({}),
      create: async data => {
        const message = {
          ...data,
          getFlag(scope, key) { return this.flags?.[scope]?.[key]; }
        };
        game.messages.push(message);
        return message;
      }
    }
  };
  globalThis.Hooks = { on() {}, off() {} };
  return documents;
}
