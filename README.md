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
  optional `extract.js` postprocessing, `transform-*.sparql`, and committed `static/` files for sources
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
- Node.js 24 (also used by the pipeline runner)
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
npm run federate   # federate existing ingest data, including geocoding
npm run vocabulary:build  # federation.ttl → data/target-vocabulary.ttl (RDFS + SHACL)
```

For a fresh checkout or after deleting `data/`, start with `npm run pipeline`.
`npm run federate` requires the lifted source data from a completed ingest.

Or programmatically:
```js
import { Pipeline } from "@directory-builder/core"

const pipeline = new Pipeline() // root defaults to process.cwd()
await pipeline.run() // ingest + federate
```
Outputs &rarr; `data/`

`pipeline`, `ingest` and `federate` load the committed `.env` and, when present,
the ignored `.env.local` from this directory. The committed file contains
non-secret geocoder defaults; shell/container settings take precedence.
These commands write local output. Publishing to GitHub requires the separate
`npm run publish:pages` command.

Caritas fetching requires `CARITAS_API_KEY`. Put it in the ignored `.env.local`
for local runs, or set it in the runner's environment. Do not put it in the
committed `.env`. The configured CariNet URL points to the production service.
Completed Caritas API pages are saved under the ignored
`data/ingest/checkpoints/caritas/` directory. If a fetch is interrupted,
rerun `npm run ingest`: it checks the first page and total before reusing saved
pages. Changed first-page IDs or a changed total start a fresh fetch. The
checkpoint is removed after the complete raw file is written.
For large result sets, the fetcher reads from both ends of CariNet's title
sort and requires the reported number of distinct IDs before writing output.

The Caritas fetch keeps the original HTML description and adds a plain-text
version for `schema:description`. Extraction derives each detail-page URL from
the API's `number` field. Supplied coordinates are mapped to addresses;
enrichment uses them before consulting the geocache or Nominatim. This API
response has no category field, so Caritas does not supply `schema:category`.

Caritas extraction converts HTML and encoded characters in names, opening hours,
and description text to plain text, preserving paragraphs in longer fields.

The federation is configured to retrieve Germany-wide Caritas, Sozialplattform
and DHS records and to extract the nationwide Destatis workbook. The supplied
AWO files cover Berlin-Mitte and adjacent postcodes. The Sources page shows
each source's declared coverage.

The DHS fetcher traverses the national search pages, deduplicates entry IDs,
checks HTTP status and page content, and retries transient failures. It downloads
up to three detail pages concurrently and keeps the detail section needed for
extraction. A missing detail page fails the harvest.

DHS groups up to 50 compact HTML records per file to reduce Java process
launches during lift. Core splits the lifted RDF into one file per page for
extraction.

### Geocoding

Run `npm run federate` to geocode existing ingest data, or `npm run pipeline`
to fetch and ingest again. The committed `.env` requires a ready local Germany
Nominatim service on port 8088; the pipeline stops if it is unavailable. Other
settings use core's defaults.

SoSuSe enables geocoding in `config/federation.ttl` and keeps results in
`registry/geocache.json`. A core version with local geocoding support (or a
linked checkout) checks the cache first, then local Nominatim, with throttled
public fallback if the service is unavailable. Empty results stay cached
misses and retry when the provider or dataset changes.

For an offline rerun, use `GEOCODE_CACHE_ONLY=true npm run federate`; an
uncached complete address fails that run. `GEOCODE_RETRY_MISSES=true` retries
cached misses explicitly. Successful coordinates remain cached.

See the [core setup](https://github.com/foederierter-datenpool/directory-builder-core/tree/main/tools/nominatim) for
importing the database, and the [runner settings](deploy/README.md#geocoding-settings)
for Docker Compose / Coolify. Geocoding is done by the pipeline; the published
webapp uses the resulting coordinates without contacting the service.

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
