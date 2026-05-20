import { parse as parseYaml } from "yaml";
import type {
  SkillGenConfig,
  ParsedSpec,
  AuthScheme,
  TagGroup,
  ParsedOperation,
  ParsedParameter,
  ParsedRequestBody,
  ParsedResponse,
  SchemaObject,
} from "./types.ts";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "options", "head"] as const;

export async function parseSpec(config: SkillGenConfig): Promise<ParsedSpec> {
  const file = Bun.file(config.specFile);
  const text = await file.text();

  const isYaml = /\.ya?ml$/i.test(config.specFile);
  const raw = isYaml ? parseYaml(text) : JSON.parse(text);

  if (!raw.openapi || !String(raw.openapi).startsWith("3.")) {
    throw new Error(`Only OpenAPI 3.x is supported (found: ${raw.openapi ?? "none"})`);
  }

  const resolved = resolveRefs(raw, raw, new Set()) as Record<string, unknown>;

  const info = resolved.info as Record<string, string> | undefined;
  const servers = resolved.servers as Array<{ url: string }> | undefined;
  const baseUrl = config.baseUrl ?? servers?.[0]?.url ?? "https://api.example.com";

  const components = resolved.components as Record<string, unknown> | undefined;
  const securitySchemes = components?.securitySchemes as Record<string, unknown> | undefined;
  const authSchemes = securitySchemes ? extractAuthSchemes(securitySchemes) : [];

  const schemas = new Map<string, SchemaObject>();
  const rawSchemas = components?.schemas as Record<string, unknown> | undefined;
  if (rawSchemas) {
    for (const [name, schema] of Object.entries(rawSchemas)) {
      schemas.set(name, schema as SchemaObject);
    }
  }

  const paths = resolved.paths as Record<string, unknown> | undefined;
  const operations = paths ? extractOperations(paths) : [];

  const specTags = (resolved.tags as Array<{ name: string; description?: string }>) ?? [];
  const tagGroups = groupByTag(operations, specTags);

  for (const group of tagGroups.values()) {
    collectReferencedSchemas(group);
  }

  return {
    title: info?.title ?? "API",
    description: info?.description ?? "",
    version: info?.version ?? "0.0.0",
    baseUrl: baseUrl.replace(/\/$/, ""),
    authSchemes,
    tagGroups,
    schemas,
  };
}

function resolveRefs(obj: unknown, root: Record<string, unknown>, visited: Set<string>): unknown {
  if (obj === null || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveRefs(item, root, visited));
  }

  const record = obj as Record<string, unknown>;
  if (typeof record.$ref === "string") {
    const refPath = record.$ref;
    if (visited.has(refPath)) {
      return { type: "object", description: `(circular reference to ${refPath.split("/").pop()})` };
    }

    const resolved = lookupRef(refPath, root);
    if (!resolved) {
      console.error(`Warning: Could not resolve $ref: ${refPath}`);
      return { type: "object", description: "Unresolved reference" };
    }

    visited.add(refPath);
    const result = resolveRefs(structuredClone(resolved), root, visited) as Record<string, unknown>;
    visited.delete(refPath);

    result.refName = refPath.split("/").pop();
    return result;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = resolveRefs(value, root, visited);
  }
  return result;
}

function lookupRef(refPath: string, root: Record<string, unknown>): unknown {
  if (!refPath.startsWith("#/")) return undefined;
  const parts = refPath.slice(2).split("/");
  let current: unknown = root;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function extractAuthSchemes(securitySchemes: Record<string, unknown>): AuthScheme[] {
  const schemes: AuthScheme[] = [];

  for (const [name, raw] of Object.entries(securitySchemes)) {
    const scheme = raw as Record<string, unknown>;
    const type = scheme.type as AuthScheme["type"];

    let envVar: string;
    if (type === "apiKey") {
      const paramName = (scheme.name as string) ?? name;
      envVar = paramName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    } else if (type === "http" && scheme.scheme === "bearer") {
      envVar = "API_BEARER_TOKEN";
    } else if (type === "http" && scheme.scheme === "basic") {
      envVar = "API_BASIC_CREDENTIALS";
    } else if (type === "oauth2") {
      envVar = "OAUTH2_ACCESS_TOKEN";
    } else {
      envVar = `${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_KEY`;
    }

    schemes.push({
      name,
      type,
      in: scheme.in as AuthScheme["in"],
      paramName: scheme.name as string | undefined,
      scheme: scheme.scheme as string | undefined,
      bearerFormat: scheme.bearerFormat as string | undefined,
      flows: scheme.flows as AuthScheme["flows"],
      envVar,
    });
  }

  return schemes;
}

function extractOperations(paths: Record<string, unknown>): ParsedOperation[] {
  const operations: ParsedOperation[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    const item = pathItem as Record<string, unknown>;
    const pathParams = (item.parameters as unknown[]) ?? [];

    for (const method of HTTP_METHODS) {
      const op = item[method] as Record<string, unknown> | undefined;
      if (!op) continue;

      const opParams = (op.parameters as unknown[]) ?? [];
      const mergedParams = mergeParameters(pathParams, opParams);

      operations.push({
        operationId: op.operationId as string | undefined,
        summary: op.summary as string | undefined,
        description: op.description as string | undefined,
        method: method.toUpperCase(),
        path,
        tags: (op.tags as string[]) ?? [],
        deprecated: !!op.deprecated,
        security: op.security as ParsedOperation["security"],
        parameters: mergedParams.map(parseParameter),
        requestBody: op.requestBody ? parseRequestBody(op.requestBody as Record<string, unknown>) : undefined,
        responses: op.responses ? parseResponses(op.responses as Record<string, unknown>) : [],
      });
    }
  }

  return operations;
}

function mergeParameters(pathLevel: unknown[], opLevel: unknown[]): unknown[] {
  const merged = new Map<string, unknown>();

  for (const p of pathLevel) {
    const param = p as Record<string, unknown>;
    merged.set(`${param.name}:${param.in}`, param);
  }
  for (const p of opLevel) {
    const param = p as Record<string, unknown>;
    merged.set(`${param.name}:${param.in}`, param);
  }

  return Array.from(merged.values());
}

function parseParameter(raw: unknown): ParsedParameter {
  const p = raw as Record<string, unknown>;
  return {
    name: p.name as string,
    in: p.in as ParsedParameter["in"],
    required: !!p.required,
    description: p.description as string | undefined,
    schema: (p.schema as SchemaObject) ?? { type: "string" },
    example: p.example,
  };
}

function parseRequestBody(raw: Record<string, unknown>): ParsedRequestBody | undefined {
  const content = raw.content as Record<string, unknown> | undefined;
  if (!content) return undefined;

  const jsonContent = content["application/json"] as Record<string, unknown> | undefined;
  const firstContent = jsonContent ?? (Object.values(content)[0] as Record<string, unknown> | undefined);
  const contentType = jsonContent ? "application/json" : Object.keys(content)[0] ?? "application/json";

  if (!firstContent) return undefined;

  return {
    required: !!raw.required,
    description: raw.description as string | undefined,
    contentType,
    schema: (firstContent.schema as SchemaObject) ?? { type: "object" },
  };
}

function parseResponses(raw: Record<string, unknown>): ParsedResponse[] {
  const responses: ParsedResponse[] = [];

  for (const [statusCode, resp] of Object.entries(raw)) {
    const r = resp as Record<string, unknown>;
    const content = r.content as Record<string, unknown> | undefined;
    let schema: SchemaObject | undefined;
    let contentType: string | undefined;

    if (content) {
      const jsonContent = content["application/json"] as Record<string, unknown> | undefined;
      const firstContent = jsonContent ?? (Object.values(content)[0] as Record<string, unknown> | undefined);
      contentType = jsonContent ? "application/json" : Object.keys(content)[0];
      schema = firstContent?.schema as SchemaObject | undefined;
    }

    responses.push({
      statusCode,
      description: (r.description as string) ?? "",
      contentType,
      schema,
    });
  }

  return responses;
}

function groupByTag(
  operations: ParsedOperation[],
  specTags: Array<{ name: string; description?: string }>,
): Map<string, TagGroup> {
  const groups = new Map<string, TagGroup>();
  const tagDescriptions = new Map(specTags.map((t) => [t.name, t.description]));

  for (const op of operations) {
    const tags = op.tags.length > 0 ? op.tags : ["general"];
    for (const tag of tags) {
      let group = groups.get(tag);
      if (!group) {
        group = {
          tag,
          description: tagDescriptions.get(tag),
          operations: [],
          referencedSchemas: new Set(),
        };
        groups.set(tag, group);
      }
      group.operations.push(op);
    }
  }

  const general = groups.get("general");
  if (general && general.operations.length > 20) {
    groups.delete("general");
    for (const op of general.operations) {
      const segment = op.path.split("/").filter(Boolean)[0] ?? "general";
      let group = groups.get(segment);
      if (!group) {
        group = {
          tag: segment,
          operations: [],
          referencedSchemas: new Set(),
        };
        groups.set(segment, group);
      }
      group.operations.push(op);
    }
    console.error(
      `Warning: Spec has no tags. Auto-grouped ${general.operations.length} operations by path segment.`,
    );
  }

  return groups;
}

function collectReferencedSchemas(group: TagGroup): void {
  for (const op of group.operations) {
    for (const param of op.parameters) {
      walkSchema(param.schema, group.referencedSchemas);
    }
    if (op.requestBody) {
      walkSchema(op.requestBody.schema, group.referencedSchemas);
    }
    for (const resp of op.responses) {
      if (resp.schema) walkSchema(resp.schema, group.referencedSchemas);
    }
  }
}

function walkSchema(schema: SchemaObject, refs: Set<string>): void {
  if (schema.refName) refs.add(schema.refName);
  if (schema.properties) {
    for (const prop of Object.values(schema.properties)) {
      walkSchema(prop, refs);
    }
  }
  if (schema.items) walkSchema(schema.items, refs);
  if (schema.oneOf) schema.oneOf.forEach((s) => walkSchema(s, refs));
  if (schema.anyOf) schema.anyOf.forEach((s) => walkSchema(s, refs));
  if (schema.allOf) schema.allOf.forEach((s) => walkSchema(s, refs));
  if (typeof schema.additionalProperties === "object" && schema.additionalProperties) {
    walkSchema(schema.additionalProperties, refs);
  }
}
