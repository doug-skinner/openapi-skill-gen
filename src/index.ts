#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { join, resolve } from "node:path";
import type { SkillGenConfig } from "./types.ts";
import { parseSpec } from "./parser.ts";
import { generateSkill, generateOverflowEndpoints } from "./generator.ts";

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      output: { type: "string", short: "o" },
      "base-url": { type: "string" },
      prefix: { type: "string", short: "p" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help || positionals.length === 0) {
    printUsage();
    process.exit(positionals.length === 0 ? 1 : 0);
  }

  const config: SkillGenConfig = {
    specFile: resolve(positionals[0]!),
    outputDir: resolve(values.output as string ?? ".claude/skills"),
    baseUrl: values["base-url"] as string | undefined,
    prefix: values.prefix as string | undefined,
  };

  const specExists = await Bun.file(config.specFile).exists();
  if (!specExists) {
    console.error(`Error: spec file not found: ${config.specFile}`);
    process.exit(1);
  }

  const spec = await parseSpec(config);
  const created: string[] = [];

  for (const [tag, group] of spec.tagGroups) {
    const skillName = config.prefix ? `${config.prefix}-${tag}` : tag;
    const skillDir = join(config.outputDir, skillName);
    const skillPath = join(skillDir, "SKILL.md");
    const markdown = generateSkill(group, spec, config);

    await Bun.write(skillPath, markdown);
    created.push(skillName);

    const overflow = generateOverflowEndpoints(group, spec);
    if (overflow) {
      await Bun.write(join(skillDir, "references", "endpoints.md"), overflow);
    }
  }

  console.log(`\nGenerated ${created.length} skill(s) from ${spec.title} v${spec.version}:\n`);
  for (const name of created) {
    const tag = config.prefix ? name.slice(config.prefix.length + 1) : name;
    const group = spec.tagGroups.get(tag)!;
    console.log(`  ${name}/SKILL.md  (${group.operations.length} endpoint${group.operations.length === 1 ? "" : "s"})`);
  }
  console.log(`\nOutput: ${config.outputDir}`);
}

function printUsage(): void {
  console.log(`
Usage: openapi-skill-gen <spec-file> [options]

Generate Claude Code skills from an OpenAPI 3.x spec.

Options:
  -o, --output <dir>      Output directory (default: .claude/skills/)
  --base-url <url>        Override the API base URL
  -p, --prefix <name>     Prefix for skill names (e.g. "petstore")
  -h, --help              Show this help
`);
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
