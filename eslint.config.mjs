import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".claude/**",
    "coverage/**",
  ]),
  {
    files: ["**/*.{test,spec}.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@ai-sdk/openai",
              message:
                "Do not import LLM SDKs in tests; keep Vitest hermetic (pure modules, fixtures, mocks).",
            },
            {
              name: "openai",
              message:
                "Do not import LLM SDKs in tests; keep Vitest hermetic (pure modules, fixtures, mocks).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
