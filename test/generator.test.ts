import { test, expect, describe } from "bun:test";
import { parseSpec } from "../src/parser.ts";
import { generateSkill, generateOverflowEndpoints } from "../src/generator.ts";
import type { SkillGenConfig } from "../src/types.ts";
import { join } from "node:path";

const fixtureConfig: SkillGenConfig = {
  specFile: join(import.meta.dir, "fixtures", "petstore.json"),
  outputDir: "/tmp/skill-gen-test",
  prefix: "petstore",
};

describe("generateSkill", () => {
  test("produces valid YAML frontmatter", async () => {
    const spec = await parseSpec(fixtureConfig);
    const group = spec.tagGroups.get("pets")!;
    const md = generateSkill(group, spec, fixtureConfig);

    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("name: petstore-pets");
    expect(md).toContain("allowed-tools: Bash");
    expect(md).toContain("argument-hint:");
    const frontmatterEnd = md.indexOf("---", 4);
    expect(frontmatterEnd).toBeGreaterThan(0);
  });

  test("includes API title and base URL", async () => {
    const spec = await parseSpec(fixtureConfig);
    const group = spec.tagGroups.get("pets")!;
    const md = generateSkill(group, spec, fixtureConfig);

    expect(md).toContain("# Petstore — Pets");
    expect(md).toContain("Base URL: `https://petstore.example.com/v1`");
  });

  test("includes authentication section", async () => {
    const spec = await parseSpec(fixtureConfig);
    const group = spec.tagGroups.get("pets")!;
    const md = generateSkill(group, spec, fixtureConfig);

    expect(md).toContain("## Authentication");
    expect(md).toContain("Authorization: Bearer $API_BEARER_TOKEN");
    expect(md).toContain("X-API-Key: $X_API_KEY");
    expect(md).toContain("export API_BEARER_TOKEN=");
  });

  test("renders all endpoints for small groups", async () => {
    const spec = await parseSpec(fixtureConfig);
    const group = spec.tagGroups.get("pets")!;
    const md = generateSkill(group, spec, fixtureConfig);

    expect(md).toContain("### GET `/pets`");
    expect(md).toContain("### POST `/pets`");
    expect(md).toContain("### GET `/pets/{petId}`");
    expect(md).toContain("### PUT `/pets/{petId}`");
    expect(md).toContain("### DELETE `/pets/{petId}`");
  });

  test("includes parameter tables", async () => {
    const spec = await parseSpec(fixtureConfig);
    const group = spec.tagGroups.get("pets")!;
    const md = generateSkill(group, spec, fixtureConfig);

    expect(md).toContain("| `limit` | query |");
    expect(md).toContain("| `status` | query |");
    expect(md).toContain("| `petId` | path |");
  });

  test("includes curl examples", async () => {
    const spec = await parseSpec(fixtureConfig);
    const group = spec.tagGroups.get("pets")!;
    const md = generateSkill(group, spec, fixtureConfig);

    expect(md).toContain("```bash");
    expect(md).toContain("curl -s");
    expect(md).toContain("https://petstore.example.com/v1/pets");
  });

  test("renders request body schema", async () => {
    const spec = await parseSpec(fixtureConfig);
    const group = spec.tagGroups.get("pets")!;
    const md = generateSkill(group, spec, fixtureConfig);

    expect(md).toContain("**Request body**");
    expect(md).toContain("`name`");
  });

  test("includes data models section", async () => {
    const spec = await parseSpec(fixtureConfig);
    const group = spec.tagGroups.get("pets")!;
    const md = generateSkill(group, spec, fixtureConfig);

    expect(md).toContain("## Data Models");
    expect(md).toContain("### Pet");
    expect(md).toContain("### NewPet");
  });

  test("marks deprecated endpoints", async () => {
    const spec = await parseSpec(fixtureConfig);
    const group = spec.tagGroups.get("pets")!;
    const md = generateSkill(group, spec, fixtureConfig);

    const deleteSection = md.slice(md.indexOf("### DELETE"));
    expect(deleteSection).toContain("**Deprecated**");
  });

  test("renders enum types inline", async () => {
    const spec = await parseSpec(fixtureConfig);
    const group = spec.tagGroups.get("pets")!;
    const md = generateSkill(group, spec, fixtureConfig);

    expect(md).toContain("`available`");
    expect(md).toContain("`pending`");
    expect(md).toContain("`sold`");
  });

  test("generates store skill correctly", async () => {
    const spec = await parseSpec(fixtureConfig);
    const group = spec.tagGroups.get("store")!;
    const md = generateSkill(group, spec, fixtureConfig);

    expect(md).toContain("name: petstore-store");
    expect(md).toContain("# Petstore — Store");
    expect(md).toContain("### GET `/store/inventory`");
    expect(md).toContain("### POST `/store/orders`");
  });

  test("uses prefix in skill name", async () => {
    const spec = await parseSpec(fixtureConfig);
    const group = spec.tagGroups.get("pets")!;
    const md = generateSkill(group, spec, fixtureConfig);
    expect(md).toContain("name: petstore-pets");

    const noPrefix: SkillGenConfig = { ...fixtureConfig, prefix: undefined };
    const md2 = generateSkill(group, spec, noPrefix);
    expect(md2).toContain("name: pets");
  });

  test("does not generate overflow for small groups", async () => {
    const spec = await parseSpec(fixtureConfig);
    const group = spec.tagGroups.get("pets")!;
    const overflow = generateOverflowEndpoints(group, spec);
    expect(overflow).toBeUndefined();
  });

  test("curl example uses path param placeholders", async () => {
    const spec = await parseSpec(fixtureConfig);
    const group = spec.tagGroups.get("pets")!;
    const md = generateSkill(group, spec, fixtureConfig);

    expect(md).toContain("${PETID}");
  });

  test("curl example includes request body for POST", async () => {
    const spec = await parseSpec(fixtureConfig);
    const group = spec.tagGroups.get("store")!;
    const md = generateSkill(group, spec, fixtureConfig);

    expect(md).toContain("-X POST");
    expect(md).toContain('-d \'');
    expect(md).toContain("Content-Type: application/json");
  });
});
