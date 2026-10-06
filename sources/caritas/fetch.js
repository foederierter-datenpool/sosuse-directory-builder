import path from "path"
import fs from "fs"
import { createHash } from "node:crypto"
import { compile } from "html-to-text"

const OUT_DIR = process.argv[2]
const FETCH_URL = process.argv[3]
const { plz: postalCodes = [] } = JSON.parse(process.argv[4] || "{}")
const apiKey = process.env.CARITAS_API_KEY

if (!apiKey) throw new Error("Caritas requires CARITAS_API_KEY in the environment")

const PAGE_SIZE = 100
const BIDIRECTIONAL_THRESHOLD = 1000
const MAX_PAGINATION_ATTEMPTS = 2
const MAX_REQUEST_ATTEMPTS = 5
const headers = { Authorization: `ApiKey ${apiKey}`, client_id: "socialservice", Accept: "application/json" }
const plainText = compile({ wordwrap: false, selectors: [{ selector: "a", options: { ignoreHref: true } }] })
const checkpointKey = createHash("sha256").update(JSON.stringify({ url: FETCH_URL, postalCodes, pageSize: PAGE_SIZE })).digest("hex").slice(0, 16)
const checkpointRoot = path.resolve("data/ingest/checkpoints/caritas", checkpointKey)

class PaginationChangedError extends Error {}
class PermanentResponseError extends Error {}

const checkpointDir = (postalCode, reverse = false) => path.join(checkpointRoot, postalCode ?? "all", ...(reverse ? ["desc"] : []))
const checkpointPath = (postalCode, start, reverse = false) => path.join(checkpointDir(postalCode, reverse), `${start}.json`)

function readCheckpoint(postalCode, start, reverse = false) {
    const file = checkpointPath(postalCode, start, reverse)
    if (!fs.existsSync(file)) return null
    try {
        const value = JSON.parse(fs.readFileSync(file, "utf8"))
        if (value.start === start && Number.isSafeInteger(value.total) && Array.isArray(value.records)
            && value.records.length > 0 && value.records.length <= PAGE_SIZE
            && value.records.every(record => record?.id)) return value
    } catch { /* A damaged checkpoint is fetched again. */ }
    fs.rmSync(file, { force: true })
    return null
}

function saveCheckpoint(postalCode, start, result, reverse = false) {
    const file = checkpointPath(postalCode, start, reverse)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.tmp`
    fs.writeFileSync(temporary, JSON.stringify({ start, ...result }))
    fs.renameSync(temporary, file)
}

function clearCheckpoint(postalCode, reverse = false) {
    fs.rmSync(checkpointDir(postalCode, reverse), { recursive: true, force: true })
}

async function page(postalCode, start, reverse = false) {
    const url = new URL(FETCH_URL)
    const label = `Caritas ${postalCode ?? "all"} ${reverse ? "descending " : ""}page ${start}`
    if (postalCode) url.searchParams.set("zipCode", postalCode)
    if (reverse) {
        url.searchParams.set("sort", "title")
        url.searchParams.set("order", "DESC")
    }
    url.searchParams.set("start", String(start))
    url.searchParams.set("end", String(start + PAGE_SIZE))

    for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt++) {
        try {
            const response = await fetch(url, { headers, signal: AbortSignal.timeout(90_000) })
            if (response.status >= 400 && response.status < 500 && response.status !== 429)
                throw new PermanentResponseError(`${label}: HTTP ${response.status}`)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)

            const totalHeader = response.headers.get("X-Total-Count")
            const total = Number(totalHeader)
            const records = await response.json()
            if (totalHeader == null || !Number.isSafeInteger(total) || total < 0 || !Array.isArray(records)
                || records.length > PAGE_SIZE || records.some(record => !record?.id))
                throw new Error("invalid response")
            if (start < total && records.length === 0)
                throw new PaginationChangedError(`${label}: empty page before total ${total}`)
            return { total, records }
        } catch (error) {
            if (error instanceof PermanentResponseError || error instanceof PaginationChangedError) throw error
            if (attempt === MAX_REQUEST_ATTEMPTS)
                throw new Error(`${label}: ${error.message} after ${attempt} attempts`, { cause: error })
            console.warn(`  ${label}: ${error.message}; retrying (${attempt}/${MAX_REQUEST_ATTEMPTS})`)
            await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 8000)))
        }
    }
}

async function fetchPostalCode(postalCode) {
    for (let attempt = 1; attempt <= MAX_PAGINATION_ATTEMPTS; attempt++) {
        const seen = new Map()
        try {
            const first = await page(postalCode, 0)
            const total = first.total
            const cachedFirst = readCheckpoint(postalCode, 0)
            if (cachedFirst && (cachedFirst.total !== first.total
                || cachedFirst.records.length !== first.records.length
                || first.records.some((record, index) => record.id !== cachedFirst.records[index].id))) {
                console.warn(`  Caritas ${postalCode ?? "all"}: first page IDs changed; discarding saved pages`)
                clearCheckpoint(postalCode)
            }
            saveCheckpoint(postalCode, 0, first)
            const cachedPages = fs.readdirSync(checkpointDir(postalCode))
                .filter(name => /^\d+\.json$/.test(name)).length - 1
            if (cachedPages > 0) console.log(`  Caritas ${postalCode ?? "all"}: resuming with ${cachedPages} saved page(s)`)

            const midpoint = total > BIDIRECTIONAL_THRESHOLD
                ? Math.ceil(total / (2 * PAGE_SIZE)) * PAGE_SIZE : total
            let start = 0
            while (start < total) {
                const cached = start === 0 ? null : readCheckpoint(postalCode, start)
                if (start >= midpoint && !cached) break
                const result = start === 0 ? first : cached ?? await page(postalCode, start)
                if (result.total !== total)
                    throw new PaginationChangedError(`Caritas ${postalCode ?? "all"}: total changed during pagination`)
                if (start !== 0 && !cached) saveCheckpoint(postalCode, start, result)
                for (const record of result.records) seen.set(record.id, record)
                start += result.records.length
                if (start % 1000 === 0 || start >= total)
                    console.log(`  Caritas ${postalCode ?? "all"}: ${Math.min(start, total)}/${total} records processed`)
            }

            if (seen.size < total) {
                const firstDesc = await page(postalCode, 0, true)
                const cachedFirstDesc = readCheckpoint(postalCode, 0, true)
                if (cachedFirstDesc && (cachedFirstDesc.total !== firstDesc.total
                    || cachedFirstDesc.records.length !== firstDesc.records.length
                    || firstDesc.records.some((record, index) => record.id !== cachedFirstDesc.records[index].id))) {
                    console.warn(`  Caritas ${postalCode ?? "all"}: descending first page IDs changed; discarding saved descending pages`)
                    clearCheckpoint(postalCode, true)
                }
                if (firstDesc.total !== total)
                    throw new PaginationChangedError(`Caritas ${postalCode ?? "all"}: total changed before descending pagination`)
                saveCheckpoint(postalCode, 0, firstDesc, true)
                const cachedDescPages = fs.readdirSync(checkpointDir(postalCode, true))
                    .filter(name => /^\d+\.json$/.test(name)).length - 1
                if (cachedDescPages > 0) console.log(`  Caritas ${postalCode ?? "all"}: resuming with ${cachedDescPages} saved descending page(s)`)

                let reverseStart = 0
                const reverseLimit = Math.min(total, total - start + 2000)
                while (seen.size < total && reverseStart < reverseLimit) {
                    const cached = reverseStart === 0 ? null : readCheckpoint(postalCode, reverseStart, true)
                    const result = reverseStart === 0 ? firstDesc : cached ?? await page(postalCode, reverseStart, true)
                    if (result.total !== total)
                        throw new PaginationChangedError(`Caritas ${postalCode ?? "all"}: total changed during descending pagination`)
                    if (reverseStart !== 0 && !cached) saveCheckpoint(postalCode, reverseStart, result, true)
                    for (const record of result.records) seen.set(record.id, record)
                    reverseStart += result.records.length
                    if (reverseStart % 1000 === 0 || seen.size === total)
                        console.log(`  Caritas ${postalCode ?? "all"}: ${seen.size}/${total} unique records after descending page ${reverseStart}`)
                }
            }
            if (seen.size !== total)
                throw new PaginationChangedError(`Caritas ${postalCode ?? "all"}: received ${seen.size} unique records, expected ${total}`)
            return seen
        } catch (error) {
            if (!(error instanceof PaginationChangedError)) throw error
            clearCheckpoint(postalCode)
            if (attempt === MAX_PAGINATION_ATTEMPTS) throw error
            console.warn(`  ${error.message}; retrying ${postalCode ?? "all"} from the first page`)
        }
    }
}

// Keep one raw JSON file so lift starts one JVM. Completed pages remain
// available after a failed fetch and are removed after the complete write.
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
fs.rmSync(checkpointRoot, { recursive: true, force: true })
console.log(`  ${byId.size} unique records → ${outPath}`)
