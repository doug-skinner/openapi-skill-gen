# openapi-skill-gen

Generate [Claude Code skills](https://docs.anthropic.com/en/docs/claude-code/skills) from OpenAPI specs — give your coding agent structured API knowledge without building MCP servers.

## What it does

Takes an OpenAPI 3.x specification (JSON or YAML) and generates one Claude Code skill per API tag. Each skill contains:

- Endpoint documentation with parameters, request bodies, and response schemas
- Authentication instructions with environment variable references
- Ready-to-use `curl` examples for every operation
- Data model definitions for referenced schemas

Once generated, you can invoke skills directly in Claude Code (e.g. `/petstore-pets list all available pets`) and Claude will construct the right API calls.

## Install

Requires [Bun](https://bun.sh).

```bash
bun install -g openapi-skill-gen
```

## Usage

```
openapi-skill-gen <spec-file> [options]

Options:
  -o, --output <dir>      Output directory (default: .claude/skills/)
  --base-url <url>        Override the API base URL from the spec
  -p, --prefix <name>     Prefix for skill names (e.g. "petstore")
  -h, --help              Show this help
```

### Example

```bash
# Generate skills from a Petstore spec
openapi-skill-gen petstore.yaml --prefix petstore

# Generated:
#   .claude/skills/petstore-pets/SKILL.md   (5 endpoints)
#   .claude/skills/petstore-store/SKILL.md  (2 endpoints)
```

Then in Claude Code:

```
> /petstore-pets create a new pet named "Buddy" with tag "dog"
```

Claude will construct and execute the appropriate `curl` command using the endpoint documentation in the skill.

### Output structure

```
.claude/skills/
└── {prefix}-{tag}/
    ├── SKILL.md              # Main skill file
    └── references/
        └── endpoints.md      # Full endpoint list (only for large APIs with >15 endpoints per tag)
```

## Features

- **JSON and YAML** spec support
- **`$ref` resolution** with circular reference detection
- **One skill per tag** — operations grouped by OpenAPI tag, with auto-grouping by path segment for untagged specs
- **Auth extraction** — reads `securitySchemes` and generates env var references (Bearer, API key, OAuth2, Basic)
- **Curl examples** — generated per endpoint with auth headers, path parameter placeholders, and JSON body skeletons
- **Schema rendering** — human-readable property lists instead of raw JSON Schema
- **Large API handling** — groups with >15 endpoints split details into `references/endpoints.md`

## How it works

1. Parses the OpenAPI 3.x spec and resolves all `$ref` references
2. Extracts authentication schemes and generates environment variable names
3. Groups operations by tag (falls back to path-segment grouping if no tags)
4. For each tag group, generates a `SKILL.md` with frontmatter, endpoint docs, curl examples, and data models
5. Writes skill directories to the output path

## Development

```bash
bun install
bun test
```

Run against the included Petstore fixture:

```bash
bun run src/index.ts test/fixtures/petstore.json --prefix petstore --output /tmp/test-output
```

## License

MIT
