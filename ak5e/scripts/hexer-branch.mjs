/** Hexer Supporter branch (Ch. 3 L7223–7330): composes Hexer Arts setup and the Hexes into one branch module. */
import { registerSupporterBranchModule } from "./supporter-branches.mjs";
import { hexerArtsPlans, defineHexerArtsPools, registerHexerArtsHooks, hexerArtsPanel, hexerArtsApi, runHexerArtsCommand } from "./hexer-arts.mjs";
import { hexerPlans, defineHexerPools, registerHexerHooks, hexerPanel, hexerApi, hexerCommand } from "./hexer-features.mjs";

const HEX_COMMANDS = new Set(["potentHex", "ultimateHex", "cursemark", "cursemarkArea"]);

registerSupporterBranchModule({
  id: "supporter-hexer",
  branch: "hexer",
  plans: { ...hexerArtsPlans, ...hexerPlans },
  pools() {
    defineHexerArtsPools();
    defineHexerPools();
  },
  hooks() {
    registerHexerArtsHooks();
    registerHexerHooks();
  },
  sheetPanel: actor => [hexerArtsPanel(actor), hexerPanel(actor)].filter(Boolean).join(""),
  async command(actor, cmd) {
    const arts = await runHexerArtsCommand(actor, cmd);
    if (arts !== undefined) return arts;
    return HEX_COMMANDS.has(cmd) ? hexerCommand(actor, cmd) : undefined;
  },
  api: Object.freeze({ ...hexerApi, arts: hexerArtsApi })
});
