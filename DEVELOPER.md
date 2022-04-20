# Developer

To build the extension for local development, install npm and then install the dependencies:

> npm install

Then run Ctrl + Shift + B in VSCode or `npm run watch`.

To launch the extension, you can this VSCode Run and Debug commands (Ctrl + Shift + D):

* Launch Client : run & debug the client
* Client + Server : run & debut the client and the server

## Tests

Tests are not implemented yet, but the command is :

> npm run test

## How to participate

Open a PR explaining your changes and why it should be merged.

## WIP

Features I am currently working on:
 
## TODO

### Features

- [ ] Auto-completion using schema
  - [x] Auto-completion of properties
  - [ ] Report constraints in the description
  - [ ] Use properties defined in definitions
  - [ ] Auto-complete accordlingly to the type into the user is typing
- [ ] Highlight using schema (green if it is a known property for instance)
- [ ] Support [hjson-js](https://github.com/hjson/hjson-js) supplementary features
- [ ] Use [ajv](https://github.com/hjson/hjson-js) to implements [TypeSchema](https://typeschema.org/) syntax or another type of inheritance syntax 
- [ ] Allow user to add specific keywords
- [ ] Commands to transform Toml to Json, Toml to Hjson, Toml to AST etc...
- [ ] Meta schema validation (would use local resource or autorisation to load external resource)
- [ ] Use Toml format for the schema
- [ ] Indicate which schema is applied in the VSCode's UI (maybe which pattern applied also)
- [ ] GIFs for README.md's features

### Code quality

- [ ] Split server file into multiple files
- [ ] Test main functionalities

## Publishing

Do not forget to edit the package.json if you want to publish your own version of the extension.

* Add features to README.md
* Add changelog to CHANGELOG.md & README.md
* Report new issues if any to README.md
* Increment version of package.json

* Login to the store
> vsce login <OrganisationName>
* Package
> vsce package
* Publish
> vsce publish
