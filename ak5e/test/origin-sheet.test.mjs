import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { registerOriginConfig, TOOLS } from "../scripts/origin-setup.mjs";

// Optional integration regression using the installed system's actual resolver
// and sheet method, read-only. No World or document database is required.
test("D&D5e sheet displays AK5e tool proficiencies without base-item IDs", {
  skip: !process.env.AK5E_DND5E_BUNDLE
}, () => {
  const bundle = readFileSync(process.env.AK5E_DND5E_BUNDLE, "utf8");
  const functions = ["_innerLabel", "getBaseItemUUID", "getBaseItem", "keyLabel"].map(name => {
    const match = bundle.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"));
    assert.ok(match, `D&D5e function ${name} must exist`);
    return match[0];
  });
  const sheetMethod = bundle.match(/^  _prepareSkillsTools\(context, property\) \{[^]*?^  }/m);
  assert.ok(sheetMethod, "D&D5e sheet method must exist");
  globalThis.CONFIG = { DND5E: {
    tools: {}, skills: {}, toolProficiencies: {}, abilities: {}, proficiencyLevels: {},
    traits: { tool: { configKey: "toolProficiencies", labels: { localization: "Tool" }, subtypes: { ids: ["tools"] } } }
  } };
  registerOriginConfig();
  const sandbox = vm.createContext({ CONFIG, game: { i18n: { lang: "en", localize: s => s } }, foundry: { utils: {
    getType: value => typeof value === "object" ? "Object" : "string",
    getProperty: (object, key) => object[key],
    parseUuid: () => { throw new Error("Custom tool labels must not need a compendium lookup"); }
  } } });
  const sheet = vm.runInContext(`${functions.join("\n")}\n({${sheetMethod[0]}})`, sandbox);
  const tools = Object.fromEntries(Object.entries(CONFIG.DND5E.tools).map(([key, tool]) => [key, { ability: tool.ability, value: 1, total: 2 }]));
  const context = { source: { tools }, system: { tools } };

  // Reproduce the pre-fix crash with the same stored proficiencies.
  const labels = CONFIG.DND5E.toolProficiencies;
  CONFIG.DND5E.toolProficiencies = {};
  assert.throws(() => sheet._prepareSkillsTools(context, "tools"), /startsWith/);

  CONFIG.DND5E.toolProficiencies = labels;
  const rows = sheet._prepareSkillsTools(context, "tools");
  assert.deepEqual(Array.from(rows, row => row.label).sort(), [...TOOLS].sort());
  assert.equal(rows.find(row => row.key === "ak5emessengerkit").label, "Messenger Kit");
});
