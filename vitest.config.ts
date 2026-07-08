import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" alias so tests can import app code (actions).
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Most tested modules (math, fees, alert evaluation, expiry) are pure and
    // import nothing from Prisma or Next. The proposal/expiry claim tests mock
    // @/lib/db with an in-memory stand-in, so no setup/db is required either.
  },
});
