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
- Assign a domain to `api` targeting port **8080**, and another to `fuseki` targeting **3030**.
- For the existing resource, **Reload Compose** after pushing, then **Redeploy**.
  Compose starts both processes automatically.
- On the API domain, open `/swagger-ui.html` and try **GET /directory.ttl**.
- On the Fuseki domain, open `/directory/sparql?query=ASK%7B%7D` to test a query.

After a pipeline run pushes `gh-pages`, deploy the API again with a build.
The Compose configuration disables build caching and pulls the current API base
image, so an unchanged sosuse commit can still produce a fresh snapshot. A failed
or empty download fails the build; invalid Turtle prevents Fuseki from starting.
No token or persistent volume is needed: the snapshot is included in the image.

The API can reach Fuseki internally at `http://fuseki:3030/directory/sparql`.
Fuseki allows read-only queries, with a 30-second timeout and no outbound SERVICE calls.
The pipeline runner remains separate.
