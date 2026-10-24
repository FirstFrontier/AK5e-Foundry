/**
 * Supporter branch index. Import-only: each branch module is imported here for its side effect of calling
 * registerSupporterBranchModule(). ak5e.mjs imports this file once. Later units append one line per branch,
 * for example: import "./hexer-features.mjs";
 */
import "./hexer-branch.mjs";
