const MODULE_ID = "ak5e";
const SETTING_KEY = "assetLibrary";
const ASSET_TYPES = new Set(["image", "audio"]);

/** Return the GM-managed asset mappings in a stable, safe shape. */
export function listAssets() {
  const stored = game.settings.get(MODULE_ID, SETTING_KEY) ?? {};
  const entries = Array.isArray(stored.entries) ? stored.entries : [];
  const usedIds = new Set();

  return entries.flatMap(entry => {
    const id = String(entry?.id ?? "").trim();
    const label = String(entry?.label ?? "").trim();
    if (!id || !label || usedIds.has(id)) return [];
    usedIds.add(id);
    return [{
      id,
      label,
      type: ASSET_TYPES.has(entry.type) ? entry.type : "image",
      path: String(entry.path ?? "").trim()
    }];
  });
}

/** Find one configured asset by its stable mapping ID. */
export function getAsset(assetId) {
  return listAssets().find(asset => asset.id === assetId) ?? null;
}

function localize(key, data = {}) {
  return game.i18n.format(`AK5E.AssetLibrary.${key}`, data);
}

function assertGM() {
  if (game.user.isGM) return;
  ui.notifications.warn(game.i18n.localize("AK5E.Notifications.GamemasterOnly"));
  throw new Error("Only a GM can manage AK5e assets.");
}

function readDialogValue(formData, key) {
  return String(formData?.object?.[key] ?? formData?.get?.(key) ?? formData?.[key] ?? "").trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function saveAssets(entries) {
  assertGM();
  await game.settings.set(MODULE_ID, SETTING_KEY, {
    version: 1,
    entries: entries.map(({ id, label, type, path }) => ({ id, label, type, path }))
  });
}

async function promptForAssetDetails({ title, submitLabel, asset = {} }) {
  const response = await foundry.applications.api.DialogV2.input({
    window: { title },
    content: `<div class="form-group">
      <label for="ak5e-asset-label">${localize("Label")}</label>
      <input id="ak5e-asset-label" name="label" type="text" value="${escapeHtml(asset.label ?? "")}" required autofocus>
    </div>
    <div class="form-group">
      <label for="ak5e-asset-type">${localize("Type")}</label>
      <select id="ak5e-asset-type" name="type">
        <option value="image" ${asset.type !== "audio" ? "selected" : ""}>${localize("Types.Image")}</option>
        <option value="audio" ${asset.type === "audio" ? "selected" : ""}>${localize("Types.Audio")}</option>
      </select>
    </div>`,
    ok: { label: submitLabel },
    rejectClose: false
  });

  if (!response) return null;
  const label = readDialogValue(response, "label");
  const type = readDialogValue(response, "type");
  if (!label) return null;
  return { label, type: ASSET_TYPES.has(type) ? type : "image" };
}

/**
 * A GM-only settings application for asset paths. Files remain in Foundry User
 * Data (or the configured file source); this app only stores named references.
 */
export class AssetLibraryConfig extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: "ak5e-asset-library",
    classes: ["ak5e", "ak5e-asset-library"],
    tag: "section",
    window: {
      title: "AK5E.AssetLibrary.Title",
      icon: "fa-solid fa-images",
      resizable: true
    },
    position: {
      width: 720,
      height: "auto"
    }
  };

  static PARTS = {
    main: { template: "modules/ak5e/templates/asset-library.hbs" }
  };

  async _prepareContext() {
    const assets = listAssets().map(asset => ({
      ...asset,
      hasPath: Boolean(asset.path),
      isImage: asset.type === "image",
      typeLabel: localize(`Types.${asset.type === "audio" ? "Audio" : "Image"}`)
    }));
    return { assets, hasAssets: assets.length > 0 };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector("[data-action='add']")?.addEventListener("click", () => this.#addAsset());
    this.element.querySelectorAll("[data-action='choose']").forEach(button => {
      button.addEventListener("click", () => this.#chooseAsset(button.dataset.assetId));
    });
    this.element.querySelectorAll("[data-action='edit']").forEach(button => {
      button.addEventListener("click", () => this.#editAsset(button.dataset.assetId));
    });
    this.element.querySelectorAll("[data-action='remove']").forEach(button => {
      button.addEventListener("click", () => this.#removeAsset(button.dataset.assetId));
    });
  }

  async #rerender() {
    await this.render({ parts: ["main"] });
  }

  async #addAsset() {
    assertGM();
    const details = await promptForAssetDetails({
      title: localize("AddTitle"),
      submitLabel: localize("Add")
    });
    if (!details) return;

    const assets = listAssets();
    if (assets.some(asset => asset.label.localeCompare(details.label, undefined, { sensitivity: "accent" }) === 0)) {
      ui.notifications.warn(localize("DuplicateLabel", { label: details.label }));
      return;
    }
    assets.push({ id: foundry.utils.randomID(), ...details, path: "" });
    await saveAssets(assets);
    await this.#rerender();
  }

  async #editAsset(assetId) {
    assertGM();
    const asset = getAsset(assetId);
    if (!asset) return;
    const details = await promptForAssetDetails({
      title: localize("EditTitle"),
      submitLabel: localize("Save"),
      asset
    });
    if (!details) return;

    const assets = listAssets();
    if (assets.some(entry => entry.id !== assetId && entry.label.localeCompare(details.label, undefined, { sensitivity: "accent" }) === 0)) {
      ui.notifications.warn(localize("DuplicateLabel", { label: details.label }));
      return;
    }
    await saveAssets(assets.map(entry => entry.id === assetId ? { ...entry, ...details } : entry));
    await this.#rerender();
  }

  async #chooseAsset(assetId) {
    assertGM();
    const asset = getAsset(assetId);
    if (!asset) return;
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    const picker = new FilePicker({
      type: asset.type,
      current: asset.path,
      callback: async path => {
        const assets = listAssets();
        await saveAssets(assets.map(entry => entry.id === assetId ? { ...entry, path } : entry));
        await this.#rerender();
      }
    });
    await picker.render({ force: true });
  }

  async #removeAsset(assetId) {
    assertGM();
    const asset = getAsset(assetId);
    if (!asset) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: localize("RemoveTitle") },
      content: `<p>${localize("RemoveConfirmation", { label: escapeHtml(asset.label) })}</p>`,
      yes: { label: localize("Remove") },
      no: { label: game.i18n.localize("Cancel") },
      rejectClose: false
    });
    if (!confirmed) return;
    await saveAssets(listAssets().filter(entry => entry.id !== assetId));
    await this.#rerender();
  }
}

export function openAssetLibrary() {
  assertGM();
  return new AssetLibraryConfig().render({ force: true });
}
