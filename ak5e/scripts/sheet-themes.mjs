import { CHAPTER_TWO_ORIGINS } from "./chapter-two-content.mjs";

export const SHEET_THEMES = Object.freeze([
  ["aegir", "Ægir", "#123849", "#60c9d8", "ocean"],
  ["bolivar", "Bolivar", "#8d4136", "#44b6aa", "woven"],
  ["columbia", "Columbia", "#253d5a", "#87a8c5", "grid"],
  ["durin-cities", "Durin Cities", "#665445", "#8ac7b1", "arches"],
  ["higashi", "Higashi", "#242832", "#d05c4d", "lattice"],
  ["iberia", "Iberia", "#1b3551", "#c8a971", "rays"],
  ["kazdel", "Kazdel", "#302d33", "#b64b57", "fracture"],
  ["kazimierz", "Kazimierz", "#594071", "#d5b65e", "banner"],
  ["kjerag", "Kjerag", "#465767", "#a9d7e4", "peaks"],
  ["laterano", "Laterano", "#786442", "#82bddd", "halos"],
  ["leithanien", "Leithanien", "#583b57", "#c6a477", "staff"],
  ["minos", "Minos", "#66594d", "#a6a276", "columns"],
  ["rim-billiton", "Rim Billiton", "#4b5050", "#ca9a53", "strata"],
  ["sami", "Sami", "#2d5749", "#c88876", "forest"],
  ["sargon", "Sargon", "#8a6740", "#54b9b0", "steps"],
  ["siesta", "Siesta", "#267a80", "#ed9375", "sunset"],
  ["siracusa", "Siracusa", "#313033", "#ab5a69", "stripes"],
  ["ursus-empire", "Ursus Empire", "#4e535b", "#be5961", "monument"],
  ["victoria", "Victoria", "#2c5549", "#c6aa74", "engraving"],
  ["yan", "Yan", "#2d665f", "#d96751", "clouds"]
].map(([id, name, primary, accent, motif]) => Object.freeze({ id, name, primary, accent, motif })));

const byId = new Map(SHEET_THEMES.map(theme => [theme.id, theme]));
const nationalityIds = new Map(CHAPTER_TWO_ORIGINS.filter(entry => entry.kind === "nationality")
  .map(entry => [entry.id, SHEET_THEMES.find(theme => theme.name === entry.name)?.id]));
const entries = collection => Array.from(collection?.values?.() ?? collection ?? []);
const t = key => game.i18n.localize(`AK5E.SheetTheme.${key}`);

/** A missing override means Automatic. Unknown values safely use the native sheet. */
export function resolveSheetTheme(actor) {
  const override = actor?.getFlag?.("ak5e", "sheetTheme") ?? actor?.flags?.ak5e?.sheetTheme;
  if (override === "default") return null;
  if (override && override !== "auto") return byId.get(override) ?? null;
  const nationalities = new Set(entries(actor?.items).map(item =>
    nationalityIds.get(item.getFlag?.("ak5e", "chapterTwoId") ?? item.flags?.ak5e?.chapterTwoId)).filter(Boolean));
  return nationalities.size === 1 ? byId.get(nationalities.values().next().value) : null;
}

export async function setSheetTheme(actor, value) {
  if (actor?.type !== "character" || !(actor.isOwner || game.user?.isGM)) throw new Error(t("OwnerRequired"));
  if (value !== "auto" && value !== "default" && !byId.has(value)) throw new Error(t("Invalid"));
  if (value === "auto") await actor.unsetFlag("ak5e", "sheetTheme");
  else await actor.setFlag("ak5e", "sheetTheme", value);
}

function actorFor(app) {
  const actor = app?.document;
  return app instanceof foundry.applications.sheets.ActorSheetV2 && actor?.documentName === "Actor"
    && actor.type === "character" ? actor : null;
}

/** Render hooks may receive the whole sheet or a single partial. */
export function renderSheetTheme(app, element) {
  const actor = actorFor(app);
  if (!actor || !element?.querySelector) return;
  const theme = resolveSheetTheme(actor);
  const root = app.element;
  if (root?.dataset) {
    if (theme) root.dataset.ak5eSheetTheme = theme.id;
    else delete root.dataset.ak5eSheetTheme;
  }
  // On the first render app.element may not yet be assigned. The header and
  // other fragments still receive the allowlisted attribute for that pass.
  const nodes = [element, ...element.querySelectorAll?.(".sheet-header, .window-content, nav") ?? []];
  for (const node of nodes) {
    if (!node?.dataset) continue;
    if (theme) node.dataset.ak5eSheetTheme = theme.id;
    else delete node.dataset.ak5eSheetTheme;
  }
}

export async function openSheetTheme(actor) {
  if (!(actor?.isOwner || game.user?.isGM)) throw new Error(t("OwnerRequired"));
  const saved = actor.getFlag("ak5e", "sheetTheme") ?? "auto";
  const selected = saved === "auto" || saved === "default" || byId.has(saved) ? saved : "default";
  const options = [["auto", t("Automatic"), null], ["default", t("Default"), null],
    ...SHEET_THEMES.map(theme => [theme.id, theme.name, theme])];
  const swatches = options.map(([id, label, theme]) => {
    const row = document.createElement("label");
    row.className = "ak5e-theme-option";
    const radio = document.createElement("input");
    radio.setAttribute("type", "radio");
    radio.setAttribute("name", "theme");
    radio.setAttribute("value", id);
    if (id === selected) radio.setAttribute("checked", "");
    const swatch = document.createElement("span");
    swatch.className = "ak5e-theme-swatch";
    swatch.style.background = theme ? `linear-gradient(135deg, ${theme.primary} 62%, ${theme.accent} 62%)` : "var(--dnd5e-background-card, #ddd)";
    const name = document.createElement("span"); name.textContent = label;
    row.append(radio, swatch, name);
    return row.outerHTML;
  }).join("");
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Title") }, position: { width: 400 }, classes: ["ak5e-theme-dialog"],
    content: `<p>${t("Hint")}</p><div class="ak5e-theme-options">${swatches}</div>`,
    buttons: [
      { action: "cancel", label: t("Cancel") },
      { action: "save", label: t("Save"), default: true, callback: (_event, button) => button.form.elements.theme.value }
    ], rejectClose: false
  });
  if (result) await setSheetTheme(actor, result);
}

export function registerSheetThemeHooks() {
  Hooks.on("renderActorSheetV2", renderSheetTheme);
  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const actor = actorFor(app);
    if (!actor || !(actor.isOwner || game.user?.isGM) || controls.some(control => control.action === "ak5eSheetTheme")) return;
    controls.unshift({ action: "ak5eSheetTheme", icon: "fa-solid fa-palette", label: t("Title"), ownership: "OWNER",
      onClick: () => openSheetTheme(actor).catch(error => { console.error("AK5e | Sheet theme", error); ui.notifications.error(error.message); }) });
  });
  for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, item => {
    const actor = item.parent;
    if (actor?.type !== "character" || !nationalityIds.has(item.getFlag?.("ak5e", "chapterTwoId") ?? item.flags?.ak5e?.chapterTwoId)) return;
    for (const app of Object.values(actor.apps ?? {})) if (actorFor(app)) {
      Promise.resolve(app.render({ force: false })).catch(error => console.error("AK5e | Sheet theme refresh", error));
    }
  });
}
