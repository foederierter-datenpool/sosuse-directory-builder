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

### Default and named graphs

Queries without `GRAPH` read only the finished `directory.ttl`. Other included Turtle
files are available as separate named graphs, including intermediate values,
provenance and configuration. Files under `data/pipeline/extracted/` and
`data/pipeline/preparation/` remain available as downloads but are excluded from
Fuseki. Graphs are refreshed when the API is rebuilt.

<details>
<summary>Discover named graphs</summary>

Names follow file paths: `data/pipeline/merged.ttl` becomes
`urn:directory:data/pipeline/merged.ttl`, and `config/federation.ttl` becomes
`urn:directory:config/federation.ttl`. `directory.ttl` is only in the default graph.
This query lists the populated graphs in the running endpoint:

```sparql
SELECT ?graph (COUNT(*) AS ?triples) WHERE {
  GRAPH ?graph { ?s ?p ?o }
}
GROUP BY ?graph
ORDER BY ?graph
```

</details>

Run the following examples against the SPARQL endpoint above. The webapp's Query
page loads the finished directory only; these named graphs live on the server.

<details>
<summary>Query one graph or several graphs</summary>

Read opening hours before resolution from one graph:

```sparql
PREFIX schema: <http://schema.org/>
SELECT ?entity ?hours WHERE {
  GRAPH <urn:directory:data/pipeline/merged.ttl> {
    ?entity schema:openingHours ?hours
  }
}
LIMIT 20
```

Read both merged and resolved values, keeping the graph name in each result:

```sparql
PREFIX schema: <http://schema.org/>
SELECT ?graph ?hours WHERE {
  VALUES ?entity { <https://civic-data.de/federated-directory#org-3fd74b2d37fb> }
  VALUES ?graph {
    <urn:directory:data/pipeline/merged.ttl>
    <urn:directory:data/pipeline/resolved.ttl>
  }
  GRAPH ?graph { ?entity schema:openingHours ?hours }
}
```

Separate `GRAPH` blocks can also join facts across graphs, as in the provenance examples below.

</details>

<details>
<summary>Where did a particular statement come from?</summary>

Select a statement from the default graph, then look up its RDF 1.2 annotation
(`rdf:reifies`) in the provenance graph. Replace the entity and predicate to inspect another fact.

```sparql
PREFIX schema: <http://schema.org/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX prov: <http://www.w3.org/ns/prov#>
SELECT ?value ?derivedFrom ?step WHERE {
  VALUES (?entity ?predicate) {
    (<https://civic-data.de/federated-directory#org-3fd74b2d37fb> schema:openingHours)
  }
  ?entity ?predicate ?value .
  GRAPH <urn:directory:data/provenance.ttl> {
    ?annotation rdf:reifies <<( ?entity ?predicate ?value )>> ;
                prov:wasDerivedFrom ?derivedFrom .
    OPTIONAL { ?annotation prov:wasGeneratedBy ?step }
  }
}
```

For a particular value, add `VALUES ?value { "the exact value" }`, including its
language tag or datatype if present. `derivedFrom` identifies the source record,
or another directory entity when the value was inherited during enrichment.
Corrected or concatenated values may have no exact statement annotation; inspect
their original merged values instead.

</details>

<details>
<summary>Which opening-hours values disagreed before resolution?</summary>

`merged.ttl` retains the original competing values. Join their annotations to source
records and check whether each value appears unchanged in the finished directory:

```sparql
PREFIX schema: <http://schema.org/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX cdp: <https://civic-data.de/pipeline#>
SELECT ?value ?sourceRecord ?source
       (EXISTS { ?entity schema:openingHours ?value } AS ?inDirectory)
WHERE {
  VALUES ?entity { <https://civic-data.de/federated-directory#org-3fd74b2d37fb> }
  GRAPH <urn:directory:data/pipeline/merged.ttl> {
    ?entity schema:openingHours ?value
  }
  GRAPH <urn:directory:data/provenance.ttl> {
    ?annotation rdf:reifies <<( ?entity schema:openingHours ?value )>> ;
                prov:wasDerivedFrom ?sourceRecord .
  }
  OPTIONAL {
    GRAPH <urn:directory:data/pipeline/mapped.ttl> {
      ?sourceRecord cdp:fromSource ?source
    }
  }
}
```

In the current snapshot, this entity has two schedules from two DHS records; one
is retained. Differences can also reflect complementary information or a mistaken
entity match, rather than a factual contradiction. The resolver's choice is not a
judgment of which source is correct.

Find other entities with multiple opening-hours values:

```sparql
PREFIX schema: <http://schema.org/>
SELECT ?entity (COUNT(DISTINCT ?value) AS ?values) WHERE {
  GRAPH <urn:directory:data/pipeline/merged.ttl> {
    ?entity schema:openingHours ?value
  }
}
GROUP BY ?entity
HAVING (COUNT(DISTINCT ?value) > 1)
```

</details>

## REST API: convenience access

The REST API provides predefined calls for browsing collections and retrieving entities. It can be extended with further methods for common use cases.

[Open Swagger to explore the methods and try them out](http://bntqrhrnf22fyrc3js1g6rug.88.99.121.103.sslip.io/swagger-ui.html), or view the [OpenAPI description](http://bntqrhrnf22fyrc3js1g6rug.88.99.121.103.sslip.io/v3/api-docs).

## GraphQL: select fields and follow relationships

The read-only GraphQL API lets you choose fields and follow connections, such as Einrichtungen and their addresses, in one request. [Open GraphiQL for schema documentation and a query editor](http://bntqrhrnf22fyrc3js1g6rug.88.99.121.103.sslip.io/graphiql). Queries go to `/graphql` on the same host.

```graphql
{
  einrichtungSchema(limit: 5) {
    id
    name
    address { postalCode addressLocality }
  }
}
```

GraphQL reads the finished directory. For named graphs, provenance and full RDF values, use SPARQL.

<details>
<summary>More GraphQL examples</summary>

**Contact details, opening hours and Träger**

Skip the first ten Einrichtungen and retrieve the next ten with their parent organizations:

```graphql
{
  einrichtungSchema(limit: 10, offset: 10) {
    id
    name
    telephone
    email
    openingHours
    parentOrganization { id name homepage }
  }
}
```

**Angebote and their providers**

A provider can be an Einrichtung or a Träger. Inline fragments select fields for each type; `__typename` identifies which one was returned.

```graphql
{
  angebotSchema(limit: 5) {
    id
    name
    provider {
      __typename
      ... on Entity_einrichtungSchema {
        id
        name
        address { streetAddress postalCode addressLocality }
      }
      ... on Entity_traegerSchema {
        id
        name
        homepage
      }
    }
  }
}
```

</details>

[GraphQL-LD clients](https://github.com/rubensworks/GraphQL-LD.js) can also use the SPARQL endpoint with a JSON-LD context. This is separate from the typed GraphQL API above.
