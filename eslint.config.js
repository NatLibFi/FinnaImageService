import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import jsdoc from "eslint-plugin-jsdoc";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js, jsdoc: jsdoc },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
    rules: {
    // Recommended
    "jsdoc/check-access": 1,
    "jsdoc/check-alignment": 1,
    "jsdoc/check-param-names": 1,
    "jsdoc/check-property-names": 1,
    "jsdoc/check-tag-names": 1,
    "jsdoc/check-types": 1,
    "jsdoc/check-values": 1,
    "jsdoc/empty-tags": 1,
    "jsdoc/implements-on-classes": 1,
    "jsdoc/multiline-blocks": 1,
    "jsdoc/no-multi-asterisks": 1,
    "jsdoc/no-undefined-types": 1,
    "jsdoc/require-jsdoc": 1,
    "jsdoc/require-param": 1,
    "jsdoc/require-param-description": 1,
    "jsdoc/require-param-name": 1,
    "jsdoc/require-param-type": 1,
    "jsdoc/require-property": 1,
    "jsdoc/require-property-description": 1,
    "jsdoc/require-property-name": 1,
    "jsdoc/require-property-type": 1,
    "jsdoc/require-returns": 1,
    "jsdoc/require-returns-check": 1,
    "jsdoc/require-returns-description": 1,
    "jsdoc/require-returns-type": 1,
    "jsdoc/require-yields": 1,
    "jsdoc/require-yields-check": 1,
    "jsdoc/tag-lines": 1,
    "jsdoc/valid-types": 1
		},
  },
]);
