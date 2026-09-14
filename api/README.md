# Sosuse API and SPARQL

The instance Dockerfile takes the generic [directory-api](https://github.com/foederierter-datenpool/directory-api)
image and downloads `directory.ttl` from `gh-pages` during the build. All API downloads
then serve that local snapshot. Fuseki loads it into memory at startup. Both
containers use the same image. Rebuild to refresh them; a restart reloads the same data.

First push directory-api, wait for **Build API image**, and make its GitHub container
package **Public**. Push this sosuse configuration too.

In Coolify, create a separate resource from this sosuse repository:

- Branch `main`, server `cdl-federation`, build pack **Docker Compose**.
- Base directory `/api`, Compose file `/compose.yaml`.

Use one hostname for both services. In **Domains**, set:

| Service | Domain | Target port | Path |
| --- | --- | --- | --- |
| `api` | Your shared hostname | `8080` | Leave empty |
| `fuseki` | The same hostname | `3030` | `/directory/sparql` |

In **Advanced**, disable **Strip Prefixes** so Fuseki receives `/directory/sparql`
unchanged. See [Coolify's path routing documentation](https://coolify.io/docs/core/networking/domains#route-to-a-port-or-path).
For a generated `sslip.io` test hostname, use **http** for both entries: HTTPS
certificate issuance can hit shared Let's Encrypt rate limits. For production,
point your own hostname at the server and use **https** for both.

For the existing resource, **Reload Compose** after changing the Compose file.
Save domain/settings changes and **Redeploy**. Compose starts both containers.
Public URLs omit the internal target ports. The current shared test deployment is
`http://bntqrhrnf22fyrc3js1g6rug.88.99.121.103.sslip.io`:

- [Swagger UI](http://bntqrhrnf22fyrc3js1g6rug.88.99.121.103.sslip.io/swagger-ui.html)
- [Turtle download](http://bntqrhrnf22fyrc3js1g6rug.88.99.121.103.sslip.io/directory.ttl)
- [SPARQL ASK query](http://bntqrhrnf22fyrc3js1g6rug.88.99.121.103.sslip.io/directory/sparql?query=ASK%7B%7D)

All three routes were verified on 2026-09-14; API readiness also returned `UP`.

If SPARQL returns 404 and its error page shows `/`, prefix stripping is still active.
For API 502 errors, check the `api` target port is `8080` and inspect its runtime logs.

After a pipeline run pushes `gh-pages`, deploy the API again with a build.
The Compose configuration disables build caching and pulls the current API base
image, so an unchanged sosuse commit can still produce a fresh snapshot. A failed
or empty download fails the build; invalid Turtle prevents Fuseki from starting.
No token or persistent volume is needed: the snapshot is included in the image.

The API can reach Fuseki internally at `http://fuseki:3030/directory/sparql`.
Fuseki allows read-only queries, with a 30-second timeout and no outbound SERVICE calls.
The pipeline runner remains separate.
