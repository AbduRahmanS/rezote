import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.wrangler/**", "**/dev-dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-globals": ["error", { name: "localStorage", message: "Use the IndexedDB storage in @rezote/core." }],
    },
  },
  {
    files: ["packages/core/src/**/*.{ts,tsx}"],
    rules: {
      // The skeleton must stay app-agnostic.
      "no-restricted-imports": ["error", { patterns: ["**/apps/**", "@rezote/collecte", "@rezote/carnet-de-route"] }],
    },
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: { globals: { console: "readonly", process: "readonly", URL: "readonly", Buffer: "readonly" } },
  },
);
