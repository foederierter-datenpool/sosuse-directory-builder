import path from "path"
import fs from "fs"
import { compile } from "html-to-text"

const OUT_DIR = process.argv[2]
const FETCH_URL = process.argv[3]
const { plz: postalCodes = [] } = JSON.parse(process.argv[4] || "{}")
const apiKey = process.env.CARITAS_API_KEY

if (!apiKey) throw new Error("Caritas requires CARITAS_API_KEY in the environment")

const PAGE_SIZE = 100
const MAX_PAGINATION_ATTEMPTS = 2
const headers = { Authorization: `ApiKey ${apiKey}`, client_id: "socialservice", Accept: "application/json" }
const plainText = compile({ wordwrap: false, selectors: [{ selector: "a", options: { ignoreHref: true } }] })

class PaginationChangedError extends Error {}

async function page(postalCode, start) {
    const url = new URL(FETCH_URL)
    if (postalCode) url.searchParams.set("zipCode", postalCode)
    url.searchParams.set("start", String(start))
    url.searchParams.set("end", String(start + PAGE_SIZE))

    let response
    for (let attempt = 0; attempt < 3; attempt++) {
        response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) })
        if (response.status !== 429 && response.status < 500) break
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
    }
    if (!response.ok) throw new Error(`Caritas ${postalCode ?? "all"} page ${start}: HTTP ${response.status}`)

    const totalHeader = response.headers.get("X-Total-Count")
    const total = Number(totalHeader)
    const records = await response.json()
    if (totalHeader == null || !Number.isSafeInteger(total) || total < 0 || !Array.isArray(records)
        || records.length > PAGE_SIZE || records.some(record => !record?.id))
        throw new Error(`Caritas ${postalCode ?? "all"} page ${start}: invalid response`)
    if (start < total && records.length === 0)
        throw new PaginationChangedError(`Caritas ${postalCode ?? "all"} page ${start}: empty page before total ${total}`)
    return { total, records }
}

async function fetchPostalCode(postalCode) {
    for (let attempt = 1; attempt <= MAX_PAGINATION_ATTEMPTS; attempt++) {
        let start = 0
        let total
        const seen = new Map()
        try {
            do {
                const result = await page(postalCode, start)
                if (total != null && result.total !== total)
                    throw new PaginationChangedError(`Caritas ${postalCode ?? "all"}: total changed during pagination`)
                total = result.total
                for (const record of result.records) seen.set(record.id, record)
                start += result.records.length
            } while (start < total)
            if (seen.size !== total)
                throw new PaginationChangedError(`Caritas ${postalCode ?? "all"}: received ${seen.size} unique records, expected ${total}`)
            return seen
        } catch (error) {
            if (!(error instanceof PaginationChangedError) || attempt === MAX_PAGINATION_ATTEMPTS) throw error
            console.warn(`  ${error.message}; retrying ${postalCode ?? "all"} from the first page`)
        }
    }
}

// Keep one raw JSON file so the lift step starts one JVM. The API returns
// addresses, identified by id; postcode queries can overlap.
const byId = new Map()
for (const postalCode of postalCodes.length ? postalCodes : [undefined]) {
    const records = await fetchPostalCode(postalCode)
    for (const record of records.values()) {
        const descriptionText = plainText(record.description || "").trim()
        if (descriptionText) record.descriptionText = descriptionText
        byId.set(record.id, record)
    }
    console.log(`  ${postalCode ?? "all"}: ${records.size} records (running total ${byId.size})`)
}

fs.mkdirSync(OUT_DIR, { recursive: true })
const outPath = path.join(OUT_DIR, "caritas.json")
fs.writeFileSync(outPath, JSON.stringify([...byId.values()], null, 2))
console.log(`  ${byId.size} unique records → ${outPath}`)
