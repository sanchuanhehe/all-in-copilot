import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/**/*.test.ts"],
		root: __dirname,
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html", "lcov"],
			reportsDirectory: "coverage",
			reportOn: "all",
			exclude: ["**/*.test.ts", "**/vitest.config.ts"],
		},
	},
});
