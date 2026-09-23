import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fetchDhs } from "../sources/dhs/fetch.js"

const baseUrl = "https://dhs.example.test/directory/"
const detailUrl = (id) => `${baseUrl}?tx_wwdhseinrichtung2_fe1%5Baction%5D=show&tx_wwdhseinrichtung2_fe1%5Bentry%5D=${id}&tail=x`
const escaped = (url) => url.replaceAll("&", "&amp;")
const listing = (...ids) => `<div class="tx-ww-dhs-einrichtung2">${ids.map(id => `<a href="${escaped(detailUrl(id))}">Entry</a>`).join("")}</div>`
const detail = (id, canonical = false) => `<html><head>${canonical ? `<link rel="canonical" href="${escaped(detailUrl(id))}">` : ""}</head><body><div class="entrylong"><h3>Facility ${id}</h3></div></body></html>`

function fixture(t, respond) {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sosuse-dhs-test-"))
    t.after(() => fs.rmSync(outDir, { recursive: true, force: true }))
    t.mock.method(console, "log", () => {})
    const calls = new Map()
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input)
        const id = url.searchParams.get("tx_wwdhseinrichtung2_fe1[entry]")
        const key = id ? `detail:${id}` : `search:${url.searchParams.get("tx_wwdhseinrichtung2_fe1[plzort]")}`
        const count = (calls.get(key) ?? 0) + 1
        calls.set(key, count)
        const { body, status = 200 } = respond(key, count, url)
        return new Response(body, { status, headers: { "Content-Type": "text/html" } })
    })
    const run = (plzs) => fetchDhs({ outDir, baseUrl, plzs, chunk: 2, delayMs: 0,
        retry: { attempts: 2, minTimeout: 1, maxTimeout: 1, jitter: false } })
    return { outDir, calls, run }
}

test("DHS retries transient failures, deduplicates across postal codes and preserves canonical links in chunks", async (t) => {
    const { outDir, calls, run } = fixture(t, (key, count, url) => {
        if (key.startsWith("search:")) {
            assert.equal(url.searchParams.get("tx_wwdhseinrichtung2_fe1[entrys][currentPage]"), "1")
            if (key === "search:10115" && count === 1) return { status: 503, body: "Unavailable" }
            return { body: listing(1, 2, 1) }
        }
        if (key === "detail:1" && count === 1) return { status: 429, body: "Slow down" }
        if (key === "detail:2" && count === 1) return { body: "<html>Please verify you are human</html>" }
        return { body: detail(key.split(":")[1], key === "detail:2") }
    })
    const result = await run(["10115", "10117"])
    assert.equal(result.written, 2)
    assert.equal(result.files, 1)
    assert.deepEqual(Object.fromEntries(calls), { "search:10115": 2, "search:10117": 1, "detail:1": 2, "detail:2": 2 })
    const html = fs.readFileSync(path.join(outDir, "records-0001.html"), "utf8")
    assert.equal([...html.matchAll(/class="cdp-record"/g)].length, 2)
    for (const id of [1, 2]) {
        assert.ok(html.includes(`data-name="${id}.html"`))
        assert.ok(html.includes(`<link rel="canonical" href="${escaped(detailUrl(id))}">`))
    }
    assert.equal([...html.matchAll(/rel="canonical"/g)].length, 2)
})

test("DHS aborts permanent HTTP errors without retrying or writing a partial harvest", async (t) => {
    const { outDir, calls, run } = fixture(t, key => key.startsWith("search:")
        ? { body: listing(1) } : { status: 403, body: "Forbidden" })
    await assert.rejects(run(["10115"]), /403/)
    assert.equal(calls.get("detail:1"), 1)
    assert.deepEqual(fs.readdirSync(outDir), [])
})

test("DHS rejects unexpected HTTP-200 search or detail pages after bounded retries", async (t) => {
    for (const phase of ["search", "detail"]) await t.test(phase, async (t) => {
        const { outDir, calls, run } = fixture(t, key => phase === "detail" && key.startsWith("search:")
            ? { body: listing(1) } : { body: "<html>Challenge page</html>" })
        await assert.rejects(run(["10115"]), /markup missing/)
        assert.equal(calls.get(phase === "search" ? "search:10115" : "detail:1"), 2)
        assert.deepEqual(fs.readdirSync(outDir), [])
    })
})

test("DHS rejects an empty discovery or a detail page without a usable canonical-link location", async (t) => {
    for (const scenario of ["empty", "missing head"]) await t.test(scenario, async (t) => {
        const { outDir, run } = fixture(t, key => key.startsWith("search:")
            ? { body: scenario === "empty" ? listing() : listing(1) }
            : { body: '<div class="entrylong">Facility</div>' })
        await assert.rejects(run(["10115"]), scenario === "empty" ? /no detail pages/ : /head missing/)
        assert.deepEqual(fs.readdirSync(outDir), [])
    })
})
