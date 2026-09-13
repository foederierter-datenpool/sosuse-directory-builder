import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { execFileSync } from "node:child_process"
import { prepareSnapshot, publishPages } from "./publish-pages.js"

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sosuse-publisher-test-"))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const write = (file, text) => {
        const target = path.join(root, file)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, text)
    }
    write("package.json", '{"type":"module"}')
    write(".github/workflows/deploy.yml", "name: Deploy webapp\n")
    write("config/federation.ttl", "<urn:config> <urn:name> 'Test' .")
    write("data/directory.ttl", "<urn:entity> <urn:name> 'Test' .")
    return { root, write }
}

test("dry-run stages only publication inputs and leaves local data intact", (t) => {
    const { root, write } = fixture(t)
    const retained = ["data/catalog.ttl", "data/provenance.ttl", "data/ingest/ingest-log.ttl",
        "data/pipeline/extracted/source.ttl", "data/pipeline/preparation/source.ttl",
        "webapp/content/about.md", "webapp/exporters/example.js"]
    const excluded = ["data/ingest/raw/source.json", "data/ingest/lifted/source.ttl",
        "data/.cache/secret", "data/index.html", "data/pipeline/index.html",
        "config/.env", "sources/source/fetch.js", "webapp/dist/index.html"]
    for (const file of [...retained, ...excluded]) write(file, file)
    // The fixture has no Git repository, dependencies or pipeline script.
    const staging = publishPages(root, ["--dry-run"])
    t.after(() => fs.rmSync(staging, { recursive: true, force: true }))
    for (const file of retained) assert.equal(fs.readFileSync(path.join(staging, file), "utf8"), file)
    for (const file of excluded) {
        assert.equal(fs.existsSync(path.join(staging, file)), false, file)
        assert.equal(fs.readFileSync(path.join(root, file), "utf8"), file)
    }
    for (const file of ["package.json", ".github/workflows/deploy.yml", "config/federation.ttl", "data/directory.ttl"])
        assert.deepEqual(fs.readFileSync(path.join(staging, file)), fs.readFileSync(path.join(root, file)))
    assert.equal(fs.existsSync(path.join(staging, ".git")), false)
})

test("rejects absent, empty and invalid final RDF", (t) => {
    const { root, write } = fixture(t)
    const destination = path.join(root, "snapshot")
    fs.unlinkSync(path.join(root, "data/directory.ttl"))
    assert.throws(() => prepareSnapshot(root, destination), /Required file is missing.*data\/directory\.ttl/)
    write("data/directory.ttl", "# no triples\n")
    assert.throws(() => prepareSnapshot(root, destination), /contains no triples/)
    write("data/directory.ttl", "This is not Turtle")
    assert.throws(() => prepareSnapshot(root, destination))
})

test("snapshot ignores local leftovers while tracked data changes remain visible", (t) => {
    const { root } = fixture(t)
    const staging = path.join(root, "snapshot")
    prepareSnapshot(root, staging)
    const git = (...args) => execFileSync("git", args, { cwd: staging, encoding: "utf8" }).trim()
    git("init", "--quiet")
    git("add", "--force", ".")
    const tracked = git("ls-files").split("\n")
    assert.ok(tracked.includes(".gitignore"))
    assert.ok(tracked.includes(".github/workflows/deploy.yml"))
    assert.ok(tracked.includes("data/directory.ttl"))
    for (const file of [".DS_Store", ".idea/settings.xml", "_local/notes.txt",
        "node_modules/package/index.js", "sources/example/fetch.js",
        "data/ingest/raw/example.json", "data/ingest/lifted/example.ttl", "webapp/dist/index.html"]) {
        fs.mkdirSync(path.dirname(path.join(staging, file)), { recursive: true })
        fs.writeFileSync(path.join(staging, file), "leftover")
    }
    assert.equal(git("ls-files", "--others", "--exclude-standard"), "")
    fs.appendFileSync(path.join(staging, "data/directory.ttl"), "\n<urn:other> <urn:name> 'Other' .")
    assert.equal(git("diff", "--name-only"), "data/directory.ttl")
})

test("rejects symlinks and files reaching GitHub's size limit", (t) => {
    const { root, write } = fixture(t)
    const destination = path.join(root, "snapshot")
    fs.symlinkSync("directory.ttl", path.join(root, "data/link.ttl"))
    assert.throws(() => prepareSnapshot(root, destination), /Cannot publish symlink/)
    fs.unlinkSync(path.join(root, "data/link.ttl"))
    write("data/large.ttl", "")
    fs.truncateSync(path.join(root, "data/large.ttl"), 100 * 1024 * 1024)
    assert.throws(() => prepareSnapshot(root, destination), /100 MiB limit/)
})

test("prepares a commit for manual pushing and retains the publication files", (t) => {
    const { root } = fixture(t)
    const calls = [], messages = []
    t.mock.method(console, "log", (message) => messages.push(message))
    let staging
    // Substitute all subprocesses: no real pipeline, Git commit or push.
    const execute = (command, args, options) => {
        calls.push([command, ...args])
        if (args[0] === "init") staging = options.cwd
        if (args[0] === "remote" && args[1] === "get-url") return "git@example.org:example/site.git\n"
        if (args[0] === "config" && args.length === 2) return "Test\n"
        if (args[0] === "ls-remote") return `${"a".repeat(40)}\trefs/heads/gh-pages\n`
        if (args[0] === "push") throw new Error("Unexpected automatic push")
        return ""
    }
    t.after(() => { if (staging) fs.rmSync(staging, { recursive: true, force: true }) })
    assert.equal(publishPages(root, ["--reuse-data"], execute), staging)
    assert.equal(calls.some((call) => call.includes("commit")), true)
    assert.equal(calls.some((call) => call[1] === "push"), false)
    assert.equal(fs.existsSync(path.join(staging, "data/directory.ttl")), true)
    assert.equal(messages.some((message) => message.includes(staging)
        && message.includes(`--force-with-lease=refs/heads/gh-pages:${"a".repeat(40)}`)
        && message.includes("HEAD:refs/heads/gh-pages")), true)
})

test("missing Git identity explains the fix before processing or publication", (t) => {
    const { root } = fixture(t)
    for (const key of ["user.name", "user.email"]) {
        for (const unset of [true, false]) {
            const execute = (command, args) => {
                if (command === "git" && args[0] === "remote") return "git@example.org:example/site.git\n"
                if (command === "git" && args[0] === "config" && args.length === 2) {
                    if (args[1] !== key) return "Test\n"
                    if (unset) throw Object.assign(new Error("Command failed"), { status: 1 })
                    return "\n"
                }
                assert.fail(`Unexpected command after missing identity: ${command} ${args.join(" ")}`)
            }
            assert.throws(() => publishPages(root, [], execute), (error) => {
                assert.ok(error.message.includes(`Missing Git ${key}`))
                assert.ok(error.message.includes(`git config ${key}`))
                return true
            })
        }
    }
})
