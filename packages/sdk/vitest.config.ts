import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html", "lcov"],
			reportsDirectory: resolve(__dirname, "coverage"),
			reportOn: "all",
			exclude: ["**/*.test.ts", "**/vitest.config.ts"],
		},
	},
});
