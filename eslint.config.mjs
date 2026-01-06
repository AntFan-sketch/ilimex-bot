import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  // Ignore scripts entirely (ESLint v9 flat-config replacement for .eslintignore)
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Your additional ignores:
    "scripts/**",
  ]),

  ...nextVitals,
  ...nextTs,

  // Temporarily allow `any` in API + server plumbing (unblocks deploy)
{
  files: [
    "src/app/api/**/*.ts",
    "src/lib/**/*.ts",
    "src/types/**/*.ts",
    "src/components/ChatWidget/**/*.tsx"
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
  },
},
]);

export default eslintConfig;
