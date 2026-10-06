import { test } from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import http from "node:http"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const run = promisify(execFile)
const fetchScript = path.join(import.meta.dirname, "../sources/caritas/fetch.js")

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

    await run(process.execPath, [fetchScript, root,
        `http://127.0.0.1:${server.address().port}/socialservice`, "{}"], {
        cwd: root,
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

    await assert.rejects(run(process.execPath, [fetchScript, root,
        `http://127.0.0.1:${server.address().port}/socialservice`, "{}"], {
        cwd: root,
        env: { ...process.env, CARITAS_API_KEY: "test-key" },
    }), /total changed during pagination/)
    assert.deepEqual(starts, [0, 100, 0, 100])
    assert.equal(fs.existsSync(path.join(root, "caritas.json")), false)
})

test("Caritas resumes saved pages after an interrupted fetch", async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caritas-fetch-"))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const records = Array.from({ length: 201 }, (_, i) => ({ id: `id-${i}` }))
    const starts = []
    let failLastPage = true
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, "http://localhost")
        const start = Number(url.searchParams.get("start"))
        starts.push(start)
        if (start === 200 && failLastPage) {
            response.writeHead(400).end()
            return
        }
        response.setHeader("Content-Type", "application/json")
        response.setHeader("X-Total-Count", "201")
        response.end(JSON.stringify(records.slice(start, Number(url.searchParams.get("end")))))
    })
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
    t.after(() => new Promise(resolve => server.close(resolve)))
    const url = `http://127.0.0.1:${server.address().port}/socialservice`
    const env = { ...process.env, CARITAS_API_KEY: "test-key" }

    await assert.rejects(run(process.execPath, [fetchScript, path.join(root, "first"), url, "{}"],
        { cwd: root, env }), /HTTP 400/)
    assert.deepEqual(starts, [0, 100, 200])
    assert.equal(fs.existsSync(path.join(root, "first/caritas.json")), false)

    failLastPage = false
    await run(process.execPath, [fetchScript, path.join(root, "second"), url, "{}"], { cwd: root, env })
    assert.deepEqual(starts, [0, 100, 200, 0, 200])
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "second/caritas.json"))).length, 201)
    assert.deepEqual(fs.readdirSync(path.join(root, "data/ingest/checkpoints/caritas")), [])
})

test("Caritas retries gateway errors and non-JSON responses", async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caritas-fetch-"))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    let attempts = 0
    const server = http.createServer((_request, response) => {
        attempts++
        if (attempts === 1) response.writeHead(502).end("gateway error")
        else if (attempts === 2) response.writeHead(200, { "Content-Type": "text/html" }).end("<html>gateway error</html>")
        else {
            response.setHeader("Content-Type", "application/json")
            response.setHeader("X-Total-Count", "1")
            response.end(JSON.stringify([{ id: "id-1" }]))
        }
    })
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
    t.after(() => new Promise(resolve => server.close(resolve)))

    await run(process.execPath, [fetchScript, root,
        `http://127.0.0.1:${server.address().port}/socialservice`, "{}"], {
        cwd: root, env: { ...process.env, CARITAS_API_KEY: "test-key" },
    })
    assert.equal(attempts, 3)
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "caritas.json"))).length, 1)
})

test("Caritas discards saved pages when the first page changes", async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caritas-fetch-"))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const records = Array.from({ length: 201 }, (_, i) => ({ id: `id-${i}`, title: "old" }))
    const starts = []
    let failLastPage = true
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, "http://localhost")
        const start = Number(url.searchParams.get("start"))
        starts.push(start)
        if (start === 200 && failLastPage) {
            response.writeHead(400).end()
            return
        }
        response.setHeader("Content-Type", "application/json")
        response.setHeader("X-Total-Count", "201")
        response.end(JSON.stringify(records.slice(start, Number(url.searchParams.get("end")))))
    })
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
    t.after(() => new Promise(resolve => server.close(resolve)))
    const url = `http://127.0.0.1:${server.address().port}/socialservice`
    const env = { ...process.env, CARITAS_API_KEY: "test-key" }

    await assert.rejects(run(process.execPath, [fetchScript, path.join(root, "first"), url, "{}"],
        { cwd: root, env }), /HTTP 400/)
    records[0].id = "updated-id"
    failLastPage = false
    await run(process.execPath, [fetchScript, path.join(root, "second"), url, "{}"], { cwd: root, env })
    assert.deepEqual(starts, [0, 100, 200, 0, 100, 200])
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "second/caritas.json")))[0].id, "updated-id")
})

test("Caritas retrieves a large result from both ends and resumes descending pages", async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caritas-fetch-"))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const records = Array.from({ length: 1201 }, (_, i) => ({ id: `id-${i}` }))
    const requests = []
    let failDescending = true
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, "http://localhost")
        const start = Number(url.searchParams.get("start"))
        const desc = url.searchParams.get("order") === "DESC"
        requests.push(`${desc ? "desc" : "asc"}:${start}`)
        if (desc && start === 300 && failDescending) {
            response.writeHead(400).end()
            return
        }
        response.setHeader("Content-Type", "application/json")
        response.setHeader("X-Total-Count", "1201")
        const ordered = desc ? [...records].reverse() : records
        response.end(JSON.stringify(ordered.slice(start, Number(url.searchParams.get("end")))))
    })
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
    t.after(() => new Promise(resolve => server.close(resolve)))
    const url = `http://127.0.0.1:${server.address().port}/socialservice`
    const env = { ...process.env, CARITAS_API_KEY: "test-key" }

    await assert.rejects(run(process.execPath, [fetchScript, path.join(root, "first"), url, "{}"],
        { cwd: root, env }), /HTTP 400/)
    failDescending = false
    await run(process.execPath, [fetchScript, path.join(root, "second"), url, "{}"], { cwd: root, env })

    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "second/caritas.json"))).length, 1201)
    assert.equal(requests.filter(x => x === "asc:100").length, 1)
    assert.equal(requests.filter(x => x === "desc:100").length, 1)
    assert.equal(requests.filter(x => x === "desc:0").length, 2)
    assert.equal(requests.some(x => x === "asc:700"), false)
    assert.deepEqual(fs.readdirSync(path.join(root, "data/ingest/checkpoints/caritas")), [])
})
