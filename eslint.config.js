import js from "@eslint/js";
import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // templates/ holds placeholders that only parse once filled in; CI lints the generated app instead.
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.wrangler/**", "**/.tanstack/**", "**/routeTree.gen.ts", "templates/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginRouter.configs["flat/recommended"],
  ...pluginQuery.configs["flat/recommended"],
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-globals": ["error", { name: "localStorage", message: "Use the IndexedDB storage in @rezote/core." }],
    },
  },
  {
    files: ["packages/core/src/**/*.{ts,tsx}", "packages/sync-api/src/**/*.ts"],
    rules: {
      // The skeleton must stay app-agnostic.
      "no-restricted-imports": ["error", { patterns: ["**/apps/**", "@rezote/collecte", "@rezote/carnet-de-route"] }],
    },
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: { globals: { console: "readonly", process: "readonly", URL: "readonly", Buffer: "readonly", crypto: "readonly", TextEncoder: "readonly", btoa: "readonly" } },
  },
);
