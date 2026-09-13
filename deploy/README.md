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
it can push. The branch rules must permit force pushes to `gh-pages`.

Copy the token directly into Coolify in the next step. It is not a repository
file or Docker build argument. [GitHub token documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

## 2. Deploy the runner

First commit and push these runner changes to `main`, so Coolify can fetch them.
In Coolify:

1. Create a project/environment, then **New Resource → Public Repository**.
2. Repository: `https://github.com/foederierter-datenpool/sosuse-directory-builder`.
3. Branch: `main`; server: `cdl-federation`.
4. Build Pack: **Docker Compose**; Base Directory: `/`; Compose Location: `/compose.yaml`.
5. In **Environment Variables**, set the Production **`GH_PAGES_TOKEN`** to your token. Enable
   Runtime and disable Build Variable if those controls are shown.
6. Deploy. The `pipeline` container should stay running. Leave domains and port
   mappings empty; the named volume is declared in the Compose file.

Compose passes `GH_PAGES_TOKEN` into the container as `GITHUB_PUSH_TOKEN`.
The separate names avoid a Coolify 4.3.1 UI bug that makes Compose environment
keys read-only. Edit `GH_PAGES_TOKEN`; leave the managed `GITHUB_PUSH_TOKEN` row alone.

Coolify checks out the repo to build the image. The next step creates the separate,
persistent working checkout used for pipeline runs.
[Docker Compose in Coolify](https://coolify.io/docs/applications/builds/docker-compose),
[environment variables](https://coolify.io/docs/applications/configuration/environment-variables).

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
flock --verbose -n /workspace/pipeline.lock npm run publish:pages
```

The lock prevents overlapping runs and reports contention without hiding pipeline
failures. For this terminal test, keep Terminal open until the command finishes;
use a Scheduled Task below for long runs.
The image supplies Git author name/email. The publisher reads the token at runtime;
ordinary Git commands otherwise retain their normal authentication behavior.

This performs fetch, lift, federation, validation and an automatic force-with-lease
push to `gh-pages`. Check the terminal for success, then the repository's **Actions**
tab for the webapp deployment. GitHub Pages must use **GitHub Actions** as its source.

For subsequent runs, use the same final command without cloning again. Redeploying
the container preserves `/workspace` but does not update its checkout; update that
checkout on `main` when you want newer code. Geocache updates remain local unless
you explicitly commit them. Keep `gh-pages` out of this working checkout.

## 4. Long runs

After the initial test, open **Configuration → Scheduled Tasks → Add** and select
the `pipeline` container. Use this command (without `docker exec`):

```sh
cd /workspace/sosuse-directory-builder && flock --verbose -n /workspace/pipeline.lock npm run publish:pages
```

Choose the intended recurring schedule and set **Timeout (seconds)** long enough
for the run: the default is only 300 seconds, and the maximum is 36000 (10 hours).
Use **Execute Now** to start a run and **Recent executions** to inspect its output
and result. The browser terminal can close; the container must remain running.
Runs exceeding 10 hours need a different execution mechanism.
[Coolify Scheduled Tasks](https://coolify.io/docs/applications/operations/scheduled-tasks).

For handover, consider replacing the personal token with a repository write deploy
key; this first test keeps token authentication.
