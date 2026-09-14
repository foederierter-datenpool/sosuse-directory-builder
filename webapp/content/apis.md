## SPARQL: native access to the directory

The SPARQL endpoint is the most complete way to access the published federated directory: query entities and relationships directly, selecting the fields and connections you need. Results can be returned as JSON or RDF, including Turtle.

See also the [query examples in this webapp](#/query).

Endpoint: `http://bntqrhrnf22fyrc3js1g6rug.88.99.121.103.sslip.io/directory/sparql`

<a href="http://bntqrhrnf22fyrc3js1g6rug.88.99.121.103.sslip.io/directory/sparql?query=ASK%7B%7D" target="_blank" rel="noopener noreferrer">Try an ASK query</a>, or count Einrichtungen:

```sh
curl --get \
  --data-urlencode 'query=SELECT (COUNT(DISTINCT ?place) AS ?count) WHERE { ?place a <http://www.w3.org/ns/org#OrganizationalUnit> }' \
  -H 'Accept: application/sparql-results+json' \
  http://bntqrhrnf22fyrc3js1g6rug.88.99.121.103.sslip.io/directory/sparql
```

Using the `SERVICE` keyword, you can query this endpoint from any SPARQL editor connected to a server that supports federated queries. <a href="https://www.govdata.de/sparql-assistent#query=SELECT%20(COUNT(DISTINCT%20%3Fplace)%20AS%20%3Fcount)%20WHERE%20%7B%0A%20%20SERVICE%20%3Chttp%3A%2F%2Fbntqrhrnf22fyrc3js1g6rug.88.99.121.103.sslip.io%2Fdirectory%2Fsparql%3E%20%7B%0A%20%20%20%20%3Fplace%20a%20%3Chttp%3A%2F%2Fwww.w3.org%2Fns%2Forg%23OrganizationalUnit%3E%20.%0A%20%20%7D%0A%7D&amp;endpoint=https%3A%2F%2Fwww.govdata.de%2Fsparql&amp;requestMethod=GET&amp;tabTitle=Sosuse&amp;headers=%7B%7D&amp;contentTypeConstruct=application%2Fn-triples%2C*%2F*%3Bq%3D0.9&amp;contentTypeSelect=application%2Fsparql-results%2Bjson%2C*%2F*%3Bq%3D0.9&amp;outputFormat=table" target="_blank" rel="noopener noreferrer">Try it in GovData’s SPARQL assistant</a>.

## REST API: convenience access

The REST API provides predefined calls for browsing collections and retrieving entities. It can be extended with further methods for common use cases.

[Open Swagger to explore the methods and try them out](http://bntqrhrnf22fyrc3js1g6rug.88.99.121.103.sslip.io/swagger-ui.html), or view the [OpenAPI description](http://bntqrhrnf22fyrc3js1g6rug.88.99.121.103.sslip.io/v3/api-docs).
