# Sosuse API

The instance Dockerfile takes the generic [directory-api](https://github.com/foederierter-datenpool/directory-api)
image and downloads `directory.ttl` from `gh-pages` during the build. All API downloads
then serve that local snapshot. Rebuild to refresh it; a restart keeps the same data.

First push directory-api, wait for **Build API image**, and make its GitHub container
package **Public**. Push this sosuse configuration too.

In Coolify, create a separate resource from this sosuse repository:

- Branch `main`, server `cdl-federation`, build pack **Docker Compose**.
- Base directory `/api`, Compose file `/compose.yaml`.
- Assign a domain to the `api` service targeting port **8080**, then deploy.
- Open `/swagger-ui.html` and try **GET /directory.ttl**.

After a pipeline run pushes `gh-pages`, deploy the API again with a build.
The Compose configuration disables build caching and pulls the current API base
image, so an unchanged sosuse commit can still produce a fresh snapshot. A failed
or empty download fails the build. No token or persistent storage is needed.

The pipeline runner remains separate. Fuseki is not implemented yet.
