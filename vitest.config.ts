import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The unit-tested modules (math, fees, alert evaluation, expiry) are pure
    // and import nothing from Prisma or Next, so no setup/db is required.
  },
});
