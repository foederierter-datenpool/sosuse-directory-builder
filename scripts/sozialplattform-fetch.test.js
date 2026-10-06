import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fetchSozialplattform } from "../sources/sozialplattform/fetch.js"

test("Sozialplattform retrieves all national pages without a place filter", async t => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sosuse-sp-test-"))
    t.after(() => fs.rmSync(outDir, { recursive: true, force: true }))
    t.mock.method(console, "log", () => {})
    const pages = []
    t.mock.method(globalThis, "fetch", async input => {
        const url = new URL(input)
        assert.equal(url.searchParams.has("place"), false)
        const page = Number(url.searchParams.get("page"))
        pages.push(page)
        const start = (page - 1) * 100
        const items = Array.from({ length: Math.min(105 - start, 100) }, (_, i) => ({ offer_id: start + i + 1 }))
        return Response.json({ status: "success", data: { total: 105, items } })
    })
    await fetchSozialplattform({ outDir, baseUrl: "https://example.test/search" })
    assert.deepEqual(pages, [1, 2])
    assert.equal(JSON.parse(fs.readFileSync(path.join(outDir, "sozialplattform.json"))).length, 105)
})
