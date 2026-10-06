import { emit, fetchOk, pool, retry } from "@directory-builder/core/fetch"
import { DomUtils, parseDocument } from "htmlparser2"
import { pathToFileURL } from "node:url"

const PAGE_SIZE = 15

function searchResults(html, baseUrl, page) {
    const document = parseDocument(html)
    const links = DomUtils.findAll(node => node.name === "a" && node.attribs?.href, document.children)
    const details = new Map()
    let nextUrl
    for (const link of links) {
        const url = new URL(link.attribs.href, baseUrl)
        const action = url.searchParams.get("tx_wwdhseinrichtung2_fe1[action]")
        if (action === "show") {
            const id = url.searchParams.get("tx_wwdhseinrichtung2_fe1[entry]")
            if (/^\d+$/.test(id)) details.set(id, url.toString())
        } else if (url.searchParams.get("tx_wwdhseinrichtung2_fe1[entrys][currentPage]") === String(page + 1)) {
            nextUrl = url.toString()
        }
    }
    const summary = DomUtils.findOne(node => node.attribs?.id === "wwdhseinrichtung2_startresults", document.children)
    const match = DomUtils.textContent(summary ?? document).match(/([\d.]+)\s+Einträge/)
    const total = match ? Number(match[1].replaceAll(".", "")) : undefined
    return { details, nextUrl, total }
}

export function compactDetail(html, url, id) {
    const document = parseDocument(html)
    const entry = DomUtils.findOne(node => node.name === "div" && node.attribs?.class?.split(/\s+/).includes("entrylong"), document.children)
    if (!entry) throw new Error(`DHS detail ${id}: entry markup missing`)
    const canonical = new URL(url)
    canonical.searchParams.set("tx_wwdhseinrichtung2_fe1[entry]", id)
    const href = canonical.toString().replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    return `<html><head><link rel="canonical" href="${href}"></head><body>${DomUtils.getOuterHTML(entry)}</body></html>`
}

export async function fetchDhs({ outDir, baseUrl, plzs = [], chunk = 50, retry: retryOptions, delayMs = 100 }) {
    const detailUrls = new Map()
    for (const plz of plzs.length ? plzs : [undefined]) {
        const params = new URLSearchParams({
            "tx_wwdhseinrichtung2_fe1[action]": "search",
            "tx_wwdhseinrichtung2_fe1[entrys][currentPage]": "1",
        })
        if (plz) params.set("tx_wwdhseinrichtung2_fe1[plzort]", plz)
        let searchUrl = `${baseUrl}?${params}`
        let expected
        for (let page = 1; page <= (plz ? 1 : 500); page++) {
            const indexHtml = await retry(async () => {
                const html = await (await fetchOk(searchUrl, { signal: AbortSignal.timeout(30_000) })).text()
                if (!/class=["'][^"']*\btx-ww-dhs-einrichtung2\b[^"']*["']/i.test(html))
                    throw new Error(`DHS search ${plz ?? "all"} page ${page}: directory markup missing`)
                return html
            }, retryOptions)
            const { details, nextUrl, total } = searchResults(indexHtml, baseUrl, page)
            if (page === 1 && !details.size) throw new Error(`DHS search ${plz ?? "all"}: no detail pages discovered`)
            if (!plz) {
                if (!Number.isSafeInteger(total) || total < 1 || (expected != null && expected !== total))
                    throw new Error(`DHS search page ${page}: invalid or changed result total`)
                expected = total
            }
            let added = 0
            for (const [id, url] of details) {
                if (detailUrls.has(id)) continue
                detailUrls.set(id, url)
                added++
            }
            console.log(`  ${plz ?? "all"} page ${page}: ${added} new entries (running total: ${detailUrls.size})`)
            if (plz) break
            if (page === Math.ceil(expected / PAGE_SIZE)) {
                if (detailUrls.size !== expected)
                    throw new Error(`DHS search: received ${detailUrls.size} unique entries, expected ${expected}`)
                break
            }
            if (!added) throw new Error(`DHS search page ${page}: no new entries`)
            if (!nextUrl) throw new Error(`DHS search page ${page}: next page link missing`)
            searchUrl = nextUrl
            if (page === 500) throw new Error("DHS search exceeded 500 pages")
        }
    }

    console.log(`Fetching ${detailUrls.size} unique detail pages (3 in parallel)…`)
    const { results } = await pool([...detailUrls], async ([id, url]) => {
        const html = await (await fetchOk(url, { signal: AbortSignal.timeout(30_000) })).text()
        return { name: `${id}.html`, content: compactDetail(html, url, id) }
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
