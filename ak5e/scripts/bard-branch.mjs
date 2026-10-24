/**
 * Bard Supporter branch (Ch. 3 L7096-7211 composing, L7106-7164 performing): composes the Bard composing half
 * (bard-compose.mjs, U7) and the Bard performing half (bard-perform.mjs, U8) into one registered branch module.
 */
import { registerSupporterBranchModule } from "./supporter-branches.mjs";
import {
  bardComposePlans, defineBardComposePools, registerBardComposeHooks, bardComposePanel, bardComposeApi, bardComposeCommand
} from "./bard-compose.mjs";
import {
  bardPerformPlans, defineBardPerformPools, registerBardPerformHooks, bardPerformPanel, bardPerformApi, bardPerformCommand
} from "./bard-perform.mjs";

const collidingPlans = Object.keys(bardComposePlans).filter(name => Object.hasOwn(bardPerformPlans, name));
if (collidingPlans.length) throw new Error(`Bard plan names collide: ${collidingPlans.join(", ")}.`);

registerSupporterBranchModule({
  id: "supporter-bard",
  branch: "bard",
  plans: { ...bardComposePlans, ...bardPerformPlans },
  pools() {
    defineBardComposePools();
    defineBardPerformPools();
  },
  hooks() {
    registerBardComposeHooks();
    registerBardPerformHooks();
  },
  sheetPanel: actor => [bardComposePanel(actor), bardPerformPanel(actor)].filter(Boolean).join(""),
  async command(actor, cmd) {
    const composed = await bardComposeCommand(actor, cmd);
    if (composed !== undefined) return composed;
    return bardPerformCommand(actor, cmd);
  },
  api: Object.freeze({ ...bardComposeApi, perform: bardPerformApi })
});
