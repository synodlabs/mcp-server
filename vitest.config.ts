import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    testTimeout: 20_000,
  },
});
