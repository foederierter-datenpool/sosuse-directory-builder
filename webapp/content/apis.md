## Query the directory

SoSuSe combines Träger (organisations), Einrichtungen (facilities), Angebote (services)
and postal addresses. Search for a facility, follow its services and relationships,
and inspect the sources behind its values.

| Interface | Use it for |
| --- | --- |
| [SPARQL endpoint](https://sosuse.correlaid.org/directory/sparql?query=ASK%7B%7D) | Search, graph relationships, source attribution and diagnostics |
| [REST / Swagger](https://sosuse.correlaid.org/swagger-ui.html) | Discover collections, browse entities and follow item links |
| [GraphQL / GraphiQL](https://sosuse.correlaid.org/graphiql) | Select nested fields from the finished directory |
| [Turtle snapshot](https://sosuse.correlaid.org/directory.ttl) | Work locally with the finished directory |

### Query examples

Each example opens and runs in the [Query editor](#/query). Edit its `VALUES`
inputs and press the play button to run it again. Queries use this directory's
SPARQL endpoint, including the named graphs for sources, provenance and matching.

| Example | Inputs | Results |
| --- | --- | --- |
| [Name search](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23search-by-name&run=1) | Name substring | Facility IRI, name, postcode and locality; at most 20 rows |
| [Postcode search](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23byPostcode&run=1) | Exact postcode as text | Facility, address, contact lists and optional linked service; at most 50 rows |
| [Bounding-box search](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23within-bounds&run=1) | South, north, west, east | Facility, coordinates and address; at most 50 rows |
| [Source records](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23sources-of&run=1) | Entity IRI | Source label, record IRI, original name and detail page where supplied |
| [Value origins](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23explain-value&run=1) | Entity IRI and predicate IRI | Current value, immediate origin, contributing source record and inheritance rule where traceable |
| [Competing values](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23competing-values&run=1) | Entity IRI and predicate IRI | Original values, source records, configured strategy and whether each value survives unchanged |
| [Sources and harvest dates](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23source-status&run=1) | None | Coverage, source-record counts and ingest timestamps |

Keep the returned entity IRIs to follow a search result through its source records
and original values. Missing fields remain missing information.

### Query from another application

Send SPARQL to the endpoint as a `query` parameter, for example:

```sh
curl --fail-with-body --max-time 35 --get \
  --data-urlencode 'query=SELECT ?entity ?name WHERE { ?entity <http://schema.org/name> ?name } LIMIT 20' \
  -H 'Accept: application/sparql-results+json' \
  https://sosuse.correlaid.org/directory/sparql
```

Results use standard SPARQL JSON: `head.vars` lists columns and
`results.bindings` contains rows. An absent optional binding means no value was
found; it is not an empty string or a negative answer.

The endpoint allows cross-origin requests and read-only queries, with a 30-second
timeout and no outbound `SERVICE` calls. The Query editor displays which endpoint
it uses.

### Search and location details

Name search uses a case-insensitive substring. “Sucht” can find names containing
that word, but cannot identify every addiction-related service. Category coverage
varies by source.

Postcode search keeps facilities even when contacts or explicitly linked services
are absent. A facility with several services produces several rows. Contact values
are joined with `; ` for display; use REST properties for separate RDF values.
Empty contact lists mean no value was found. Some facility contacts are inherited
from their Träger and may reach a head office.
An absent Angebot does not mean the facility offers no support.

The bounding-box example is a rectangular geographic filter, not a radius or
nearest-first ranking. It includes only facilities whose addresses have coordinates.
It cannot establish travel distance, accessibility or whether a service is open now.

## Sources, provenance and matching

Queries without `GRAPH` read only the finished `directory.ttl`. Other published
Turtle files are separate named graphs. Their names follow file paths:

| Graph | Contents |
| --- | --- |
| `urn:directory:data/pipeline/mapped.ttl` | Source records mapped to common predicates, including their source IRIs |
| `urn:directory:data/pipeline/matches.ttl` | Cluster membership and accepted matching evidence |
| `urn:directory:data/pipeline/merged.ttl` | Combined values before corrections and resolution |
| `urn:directory:data/pipeline/resolved.ttl` | Resolved values before inheritance and geocoding |
| `urn:directory:data/provenance.ttl` | Statement annotations and inheritance origins |
| `urn:directory:config/federation.ttl` | Sources, coverage, target fields and processing rules |
| `urn:directory:config/curation.ttl` | Explicit matches, exclusions and value corrections |
| `urn:directory:data/ingest/ingest-log.ttl` | Harvest observations and ingest start/end |
| `urn:directory:data/catalog.ttl` | Publication metadata, including snapshot date |
| `urn:directory:data/target-vocabulary.ttl` | Target vocabulary and validation shapes |

Extracted and preparation files are downloadable but are not imported into Fuseki.
Graph availability follows the published snapshot.
[Discover populated graphs in Query](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23graphs&run=1).

### Which sources describe an entity?

[Source records](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23sources-of&run=1) follows `cdp:hasMember`
from an entity to its contributing records, then reads their `cdp:fromSource`.
It also returns source-specific detail pages before resolution selects one.
The example entity is a Berlin facility; replace it with an IRI returned by search.

[Multi-source facilities](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23multi-source-entities&run=1)
returns 20 facilities described by more than one source, with distinct source
counts and source IRIs. This is useful for exploring overlap. Membership does
not mean every source confirms every field, and a match can be wrong.

### Where did a value come from?

[Explain a value](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23explain-value&run=1) starts with a current
value, finds its RDF 1.2 statement annotation (`rdf:reifies`), and follows
`prov:wasDerivedFrom`. For inheritance it also follows one hop from the parent
entity's statement to its source record. `step` and `inheritanceRule` identify
that derivation when present.

Try the example's name first. For inherited values, use a service IRI and
`schema:openingHours`, `schema:audience` or `schema:areaServed`, or a facility
with inherited contact details. For a concrete example, change the `VALUES` row to:

```sparql
(<https://civic-data.de/federated-directory#service-00163aaaeddb> schema:audience)
```

This follows the inherited audience through its facility to DHS record `dhs-4050`.
Example IRIs apply to their snapshot. A parent link alone does not establish
inheritance: values supplied directly take precedence.

| Value kind | What the provenance query can show |
| --- | --- |
| Original value preserved by resolution | Contributing source record(s) |
| Inherited value | Parent entity and, when its original statement is annotated, the source record |
| Concatenated or corrected value | An exact annotation may be absent; inspect original merged values and curation |
| Geocoded coordinates | No per-coordinate source-record annotation; `cdp:geocodedAs` records some adjusted lookup strings only |

No result is not proof that a value has no origin. These are limits of the
published annotations. Resolver configuration describes the strategy, not a
recorded explanation of each individual choice.

### Compare values before and after resolution

[Competing values](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23competing-values&run=1) reads the
original merged values, attaches their source records, and checks whether each
exact RDF term remains in the finished directory. Change the predicate from
`schema:name` to `schema:openingHours` to inspect schedules.

`presentUnchanged = false` can mean a value was replaced, corrected or combined
into another literal. It does not mean the value was judged false. The strategy
column comes from the configuration. Inspect `ValueCorrection` entries in the
curation graph for explicit corrections, and use [Merge](#/merge) to browse the
same kinds of differences visually.

### Count value variation across the corpus

[Value variation](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23value-variation&run=1) takes **one
literal-valued predicate** and returns an entity count for each observed scope:

- One source record carrying several values.
- Several records from one source carrying different values.
- Different sets of values supplied by different sources.
- Several sources supplying the same multi-value set.

Source sets are compared as RDF terms, including language and datatype. A missing
field in another source is not counted as a disagreement. The query excludes
record identifiers, source attribution, detail links, dates and coordinates.
It also reads the configured `keepAll` / `concatenateAll` strategies and
`multiValued` declarations so intentional multiplicity is excluded.

This compares mapped literal values grouped by match membership. It does not
measure factual contradictions, remaining manual work or matching accuracy.
Formatting, complementary descriptions and mistaken matches can all produce
variation. Coordinates need a paired latitude/longitude check of their own.
If no qualifying variation exists, the result is empty rather than a zero row.

Keep this query scoped to one predicate, such as `schema:name` or
`schema:openingHours`. A corpus-wide aggregation over all predicates can exceed
the server timeout. Adding `LIMIT` does not reduce the work needed to compute
an aggregate. For repeated analysis, work from a local snapshot.

### Why were records matched?

[Matching evidence](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23match-evidence&run=1) returns accepted
record pairs, manual-match markers, aggregate scores and per-criterion values.
The example includes a curated match. Replace the entity IRI to inspect an
automatic match, or browse [Match](#/match).

[Matches near their threshold](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23near-threshold-matches&run=1)
returns 20 accepted fuzzy-match evidence rows within `0.05` of their rule's
configured minimum. It is a review queue: a near-threshold match can be correct,
and a high-scoring match can still combine different services at one address.

Exact-key address rules have no weighted score; their aggregate is `0.000` even
when their hard criteria pass. Only accepted evidence is published. Rejected
candidates and source-guard blocks are not available in `matches.ttl`.

## Snapshot, coverage and operating limits

[Source status](#/query?example=https%3A%2F%2Fcivic-data.de%2Fsosuse%2Fquery-example%23source-status&run=1) returns one row per
source with its coverage, source-record count and harvest observation. Counts
include every mapped entity type, not just facilities. Static-file ingestion
times describe when a file was copied; `staticCommittedAt` is its repository date,
not proof of when its contents were collected.

The catalog's `dct:modified` dates the publication, not every source record.
An entity's `dct:modified` is currently selected by the generic longest-value
resolver; it must not be interpreted as the newest contributing timestamp.
Likewise, the resolved `schema:mainEntityOfPage` retains one detail page, not
all source citations. Use the source-records example for those links.

Coverage is uneven: Caritas covers CariNet listings, including Kitas and other
organisation types, and its API supplies no mapped category. AWO covers the
supplied Berlin-Mitte and adjacent-postcode files. Other source declarations
indicate national scope, not completeness. The data is predominantly German.
The absence of a result is not evidence that support is unavailable in an area.

Entity IRIs are deterministic but have no guaranteed stability across snapshots:
the persistent identity registry is disabled. Changes in matching can split or
combine entities and change their IRIs. Keep source-record links and identify
which snapshot an analysis used. REST pagination applies within one snapshot.

The webapp and API update separately. Compare their `directory.ttl` downloads
with SHA-256 when snapshot agreement matters; equal counts alone are insufficient.
The [Download page](#/download) provides the webapp's file, while the API serves
its own [directory snapshot](https://sosuse.correlaid.org/directory.ttl).
The harvest run IRI and timestamps provide additional context.

Keep interactive calls bounded, cache repeated results and avoid parallel corpus
aggregations on the shared endpoint. For heavier analysis, use the full Turtle
files from [Pipeline](#/pipeline) and run your own copy using the
[SoSuSe API setup](https://github.com/foederierter-datenpool/sosuse-directory-builder/tree/main/api)
and [directory-api](https://github.com/foederierter-datenpool/directory-api).
A local copy of `directory.ttl` alone supports search but not provenance or match queries.

## REST API: convenience access

The REST API provides predefined calls for browsing collections and retrieving entities. It can be extended with further methods for common use cases. Both REST and GraphQL query the SPARQL endpoint behind the scenes.

[Open Swagger to explore the methods and try them out](https://sosuse.correlaid.org/swagger-ui.html), or view the [OpenAPI description](https://sosuse.correlaid.org/v3/api-docs).

## GraphQL: select fields and follow relationships

The read-only GraphQL API lets you choose fields and follow connections, such as Einrichtungen and their addresses, in one request. [Open GraphiQL for schema documentation and a query editor](https://sosuse.correlaid.org/graphiql?query=%7B%0A%20%20einrichtungSchema%28limit%3A%205%29%20%7B%0A%20%20%20%20id%0A%20%20%20%20name%0A%20%20%20%20address%20%7B%20postalCode%20addressLocality%20%7D%0A%20%20%7D%0A%7D). Queries go to `/graphql` on the same host.

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
