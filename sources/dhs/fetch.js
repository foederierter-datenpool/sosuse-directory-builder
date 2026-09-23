import { emit, fetchOk, pool, retry } from "@directory-builder/core/fetch"
import { pathToFileURL } from "node:url"

// Keep the existing postal-code searches and entry-ID deduplication. Pagination
// and geographic scope are separate decisions from this engine migration.
export async function fetchDhs({ outDir, baseUrl, plzs, chunk = 50, retry: retryOptions, delayMs = 100 }) {
    const detailUrls = new Map()
    for (const plz of plzs) {
        const params = new URLSearchParams({
            "tx_wwdhseinrichtung2_fe1[action]":              "search",
            "tx_wwdhseinrichtung2_fe1[entrys][currentPage]": "1",
            "tx_wwdhseinrichtung2_fe1[plzort]":              plz,
        })
        const searchUrl = `${baseUrl}?${params}`
        const indexHtml = await retry(async () => {
            const html = await (await fetchOk(searchUrl, { signal: AbortSignal.timeout(30_000) })).text()
            // A bot challenge can return HTTP 200. Require the actual directory.
            if (!/class=["'][^"']*\btx-ww-dhs-einrichtung2\b[^"']*["']/i.test(html))
                throw new Error(`DHS search ${plz}: directory markup missing`)
            return html
        }, retryOptions)
        const detailRe = /href="([^"]*action%5D=show[^"]*entry%5D=(\d+)[^"]*)"/g
        let added = 0
        for (const m of indexHtml.matchAll(detailRe)) {
            if (detailUrls.has(m[2])) continue
            const href = m[1].replace(/&amp;/g, "&")
            detailUrls.set(m[2], new URL(href, baseUrl).toString())
            added++
        }
        console.log(`  ${plz}: ${added} new entries (running total: ${detailUrls.size})`)
    }
    if (!detailUrls.size) throw new Error("DHS: no detail pages discovered for the configured postal codes")

    console.log(`Fetching ${detailUrls.size} unique detail pages (3 in parallel)…`)
    const { results } = await pool([...detailUrls], async ([id, url]) => {
        const html = await (await fetchOk(url, { signal: AbortSignal.timeout(30_000) })).text()
        if (!/class=["'][^"']*\bentrylong\b[^"']*["']/i.test(html))
            throw new Error(`DHS detail ${id}: entry markup missing`)
        // The extract reads the entry ID from this link. Preserve the existing
        // fallback when DHS omits it, including when documents are chunked.
        const canonical = /rel=["']canonical["']/i.test(html)
        if (!canonical && !/<\/head>/i.test(html))
            throw new Error(`DHS detail ${id}: cannot insert the canonical link (head missing)`)
        const content = canonical ? html
            : html.replace(/<\/head>/i, `<link rel="canonical" href="${url.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">$&`)
        return { name: `${id}.html`, content }
    }, {
        concurrency: 3, retry: retryOptions, delayMs,
        onProgress: ({ completed, total }) => {
            if (completed % 10 === 0 || completed === total) console.log(`  details: ${completed}/${total}`)
        },
    })
    // Only write after every detail succeeds. Core lifts each chunk once, then
    // splits it back into per-record files for the unchanged extract.
    return emit(results, {
        outDir, format: "html", mode: "documents", chunk,
        expect: { total: detailUrls.size, minRecords: 1 },
    })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { plz = [] } = JSON.parse(process.argv[4] || "{}")
    await fetchDhs({ outDir: process.argv[2], baseUrl: process.argv[3], plzs: plz })
}
