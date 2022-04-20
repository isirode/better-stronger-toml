import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  NotificationType,
  DidChangeWatchedFilesParams,
  MarkupContent,
  MarkupKind
} from 'vscode-languageserver/node';

import { TextDocument, Position as TextDocumentPosition } from 'vscode-languageserver-textdocument';

import * as fs from 'fs';
var minimatch = require("minimatch");

//#region "TOML parser"

// TODO : extends TOML to have multiline comments
// TODO : use the AST so that we can improve diagnostics
// TODO : extends so that we can go back to the racine
import type { AST } from "toml-eslint-parser";
import { parseTOML, getStaticTOMLValue, ParseError } from "toml-eslint-parser";

//#endregion

//#region "Schema validation"

// TODO : Find or make types for typescript
var hjson = require('hjson');

// TODO : try to use keyword "descriminator", OpenApi or a custom keyword to implement inheritance
// TODO : check if can implement https://typeschema.org/
// Check https://github.com/ajv-validator/ajv-keywords
import Ajv, { ValidateFunction } from "ajv";
import { ErrorObject } from "ajv";
import { Position } from 'vscode';
const ajv = new Ajv({
  validateSchema: false
});
// TODO : let the user add those
ajv.addVocabulary(["defaultSnippets",]);

//#endregion

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// The console do not seem to be working so we use that
const infoNotificationType = new NotificationType(`better-stronger-toml/info`);
const errorNotificationType = new NotificationType(`better-stronger-toml/error`);

function info(msg: any) {
  connection.sendNotification(infoNotificationType, msg);
};
function error(msg: any) {
  connection.sendNotification(errorNotificationType, msg);
};

// Create a simple text document manager.
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

const appName = 'Better stronger TOML';
var globalParams: InitializeParams;
// rootPath : format 'c:\\Users\\etc...'
// rootUri : format 'file:///c%3A/Users/etc...'
// workspaceFolders[0] : format file:///c%3A/Users/etc...
connection.onInitialize((params: InitializeParams) => {
  // There is no access to info() or error() here
  info('Initialize server');

  globalParams = params;

  let capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true
      }
    }
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true
      }
    };
  }
  return result;
});

connection.onInitialized(() => {
  info('Server initialized');
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log('Workspace folder change event received.');
    });
  }
});

// The extension's settings
interface AssociationSettings {
  pattern: string
  schema: string
}
interface JsonSchemaSettings {
  enabled: boolean
  defaultSchema: string
  associations: AssociationSettings[]
}
interface BetterStrongerTomlSettings {
  jsonSchema: JsonSchemaSettings;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: BetterStrongerTomlSettings = { 
  jsonSchema: {
    enabled: true,
    defaultSchema: "",
    associations: []
  }
};
let globalSettings: BetterStrongerTomlSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<BetterStrongerTomlSettings>> = new Map();
// Map schema path to the conf
interface JsonSchema {
  schemaAsString: string
  schemaAsObject: any
  ajvSchema: ValidateFunction<unknown>
}
// TODO : watch for schema changes
let schemas: Map<string, JsonSchema> = new Map();

connection.onDidChangeConfiguration(change => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = <BetterStrongerTomlSettings>(
      (change.settings.betterStrongerToml || defaultSettings)
    );
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<BetterStrongerTomlSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'betterStrongerToml'
    });
    result.then(onSettingsLoaded, error => error(error));
    documentSettings.set(resource, result);
  }
  return result;
}

// When settings are loaded, with load & compile schemas
function onSettingsLoaded(settings: BetterStrongerTomlSettings) {
  // FIXME : do we unload schemas ?
  if (settings.jsonSchema.enabled === false) {
    return;
  }
  if (globalParams === null) {
    return;
  }
  loadSchema(settings.jsonSchema.defaultSchema);

  if (settings.jsonSchema.associations !== null && settings.jsonSchema.associations.length !== 0) {
    for (let associationSettings of settings.jsonSchema.associations) {
      loadSchema(associationSettings.schema);
    }
  }
}

function loadSchema(schemaPath: string) {
  let fullPath = getSchemaFullPath(schemaPath);

  let jsonSchema = loadJsonSchema(fullPath);
  if (jsonSchema !== undefined) {// FIXME : emit a warning here ?
    // We have to put full path because if we have multiples workspaces, they might have same schema path
    schemas.set(fullPath, jsonSchema);
  }
}

function loadJsonSchema(schemaPath: string): JsonSchema | undefined {
    try {
      const schemaAsString = fs.readFileSync(schemaPath, "utf8");
      let schemaAsObject = hjson.parse(schemaAsString);// FIXME : maybe keep & use the comments
      let ajvSchema = ajv.compile(schemaAsObject);
      return {
        schemaAsString: schemaAsString,
        schemaAsObject: schemaAsObject,
        ajvSchema: ajvSchema
      };
    } catch (err: any) {// FIXME : seem that NodeJS.ErrnoException is not usable
      // TODO : different message if it is a load problem or an Ajv exception
      error("An unexpected error occurred while loading schema " + schemaPath + " : " + err.message);
      return undefined;
    }
}

// Info : made for reading a text document for auto-completion but not used anymore
function loadTextDocumentFromFileUri(fileUri: string): string | undefined {
  try {
    const fixedFileUri = cleanUriPath(fileUri);
    const schemaAsString = fs.readFileSync(fixedFileUri, "utf8");
    return schemaAsString;
  } catch (err: any) {
    error("An unexpected error occurred while loading file " + fileUri + " : " + err.message);
    return undefined;
  }
}

// FIXME : add this to JsonSchema class ?
function getSchemaFullPath(schemaPath: string): string {
  let path = "";
  // We slice "."
  if (schemaPath[0] === '.') {
    path = schemaPath.slice(1);

    // globamParams.rootPath is correctly formatted but cannot use it because other uri are not in this format
    // and it will be deprecated
    if (globalParams.rootUri !== null) {
      path = cleanUriPath(globalParams.rootUri) + path;
    } else if (globalParams.rootPath !== null && globalParams.rootPath !== undefined) {
      path = formatPathToUri(globalParams.rootPath) + path;
    } else {
      // TODO : replace by warn, maybe add an identifier so that an useful warning is displayed to the user : cannot load schemas
      error("Cannot load schemas because VSCode did not provide rootPath or rootUri.");
    }
  } else {
    path = schemaPath;
  }
  

  return path;
}

// TODO : test that cleanUriPath & formatPathToUri return exactly the same result
function cleanUriPath(uriPath: string): string {
  let path = uriPath.replace("file:///c%3A", "c:");
  return path;
}

function formatPathToUri(path: string): string {
  let result = path.replace("\\\\", "/");
  return result;
}

function getSchemaFromCache(settings: BetterStrongerTomlSettings, documentPath: string): JsonSchema | undefined {
  let resultSchema!: JsonSchema | undefined;

  // FIXME : cache this ?
  if (settings.jsonSchema.associations !== null && settings.jsonSchema.associations.length !== 0) {
    for (let schemaSettings of settings.jsonSchema.associations) {
      if (schemaSettings.schema.length === 0) {
        continue;// FIXME : maybe emit a warning
      }

      if (minimatch(documentPath, schemaSettings.pattern)) {
        let defaultSchemaPath = getSchemaFullPath(schemaSettings.schema);
        resultSchema = schemas.get(defaultSchemaPath);
        if (resultSchema !== undefined) {
          break;
        }
      }
    }
  }

  if (resultSchema === undefined) {
    let defaultSchemaPath = getSchemaFullPath(settings.jsonSchema.defaultSchema);
    resultSchema = schemas.get(defaultSchemaPath);
  }

  return resultSchema;
}

// Only keep settings for open documents
documents.onDidClose(e => {
  documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});

/*
connection.onDidChangeTextDocument((handler: DidChangeTextDocumentParams) => {
  handler.textDocument.uri
});
*/

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  // FIXME : this is the full path of the document, example: file:///c%3A/etc/.../a-document.toml, so we load multiple times the settings
  let settings = await getDocumentSettings(textDocument.uri);

  let text = textDocument.getText();

  let diagnostics: Diagnostic[] = [];

  var ast: AST.TOMLProgram;
  var tomlAsObject = null;

  try {
    ast = parseTOML(text);
    tomlAsObject = getStaticTOMLValue(ast);
  } catch (error: any) {
    // Errors do not explain length of the problematic token
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      range: {
        start: {
          line: error.lineNumber - 1,
          character: error.column
        },
        end: {
          line: error.lineNumber - 1,
          character: Number.MAX_VALUE
        }
      },
      message: `TOML parsing error : ${error.message}.`,
      source: appName
    });
  }

  // Get the schema
  let applicableSchema: JsonSchema | undefined = getSchemaFromCache(settings, textDocument.uri);

  // Schema validation
  // TODO : see if https://github.com/Microsoft/vscode-json-languageservice is usable ?
  if (diagnostics.length === 0 && settings?.jsonSchema.enabled === true && applicableSchema !== undefined && applicableSchema.ajvSchema !== null) {
    const valid = applicableSchema.ajvSchema(tomlAsObject);
    if (!valid) {
      connection.sendNotification(errorNotificationType, {
        schemaExceptions: applicableSchema.ajvSchema.errors?.map((elem: ErrorObject) => elem.message).join("\r")
      });
      // FIXME : AJV do not report the property in error when matching against a constraint (minimum, type etc)
      applicableSchema.ajvSchema.errors?.forEach(error => {
        // Info : if it is constraint error, keyword will be "minimum", "maximum" and will not be found on the TOML document
        // FIXME : instance path will have the shape /server/port, maybe we can do something but seem difficult
        // {
        //   instancePath: "/id",
        //   schemaPath: "#/properties/id/minimum",
        //   keyword: "minimum",
        //   params: {
        //     comparison: ">=",
        //     limit: 0,
        //   },
        //   message: "must be >= 0",
        // }
        //
        info(`An Ajv error occurred : ${error.message}, keyword: ${error.keyword}, propertyName: ${error.propertyName}, instancePath: ${error.instancePath}, schemaPath: ${error.schemaPath}`);

        // FIXME : not every errors will be solved this way
        var pos = text.search(`\"${error.keyword}\"`);

        let startPosition: TextDocumentPosition;
        let endCharacterPosition: number;

        if (pos === -1) {
          // TODO : parse the path and attempt to pick correct line
          startPosition = {
            line: 0,
            character: 0
          };
          endCharacterPosition = Number.MAX_VALUE;
        } else {
          startPosition = textDocument.positionAt(pos);
          endCharacterPosition = startPosition.character + error.keyword.length;
        }

        var endPosition = {
          line: startPosition.line,
          character: endCharacterPosition
        } as Position;

        var message = "Schema error : " + error.message;
        // FIXME : if same key, merge allowed values ?
        if (error.params["allowedValues"] !== null && error.params["allowedValues"] !== undefined) {
          message += ": " + error.params["allowedValues"].join(",");
        }
        if (error.instancePath && error.instancePath !== "") {
          message += ", at " + error.instancePath;
        }
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: startPosition,
            end: endPosition
          },
          message: `${message}.`,
          source: appName
        });
      });
    }
  }
  // Always send the diagnostics so that it clear fixed errors
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles((_change: DidChangeWatchedFilesParams) => {
  // Monitored files have change in VS Code
  info('File changed event');
  // TODO : We update schema (end with json, use path)
  for (let change of _change.changes) {
    if (change.uri.indexOf("settings.json") !== -1) {
      continue;
    }
    // FIXME : let user decide this ?
    // Information : uri is always in format 'file:///c%3A/Users/etc...'
    if (minimatch(change.uri, "**/*.json") || minimatch(change.uri, "**/*.hjson")) {
      // 
      let path = cleanUriPath(change.uri);
      // if the schema was not loaded before, we do not load it now
      // Information : path might be correct but not present if the user started editing a schema before a toml document
      //    It will be like that as long as settings are loaded using textDocument.uri
      if (!schemas.has(path)) {
        continue;
      }
      let jsonSchema = loadJsonSchema(path);
      if (jsonSchema === null || jsonSchema === undefined) {
        continue;
      }
      // We have to put full path because if we have multiples workspaces, they might have same schema path
      schemas.set(path, jsonSchema);
    }
  }
});

// FIXME : do not seem triggered when I'm typing inside a string value
// This handler provides the initial list of the completion items.
connection.onCompletion(
  async (_textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {

    // _textDocumentPosition.textDocument.uri : file:///c%3A/Users/odeleham/wk/vscode/extensions/workspace-test/test.server.toml

    let autoCompleteItems: CompletionItem[] = [];
    
    let settings = await getDocumentSettings(_textDocumentPosition.textDocument.uri);
    let applicableSchema: JsonSchema | undefined = getSchemaFromCache(settings, _textDocumentPosition.textDocument.uri);
    if (applicableSchema === undefined) {
      return [];
    }
    
    // Info : We cannot load the document ourselves here because this will not a correct version until the user save it
    let documentAsString = documents.get(_textDocumentPosition.textDocument.uri)?.getText();
    
    if (documentAsString === undefined) {
      return [];
    }

    const fixedPosition = {
      line: _textDocumentPosition.position.line + 1,
      character: _textDocumentPosition.position.character - 1
    };
    let elementToComplete: AST.Token | undefined = undefined;
    let ast: AST.TOMLProgram;
    // Info : will throw if property is not completed (character = and a value)
    try {
      ast = parseTOML(documentAsString);
    } catch (exception: any) {
      if (exception instanceof ParseError) {
        if (exception.message === "Expected equal (=) token" 
            || exception.message === "The key, equals sign, and value must be on the same line") {

          let lines = documentAsString.split(/\r\n|\r|\n/);
          let line = lines[exception.lineNumber - 2];
          if (line !== undefined && line !== '') {
            autoCompleteItems = autocompleteProperty(line, applicableSchema.schemaAsObject['properties']);
          }
        } else {
          error(exception.message);
        }
      } else {
        error(exception);
      }
      return autoCompleteItems;
    }
    
    for (const element of ast.tokens) {
      if (element.loc.start.line !== fixedPosition.line){
        continue;
      }
      // TODO : can obtain property name if in value but it could be a duplicate if in subnode
      // But we could implement value completion from examples etc... here
      if (fixedPosition.character >= element.loc.start.column && fixedPosition.character <= element.loc.end.column) {
        elementToComplete = element;
      }
    }
    
    if (elementToComplete === undefined) {
      return [];
    }

    if (elementToComplete.type === 'Bare') {
      autoCompleteItems = autocompleteProperty(elementToComplete.value, applicableSchema.schemaAsObject['properties']);
    }

    return autoCompleteItems;
  }
);

function autocompleteProperty(key: string, properties: any): CompletionItem[] {
  const autoCompleteItems: CompletionItem[] = [];

  // TODO : autocomplete using subtypes properties
  // TODO : autocomplete subtypes properties using subtypes properties
  // TODO : autocomplete value string using examples
  if (properties) {
    for (const key in properties) {
      if (key.startsWith(key)) {
        let item = {
          label: key,
          kind: CompletionItemKind.Property,
          data: key// FIXME: try to use an index ?
        } as CompletionItem;
        let property = properties[key];
        // TODO : indicate constraints in the description part
        // https://json-schema.org/understanding-json-schema/reference/numeric.html
        // https://json-schema.org/understanding-json-schema/reference/string.html
        // required also
        // TODO : indicate subtype details in the description part
        let markdownExamples = "";
        if (property.examples && Array.isArray(property.examples)) {
          markdownExamples = "\r* " + property.examples.join("\r* ");
        }
        if (property.description) {
          let description: MarkupContent =  {
            value: property.description + (markdownExamples === "" ? "" : "\r\rExamples:" + markdownExamples),
            kind: MarkupKind.Markdown
          };
          item.documentation = description;
        }
        if (property.type || property["$ref"]) {
          item.detail = (property.type ? property.type : "") + (property["$ref"] ? property["$ref"] : "");
        }
        autoCompleteItems.push(item);
      }
    }
  }

  return autoCompleteItems;
}

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
  async (item: CompletionItem): Promise<CompletionItem> => {
    /*
    if (item.data === 1) {
      item.detail = 'TypeScript details';
      item.documentation = 'TypeScript documentation';
    } else if (item.data === 2) {
      item.detail = 'JavaScript details';
      item.documentation = 'JavaScript documentation';
    }
    */
  
    return item;
  }
);

// TODO : implement them
// connection.onDocumentSymbol
// connection.onRenameRequest
// connection.onReferences

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();