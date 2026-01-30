import esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.argv.includes("--production");

async function build() {
        const ctx = await esbuild.context({
                entryPoints: [path.resolve(__dirname, "src/extension.ts")],
                bundle: true,
                outfile: path.resolve(__dirname, "out/extension.js"),
                external: ["vscode"],
                format: "esm",
                target: "es2022",
                sourcemap: !isProduction,
                minify: isProduction,
                platform: "node",
                mainFields: ["module", "main"],
                conditions: ["import"],
                logLevel: "info",
                treeShaking: true,
        });

        if (isProduction) {
                await ctx.rebuild();
                await ctx.dispose();
                console.log("Build complete");
        } else {
                await ctx.watch();
                console.log("Watching for changes...");
        }
}

build().catch((err) => {
        console.error(err);
        process.exit(1);
});
