import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    maxWorkers: 1,
    minWorkers: 1,
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    testTimeout: 20_000,
  },
});
