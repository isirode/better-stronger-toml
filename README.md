# better-stronger-toml

A VS Code extension allowing syntax validation for TOML and schema validation using Json and Hjson.

It is currently in preview, report bugs [on Github](https://github.com/isirode/better-stronger-toml/issues).

## Features

- [x] Syntax validation for [TOML 1.0.0](https://toml.io/en/v1.0.0)
- [x] Schema validation with [Json Schema draft-2020-12](https://json-schema.org/draft/2020-12/release-notes.html)
- [x] Default schema & glob pattern associations with schema
- [x] Loading schema in Json or [Hjson](https://hjson.github.io/) 
- [ ] Syntax Hightlighting is not supported yet, but other extensions providing this feature only are available, you can use them conjointly with this extension

### TOML

TOML is a simple data format, usually used for configuration files, this extension provide syntaxic correction for it. 

```toml
id = 10
owner = "John Doe"

[server]
enabled = true
hostname = "localhost"
port = 8080
```

### Json schema

The extension allow you to use usual Json schema. 

```json
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Server schema",
  "description": "Simple schema of a server",
  "type": "object",
  "properties": {
    "id": {
      "description": "The unique identifier of a server",
      "type": "integer"
    },
    "owner": {
      "description": "Owner of the server",
      "type": "string"
    },
    "server": {
      "description": "Configuration of the server",
      "$ref": "#/definitions/Server"
    }
  },
  "required": ["id", "owner", "server"],
  "definitions": {
    "Server": {
      "type": "object",
      "additionalProperties": true,
      "properties": {
        "enabled": {
          "type": "boolean"
        },
        "localhost": {
          "type": "string"
        },
        "port": { 
          "type": "integer",
          "minimum": 1024,
          "maximum": 65535
        }
      },
      "title": "Configuration of the server",
      "required": [ "hostname", "port" ]
    }
  }
}
```

### Hjson schema

The extension allow you to specify the schema with a less verbose syntax than Json : Hjson.

````hjson
{
  // You can use comments
  # Properties do not need quotes
  $schema: "http://json-schema.org/draft-04/schema#",
  /* Strings do not need quotes */
  title: Server schema
  type: "object"
  // You do not need commas
  description: "Simple schema of a server"
  properties: {
    id: {
      description: The unique identifier of a server
      type: integer
    }
    owner: {
      description: Owner of the server
      type: "string"
    }
    server: {
      description: "Configuration of the server"
      $ref: "#/definitions/Server"
    }
  }
  required: ["id", "owner", "server"]
  definitions: {
    Server: {
      type: "object"
      additionalProperties : true
      properties: {
        "enabled": {
          "type" : "boolean"
        },
        localhost: {
          "type": "string"
        },
        port: { 
          type: "integer",
          minimum: 1024,
          maximum: 65535
        }
      }
      title : "Configuration of the server"
      required : [ "hostname", "port" ]
    }
  }
}
```

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

This extension contributes the following settings:

* `betterStrongerToml.jsonSchema.enabled`: enable/disable usage of schemas
* `betterStrongerToml.jsonSchema.defaultSchema`: default schema to use, example : "./schema.json"
* `betterStrongerToml.jsonSchema.associations`: associations between a glob pattern ("**/*.server.toml" for instance) and a schema

## Release Notes

Users appreciate release notes as you update your extension.

### 0.0.1

Initial release of Better Stronger TOML (preview).

