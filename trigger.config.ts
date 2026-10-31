import { defineConfig } from "@trigger.dev/sdk";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";

// Copied from the local .env into the deployed environment on every `npm run deploy`
const SYNCED_ENV_VARS = [
  "GOOGLE_PLACES_API_KEY",
  "GOOGLE_SHEET_ID",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "CLICKUP_API_TOKEN",
  "CLICKUP_LIST_ID",
];

export default defineConfig({
  project: "proj_isyhnyjbioxyvzknwmzd",
  dirs: ["./src/trigger"],
  maxDuration: 600,
  build: {
    extensions: [
      syncEnvVars(() =>
        SYNCED_ENV_VARS.filter((name) => process.env[name]).map((name) => ({
          name,
          value: process.env[name]!,
        }))
      ),
    ],
  },
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 5000,
      maxTimeoutInMs: 30_000,
    },
  },
});
