# sosuse-directory-builder
Builds a federated directory of social support services from multiple input sources.

## How it works
This repo is a **use case** of [`@directory-builder/core`](https://github.com/foederierter-datenpool/directory-builder-core)
and holds no engine or webapp code — only what is specific to this federation:

- **Decisions** live in `config/federation.ttl`: the sources and their facts
  (URL, format, lift params), the target schemas and field mappings, the
  match/merge/resolve rules, run parameters, exporters, repository URL and
  title. `config/curation.ttl` adds curated `owl:sameAs` /
  `owl:differentFrom` pairs and `:ValueCorrection` entries.
- **Per-source code** lives in `sources/<name>/`: a `fetch.js` (how to get the
  data), an `extract.sparql` (how to extract entities from its lifted RDF),
  optional `transform-*.sparql`, and committed `static/` files for sources
  without an API.
- **Webapp material** lives in `webapp/`: the About page prose, the Query
  page's starting query, and the exporters the Download page loads at runtime.

Everything else is convention: every file path follows from the source names,
so the config contains no paths at all. The engines journal each executed step
as p-plan RDF (`data/ingest/ingest-log.ttl`, `data/pipeline/federate-log.ttl`),
and the webapp renders those journals and the pipeline's artifacts directly —
the site is a pure function of `config/` + `data/`, fetched at runtime.

The pipeline: fetch → lift (to RDF) → extract → map (onto the target schemas) →
match (cluster duplicates across sources) → merge → resolve (one value per
field), each stage written to `data/`.

## Prerequisites
- Node.js
- Java (for [SPARQL Anything](https://github.com/SPARQL-Anything/sparql.anything), auto-downloaded on first run)

## Setup
```sh
npm install
```

## Run the pipeline
Two ways — both run the same engines, rooted at the instance directory (config/, sources/, data/).

Via command (root = where you invoke):
```sh
npm run pipeline   # ingest + federate
npm run ingest     # fetch + lift only
npm run federate   # extract → map → match → merge → resolve only
```

Or programmatically:
```js
import { Pipeline } from "@directory-builder/core"

const pipeline = new Pipeline() // root defaults to process.cwd()
await pipeline.run() // ingest + federate
```
Outputs &rarr; `data/`

## Run the webapp
The webapp ships with `@directory-builder/core`; this repo holds no webapp
code — only the modules and prose under `webapp/` it injects at runtime.
```sh
npm run webapp         # dev server against this repo's config/ + data/
npm run webapp:build   # production build → webapp/dist/
```

## Deployment
Before publishing, set GitHub **Settings → Pages → Source** to **GitHub Actions**.
If the `github-pages` environment restricts branches, allow `gh-pages`.

From your source checkout on `main`:

```sh
npm run publish:pages                      # Run pipeline, validate, prepare commit
npm run publish:pages -- --reuse-data       # Prepare from existing output instead
npm run publish:pages -- --dry-run          # Optional: preview existing files only
```

Choose one command. Reusing output requires a complete `data/` matching the current
configuration. The dry run only copies selected files into a temporary folder;
it does not run the pipeline, commit or push.

**Pushing is manual.** The script creates a single parentless commit in a temporary
repository and prints the exact push command. Run that command when ready to
replace remote `gh-pages`. It uses your existing Git identity and GitHub access,
and refuses to overwrite a remote update made since preparation started.
To enable automatic pushing, change `const PUSH_AUTOMATICALLY = false` to `true`
at the top of `scripts/publish-pages.js`.

Keep the temporary directory until you have pushed. Stay on `main` for pipeline
work: switching to `gh-pages` and back can remove generated data from your working
checkout.

The snapshot contains configuration, webapp content/exporters, the package
manifest, deployment workflow and generated data. Raw downloads and lifted RDF
stay local; hidden files and old data-directory HTML indexes are excluded.
A generated `.gitignore` hides untracked local leftovers on the publication branch.

Pushing `gh-pages` triggers Actions to build and deploy the webapp. The finished
`assets/` and `index.html` go into the Pages artifact, not the branch. Actions uses
the published npm core package and never runs the pipeline. Pushes to `main` do
not deploy. Check the Actions run for completion.

Run the publisher tests with `npm test`; they do not harvest, commit or push.
