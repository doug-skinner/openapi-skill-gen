import { test, expect, describe } from "bun:test";
import { parseSpec } from "../src/parser.ts";
import type { SkillGenConfig } from "../src/types.ts";
import { join } from "node:path";

const fixtureConfig: SkillGenConfig = {
  specFile: join(import.meta.dir, "fixtures", "petstore.json"),
  outputDir: "/tmp/skill-gen-test",
};

describe("parseSpec", () => {
  test("extracts top-level info", async () => {
    const spec = await parseSpec(fixtureConfig);
    expect(spec.title).toBe("Petstore");
    expect(spec.version).toBe("1.0.0");
    expect(spec.baseUrl).toBe("https://petstore.example.com/v1");
    expect(spec.description).toBe("A sample API for managing pets");
  });

  test("respects base-url override", async () => {
    const spec = await parseSpec({ ...fixtureConfig, baseUrl: "https://custom.api.com" });
    expect(spec.baseUrl).toBe("https://custom.api.com");
  });

  test("extracts auth schemes", async () => {
    const spec = await parseSpec(fixtureConfig);
    expect(spec.authSchemes.length).toBe(2);

    const bearer = spec.authSchemes.find((s) => s.name === "bearerAuth");
    expect(bearer).toBeDefined();
    expect(bearer!.type).toBe("http");
    expect(bearer!.scheme).toBe("bearer");
    expect(bearer!.envVar).toBe("API_BEARER_TOKEN");

    const apiKey = spec.authSchemes.find((s) => s.name === "apiKey");
    expect(apiKey).toBeDefined();
    expect(apiKey!.type).toBe("apiKey");
    expect(apiKey!.in).toBe("header");
    expect(apiKey!.envVar).toBe("X_API_KEY");
  });

  test("groups operations by tag", async () => {
    const spec = await parseSpec(fixtureConfig);
    expect(spec.tagGroups.size).toBe(2);
    expect(spec.tagGroups.has("pets")).toBe(true);
    expect(spec.tagGroups.has("store")).toBe(true);
  });

  test("parses pets operations correctly", async () => {
    const spec = await parseSpec(fixtureConfig);
    const pets = spec.tagGroups.get("pets")!;
    expect(pets.operations.length).toBe(5);

    const listPets = pets.operations.find((o) => o.operationId === "listPets");
    expect(listPets).toBeDefined();
    expect(listPets!.method).toBe("GET");
    expect(listPets!.path).toBe("/pets");
    expect(listPets!.parameters.length).toBe(2);

    const limitParam = listPets!.parameters.find((p) => p.name === "limit");
    expect(limitParam!.in).toBe("query");
    expect(limitParam!.required).toBe(false);
    expect(limitParam!.schema.type).toBe("integer");
  });

  test("parses request bodies", async () => {
    const spec = await parseSpec(fixtureConfig);
    const pets = spec.tagGroups.get("pets")!;
    const createPet = pets.operations.find((o) => o.operationId === "createPet");
    expect(createPet!.requestBody).toBeDefined();
    expect(createPet!.requestBody!.required).toBe(true);
    expect(createPet!.requestBody!.contentType).toBe("application/json");
    expect(createPet!.requestBody!.schema.properties).toBeDefined();
    expect(createPet!.requestBody!.schema.properties!.name).toBeDefined();
  });

  test("resolves $ref references", async () => {
    const spec = await parseSpec(fixtureConfig);
    const pets = spec.tagGroups.get("pets")!;
    const createPet = pets.operations.find((o) => o.operationId === "createPet");
    const bodySchema = createPet!.requestBody!.schema;
    expect(bodySchema.refName).toBe("NewPet");
    expect(bodySchema.properties).toBeDefined();
    expect(bodySchema.properties!.name.type).toBe("string");
  });

  test("merges path-level and operation-level parameters", async () => {
    const spec = await parseSpec(fixtureConfig);
    const pets = spec.tagGroups.get("pets")!;
    const getPet = pets.operations.find((o) => o.operationId === "getPet");
    expect(getPet!.parameters.length).toBe(1);
    expect(getPet!.parameters[0].name).toBe("petId");
    expect(getPet!.parameters[0].in).toBe("path");
    expect(getPet!.parameters[0].required).toBe(true);
  });

  test("detects deprecated operations", async () => {
    const spec = await parseSpec(fixtureConfig);
    const pets = spec.tagGroups.get("pets")!;
    const deletePet = pets.operations.find((o) => o.operationId === "deletePet");
    expect(deletePet!.deprecated).toBe(true);
  });

  test("collects referenced schemas per tag group", async () => {
    const spec = await parseSpec(fixtureConfig);
    const pets = spec.tagGroups.get("pets")!;
    expect(pets.referencedSchemas.has("Pet")).toBe(true);
    expect(pets.referencedSchemas.has("NewPet")).toBe(true);
    expect(pets.referencedSchemas.has("Error")).toBe(true);

    const store = spec.tagGroups.get("store")!;
    expect(store.referencedSchemas.has("Order")).toBe(true);
  });

  test("extracts component schemas", async () => {
    const spec = await parseSpec(fixtureConfig);
    expect(spec.schemas.has("Pet")).toBe(true);
    expect(spec.schemas.has("NewPet")).toBe(true);
    expect(spec.schemas.has("Order")).toBe(true);
    expect(spec.schemas.has("Error")).toBe(true);
  });

  test("parses store operations", async () => {
    const spec = await parseSpec(fixtureConfig);
    const store = spec.tagGroups.get("store")!;
    expect(store.operations.length).toBe(2);
    expect(store.description).toBe("Store inventory and orders");
  });

  test("parses enum parameters", async () => {
    const spec = await parseSpec(fixtureConfig);
    const pets = spec.tagGroups.get("pets")!;
    const listPets = pets.operations.find((o) => o.operationId === "listPets")!;
    const statusParam = listPets.parameters.find((p) => p.name === "status")!;
    expect(statusParam.schema.enum).toEqual(["available", "pending", "sold"]);
  });
});
