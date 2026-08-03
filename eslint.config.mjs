// TEMPORARY — root ESLint config.
//
// packages/agents and apps/backend have no eslint.config.js and no lint script,
// so ESLint's upward config search escaped the repo and picked up
// ~/eslint.config.js (a stray Vite scaffold). That config applies
// eslint:recommended, which since ESLint 9.39.0 includes no-useless-assignment
// as an error — hence the sudden squiggles after node_modules was re-resolved.
//
// This file stops the upward search at the repo root and keeps those two
// workspaces unlinted, which is the state they were always in.
// apps/frontend is unaffected: it has its own nearer eslint.config.js.
//
// To actually lint them later, replace the ignore below with the shared config:
//   import { config } from "@repo/eslint-config/base";
export default [
  {
    ignores: ["**/*"],
  },
];
