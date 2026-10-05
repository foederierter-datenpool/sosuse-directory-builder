# First pipeline run on Coolify

This is a tools container with Node 24, Java 21 and Git. It stays running so you
can start the pipeline from Coolify's Terminal or Scheduled Tasks. The checkout, dependencies, raw
data, lifted RDF and registry persist in the `pipeline-workspace` volume mounted
at `/workspace`. No domain or public port is needed.
The webapp workflow currently uses Node 20; the runner uses Node 24.

## 1. Create a GitHub token

Open [GitHub's fine-grained token form](https://github.com/settings/personal-access-tokens/new)
(personal Settings → Developer settings → Personal access tokens → Fine-grained tokens).
Choose:

- Name: `Coolify sosuse pipeline`, with an expiry date you can renew.
- Resource owner: `foederierter-datenpool`.
- Repository access: only `sosuse-directory-builder`.
- Repository permissions: **Contents: Read and write**, **Workflows: Read and write**.

Workflows permission is needed because the publication includes `deploy.yml`.
If GitHub marks the token pending, an organization owner must approve it before
it can push. The branch rules must permit force pushes to `pipeline-data`.

Copy the token directly into Coolify in the next step. It is not a repository
file or Docker build argument. [GitHub token documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

## 2. Deploy the runner

First commit and push these runner changes to `main`, so Coolify can fetch them.
In Coolify:

1. Create a project/environment, then **New Resource → Public Repository**.
2. Repository: `https://github.com/foederierter-datenpool/sosuse-directory-builder`.
3. Branch: `main`; server: `cdl-federation`.
4. Build Pack: **Docker Compose**; Base Directory: `/`; Compose Location: `/compose.yaml`.
5. In **Environment Variables**, set the Production **`GH_PAGES_TOKEN`** to your token and
   **`PIPELINE_CARITAS_API_KEY`** to the CariNet API key. Enable Runtime and disable Build
   Variable for both if those controls are shown.
6. Under **Advanced**, disable **Inject Build Args to Dockerfile**; this image needs no build arguments.
7. Deploy. The `pipeline` container should stay running. Leave domains and port
   mappings empty; the named volume is declared in the Compose file.

Compose passes `GH_PAGES_TOKEN` into the container as `GITHUB_PUSH_TOKEN` and
`PIPELINE_CARITAS_API_KEY` as `CARITAS_API_KEY`. The local `.env.local` is not
needed in Coolify.
The separate names avoid a Coolify 4.3.1 UI bug that makes Compose environment
keys read-only. Edit `GH_PAGES_TOKEN` and `PIPELINE_CARITAS_API_KEY`; leave their
managed container environment rows alone.
The reference allows an empty value during image builds because Coolify parses
Compose without runtime secrets at that stage. The container checks for a nonempty
token at startup and exits with an explanatory error if it is missing.

Coolify checks out the repo to build the image. The next step creates the separate,
persistent working checkout used for pipeline runs.
[Docker Compose in Coolify](https://coolify.io/docs/applications/builds/docker-compose),
[environment variables](https://coolify.io/docs/applications/configuration/environment-variables).

### Geocoding settings

The runner accepts these optional Compose / Coolify runtime variables. Like
the token setting, the `PIPELINE_` aliases keep editable inputs separate from
Coolify's managed container environment keys.

| Runtime variable | Default | Passed to core as |
| --- | --- | --- |
| `PIPELINE_GEOCODE_ENDPOINT` | `http://nominatim:8080/search` | `GEOCODE_ENDPOINT` |
| `PIPELINE_GEOCODE_DELAY_MS` | `0` | `GEOCODE_DELAY_MS` |
| `PIPELINE_GEOCODE_DATASET` | unset | `GEOCODE_DATASET` |
| `PIPELINE_GEOCODE_RETRY_MISSES` | `false` | `GEOCODE_RETRY_MISSES` |
| `PIPELINE_GEOCODE_CACHE_ONLY` | `false` | `GEOCODE_CACHE_ONLY` |
| `PIPELINE_GEOCODE_REQUIRE_LOCAL` | `false` | `GEOCODE_REQUIRE_LOCAL` |

The runner checks the address cache first, then probes the preferred service
once when needed. If unavailable, or if it fails mid-run, public Nominatim is
used with a minimum 1100 ms delay. Valid empty results remain cached misses.
Set `PIPELINE_GEOCODE_REQUIRE_LOCAL=true` when a run must stop instead of
falling back to public Nominatim; use this for nationwide geocoding.
Use a shared server geocoder for recurring national runs; public bulk jobs
are subject to [Nominatim's usage policy](https://operations.osmfoundation.org/policies/nominatim/),
including four requests per minute for recurring jobs (`PIPELINE_GEOCODE_DELAY_MS=15000`).

The default service URL requires the pipeline and `nominatim` containers on
the same Docker network. Separate Compose projects must explicitly join a
shared network. Set `PIPELINE_GEOCODE_ENDPOINT` to the service URL reachable
**from the runner container**, and `PIPELINE_GEOCODE_DATASET=germany` for a
Germany import. The runner does not start or deploy Nominatim automatically.
Verify the shared server has sufficient import capacity before deploying it.
On Docker Desktop, a host-published service can instead be reached through
`http://host.docker.internal:8088/search`; `127.0.0.1` refers to the runner itself.

Misses retry when the endpoint, dataset label or reported OSM snapshot changes.
Set `PIPELINE_GEOCODE_RETRY_MISSES=true` for a deliberate retry of all cached
misses; successful coordinates remain cached.

Alternatively, fill the instance's `registry/geocache.json` locally, transfer
that cache to the runner checkout, and set `PIPELINE_GEOCODE_CACHE_ONLY=true`.
Cache-only mode makes no health probes and ignores retry-misses. Any new
complete address will fail instead of making a network request, so leave this
mode off for recurring harvests that can introduce new addresses. The
installed core must include these options; after publishing/upgrading core,
run `npm install` in the persistent checkout as described below.

## 3. Clone and run

Open the application's **Terminal**, selecting the `pipeline` container.
Run these setup commands once:

```sh
cd /workspace
git clone --branch main --single-branch --no-tags https://github.com/foederierter-datenpool/sosuse-directory-builder.git
cd sosuse-directory-builder
npm install
```

Then start the pipeline:

```sh
cd /workspace/sosuse-directory-builder
npm run publish:pages
```

For this terminal test, keep Terminal open until the command finishes;
use a Scheduled Task below for long runs.
The image supplies Git author name/email. The publisher reads the token at runtime;
ordinary Git commands otherwise retain their normal authentication behavior.

This performs fetch, lift, federation, validation and an automatic force-with-lease
push to `pipeline-data`. Check the terminal for success, then the repository's **Actions**
tab for the webapp deployment. GitHub Pages must use **GitHub Actions** as its source.

For subsequent runs, use the same final command without cloning again. Redeploying
the container preserves `/workspace` but does not update its checkout. To update
the runner code before publishing:

```sh
cd /workspace/sosuse-directory-builder
git pull --ff-only origin main
npm install
```

Geocache updates remain local unless you explicitly commit them.
Keep `pipeline-data` out of this working checkout.

## 4. Long runs

After the initial test, open **Configuration → Scheduled Tasks → Add** and select
the `pipeline` container. Use this command (without `docker exec`):

```sh
cd /workspace/sosuse-directory-builder && npm run publish:pages
```

Choose the intended recurring schedule and set **Timeout (seconds)** long enough
for the run: the default is only 300 seconds, and the maximum is 36000 (10 hours).
Use **Execute Now** to start a run and **Recent executions** to inspect its output
and result. The browser terminal can close; the container must remain running.
Runs exceeding 10 hours need a different execution mechanism.
[Coolify Scheduled Tasks](https://coolify.io/docs/applications/operations/scheduled-tasks).

For handover, consider replacing the personal token with a repository write deploy
key; this first test keeps token authentication.
