# Sosuse API

Uses the generic [directory-api](https://github.com/foederierter-datenpool/directory-api)
image. Edit settings under `environment:` in `compose.yaml`, commit and redeploy;
no Java build or mounted configuration file is needed. `:main` pulls the latest
image on deployment; pin a digest when you need a fixed release.

Before deploying, push directory-api, wait for **Build API image**, and make its
GitHub container package **Public**. Push this sosuse configuration too.

In Coolify, create a separate resource from this sosuse repository:

- Branch `main`, server `cdl-federation`, build pack **Docker Compose**.
- Base directory `/api`, Compose file `/compose.yaml`.
- Assign a domain to the `api` service targeting port **8080**, with DNS pointing
  to the server, then deploy manually.
- Check `/hello` for `{"message":"Hello world!"}` and
  `/actuator/health/readiness` for `{"status":"UP"}`.

No token, storage or repository-preservation setting is needed. The pipeline
runner remains separate. Directory data loading and Fuseki are not implemented.
