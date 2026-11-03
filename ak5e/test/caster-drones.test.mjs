import test from "node:test";
import assert from "node:assert/strict";
import {
  createCasterDrone, droneAttackGate, droneData, droneInRange, droneStatistics,
  linkCasterDrone, syncCasterDrones
} from "../scripts/caster-drones.mjs";
import { casterDroneOrigin, droneOriginWarnings } from "../scripts/caster-casting.mjs";
import { casterCommand } from "../scripts/caster-features.mjs";
import { handleDroneRelay, requestCasterDrone } from "../scripts/caster-mech.mjs";
import { previewUndo } from "../scripts/caster-primal-splash.mjs";

const setPath = (object, path, value) => {
  const parts = path.split("."), last = parts.pop(); let current = object;
  for (const part of parts) current = current[part] ??= {};
  current[last] = structuredClone(value);
};
const getFlag = (document, key) => document.flags?.ak5e?.[key];
function documentWithFlags(data, documentName = "Actor") {
  return {
    ...structuredClone(data), documentName,
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; }
  };
}
function creator({ level = 6, branch = "mech-accord", owner = true, id = "caster" } = {}) {
  const branchId = { core: "subclass-caster-core", mystic: "subclass-caster-mystic", "mech-accord": "subclass-caster-mech-accord" }[branch];
  const actor = {
    id, uuid: `Actor.${id}`, documentName: "Actor", type: "character", name: `Caster ${id}`, isOwner: owner,
    ownership: { default: 0, player: 3 }, flags: { ak5e: {
      casting: { enabled: true, ability: "int" },
      artsPoints: { maximum: 10, value: 8, maximumArtLevel: 3 },
      caster: { enabled: true, choices: { ability: "int" }, rulings: {}, drones: [], casts: [], spends: [], operations: [], turn: {}, uses: {} }
    } },
    system: { abilities: { int: { value: 14, mod: 2 }, wis: { value: 10, mod: 0 }, cha: { value: 10, mod: 0 } },
      attributes: { prof: 2, hp: { value: 30, max: 30, temp: 0 } }, skills: { ak5etech: { value: 1, total: 5 } },
      currency: { cp: 1000 }, bonuses: {} },
    items: new Map(), effects: new Map(), tokens: [],
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    getActiveTokens() { return this.tokens; },
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; }
  };
  const classItem = { id: `class-${id}`, type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-caster" } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; } };
  const branchItem = { id: `branch-${id}`, type: "subclass", flags: { ak5e: { chapterThreeId: branchId } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; } };
  actor.items.set(classItem.id, classItem); actor.items.set(branchItem.id, branchItem);
  return actor;
}
function world({ isGM = false } = {}) {
  const documents = new Map();
  const user = { id: isGM ? "gm" : "player", isGM, targets: new Set(), flags: { ak5e: {} }, getFlag, async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; } };
  const users = Object.assign(new Map(), { activeGM: isGM ? user : null });
  if (isGM) users.set(user.id, user);
  let epoch = 0;
  globalThis.game = { user, actors: new Map(), scenes: new Map(), time: { worldTime: 0 }, messages: [], users,
    settings: { get: (_module, key) => key === "encounterEpoch" ? epoch : undefined },
    setTestEpoch(value) { epoch = value; } };
  globalThis.__casterDroneTestDocuments = documents;
  globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => documents.get(uuid) ?? null;
  let random = 0;
  globalThis.foundry = { utils: { randomID: () => `random-${++random}` } };
  globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), async create(data) {
    const message = { ...structuredClone(data), id: `message-${game.messages.length + 1}`, author: user,
      getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
      async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; } };
    game.messages.push(message); return message;
  } } };
  let count = 0;
  globalThis.Actor = { implementation: { async create(data) {
    const doc = documentWithFlags(data);
    doc.id = `drone-${++count}`; doc.uuid = `Actor.${doc.id}`; doc.isOwner = true;
    doc.tokens = [];
    doc.items = new Map();
    for (const itemData of data.items ?? []) {
      const item = documentWithFlags(itemData, "Item"); item.id = itemData.name === "Originium Spark" ? `spark-${doc.id}` : `reaction-${doc.id}`;
      item.parent = doc; item.update = async changes => { for (const [path, value] of Object.entries(changes)) setPath(item, path, value); return item; };
      doc.items.set(item.id, item);
    }
    doc.effects = new Map((data.effects ?? []).map((effectData, index) => {
      const effect = documentWithFlags(effectData, "ActiveEffect"); effect.id = `effect-${doc.id}-${index}`;
      effect.update = async changes => { for (const [path, value] of Object.entries(changes)) setPath(effect, path, value); return effect; };
      return [effect.id, effect];
    }));
    for (const item of doc.items.values()) {
      const activities = item.system?.activities ?? {};
      item.system.activities = new Map(Object.entries(activities).map(([id, activity]) => [id, { ...activity, id: activity.id ?? activity._id ?? id }]));
      item.update = async changes => {
        for (const [path, value] of Object.entries(changes)) {
          const match = path.match(/^system\.activities\.([^.]+)\.(.+)$/);
          if (match) { const activity = item.system.activities.get(match[1]); if (activity) setPath(activity, match[2], value); }
          else setPath(item, path, value);
        }
        return item;
      };
    }
    doc.getTokenDocument = async position => ({ id: `token-${doc.id}`, actorId: doc.id, ...position, toObject() { const { toObject, ...data } = this; return data; } });
    doc.delete = async () => { game.actors.delete(doc.uuid); documents.delete(doc.uuid); return doc; };
    doc.getActiveTokens = () => [...game.scenes.values()].flatMap(scene => [...scene.tokens.values()].filter(token => token.actor === doc));
    documents.set(doc.uuid, doc); game.actors.set(doc.uuid, doc); return doc;
  } } };
  return { documents, add(document) { documents.set(document.uuid, document); return document; } };
}
function addScene(id = "scene") {
  const scene = { id, grid: { units: "ft", distance: 5, size: 100 }, tokens: new Map(),
    async createEmbeddedDocuments(type, rows) {
      assert.equal(type, "Token");
      return rows.map(row => {
        const actor = game.actors.get(`Actor.${row.actorId}`), token = {
          ...row, documentName: "Token", uuid: `Scene.${id}.Token.${row.id}`, parent: scene, actor,
          width: row.width ?? 1, height: row.height ?? 1, elevation: row.elevation ?? 0,
          getFlag(scope, key) { return actor?.getFlag(scope, key); },
          async update(changes) { Object.assign(this, changes); return this; },
          async delete() { scene.tokens.delete(this.id); globalThis.__casterDroneTestDocuments.delete(this.uuid); if (actor) actor.tokens = actor.tokens.filter(entry => entry !== this); return this; }
        };
        scene.tokens.set(token.id, token); globalThis.__casterDroneTestDocuments.set(token.uuid, token); if (actor) actor.tokens.push(token); return token;
      });
    }
  };
  game.scenes.set(scene.id, scene); return scene;
}
function addToken(scene, actor, { id, x = 0, y = 0, elevation = 0 } = {}) {
  const token = { id, uuid: `Scene.${scene.id}.Token.${id}`, documentName: "Token", actor, parent: scene,
    x, y, elevation, width: 1, height: 1,
    getFlag(scope, key) { return actor.getFlag(scope, key); },
    async update(changes) { Object.assign(this, changes); return this; } };
  scene.tokens.set(token.id, token); globalThis.__casterDroneTestDocuments.set(token.uuid, token); actor.tokens.push(token); return token;
}
function recordRuling(actor, value = "techTotal") {
  actor.flags.ak5e.caster.rulings.technologyModifier = { value, source: "GM reviewed the Technology Modifier interpretation for this table." };
}
function connect(actor, drone) { actor.flags.ak5e.caster.drones.push(drone.uuid); }

test("Arts Master source statblock and Originium Spark fields use reviewed creator statistics", () => {
  world();
  const actor = creator();
  // No ruling: the player picks the Technology Modifier reading for this use.
  assert.throws(() => droneStatistics(actor), error => error.name === "AK5eReading" && error.key === "technologyModifier");
  assert.throws(() => droneData(actor, "unruled"), error => error.name === "AK5eReading");
  assert.equal(droneStatistics(actor, "intMod").hp, 25 + Number(actor.system.abilities.int.mod));

  recordRuling(actor, "techTotal");
  actor.system.attributes.spell = { attack: 8 };
  actor.system.attributes.prof = 3;
  actor.system.abilities.int.mod = 4;
  actor.system.skills.ak5etech.total = 7;
  const stats = droneStatistics(actor), data = droneData(actor, "source-test");
  assert.deepEqual(stats, { hp: 32, modifier: 4, pb: 3, attack: 8 });
  assert.equal(data.type, "npc");
  assert.equal(data.system.attributes.ac.flat, 17);
  assert.equal(data.system.attributes.hp.value, 32);
  assert.equal(data.system.attributes.hp.max, 32);
  assert.equal(data.system.attributes.movement.fly, 30);
  assert.equal(data.system.attributes.movement.hover, true);
  // B-005: dnd5e 5.3 moved senses.darkvision to senses.ranges.darkvision; the old shape logs deprecation warnings.
  assert.deepEqual(data.system.attributes.senses, { ranges: { darkvision: 60 } });
  for (const old of ["darkvision", "blindsight", "tremorsense", "truesight"]) assert.equal(old in data.system.attributes.senses, false);
  assert.equal(data.system.details.type.value, "construct");
  assert.equal(10 + Math.floor((data.system.abilities.wis.value - 10)/2) + Number(data.system.skills.prc.bonuses.passive), 6);
  assert.deepEqual(data.system.traits.di.value, ["poison", "necrotic"]);
  assert.ok(data.system.traits.ci.value.includes("charmed"));
  assert.equal(data.effects[0].changes[0].value, "3");

  const spark = data.items.find(item => item.flags.ak5e.artsMasterSpark);
  const activity = spark.system.activities.ak5eSparkAttack1;
  assert.equal(activity.activation.type, "action");
  assert.equal(activity.attack.bonus, "8");
  assert.equal(activity.range.value, 30);
  assert.equal(activity.range.long, 100);
  assert.equal(activity.target.affects.count, "1");
  assert.deepEqual(activity.damage.parts[0], { number: 2, denomination: 4, bonus: "4", types: ["force"] });
  assert.equal(data.items.find(item => item.flags.ak5e.artsMasterReaction).name, "Wolfpack Doctrine");
});

test("creation requires an owner and GM, enforces one/two drone caps, and retries placement idempotently", async () => {
  const { documents } = world();
  const scene = addScene();
  const actor = creator({ level: 9 }); recordRuling(actor);
  await assert.rejects(createCasterDrone(actor, { confirmed: true, operationId: "no-gm" }), /no GM is connected/);
  game.user.isGM = true;
  const unowned = creator({ owner: false, id: "unowned" }); recordRuling(unowned);
  await assert.rejects(createCasterDrone(unowned, { confirmed: true, operationId: "not-owner" }), /owned, configured Mech-Accord/);
  game.users.activeGM = game.user; game.users.set(game.user.id, game.user);

  const first = await createCasterDrone(actor, { confirmed: true, operationId: "drone-1", sceneId: scene.id, x: 300, y: 400 });
  assert.equal(actor.flags.ak5e.caster.undo.find(entry => entry.id === "drone-1")?.undoKind, "droneRequest",
    "the exported creation helper records the same per-encounter undo receipt as the panel workflow");
  assert.equal(first.ownership.player, 3, "creator's player owns the Arts Master Actor");
  assert.equal(scene.tokens.size, 1);
  assert.equal(scene.tokens.values().next().value.actor, first);
  assert.equal(actor.flags.ak5e.caster.drones.length, 1);
  const retry = await createCasterDrone(actor, { confirmed: true, operationId: "drone-1", sceneId: scene.id, x: 300, y: 400 });
  assert.equal(retry, first);
  assert.equal(game.actors.size, 1, "retry reuses the original Actor");
  assert.equal(scene.tokens.size, 1, "retry does not duplicate the placed token");
  await assert.rejects(createCasterDrone(actor, { confirmed: true, operationId: "over-cap" }), /cap has been reached/);

  actor.items.get("class-caster").system.levels = 10;
  const second = await createCasterDrone(actor, { confirmed: true, operationId: "drone-2", sceneId: scene.id, x: 500, y: 400 });
  assert.notEqual(second.uuid, first.uuid);
  assert.equal(actor.flags.ak5e.caster.drones.length, 2);
  assert.equal(game.actors.size, 2);
  assert.equal(scene.tokens.size, 2);
  await assert.rejects(createCasterDrone(actor, { confirmed: true, operationId: "third" }), /cap has been reached/);
  assert.equal(documents.size, 4, "each created Actor and placed Token remains addressable by UUID");
});

test("Arts Master creation receipt undoes an unchanged Actor and Token, while edited documents are preserved and unlinked", async () => {
  const { documents } = world({ isGM: true });
  const actor = creator({ level: 3 }); recordRuling(actor, "intMod");
  game.users.activeGM = game.user;
  const scene = addScene();
  const created = await requestCasterDrone(actor, "create", { confirmed: true, operationId: "create-undo", sceneId: scene.id, x: 100, y: 200 });
  const receipt = actor.flags.ak5e.caster.undo.find(entry => entry.id === "create-undo");
  assert.equal(receipt.status, "complete");
  assert.equal(actor.flags.ak5e.caster.drones[0], created.uuid);
  const evidenceMessage = game.messages.find(message => message.flags?.ak5e?.casterDroneEvidence);
  assert.deepEqual(evidenceMessage.whisper, [game.user.id], "creation snapshots are visible only to the GM, not stored on enumerable User flags");
  assert.equal(game.user.flags.ak5e.casterDroneEvidence, undefined);
  await assert.rejects(requestCasterDrone(actor, "create", { confirmed: true, operationId: "create-undo", sceneId: scene.id, x: 101, y: 200 }), /Retry the original Arts Master request with the same operation choices/);
  assert.match(previewUndo(actor, "create-undo").lines.join(" "), /removes this operation's unchanged Arts Master Actor and 1 unchanged placed Token/);
  await casterCommand(actor, "undoUse", { useId: "create-undo" }, "create-undo-request");
  assert.equal(game.actors.has(created.uuid), false);
  assert.equal(scene.tokens.size, 0);
  assert.deepEqual(actor.flags.ak5e.caster.drones, []);

  const edited = await requestCasterDrone(actor, "create", { confirmed: true, operationId: "create-edited", sceneId: scene.id, x: 300, y: 400 });
  const editedToken = [...scene.tokens.values()][0];
  edited.system.attributes.hp.value -= 1;
  editedToken.x += 100;
  assert.equal(await requestCasterDrone(actor, "create", { confirmed: true, operationId: "create-edited", sceneId: scene.id, x: 300, y: 400 }), edited,
    "a completed direct-GM retry returns the original Actor without refreshing its baseline snapshot");
  receipt.request.actorSnapshot.system.attributes.hp.value = edited.system.attributes.hp.value;
  receipt.request.tokens[0].snapshot.x = editedToken.x;
  assert.match(previewUndo(actor, "create-edited").lines.join(" "), /changed.*preserves those documents and removes only this Caster's link/);
  await casterCommand(actor, "undoUse", { useId: "create-edited" }, "create-edited-undo");
  assert.equal(game.actors.has(edited.uuid), true);
  assert.equal(scene.tokens.has(editedToken.id), true);
  assert.deepEqual(actor.flags.ak5e.caster.drones, []);
  assert.match(game.messages.at(-1).content, /preserves those documents/);
  assert.ok(documents.has(edited.uuid));
});

test("owner-edited receipt epoch cannot unlock a GM-evidence-locked creation", async () => {
  const { documents } = world({ isGM: true });
  const actor = creator({ level: 3 }); recordRuling(actor, "intMod"); game.users.activeGM = game.user;
  actor.testUserPermission = () => true; documents.set(actor.uuid, actor); game.actors.set(actor.uuid, actor);
  const created = await requestCasterDrone(actor, "create", { confirmed: true, operationId: "locked-create" });
  const receipt = actor.flags.ak5e.caster.undo.find(entry => entry.id === "locked-create");
  game.setTestEpoch(1);
  receipt.epoch = 1;
  const player = { id: "player", isGM: false }; game.users.set(player.id, player);
  const request = { author: player, flags: { ak5e: { casterDroneRequest: { actorUuid: actor.uuid, id: "locked-create-undo",
    command: "undoRequest", data: { useId: receipt.id, confirmation: true } } } },
    async update(changes) { setPath(this, Object.keys(changes)[0], Object.values(changes)[0]); return this; } };
  await handleDroneRelay(request, {}, player.id);
  assert.match(request.flags.ak5e.casterDroneResponse.error, /encounter window ended/);
  assert.equal(game.actors.get(created.uuid), created, "trusted GM evidence retains the original encounter epoch");
  assert.deepEqual(actor.flags.ak5e.caster.drones, [created.uuid]);
});

test("GM-authored private evidence remains usable after elected-GM turnover", async () => {
  world({ isGM: true });
  const actor = creator({ level: 3 }); recordRuling(actor, "intMod"); game.users.activeGM = game.user;
  const created = await requestCasterDrone(actor, "create", { confirmed: true, operationId: "gm-turnover" });
  const originalAuthor = game.messages.find(message => message.flags?.ak5e?.casterDroneEvidence)?.author;
  const successor = { id: "gm-successor", isGM: true };
  game.users.set(successor.id, successor); game.users.activeGM = successor; game.user = successor;
  await casterCommand(actor, "undoUse", { useId: "gm-turnover" }, "gm-turnover-undo");
  assert.equal(originalAuthor.id, "gm");
  assert.equal(game.actors.has(created.uuid), false, "the elected GM can read and update the original GM-authored evidence");
});

test("a copied owner receipt cannot authorize deletion of another Caster's Arts Master", async () => {
  world({ isGM: true });
  const source = creator({ id: "source", level: 3 }), intruder = creator({ id: "intruder", level: 3 });
  recordRuling(source, "intMod"); recordRuling(intruder, "intMod");
  game.users.activeGM = game.user; game.actors.set(source.uuid, source); game.actors.set(intruder.uuid, intruder);
  const created = await requestCasterDrone(source, "create", { confirmed: true, operationId: "foreign-proof" });
  const receipt = structuredClone(source.flags.ak5e.caster.undo.find(entry => entry.id === "foreign-proof"));
  intruder.flags.ak5e.caster.undo = [receipt]; intruder.flags.ak5e.caster.drones = [created.uuid];
  await assert.rejects(casterCommand(intruder, "undoUse", { useId: receipt.id }, "foreign-proof-undo"), /no matching GM-authored evidence/);
  assert.equal(game.actors.get(created.uuid), created);
  assert.deepEqual(intruder.flags.ak5e.caster.drones, [created.uuid]);
});

test("Arts Master requests require confirmation and an undone request ID cannot recreate documents", async () => {
  const { documents } = world({ isGM: true });
  const actor = creator({ level: 3 }); recordRuling(actor, "intMod");
  game.users.activeGM = game.user;
  const scene = addScene();
  await assert.rejects(requestCasterDrone(actor, "create", { operationId: "cancelled", sceneId: scene.id, x: 50, y: 60 }), /Confirm the Arts Master request/);
  assert.equal(game.actors.size, 0); assert.equal(actor.flags.ak5e.caster.undo?.length ?? 0, 0);
  const created = await requestCasterDrone(actor, "create", { confirmed: true, operationId: "cancelled", sceneId: scene.id, x: 50, y: 60 });
  await casterCommand(actor, "undoUse", { useId: "cancelled" }, "cancelled-undo");
  await assert.rejects(requestCasterDrone(actor, "create", { confirmed: true, operationId: "cancelled", sceneId: scene.id, x: 50, y: 60 }), /request was undone/);
  assert.equal(game.actors.size, 0); assert.equal(documents.has(created.uuid), false);
});

test("creation undo retries after a token delete succeeded but the client reported failure", async () => {
  world({ isGM: true });
  const actor = creator({ level: 3 }); recordRuling(actor, "intMod"); game.users.activeGM = game.user;
  const scene = addScene();
  const created = await requestCasterDrone(actor, "create", { confirmed: true, operationId: "partial-delete", sceneId: scene.id, x: 100, y: 120 });
  const token = [...scene.tokens.values()][0], deleteToken = token.delete.bind(token); let fail = true;
  token.delete = async () => { await deleteToken(); if (fail) { fail = false; throw new Error("simulated disconnect after token removal"); } };
  await assert.rejects(casterCommand(actor, "undoUse", { useId: "partial-delete" }, "partial-delete-undo"), /simulated disconnect/);
  assert.equal(game.actors.has(created.uuid), true, "the Actor remains until the retry resumes token deletion");
  assert.equal(actor.flags.ak5e.caster.undo.find(entry => entry.id === "partial-delete").request.deletion[token.uuid], "deleting");
  await casterCommand(actor, "undoUse", { useId: "partial-delete" }, "partial-delete-undo");
  assert.equal(game.actors.has(created.uuid), false);
  assert.equal(scene.tokens.size, 0);
  assert.deepEqual(actor.flags.ak5e.caster.drones, []);
});

test("creation undo rechecks Actor ownership and snapshot after durable delete intent", async () => {
  world({ isGM: true });
  const actor = creator({ level: 3 }); recordRuling(actor, "intMod"); game.users.activeGM = game.user;
  const scene = addScene();
  const created = await requestCasterDrone(actor, "create", { confirmed: true, operationId: "late-actor-edit", sceneId: scene.id, x: 50, y: 60 });
  const evidence = game.messages.find(message => message.flags?.ak5e?.casterDroneEvidence);
  const update = evidence.update.bind(evidence); let edited = false;
  evidence.update = async changes => {
    const next = changes["flags.ak5e.casterDroneEvidence.evidence"];
    if (!edited && next?.deletion?.actor === "deleting") { edited = true; created.name = "Owner edited during undo"; }
    return update(changes);
  };
  await casterCommand(actor, "undoUse", { useId: "late-actor-edit" }, "late-actor-edit-undo");
  assert.equal(edited, true);
  assert.equal(game.actors.get(created.uuid), created, "the latest Actor snapshot is checked after durable intent writes");
  assert.equal(created.name, "Owner edited during undo");
  assert.match(game.messages.at(-1).content, /changed or linked during undo; the Actor was preserved/);
});

test("creation undo preserves a Token edited while its delete intent is being saved", async () => {
  world({ isGM: true });
  const actor = creator({ level: 3 }); recordRuling(actor, "intMod"); game.users.activeGM = game.user;
  const scene = addScene();
  const created = await requestCasterDrone(actor, "create", { confirmed: true, operationId: "late-token-edit", sceneId: scene.id, x: 70, y: 80 });
  const token = [...scene.tokens.values()][0], evidence = game.messages.find(message => message.flags?.ak5e?.casterDroneEvidence);
  const update = evidence.update.bind(evidence); let edited = false;
  evidence.update = async changes => {
    const next = changes["flags.ak5e.casterDroneEvidence.evidence"];
    if (!edited && next?.deletion?.[token.uuid] === "deleting") { edited = true; token.x += 25; }
    return update(changes);
  };
  await casterCommand(actor, "undoUse", { useId: "late-token-edit" }, "late-token-edit-undo");
  assert.equal(edited, true);
  assert.equal(scene.tokens.get(token.id), token, "the latest Token snapshot is checked after durable intent writes");
  assert.equal(token.x, 95);
  assert.equal(game.actors.get(created.uuid), created, "an Actor with a surviving Token is not deleted");
  assert.match(game.messages.at(-1).content, /Token.*changed during undo; the Token was preserved/);
});

test("link request undo removes only its own link and leaves the existing Actor intact", async () => {
  const { documents } = world({ isGM: true });
  const actor = creator({ level: 10 }); recordRuling(actor, "intMod");
  game.users.activeGM = game.user;
  const existing = documentWithFlags({ id: "existing", uuid: "Actor.existing", name: "Existing Arts Master", flags: { ak5e: { artsMaster: { creatorUuid: actor.uuid, operationId: "earlier" } } } });
  existing.id = "existing"; existing.uuid = "Actor.existing"; existing.isOwner = true; game.actors.set(existing.uuid, existing); documents.set(existing.uuid, existing);
  await requestCasterDrone(actor, "link", { confirmed: true, operationId: "link-undo", droneUuid: existing.uuid });
  assert.deepEqual(actor.flags.ak5e.caster.drones, [existing.uuid]);
  await casterCommand(actor, "undoUse", { useId: "link-undo" }, "link-undo-request");
  assert.deepEqual(actor.flags.ak5e.caster.drones, []);
  assert.equal(game.actors.get(existing.uuid), existing);
  assert.equal(game.messages.at(-1).flags.ak5e.casterOperation, "link-undo-undo");
});

test("missing GM evidence blocks player undo but lets the GM safely remove a proven own link", async () => {
  const { documents } = world({ isGM: true });
  const actor = creator({ level: 10 }); recordRuling(actor, "intMod"); game.users.activeGM = game.user;
  actor.testUserPermission = () => true; documents.set(actor.uuid, actor); game.actors.set(actor.uuid, actor);
  const existing = documentWithFlags({ id: "proven", uuid: "Actor.proven", name: "Proven Arts Master", flags: { ak5e: { artsMaster: { creatorUuid: actor.uuid, operationId: "older" } } } });
  existing.id = "proven"; existing.uuid = "Actor.proven"; existing.isOwner = true; game.actors.set(existing.uuid, existing); documents.set(existing.uuid, existing);
  await requestCasterDrone(actor, "link", { confirmed: true, operationId: "link-no-evidence", droneUuid: existing.uuid });
  game.messages.splice(game.messages.findIndex(message => message.flags?.ak5e?.casterDroneEvidence), 1);
  const player = { id: "player", isGM: false }; game.users.set(player.id, player);
  const request = { author: player, flags: { ak5e: { casterDroneRequest: { actorUuid: actor.uuid, id: "player-no-evidence",
    command: "undoRequest", data: { useId: "link-no-evidence", confirmation: true } } } },
    async update(changes) { setPath(this, Object.keys(changes)[0], Object.values(changes)[0]); return this; } };
  await handleDroneRelay(request, {}, player.id);
  assert.match(request.flags.ak5e.casterDroneResponse.error, /no matching GM-authored evidence/);
  assert.deepEqual(actor.flags.ak5e.caster.drones, [existing.uuid]);
  await casterCommand(actor, "undoUse", { useId: "link-no-evidence" }, "gm-safe-link-undo");
  assert.deepEqual(actor.flags.ak5e.caster.drones, []);
  assert.equal(game.actors.get(existing.uuid), existing, "without trusted evidence the GM preserves the external Actor");
  assert.match(game.messages.at(-1).content, /preserved/);
});

test("external drone receipt and Mech use updates serialize without losing either receipt", async () => {
  const { documents } = world({ isGM: true });
  const actor = creator({ level: 10 }); recordRuling(actor, "intMod"); game.users.activeGM = game.user;
  const scene = addScene(); addToken(scene, actor, { id: "race-caster", x: 0, y: 0 });
  const target = documentWithFlags({ id: "race-drone", uuid: "Actor.race-drone", name: "Race Drone", isOwner: true,
    flags: { ak5e: { artsMaster: { creatorUuid: actor.uuid, operationId: "old", destroyed: false } } },
    system: { attributes: { hp: { value: 1, max: 100, temp: 0 } } } });
  target.id = "race-drone"; target.uuid = "Actor.race-drone"; target.getActiveTokens = () => [];
  target.tokens = []; addToken(scene, target, { id: "race-target", x: 100, y: 0 }); target.getActiveTokens = () => target.tokens;
  game.actors.set(target.uuid, target); documents.set(target.uuid, target);
  let beginSave, releaseSave;
  const held = new Promise(resolve => { releaseSave = resolve; });
  const started = new Promise(resolve => { beginSave = resolve; });
  const update = actor.update.bind(actor); let paused = false;
  actor.update = async changes => {
    const undo = changes["flags.ak5e.caster.undo"] ?? changes["flags.ak5e.caster"]?.undo;
    if (!paused && undo?.some(entry => entry.id === "external-create")) {
      paused = true; beginSave(); await held;
    }
    return update(changes);
  };
  const request = requestCasterDrone(actor, "link", { confirmed: true, operationId: "external-create", droneUuid: target.uuid });
  await started;
  const use = casterCommand(actor, "juryRig", { confirmed: true, droneUuid: target.uuid, visible: true, ap: 1 }, "race-jury");
  releaseSave();
  await Promise.all([request, use]);
  assert.deepEqual(actor.flags.ak5e.caster.undo.map(entry => entry.id).sort(), ["external-create", "race-jury"]);
  assert.equal(actor.flags.ak5e.artsPoints.value, 7);
  assert.deepEqual(actor.flags.ak5e.caster.drones, [target.uuid]);
});

test("linking is GM-only, limited to this creator's Arts Masters, and idempotent", async () => {
  const { documents } = world();
  const actor = creator();
  const other = creator({ id: "other" });
  const candidate = documentWithFlags({ id: "candidate", uuid: "Actor.candidate", name: "Arts Master", flags: { ak5e: { artsMaster: { creatorUuid: actor.uuid } } } });
  candidate.id = "candidate"; candidate.uuid = "Actor.candidate"; candidate.isOwner = true;
  const second = documentWithFlags({ id: "candidate-2", uuid: "Actor.candidate-2", name: "Arts Master 2", flags: { ak5e: { artsMaster: { creatorUuid: actor.uuid } } } });
  second.id = "candidate-2"; second.uuid = "Actor.candidate-2"; second.isOwner = true;
  for (const drone of [candidate, second]) { documents.set(drone.uuid, drone); game.actors.set(drone.uuid, drone); }
  await assert.rejects(linkCasterDrone(actor, candidate.uuid, true), /no GM is connected/);
  game.user.isGM = true;
  game.users.activeGM = game.user; game.users.set(game.user.id, game.user);
  await assert.rejects(linkCasterDrone(other, candidate.uuid, true), /belonging to this creator/);
  await linkCasterDrone(actor, candidate.uuid, true);
  await linkCasterDrone(actor, candidate.uuid, true);
  assert.deepEqual(actor.flags.ak5e.caster.drones, [candidate.uuid]);
  await assert.rejects(linkCasterDrone(actor, second.uuid, true), /cap has been reached/);
  actor.items.get("class-caster").system.levels = 10;
  await linkCasterDrone(actor, second.uuid, true);
  assert.deepEqual(actor.flags.ak5e.caster.drones, [candidate.uuid, second.uuid]);
  await assert.rejects(linkCasterDrone(actor, candidate.uuid, false), /Confirm the Arts Master request/);
});

test("stat synchronization updates managed values while preserving authored Spark, HP, temp HP and caster resources", async () => {
  world({ isGM: true });
  const actor = creator({ level: 10 }); recordRuling(actor);
  const managed = await createCasterDrone(actor, { confirmed: true, operationId: "managed" });
  assert.equal(managed.system.skills.prc.ability, "wis", "printed Perception is preserved despite the AK5e skill default using Dexterity");
  const customized = await createCasterDrone(actor, { confirmed: true, operationId: "customized" });

  managed.system.attributes.hp.value = 12; managed.system.attributes.hp.temp = 5;
  customized.system.attributes.hp.value = 17; customized.system.attributes.hp.max = droneData(actor, "customized").system.attributes.hp.max - 1;
  customized.system.attributes.hp.temp = 4;
  const customSpark = [...customized.items.values()].find(item => item.getFlag("ak5e", "artsMasterSpark")), customActivity = customSpark.system.activities.get("ak5eSparkAttack1");
  customActivity.attack.bonus = "99"; customActivity.damage.parts[0].bonus = "77";
  [...customized.effects.values()][0].changes[0].value = "99";

  actor.system.skills.ak5etech.total = 9; actor.system.abilities.int.mod = 4; actor.system.attributes.prof = 3;
  const beforeAP = actor.flags.ak5e.artsPoints.value;
  assert.deepEqual(await syncCasterDrones(actor), [managed.uuid, customized.uuid]);

  assert.equal(managed.system.attributes.hp.max, 34);
  assert.equal(managed.system.attributes.hp.value, 12);
  assert.equal(managed.system.attributes.hp.temp, 5);
  const managedSpark = [...managed.items.values()].find(item => item.getFlag("ak5e", "artsMasterSpark"));
  const managedActivity = managedSpark.system.activities.get("ak5eSparkAttack1");
  assert.equal(managedActivity.attack.bonus, "7");
  assert.equal(managedActivity.damage.parts[0].bonus, "4");
  assert.equal([...managed.effects.values()][0].changes[0].value, "3", "creator-PB effect updates only while still managed");

  assert.equal(customized.system.attributes.hp.max, 29, "authored maximum HP is preserved");
  assert.equal(customized.system.attributes.hp.value, 17);
  assert.equal(customized.system.attributes.hp.temp, 4);
  assert.equal(customActivity.attack.bonus, "99", "authored Originium Spark attack bonus is preserved");
  assert.equal(customActivity.damage.parts[0].bonus, "77", "authored Originium Spark damage bonus is preserved");
  assert.equal([...customized.effects.values()][0].changes[0].value, "99", "authored PB effect is preserved");
  assert.equal(actor.flags.ak5e.artsPoints.value, beforeAP);
});

test("drone commands accept exactly 100 feet, reject out-of-range and cross-scene tokens", () => {
  const { add } = world();
  const actor = creator(); recordRuling(actor);
  add(actor);
  const drone = documentWithFlags({ id: "drone", uuid: "Actor.drone", flags: { ak5e: { artsMaster: { creatorUuid: actor.uuid, destroyed: false } } },
    system: { attributes: { hp: { value: 25, max: 25, temp: 0 } } } });
  drone.id = "drone"; drone.uuid = "Actor.drone"; drone.isOwner = true; drone.tokens = []; drone.getActiveTokens = () => [];
  connect(actor, drone); add(drone);
  const scene = addScene(), casterToken = addToken(scene, actor, { id: "caster", x: 0 }), droneToken = addToken(scene, drone, { id: "drone", x: 2000 });
  assert.equal(droneInRange(actor, droneToken.uuid), droneToken, "100-foot limit is inclusive");
  droneToken.x = 2000.2;
  assert.throws(() => droneInRange(actor, droneToken.uuid), /within 100 feet/);
  droneToken.x = 0;
  const otherScene = addScene("other"); addToken(otherScene, drone, { id: "elsewhere", x: 0 });
  assert.equal(casterToken.parent.id, scene.id);
  assert.throws(() => droneInRange(actor, `Scene.other.Token.elsewhere`), /within 100 feet/);
});

test("Synergetic Casting origin requires a linked drone; level, life state and Scene are warnings", () => {
  const { add } = world();
  const actor = creator({ level: 6 });
  add(actor);
  const drone = documentWithFlags({ id: "drone", uuid: "Actor.drone", flags: { ak5e: { artsMaster: { creatorUuid: actor.uuid, destroyed: false } } },
    system: { attributes: { hp: { value: 25, max: 25 } } } });
  drone.id = "drone"; drone.uuid = "Actor.drone"; drone.isOwner = true; drone.tokens = []; drone.getActiveTokens = () => [];
  connect(actor, drone); add(drone);
  const scene = addScene(), creatorToken = addToken(scene, actor, { id: "caster" }), droneToken = addToken(scene, drone, { id: "drone" });
  assert.equal(casterDroneOrigin(actor, droneToken.uuid), droneToken);
  assert.deepEqual(droneOriginWarnings(actor, droneToken.uuid), []);
  actor.tokens.splice(actor.tokens.indexOf(creatorToken), 1);
  assert.deepEqual(droneOriginWarnings(actor, droneToken.uuid).map(w => w.id), ["originScene"]);
  actor.tokens.push(creatorToken);
  drone.flags.ak5e.artsMaster.destroyed = true;
  assert.deepEqual(droneOriginWarnings(actor, droneToken.uuid).map(w => w.id), ["originDestroyed"]);
  drone.flags.ak5e.artsMaster.destroyed = false;
  actor.items.get("class-caster").system.levels = 5;
  assert.deepEqual(droneOriginWarnings(actor, droneToken.uuid).map(w => w.id), ["originLevel"]);
  actor.items.get("class-caster").system.levels = 6;
  drone.flags.ak5e.artsMaster.creatorUuid = "Actor.someone-else";
  assert.throws(() => casterDroneOrigin(actor, droneToken.uuid), /not linked/, "identity stays a hard stop");
});

test("native Originium Spark activity is blocked for Cantrip Duplication locks and destroyed drones", () => {
  const { add } = world();
  const actor = creator({ level: 6 });
  add(actor);
  const drone = documentWithFlags({ id: "drone", uuid: "Actor.drone", flags: { ak5e: { artsMaster: { creatorUuid: actor.uuid, destroyed: false } } },
    system: { attributes: { hp: { value: 25, max: 25 } } } });
  drone.id = "drone"; drone.uuid = "Actor.drone"; drone.isOwner = true; drone.tokens = []; drone.getActiveTokens = () => [];
  connect(actor, drone); add(drone);
  const scene = addScene(), token = addToken(scene, drone, { id: "drone" }); drone.getActiveTokens = () => [token];
  const activity = { actor: drone, item: { flags: { ak5e: { artsMasterSpark: true } }, getFlag: getFlag } };
  assert.equal(droneAttackGate(activity), undefined, "ordinary Originium Spark remains available");
  actor.flags.ak5e.caster.attackLocks = {};
  actor.flags.ak5e.caster.attackLocks[token.uuid] = { castId: "duplicate" };
  assert.equal(droneAttackGate(activity), false);
  delete actor.flags.ak5e.caster.attackLocks[token.uuid];
  setPath(actor.flags.ak5e.caster.attackLocks, token.uuid, { castId: "legacy-expanded", turn: {} });
  assert.equal(droneAttackGate(activity), false, "legacy UUID keys expanded by Foundry still prohibit attacks");
  actor.flags.ak5e.caster.attackLocks = { safeKey: { tokenUuid: token.uuid, castId: "opaque", turn: {} } };
  assert.equal(droneAttackGate(activity), false, "opaque keys retain the explicit token identity");
  actor.flags.ak5e.caster.attackLocks = {};
  assert.equal(droneAttackGate(activity), undefined);
  drone.flags.ak5e.artsMaster.destroyed = true;
  assert.equal(droneAttackGate(activity), false);
  drone.flags.ak5e.artsMaster.destroyed = false; drone.system.attributes.hp.value = 0;
  assert.equal(droneAttackGate(activity), false);
});
