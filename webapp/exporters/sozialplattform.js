// Exporter: maps the federated directory into Sozialplattform's JSON shape via
// a SPARQL query. A bespoke output adapter (target-specific by nature).
// Declared in federation.ttl (:hasExporter "sozialplattform") and loaded by the
// webapp's Download page at runtime, like config/ and data/. Runtime modules
// can't resolve bare imports, so build() receives the helpers as a toolkit.

export const label    = "Sozialplattform JSON"
export const filename = "sozialplattform.json"
export const mime     = "application/json"

const QUERY = `
PREFIX schema: <http://schema.org/>

SELECT ?org
       (SAMPLE(?n)   AS ?name)
       (SAMPLE(?s)   AS ?street)
       (SAMPLE(?pc)  AS ?postalCode)
       (SAMPLE(?l)   AS ?locality)
       (SAMPLE(?co)  AS ?country)
       (SAMPLE(?cat) AS ?category)
       (SAMPLE(?ph)  AS ?phone)
       (SAMPLE(?em)  AS ?email)
WHERE {
    ?org schema:name ?n .
    # The address lives on the linked Adresse entity (schema:address), not flat
    # on the org — directory.ttl drops the org-side copies via the :drop override.
    OPTIONAL { ?org schema:address ?adr .
        OPTIONAL { ?adr schema:streetAddress   ?s  }
        OPTIONAL { ?adr schema:postalCode      ?pc }
        OPTIONAL { ?adr schema:addressLocality ?l  }
        OPTIONAL { ?adr schema:addressCountry  ?co }
    }
    OPTIONAL { ?org schema:category        ?cat }
    OPTIONAL { ?org schema:telephone       ?ph  }
    OPTIONAL { ?org schema:email           ?em  }
}
GROUP BY ?org
ORDER BY ?org`

export async function build(finalTtl, { sparqlSelect, storeFromTurtles, localName }) {
    const rows = await sparqlSelect(QUERY, [storeFromTurtles([finalTtl])])
    // Key order mirrors a Sozialplattform record; fields the directory has no
    // value for stay blank rather than being omitted, so the shape round-trips.
    return JSON.stringify(rows.map((r) => ({
        offer_id:                   localName(r.org),
        offer_nid:                  "",
        offer_title:                "",
        offer_langcode:             "",
        offer_service_area:         "",
        search_score:               null,
        office_address_short:       [r.country, r.locality, r.postalCode, r.street].filter(Boolean).join(", "),
        office_address: {
            langcode:               null,
            country_code:           r.country    ?? null,
            locality:               r.locality   ?? null,
            postal_code:            r.postalCode ?? null,
            address_line1:          r.street     ?? null,
            address_line3:          null,
        },
        office_title:               r.name  ?? "",
        office_phone:               r.phone ?? "",
        office_email:               r.email ?? "",
        office_opening_hours:       "",
        office_opening_hours_notes: "",
        offer_type:                 r.category ?? "",
    })), null, 2)
}
