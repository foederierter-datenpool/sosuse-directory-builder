import { test } from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import http from "node:http"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const run = promisify(execFile)

test("Caritas restarts an inconsistent paginated harvest once", async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caritas-fetch-"))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const records = Array.from({ length: 101 }, (_, i) => ({ id: `id-${i}`, number: i + 1 }))
    const starts = []
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, "http://localhost")
        const start = Number(url.searchParams.get("start"))
        starts.push(start)
        response.setHeader("Content-Type", "application/json")
        response.setHeader("X-Total-Count", starts.length === 2 ? "102" : "101")
        response.end(JSON.stringify(records.slice(start, Number(url.searchParams.get("end")))))
    })
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
    t.after(() => new Promise(resolve => server.close(resolve)))

    await run(process.execPath, ["sources/caritas/fetch.js", root,
        `http://127.0.0.1:${server.address().port}/socialservice`, "{}"], {
        cwd: path.join(import.meta.dirname, ".."),
        env: { ...process.env, CARITAS_API_KEY: "test-key" },
    })

    assert.deepEqual(starts, [0, 100, 0, 100])
    const written = JSON.parse(fs.readFileSync(path.join(root, "caritas.json"), "utf8"))
    assert.equal(written.length, 101)
})

test("Caritas fails without writing partial data when pagination changes twice", async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caritas-fetch-"))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const starts = []
    const server = http.createServer((request, response) => {
        const start = Number(new URL(request.url, "http://localhost").searchParams.get("start"))
        starts.push(start)
        response.setHeader("X-Total-Count", start === 0 ? "101" : "102")
        response.setHeader("Content-Type", "application/json")
        response.end(JSON.stringify(Array.from({ length: start === 0 ? 100 : 1 }, (_, i) => ({ id: `id-${start + i}` }))))
    })
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
    t.after(() => new Promise(resolve => server.close(resolve)))

    await assert.rejects(run(process.execPath, ["sources/caritas/fetch.js", root,
        `http://127.0.0.1:${server.address().port}/socialservice`, "{}"], {
        cwd: path.join(import.meta.dirname, ".."),
        env: { ...process.env, CARITAS_API_KEY: "test-key" },
    }), /total changed during pagination/)
    assert.deepEqual(starts, [0, 100, 0, 100])
    assert.equal(fs.existsSync(path.join(root, "caritas.json")), false)
})
