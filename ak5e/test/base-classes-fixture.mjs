/**
 * High-fidelity in-memory Foundry document and environment mocks for AK5e base class tests.
 * Provides realistic Actor, Item, ChatMessage, Hooks, ui, game, and foundry.utils simulation
 * that integrates cleanly with resource-pools.mjs and operation-kernel.mjs.
 */

// ---------------------------------------------------------------- Utilities & Path Merger

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const isPlainObject = v => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Set) && !(v instanceof Map);

function forceKeys(value) {
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const cleanKey = k.replace(/^==/, "");
    if (DANGEROUS_KEYS.has(cleanKey)) continue;
    out[cleanKey] = forceKeys(v);
  }
  return out;
}

/**
 * Merges nested objects by dotted path and replaces arrays/primitives.
 * Supports Foundry's "-=key" deletion syntax and "==key" force-replace keys.
 * Guards against prototype pollution and gracefully replaces intermediate primitives.
 */
export function setPropertyByPath(object, path, value) {
  if (!object || typeof object !== "object" || typeof path !== "string" || !path) return;

  let isDelete = false;
  let isForce = false;

  let cleanPath = path;
  if (cleanPath.startsWith("-=")) {
    isDelete = true;
    cleanPath = cleanPath.slice(2);
  } else if (cleanPath.startsWith("==")) {
    isForce = true;
    cleanPath = cleanPath.slice(2);
  }

  const parts = cleanPath.split(".");
  let last = parts.pop();
  if (!last) return;

  if (last.startsWith("-=")) {
    isDelete = true;
    last = last.slice(2);
  } else if (last.startsWith("==")) {
    isForce = true;
    last = last.slice(2);
  }

  if (DANGEROUS_KEYS.has(last)) return;

  let current = object;
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i];
    if (part.startsWith("-=")) {
      part = part.slice(2);
      if (!DANGEROUS_KEYS.has(part)) {
        delete current[part];
      }
      return;
    }
    if (part.startsWith("==")) {
      part = part.slice(2);
      if (DANGEROUS_KEYS.has(part)) return;
      current[part] = {};
      current = current[part];
      continue;
    }
    if (DANGEROUS_KEYS.has(part)) return;
    if (!isPlainObject(current[part])) {
      current[part] = {};
    }
    current = current[part];
  }

  if (isDelete) {
    delete current[last];
  } else if (isForce) {
    current[last] = forceKeys(structuredClone(value));
  } else if (isPlainObject(value) && isPlainObject(current[last])) {
    for (const [k, v] of Object.entries(value)) {
      if (DANGEROUS_KEYS.has(k) || DANGEROUS_KEYS.has(k.replace(/^[-=]{2}/, ""))) continue;
      if (k.startsWith("-=")) {
        const subKey = k.slice(2);
        if (!DANGEROUS_KEYS.has(subKey)) delete current[last][subKey];
      } else if (k.startsWith("==")) {
        const subKey = k.slice(2);
        if (!DANGEROUS_KEYS.has(subKey)) {
          current[last][subKey] = forceKeys(structuredClone(v));
        }
      } else {
        setPropertyByPath(current[last], k, v);
      }
    }
  } else {
    current[last] = forceKeys(structuredClone(value));
  }
}

/**
 * Resolves a value from an object using a dotted path.
 */
export function getPropertyByPath(object, path) {
  if (!object || typeof object !== "object" || typeof path !== "string") return undefined;
  const parts = path.split(".");
  let curr = object;
  for (const part of parts) {
    if (!curr || typeof curr !== "object") return undefined;
    if (DANGEROUS_KEYS.has(part)) return undefined;
    curr = curr[part];
  }
  return curr;
}

/**
 * Lightweight Collection simulating Foundry's Collection (Map with array-like helpers).
 */
export class TestCollection extends Map {
  get(key) {
    return super.get(key);
  }
  getName(name) {
    return this.find(e => e.name === name);
  }
  get contents() {
    return Array.from(this.values());
  }
  find(predicate) {
    for (const val of this.values()) {
      if (predicate(val)) return val;
    }
    return undefined;
  }
  filter(predicate) {
    const res = [];
    for (const val of this.values()) {
      if (predicate(val)) res.push(val);
    }
    return res;
  }
  map(fn) {
    const res = [];
    for (const val of this.values()) {
      res.push(fn(val));
    }
    return res;
  }
  some(predicate) {
    for (const val of this.values()) {
      if (predicate(val)) return true;
    }
    return false;
  }
  every(predicate) {
    for (const val of this.values()) {
      if (!predicate(val)) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------- Item Mock

/**
 * Creates an in-memory Item document mock.
 */
export function createTestItem(data = {}, parent = null) {
  const id = data.id || data._id || globalThis.foundry?.utils?.randomID?.() || `item_${Math.random().toString(36).slice(2, 9)}`;
  const docName = data.documentName || "Item";
  const uuid = parent ? `${parent.uuid}.${docName}.${id}` : `${docName}.${id}`;

  const item = {
    id,
    _id: id,
    uuid,
    documentName: docName,
    type: data.type || "feat",
    name: data.name || "Test Item",
    img: data.img || "icons/svg/item-bag.svg",
    parent,
    flags: {
      ak5e: structuredClone(data.flags?.ak5e ?? {}),
      ...(data.flags ? structuredClone(data.flags) : {})
    },
    system: structuredClone(data.system ?? {}),
    effects: new TestCollection(),
    ownership: structuredClone(data.ownership || (parent ? parent.ownership : { default: 3 })),
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    },
    async setFlag(scope, key, val) {
      return this.update({ [`flags.${scope}.${key}`]: val });
    },
    async unsetFlag(scope, key) {
      return this.update({ [`flags.${scope}.-=${key}`]: null });
    },
    async update(changes, options = {}) {
      for (const [k, v] of Object.entries(changes)) {
        setPropertyByPath(this, k, v);
      }
      return this;
    },
    async createEmbeddedDocuments(type, entries = []) {
      if (type !== "ActiveEffect") return [];
      const created = entries.map(entry => {
        const docId = entry._id || entry.id || globalThis.foundry?.utils?.randomID?.() || `effect_${Math.random().toString(36).slice(2, 9)}`;
        const effect = createTestItem({ ...entry, id: docId, _id: docId, documentName: "ActiveEffect", type: "effect" }, this);
        effect.uuid = `${this.uuid}.ActiveEffect.${docId}`;
        this.effects.set(docId, effect);
        return effect;
      });
      return created;
    },
    async deleteEmbeddedDocuments(type, ids = []) {
      if (type !== "ActiveEffect") return [];
      const removed = [];
      for (const id of ids) {
        const effect = this.effects.get(id);
        if (effect) { removed.push(effect); this.effects.delete(id); }
      }
      return removed;
    },
    async delete(options = {}) {
      if (this.parent?.items?.has(this.id)) {
        this.parent.items.delete(this.id);
      }
      if (this.parent?.effects?.has(this.id)) {
        this.parent.effects.delete(this.id);
      }
      if (this.parent?.created) {
        this.parent.created = this.parent.created.filter(d => d.id !== this.id && d._id !== this.id);
      }
      if (globalThis._ak5eTestDocs) {
        globalThis._ak5eTestDocs.delete(this.uuid);
      }
      return this;
    },
    toObject(source = true) {
      return {
        _id: this._id,
        id: this.id,
        name: this.name,
        type: this.type,
        img: this.img,
        system: structuredClone(this.system ?? {}),
        flags: structuredClone(this.flags ?? {}),
        ownership: structuredClone(this.ownership ?? {}),
        effects: Array.from(this.effects?.values?.() ?? []).map(e => (typeof e.toObject === "function" ? e.toObject(source) : structuredClone(e)))
      };
    }
  };

  for (const effect of data.effects ?? []) {
    const effectId = effect.id || effect._id || globalThis.foundry?.utils?.randomID?.() || `effect_${Math.random().toString(36).slice(2, 9)}`;
    const doc = createTestItem({ ...effect, id: effectId, _id: effectId, documentName: "ActiveEffect", type: "effect" }, item);
    doc.uuid = `${item.uuid}.ActiveEffect.${effectId}`;
    // createTestItem keeps only Item fields; carry the Active Effect's own data across.
    Object.assign(doc, { changes: structuredClone(effect.changes ?? []), disabled: effect.disabled === true, transfer: effect.transfer ?? true });
    item.effects.set(effectId, doc);
  }

  if (globalThis._ak5eTestDocs) {
    globalThis._ak5eTestDocs.set(item.uuid, item);
  }
  return item;
}

// ---------------------------------------------------------------- Actor Mock

const PERMISSION_LEVELS = {
  NONE: 0,
  LIMITED: 1,
  OBSERVER: 2,
  OWNER: 3
};

/**
 * Creates an in-memory Actor document mock with realistic attributes, abilities, items, and flags.
 */
export function createTestActor(data = {}) {
  const id = data.id || data._id || globalThis.foundry?.utils?.randomID?.() || `act_${Math.random().toString(36).slice(2, 9)}`;
  const level = Number(data.level ?? 1);
  const prof = Number(data.prof ?? (2 + Math.floor((Math.max(1, level) - 1) / 4)));
  const owner = data.owner ?? data.isOwner ?? true;
  const isToken = data.token ?? data.isToken ?? false;

  const actor = {
    id,
    _id: id,
    uuid: `Actor.${id}`,
    documentName: "Actor",
    type: data.type || "character",
    name: data.name || "Test Actor",
    img: data.img || "icons/svg/mystery-man.svg",
    isOwner: owner,
    isToken,
    ownership: structuredClone(data.ownership || { default: owner ? 3 : 0 }),
    pack: data.pack ?? null,
    member: data.member ?? true,
    flags: {
      ak5e: structuredClone(data.flags?.ak5e ?? {}),
      ...(data.flags ? structuredClone(data.flags) : {})
    },
    system: {
      abilities: {
        str: { value: 10, mod: 0, ...(data.abilities?.str || {}) },
        dex: { value: 10, mod: 0, ...(data.abilities?.dex || {}) },
        con: { value: 10, mod: 0, ...(data.abilities?.con || {}) },
        int: { value: 10, mod: 0, ...(data.abilities?.int || {}) },
        wis: { value: 10, mod: 0, ...(data.abilities?.wis || {}) },
        cha: { value: 10, mod: 0, ...(data.abilities?.cha || {}) },
      },
      attributes: {
        prof,
        movement: { walk: 30, ...(data.movement || {}) },
        hp: { value: 20, max: 20, temp: 0, ...(data.hp || {}) },
        ...(data.attributes || {})
      },
      details: {
        level,
        ...(data.details || {})
      },
      skills: structuredClone(data.skills || {}),
      ...(data.system || {})
    },
    items: new TestCollection(),
    effects: new TestCollection(),
    writes: [],
    created: [],

    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    },
    async setFlag(scope, key, value) {
      return this.update({ [`flags.${scope}.${key}`]: value });
    },
    async unsetFlag(scope, key) {
      return this.update({ [`flags.${scope}.-=${key}`]: null });
    },
    getActiveTokens() {
      return [];
    },
    getRollData() {
      return {
        ...this.system,
        prof: this.system.attributes.prof,
        flags: this.flags
      };
    },
    testUserPermission(user, permission = "OWNER", { exact = false } = {}) {
      if (user?.isGM) return true;
      if (!user || typeof user !== "object") return false;

      let targetLevel = 3;
      if (typeof permission === "number") {
        targetLevel = permission;
      } else if (typeof permission === "string") {
        const upper = permission.toUpperCase();
        if (upper in PERMISSION_LEVELS) {
          targetLevel = PERMISSION_LEVELS[upper];
        } else if (!isNaN(Number(permission))) {
          targetLevel = Number(permission);
        }
      }

      let userLevel = 0;
      if (this.ownership && user.id && user.id in this.ownership) {
        userLevel = this.ownership[user.id];
      } else if (this.ownership && "default" in this.ownership) {
        userLevel = this.ownership.default;
      } else {
        userLevel = this.isOwner ? 3 : 0;
      }

      if (typeof userLevel === "boolean") {
        userLevel = userLevel ? 3 : 0;
      } else {
        userLevel = Number(userLevel) || 0;
      }

      return exact ? userLevel === targetLevel : userLevel >= targetLevel;
    },
    async update(changes, options = {}) {
      if (this.blockUpdate) throw new Error("blocked write");
      this.writes.push({ changes: structuredClone(changes), options });
      for (const [path, value] of Object.entries(changes)) {
        setPropertyByPath(this, path, value);
      }
      return this;
    },
    async createEmbeddedDocuments(type, entries = [], options = {}) {
      const createdDocs = entries.map((entry) => {
        const docId = entry._id || entry.id || globalThis.foundry?.utils?.randomID?.() || `emb_${Math.random().toString(36).slice(2, 9)}`;
        const doc = createTestItem({
          ...entry,
          id: docId,
          _id: docId,
          documentName: type,
          type: type === "Item" ? (entry.type || "feat") : (entry.type || type),
          parent: this
        }, this);
        if (type === "ActiveEffect") {
          doc.documentName = "ActiveEffect";
          doc.uuid = `${this.uuid}.ActiveEffect.${docId}`;
        }
        if (type === "Item") {
          this.items.set(docId, doc);
        } else if (type === "ActiveEffect") {
          this.effects.set(docId, doc);
        }
        if (globalThis._ak5eTestDocs) {
          globalThis._ak5eTestDocs.set(doc.uuid, doc);
        }
        return doc;
      });
      this.created.push(...createdDocs);
      return createdDocs;
    },
    async updateEmbeddedDocuments(type, updates = [], options = {}) {
      const collection = type === "Item" ? this.items : (type === "ActiveEffect" ? this.effects : null);
      if (!collection) return [];
      const updated = [];
      for (const update of updates) {
        const id = update._id || update.id;
        const doc = collection.get(id);
        if (doc) {
          await doc.update(update, options);
          updated.push(doc);
        }
      }
      return updated;
    },
    async deleteEmbeddedDocuments(type, ids = [], options = {}) {
      const collection = type === "Item" ? this.items : (type === "ActiveEffect" ? this.effects : null);
      if (!collection) return [];
      const deleted = [];
      for (const docId of ids) {
        if (collection.has(docId)) {
          const doc = collection.get(docId);
          collection.delete(docId);
          if (globalThis._ak5eTestDocs) globalThis._ak5eTestDocs.delete(doc.uuid);
          this.created = this.created.filter(d => d.id !== docId && d._id !== docId);
          deleted.push(doc);
        }
      }
      return deleted;
    },
    toObject(source = true) {
      return {
        _id: this._id,
        id: this.id,
        name: this.name,
        type: this.type,
        img: this.img,
        system: structuredClone(this.system ?? {}),
        flags: structuredClone(this.flags ?? {}),
        ownership: structuredClone(this.ownership ?? {}),
        items: Array.from(this.items?.values?.() ?? []).map(i => (typeof i.toObject === "function" ? i.toObject(source) : structuredClone(i))),
        effects: Array.from(this.effects?.values?.() ?? []).map(e => (typeof e.toObject === "function" ? e.toObject(source) : structuredClone(e)))
      };
    }
  };

  // Recalculate ability modifiers based on values if not explicitly set
  for (const [k, ability] of Object.entries(actor.system.abilities)) {
    if (ability.mod === 0 && ability.value !== 10) {
      ability.mod = Math.floor((ability.value - 10) / 2);
    }
  }

  // Pre-seed class item if data.class is specified
  if (data.class) {
    const rawClass = String(data.class);
    const cleanSlug = rawClass.toLowerCase().replace(/^class-/, "");
    const className = cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1);
    const classId = `class-${cleanSlug}`;
    const classItem = createTestItem({
      id: "class_item",
      _id: "class_item",
      type: "class",
      name: className,
      system: { levels: level },
      flags: { ak5e: { chapterThreeId: classId } },
      parent: actor
    }, actor);
    actor.items.set(classItem.id, classItem);
  }

  // Pre-seed subclass/branch item if data.branch is specified
  if (data.branch) {
    const rawBranch = String(data.branch);
    const branchSlug = rawBranch.toLowerCase().replace(/^subclass-[a-z]+-/, "");
    const branchName = branchSlug.charAt(0).toUpperCase() + branchSlug.slice(1);
    const classSlug = (data.class ? String(data.class).toLowerCase().replace(/^class-/, "") : "class");
    const branchId = `subclass-${classSlug}-${branchSlug}`;
    const branchItem = createTestItem({
      id: "branch_item",
      _id: "branch_item",
      type: "subclass",
      name: branchName,
      system: {},
      flags: { ak5e: { chapterThreeId: branchId } },
      parent: actor
    }, actor);
    actor.items.set(branchItem.id, branchItem);
  }

  // Seed additional items if provided
  if (Array.isArray(data.items)) {
    for (const itemData of data.items) {
      const sourceItem = typeof itemData?.toObject === "function" ? itemData.toObject() : itemData;
      const it = createTestItem(sourceItem, actor);
      actor.items.set(it.id, it);
    }
  }

  // Register in global registry if present
  if (globalThis._ak5eTestDocs) {
    globalThis._ak5eTestDocs.set(actor.uuid, actor);
  }
  if (globalThis.game?.actors) {
    globalThis.game.actors.set(actor.id, actor);
  }

  return actor;
}

// ---------------------------------------------------------------- Global Environment Setup

let savedGlobals = null;

/**
 * Sets up in-memory Foundry VTT globals (game, foundry, Hooks, ChatMessage, ui, CONFIG, Roll).
 */
export function setupFoundryGlobals(options = {}) {
  if (!savedGlobals) {
    savedGlobals = {
      game: globalThis.game,
      CONFIG: globalThis.CONFIG,
      foundry: globalThis.foundry,
      ChatMessage: globalThis.ChatMessage,
      Hooks: globalThis.Hooks,
      ui: globalThis.ui,
      fromUuidSync: globalThis.fromUuidSync,
      fromUuid: globalThis.fromUuid,
      Roll: globalThis.Roll,
      _ak5eTestDocs: globalThis._ak5eTestDocs
    };
  }

  const docs = new Map();
  globalThis._ak5eTestDocs = docs;

  const hooks = new Map();
  globalThis.Hooks = {
    _hooks: hooks,
    on(name, fn) {
      hooks.set(name, [...(hooks.get(name) ?? []), fn]);
      return fn;
    },
    off(name, fn) {
      const list = hooks.get(name) ?? [];
      const idx = list.indexOf(fn);
      if (idx !== -1) list.splice(idx, 1);
    },
    once(name, fn) {
      const wrapper = (...args) => {
        this.off(name, wrapper);
        return fn(...args);
      };
      this.on(name, wrapper);
      return wrapper;
    },
    call(name, ...args) {
      const list = hooks.get(name) ?? [];
      for (const fn of list) fn(...args);
      return true;
    },
    async callAll(name, ...args) {
      const list = hooks.get(name) ?? [];
      const results = list.map(fn => fn(...args));
      await Promise.all(results);
      return true;
    }
  };

  const gmUser = options.gmUser || { id: "gm", name: "Gamemaster", isGM: true, targets: new Set() };
  const playerUser = options.playerUser || { id: "player", name: "Player", isGM: false, targets: new Set() };
  const defaultUser = options.user || (options.isGM === false ? playerUser : gmUser);

  const usersMap = new TestCollection();
  usersMap.set(gmUser.id, gmUser);
  usersMap.set(playerUser.id, playerUser);
  if (Array.isArray(options.users)) {
    for (const u of options.users) usersMap.set(u.id, u);
  }

  const activeGM = options.activeGM !== undefined ? options.activeGM : gmUser;
  Object.defineProperty(usersMap, "activeGM", {
    get() { return activeGM; },
    configurable: true,
    enumerable: true
  });

  const actorsCollection = new TestCollection();
  const messages = [];
  messages.get = function(id) {
    return this.find(m => m.id === id || m._id === id) ?? null;
  };

  globalThis.game = {
    user: defaultUser,
    users: usersMap,
    combats: options.combats || [],
    combat: options.combat || null,
    time: { worldTime: options.worldTime ?? 100 },
    i18n: {
      localize: (key) => options.translations?.[key] ?? key,
      format: (key, data = {}) => {
        let text = options.translations?.[key] ?? key;
        for (const [k, v] of Object.entries(data)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v);
        }
        return text;
      }
    },
    settings: {
      get: (ns, key) => options.settings?.[`${ns}.${key}`] ?? false,
      set: (ns, key, val) => {
        options.settings ??= {};
        options.settings[`${ns}.${key}`] = val;
      }
    },
    actors: actorsCollection,
    messages,
    scenes: new Map()
  };

  globalThis.foundry = {
    utils: {
      randomID(len = 16) {
        return "rnd_" + Math.random().toString(36).slice(2, 2 + len);
      },
      flattenObject(obj) {
        const out = {};
        const walk = (v, prefix) => {
          if (v && typeof v === "object" && !Array.isArray(v)) {
            for (const [k, val] of Object.entries(v)) {
              walk(val, prefix ? `${prefix}.${k}` : k);
            }
          } else {
            out[prefix] = v;
          }
        };
        walk(obj, "");
        return out;
      },
      hasProperty(obj, path) {
        if (!obj || typeof path !== "string") return false;
        return path.split(".").reduce((curr, key) => (curr && typeof curr === "object" && key in curr ? curr[key] : undefined), obj) !== undefined;
      },
      getProperty(obj, path) {
        return getPropertyByPath(obj, path);
      },
      setProperty(obj, path, value) {
        setPropertyByPath(obj, path, value);
      },
      mergeObject(target, source, opts = {}) {
        for (const [k, v] of Object.entries(source || {})) {
          setPropertyByPath(target, k, v);
        }
        return target;
      },
      duplicate(v) {
        return structuredClone(v);
      },
      isObjectEmpty(obj) {
        return Object.keys(obj || {}).length === 0;
      }
    }
  };

  globalThis.ui = {
    notifications: {
      warn: (msg) => { options.onWarn?.(msg); },
      error: (msg) => { options.onError?.(msg); },
      info: (msg) => { options.onInfo?.(msg); }
    }
  };

  globalThis.fromUuidSync = (uuid) => docs.get(uuid) ?? null;
  globalThis.fromUuid = async (uuid) => docs.get(uuid) ?? null;

  globalThis.CONFIG = {
    DND5E: {
      restTypes: {
        short: { recoverPeriods: ["sr"] },
        long: { recoverPeriods: ["lr", "sr"] }
      }
    },
    Dice: options.Dice || {}
  };

  globalThis.Roll = class MockRoll {
    constructor(formula, data = {}) {
      this.formula = formula;
      this.data = data;
      this.total = null;
    }
    async evaluate() {
      if (options.rollEvaluator) {
        this.total = options.rollEvaluator(this.formula, this.data);
      } else {
        this.total = 4;
      }
      return this;
    }
    async toMessage(messageData = {}) {
      return ChatMessage.implementation.create({
        ...messageData,
        content: `Roll [${this.formula}]: ${this.total}`
      });
    }
  };

  globalThis.ChatMessage = {
    implementation: {
      getSpeaker({ actor, scene, alias } = {}) {
        return {
          actor: actor?.id,
          alias: alias || actor?.name
        };
      },
      create: async (data, opts = {}) => {
        const id = data.id || data._id || globalThis.foundry.utils.randomID();
        const message = {
          id,
          _id: id,
          uuid: `ChatMessage.${id}`,
          author: game.user,
          ...structuredClone(data),
          flags: structuredClone(data.flags || {}),
          getFlag(scope, key) {
            return this.flags?.[scope]?.[key];
          },
          async setFlag(scope, key, val) {
            return this.update({ [`flags.${scope}.${key}`]: val });
          },
          async update(changes) {
            for (const [k, v] of Object.entries(changes)) {
              setPropertyByPath(this, k, v);
            }
            return this;
          }
        };
        game.messages.push(message);
        return message;
      }
    }
  };

  return {
    game: globalThis.game,
    docs,
    hooks,
    users: usersMap,
    teardown: teardownFoundryGlobals
  };
}

/**
 * Restores original global variables and clears test document registry.
 */
export function teardownFoundryGlobals() {
  if (savedGlobals) {
    globalThis.game = savedGlobals.game;
    globalThis.CONFIG = savedGlobals.CONFIG;
    globalThis.foundry = savedGlobals.foundry;
    globalThis.ChatMessage = savedGlobals.ChatMessage;
    globalThis.Hooks = savedGlobals.Hooks;
    globalThis.ui = savedGlobals.ui;
    globalThis.fromUuidSync = savedGlobals.fromUuidSync;
    globalThis.fromUuid = savedGlobals.fromUuid;
    globalThis.Roll = savedGlobals.Roll;
    globalThis._ak5eTestDocs = savedGlobals._ak5eTestDocs;
    savedGlobals = null;
  }
}

// ---------------------------------------------------------------- Rest & Combat Helpers

/**
 * Triggers a short rest for an Actor via the dnd5e.restCompleted hook.
 */
export async function triggerShortRest(actor, options = {}) {
  const result = options.result ?? { dh: 0, hp: 0 };
  const config = { type: "short", ...options.config };
  if (globalThis.Hooks?.callAll) {
    await globalThis.Hooks.callAll("dnd5e.restCompleted", actor, result, config);
  }
  return { actor, result, config };
}

/**
 * Triggers a long rest for an Actor via the dnd5e.restCompleted hook.
 */
export async function triggerLongRest(actor, options = {}) {
  const result = options.result ?? { dh: 0, hp: 0 };
  const config = { type: "long", ...options.config };
  if (globalThis.Hooks?.callAll) {
    await globalThis.Hooks.callAll("dnd5e.restCompleted", actor, result, config);
  }
  return { actor, result, config };
}

let combatSequence = 0;

/**
 * Creates an in-memory Combat document mock for testing combat hooks and turn events.
 */
export function createTestCombat(actors = [], options = {}) {
  const id = options.id || `combat_${++combatSequence}`;
  const turns = actors.map((a, idx) => ({
    id: `combatant_${idx}`,
    actor: a,
    initiative: 10 + idx
  }));
  const combatantsMap = new TestCollection(turns.map(t => [t.id, t]));
  const combat = {
    id,
    uuid: `Combat.${id}`,
    round: options.round ?? 0,
    turn: options.turn ?? null,
    started: options.started ?? false,
    turns,
    combatants: combatantsMap,
    previous: { round: 0, turn: null, combatantId: null },
    current: { round: 0, turn: null, combatantId: null },
    start() {
      this.started = true;
      this.round = 1;
      this.turn = 0;
      this.current = { round: 1, turn: 0, combatantId: turns[0]?.id ?? null };
      return this;
    },
    nextTurn() {
      this.previous = { ...this.current };
      let nextTurn = (this.turn ?? -1) + 1;
      let nextRound = this.round;
      if (nextTurn >= turns.length) {
        nextTurn = 0;
        nextRound++;
      }
      this.round = nextRound;
      this.turn = nextTurn;
      this.current = { round: nextRound, turn: nextTurn, combatantId: turns[nextTurn]?.id ?? null };
      return this;
    }
  };
  for (const t of turns) t.parent = combat;
  return combat;
}

/**
 * Compatibility helper matching guard-fixture/defender-fixture world() signature.
 */
export function world(combat = null) {
  const res = setupFoundryGlobals({ combat });
  return res.docs;
}

/**
 * Compatibility helper matching fixture() signature.
 */
export function fixture(options = {}) {
  return createTestActor(options);
}
