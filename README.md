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
npm run vocabulary:build  # federation.ttl → data/target-vocabulary.ttl (RDFS + SHACL)
```

Or programmatically:
```js
import { Pipeline } from "@directory-builder/core"

const pipeline = new Pipeline() // root defaults to process.cwd()
await pipeline.run() // ingest + federate
```
Outputs &rarr; `data/`

The DHS fetcher deduplicates entries across the configured postal codes,
checks HTTP status and page content, and retries transient failures. It downloads
up to three detail pages concurrently and fails the harvest if any discovered
detail page cannot be retrieved and verified.

DHS groups up to 50 HTML pages per file to reduce Java process launches during
lift. Core detects these chunks automatically and splits the lifted RDF into
one file per page for extraction.

## Run the webapp
The webapp ships with `@directory-builder/core`; this repo holds no webapp
code — only the modules and prose under `webapp/` it injects at runtime.
```sh
npm run webapp         # dev server against this repo's config/ + data/
npm run webapp:build   # production build → webapp/dist/
```

## Deployment
Before publishing, set GitHub **Settings → Pages → Source** to **GitHub Actions**.
If the `github-pages` environment restricts branches, allow both `main` and `pipeline-data`.

From your source checkout on `main`:

```sh
npm run publish:pages                      # Run pipeline, validate, prepare commit
npm run publish:pages -- --reuse-data       # Prepare from existing output instead
npm run publish:pages -- --dry-run          # Optional: preview existing files only
```

Choose one command. Reusing output requires a complete `data/` matching the current
configuration. The dry run only copies selected files into a temporary folder;
it does not run the pipeline, commit or push.

**Pushing is automatic.** The script creates a single parentless commit and
replaces remote `pipeline-data` using force-with-lease. It refuses to overwrite a remote
update made since preparation started. Local runs use your existing Git access;
the Coolify runner uses `GITHUB_PUSH_TOKEN` through a Git credential helper.
To push manually instead, change `const PUSH_AUTOMATICALLY = true` to `false`
at the top of `scripts/publish-pages.js`. The script then prints the push command.

In manual mode or after a failed push, keep the temporary directory until you
have pushed. Stay on `main` for pipeline
work: switching to `pipeline-data` and back can remove generated data from your working
checkout.

The snapshot contains configuration, webapp content/exporters, the package
manifest, deployment workflow and generated data. Raw downloads and lifted RDF
stay local; hidden files and old data-directory HTML indexes are excluded.
A generated `.gitignore` hides untracked local leftovers on the publication branch.

Pushes to `main` or `pipeline-data` build and deploy the webapp. Actions takes the package
manifest and webapp content/exporters from `main`, and `config/` plus `data/` from
the published `pipeline-data` snapshot. It regenerates `data/target-vocabulary.ttl`
from `main`'s `config/federation.ttl` for each deployment, so the Vocabulary page
updates without a pipeline run. Other pages use the snapshot's matching configuration
and data; changes to the pipeline output still require publishing a fresh snapshot.

To rebuild manually, choose **Actions → Deploy webapp → Run workflow → main**.
Actions installs the published npm core package and never runs the pipeline.
The finished `assets/` and `index.html` go into the Pages artifact, not the branch.

Run the fetcher and publisher tests with `npm test`; they do not harvest live
data, commit or push.

## Run on Coolify
The [Coolify setup guide](deploy/README.md) covers the GitHub token, Docker Compose
deployment, cloning the repository and starting the pipeline. The runner keeps
its checkout and output in a persistent volume; deployment itself does not run
the pipeline.

The [API setup guide](api/README.md) covers a separate Spring Boot deployment
using the reusable `directory-api` image and settings in `api/compose.yaml`.
