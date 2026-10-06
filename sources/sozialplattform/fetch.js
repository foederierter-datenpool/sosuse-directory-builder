import path from "path"
import fs from "fs"
import { pathToFileURL } from "node:url"

const PER_PAGE = 100

const fetchPage = async (baseUrl, page) => {
    const url = new URL(baseUrl)
    url.searchParams.set("page", String(page))
    url.searchParams.set("itemsPerPage", String(PER_PAGE))
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`Page ${page}: HTTP ${res.status}`)
    const json = await res.json()
    if (json.status !== "success") throw new Error(`Page ${page}: API status ${json.status}`)
    if (!Number.isSafeInteger(Number(json.data?.total)) || Number(json.data.total) < 0 || !Array.isArray(json.data.items))
        throw new Error(`Page ${page}: invalid response`)
    return { total: Number(json.data.total), items: json.data.items }
}

export async function fetchSozialplattform({ outDir, baseUrl }) {
    // One raw file keeps the lift to one JVM start.
    const byId = new Map()
    const first = await fetchPage(baseUrl, 1)
    const total = first.total
    const totalPages = Math.ceil(total / PER_PAGE)
    for (let page = 1; page <= Math.max(1, totalPages); page++) {
        const { total: pageTotal, items } = page === 1 ? first : await fetchPage(baseUrl, page)
        if (pageTotal !== total || items.length > PER_PAGE || items.some(item => item?.offer_id == null))
            throw new Error(`Page ${page}: inconsistent response`)
        for (const item of items) byId.set(item.offer_id, item)
    }
    if (byId.size !== total) throw new Error(`Received ${byId.size} unique offers, expected ${total}`)

    fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, "sozialplattform.json")
    fs.writeFileSync(outPath, JSON.stringify([...byId.values()], null, 2))
    console.log(`  ${byId.size} unique offers (${totalPages} pages) → ${outPath}`)
    return { count: byId.size, outPath }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    await fetchSozialplattform({ outDir: process.argv[2], baseUrl: process.argv[3] })
