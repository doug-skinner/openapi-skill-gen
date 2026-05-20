import type {
  SkillGenConfig,
  ParsedSpec,
  TagGroup,
  ParsedOperation,
  AuthScheme,
  ParsedParameter,
  SchemaObject,
} from "./types.ts";

const MAX_INLINE_ENDPOINTS = 15;
const MAX_SCHEMA_DEPTH = 3;

export function generateSkill(group: TagGroup, spec: ParsedSpec, config: SkillGenConfig): string {
  const skillName = config.prefix ? `${config.prefix}-${group.tag}` : group.tag;
  const tagTitle = capitalize(group.tag);
  const needsSplit = group.operations.length > MAX_INLINE_ENDPOINTS;

  const lines: string[] = [];

  lines.push("---");
  lines.push(`name: ${skillName}`);
  lines.push(`description: "Interact with ${spec.title} — ${group.description ?? tagTitle + " endpoints"}."`);
  lines.push(`argument-hint: <describe what you want to do with ${group.tag}>`);
  lines.push("allowed-tools: Bash");
  lines.push("---");
  lines.push("");
  lines.push(`# ${spec.title} — ${tagTitle}`);
  lines.push("");
  if (group.description) {
    lines.push(group.description);
    lines.push("");
  }
  lines.push(`Base URL: \`${spec.baseUrl}\``);
  lines.push("");

  lines.push(renderAuthSection(spec.authSchemes));

  if (needsSplit) {
    lines.push("## Endpoints (summary)");
    lines.push("");
    lines.push(`This API group has ${group.operations.length} endpoints. The most common are shown below. See \`references/endpoints.md\` for the full list.`);
    lines.push("");
    lines.push("| Method | Path | Summary |");
    lines.push("| --- | --- | --- |");
    for (const op of group.operations) {
      lines.push(`| ${op.method} | \`${op.path}\` | ${op.summary ?? ""} |`);
    }
    lines.push("");
    const top = group.operations.slice(0, 5);
    for (const op of top) {
      lines.push(renderEndpoint(op, spec));
    }
  } else {
    lines.push("## Endpoints");
    lines.push("");
    for (const op of group.operations) {
      lines.push(renderEndpoint(op, spec));
    }
  }

  const models = renderDataModels(group, spec);
  if (models) {
    lines.push(models);
  }

  return lines.join("\n");
}

export function generateOverflowEndpoints(group: TagGroup, spec: ParsedSpec): string | undefined {
  if (group.operations.length <= MAX_INLINE_ENDPOINTS) return undefined;

  const lines: string[] = [];
  lines.push(`# ${capitalize(group.tag)} — All Endpoints`);
  lines.push("");

  for (const op of group.operations) {
    lines.push(renderEndpoint(op, spec));
  }

  return lines.join("\n");
}

function renderAuthSection(authSchemes: AuthScheme[]): string {
  if (authSchemes.length === 0) {
    return "## Authentication\n\nNo authentication required.\n";
  }

  const lines: string[] = [];
  lines.push("## Authentication");
  lines.push("");

  for (const scheme of authSchemes) {
    if (scheme.type === "http" && scheme.scheme === "bearer") {
      lines.push(`Include \`Authorization: Bearer $${scheme.envVar}\` header.`);
    } else if (scheme.type === "http" && scheme.scheme === "basic") {
      lines.push(`Include \`Authorization: Basic $${scheme.envVar}\` header (base64-encoded \`user:pass\`).`);
    } else if (scheme.type === "apiKey") {
      const location = scheme.in ?? "header";
      if (location === "header") {
        lines.push(`Include header \`${scheme.paramName ?? scheme.name}: $${scheme.envVar}\`.`);
      } else if (location === "query") {
        lines.push(`Include query parameter \`${scheme.paramName ?? scheme.name}=$${scheme.envVar}\`.`);
      }
    } else if (scheme.type === "oauth2") {
      lines.push(`Include \`Authorization: Bearer $${scheme.envVar}\` header (OAuth2 access token).`);
      if (scheme.flows) {
        for (const [flowType, flow] of Object.entries(scheme.flows)) {
          if (flow.tokenUrl) {
            lines.push(`Token URL (${flowType}): \`${flow.tokenUrl}\``);
          }
        }
      }
    }
    lines.push("");
  }

  lines.push("Set your credentials:");
  lines.push("");
  lines.push("```bash");
  for (const scheme of authSchemes) {
    lines.push(`export ${scheme.envVar}="your-key-here"`);
  }
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

function renderEndpoint(op: ParsedOperation, spec: ParsedSpec): string {
  const lines: string[] = [];

  lines.push(`### ${op.method} \`${op.path}\``);
  lines.push("");

  if (op.deprecated) {
    lines.push("**Deprecated**");
    lines.push("");
  }

  if (op.summary) {
    lines.push(op.summary);
    lines.push("");
  }

  if (op.description && op.description !== op.summary) {
    lines.push(op.description);
    lines.push("");
  }

  const visibleParams = op.parameters.filter((p) => p.in !== "cookie");
  if (visibleParams.length > 0) {
    lines.push("| Name | In | Type | Required | Description |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const param of visibleParams) {
      lines.push(
        `| \`${param.name}\` | ${param.in} | ${renderTypeInline(param.schema)} | ${param.required ? "yes" : "no"} | ${param.description ?? ""} |`,
      );
    }
    lines.push("");
  }

  if (op.requestBody) {
    lines.push(`**Request body** (\`${op.requestBody.contentType}\`${op.requestBody.required ? ", required" : ""}):`);
    lines.push("");
    lines.push(renderSchema(op.requestBody.schema, 0));
    lines.push("");
  }

  const successResp = op.responses.find((r) => r.statusCode.startsWith("2")) ?? op.responses[0];
  if (successResp) {
    lines.push(`**Response ${successResp.statusCode}:** ${successResp.description}`);
    if (successResp.schema) {
      lines.push("");
      lines.push(renderSchema(successResp.schema, 0));
    }
    lines.push("");
  }

  lines.push("```bash");
  lines.push(generateCurlExample(op, spec));
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

function renderDataModels(group: TagGroup, spec: ParsedSpec): string | undefined {
  if (group.referencedSchemas.size === 0) return undefined;

  const lines: string[] = [];
  lines.push("## Data Models");
  lines.push("");

  for (const name of group.referencedSchemas) {
    const schema = spec.schemas.get(name);
    if (!schema) continue;

    lines.push(`### ${name}`);
    lines.push("");
    if (schema.description) {
      lines.push(schema.description);
      lines.push("");
    }
    lines.push(renderSchema(schema, 0));
    lines.push("");
  }

  return lines.join("\n");
}

function renderTypeInline(schema: SchemaObject): string {
  if (schema.refName) return schema.refName;
  if (schema.enum) return `${schema.type ?? "string"}, one of: ${schema.enum.map((v) => `\`${v}\``).join(" \\| ")}`;
  if (schema.type === "array") return `array of ${renderTypeInline(schema.items ?? { type: "string" })}`;
  let t = schema.type ?? "string";
  if (schema.format) t += ` (${schema.format})`;
  return t;
}

function renderSchema(schema: SchemaObject, depth: number): string {
  if (depth >= MAX_SCHEMA_DEPTH) {
    return schema.refName
      ? `_(nested object — see ${schema.refName} definition)_`
      : "_(nested object)_";
  }

  if (schema.type === "object" || schema.properties) {
    return renderObjectSchema(schema, depth);
  }

  if (schema.type === "array" && schema.items) {
    const inner = renderTypeInline(schema.items);
    if (schema.items.properties) {
      return `Array of objects:\n\n${renderObjectSchema(schema.items, depth + 1)}`;
    }
    return `Array of ${inner}`;
  }

  if (schema.oneOf || schema.anyOf) {
    const variants = schema.oneOf ?? schema.anyOf!;
    const names = variants.map((v) => v.refName ?? renderTypeInline(v));
    return `One of: ${names.join(", ")}`;
  }

  if (schema.allOf) {
    const merged = mergeAllOf(schema.allOf);
    return renderSchema(merged, depth);
  }

  return renderTypeInline(schema);
}

function renderObjectSchema(schema: SchemaObject, depth: number): string {
  const props = schema.properties;
  if (!props) return "object";

  const requiredSet = new Set(schema.required ?? []);
  const indent = "  ".repeat(depth);
  const lines: string[] = [];

  for (const [name, prop] of Object.entries(props)) {
    const req = requiredSet.has(name) ? " **(required)**" : "";
    const desc = prop.description ? ` — ${prop.description}` : "";

    if ((prop.type === "object" || prop.properties) && depth < MAX_SCHEMA_DEPTH - 1) {
      lines.push(`${indent}- \`${name}\`: object${req}${desc}`);
      lines.push(renderSchema(prop, depth + 1));
    } else if (prop.type === "array" && prop.items?.properties && depth < MAX_SCHEMA_DEPTH - 1) {
      lines.push(`${indent}- \`${name}\`: array of objects${req}${desc}`);
      lines.push(renderSchema(prop.items, depth + 1));
    } else {
      lines.push(`${indent}- \`${name}\`: ${renderTypeInline(prop)}${req}${desc}`);
    }
  }

  return lines.join("\n");
}

function mergeAllOf(schemas: SchemaObject[]): SchemaObject {
  const merged: SchemaObject = { type: "object", properties: {}, required: [] };
  for (const s of schemas) {
    if (s.properties) Object.assign(merged.properties!, s.properties);
    if (s.required) merged.required!.push(...s.required);
    if (s.description && !merged.description) merged.description = s.description;
  }
  return merged;
}

function generateCurlExample(op: ParsedOperation, spec: ParsedSpec): string {
  const parts: string[] = [];
  parts.push("curl -s");

  if (op.method !== "GET") {
    parts.push(`-X ${op.method}`);
  }

  const authHeader = buildAuthHeader(spec.authSchemes);
  if (authHeader) {
    parts.push(`-H "${authHeader}"`);
  }

  let path = op.path;
  for (const param of op.parameters.filter((p) => p.in === "path")) {
    path = path.replace(`{${param.name}}`, `\${${param.name.toUpperCase()}}`);
  }

  const queryParams = op.parameters.filter((p) => p.in === "query" && p.required);
  let url = `${spec.baseUrl}${path}`;
  if (queryParams.length > 0) {
    const qs = queryParams.map((p) => `${p.name}=\${${p.name.toUpperCase()}}`).join("&");
    url += `?${qs}`;
  }

  if (op.requestBody) {
    parts.push(`-H "Content-Type: ${op.requestBody.contentType}"`);
    const body = generatePlaceholderBody(op.requestBody.schema);
    parts.push(`-d '${JSON.stringify(body, null, 2)}'`);
  }

  parts.push(`"${url}"`);

  if (parts.length <= 3) {
    return parts.join(" ");
  }

  return parts.join(" \\\n  ");
}

function buildAuthHeader(authSchemes: AuthScheme[]): string | undefined {
  const scheme = authSchemes[0];
  if (!scheme) return undefined;

  if (scheme.type === "http" && scheme.scheme === "bearer") {
    return `Authorization: Bearer $${scheme.envVar}`;
  }
  if (scheme.type === "http" && scheme.scheme === "basic") {
    return `Authorization: Basic $${scheme.envVar}`;
  }
  if (scheme.type === "apiKey" && scheme.in === "header") {
    return `${scheme.paramName ?? scheme.name}: $${scheme.envVar}`;
  }
  if (scheme.type === "oauth2") {
    return `Authorization: Bearer $${scheme.envVar}`;
  }
  return undefined;
}

function generatePlaceholderBody(schema: SchemaObject): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const props = schema.properties;
  if (!props) return body;

  const requiredSet = new Set(schema.required ?? []);

  for (const [name, prop] of Object.entries(props)) {
    if (!requiredSet.has(name)) continue;
    body[name] = placeholderValue(prop);
  }

  if (Object.keys(body).length === 0) {
    for (const [name, prop] of Object.entries(props)) {
      body[name] = placeholderValue(prop);
    }
  }

  return body;
}

function placeholderValue(schema: SchemaObject): unknown {
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];

  switch (schema.type) {
    case "string":
      if (schema.format === "date-time") return "2024-01-01T00:00:00Z";
      if (schema.format === "date") return "2024-01-01";
      if (schema.format === "email") return "user@example.com";
      if (schema.format === "uri" || schema.format === "url") return "https://example.com";
      if (schema.format === "uuid") return "00000000-0000-0000-0000-000000000000";
      return "string";
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return true;
    case "array":
      return [];
    case "object":
      return schema.properties ? generatePlaceholderBody(schema) : {};
    default:
      return "string";
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
