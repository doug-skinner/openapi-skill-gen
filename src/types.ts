export interface SkillGenConfig {
  specFile: string;
  outputDir: string;
  baseUrl?: string;
  prefix?: string;
}

export interface ParsedSpec {
  title: string;
  description: string;
  version: string;
  baseUrl: string;
  authSchemes: AuthScheme[];
  tagGroups: Map<string, TagGroup>;
  schemas: Map<string, SchemaObject>;
}

export interface AuthScheme {
  name: string;
  type: "apiKey" | "http" | "oauth2" | "openIdConnect";
  in?: "header" | "query" | "cookie";
  paramName?: string;
  scheme?: string;
  bearerFormat?: string;
  flows?: Record<string, OAuthFlow>;
  envVar: string;
}

export interface OAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  scopes: Record<string, string>;
}

export interface TagGroup {
  tag: string;
  description?: string;
  operations: ParsedOperation[];
  referencedSchemas: Set<string>;
}

export interface ParsedOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  method: string;
  path: string;
  tags: string[];
  deprecated: boolean;
  security?: SecurityRequirement[];
  parameters: ParsedParameter[];
  requestBody?: ParsedRequestBody;
  responses: ParsedResponse[];
}

export type SecurityRequirement = Record<string, string[]>;

export interface ParsedParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  description?: string;
  schema: SchemaObject;
  example?: unknown;
}

export interface ParsedRequestBody {
  required: boolean;
  description?: string;
  contentType: string;
  schema: SchemaObject;
}

export interface ParsedResponse {
  statusCode: string;
  description: string;
  contentType?: string;
  schema?: SchemaObject;
}

export interface SchemaObject {
  type?: string;
  format?: string;
  description?: string;
  enum?: unknown[];
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  additionalProperties?: boolean | SchemaObject;
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  allOf?: SchemaObject[];
  nullable?: boolean;
  default?: unknown;
  example?: unknown;
  $ref?: string;
  refName?: string;
}
