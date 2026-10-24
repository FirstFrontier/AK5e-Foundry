/**
 * Artificer Supporter branch (Ch. 3 L6858-7073): composes the Automaton lifecycle and core (artificer-features.mjs)
 * and the Heavy Duty Upgrades (artificer-upgrades.mjs) into one registered branch module.
 */
import { registerSupporterBranchModule } from "./supporter-branches.mjs";
import {
  artificerPlans, artificerReadings, defineArtificerPools, registerArtificerHooks, artificerPanel, artificerApi, artificerCommand
} from "./artificer-features.mjs";
import {
  artificerUpgradePlans, defineArtificerUpgradePools, registerArtificerUpgradeHooks, artificerUpgradePanel, artificerUpgradeApi, artificerUpgradeCommand
} from "./artificer-upgrades.mjs";

const collidingPlans = Object.keys(artificerPlans).filter(name => Object.hasOwn(artificerUpgradePlans, name));
if (collidingPlans.length) throw new Error(`Artificer plan names collide: ${collidingPlans.join(", ")}.`);

registerSupporterBranchModule({
  id: "supporter-artificer",
  branch: "artificer",
  plans: { ...artificerPlans, ...artificerUpgradePlans },
  readings: artificerReadings,
  pools() {
    defineArtificerPools();
    defineArtificerUpgradePools();
  },
  hooks() {
    registerArtificerHooks();
    registerArtificerUpgradeHooks();
  },
  sheetPanel(actor) {
    // The Fort Builder pool is read by the panel; defining it here (idempotent) keeps a render before initSupporterBranches() safe.
    defineArtificerPools();
    return [artificerPanel(actor), artificerUpgradePanel(actor)].filter(Boolean).join("");
  },
  async command(actor, cmd) {
    const automaton = await artificerCommand(actor, cmd);
    if (automaton !== undefined) return automaton;
    return artificerUpgradeCommand(actor, cmd);
  },
  api: Object.freeze({ ...artificerApi, upgrades: artificerUpgradeApi })
});
