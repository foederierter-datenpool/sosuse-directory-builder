import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { parseTtl } from "@directory-builder/core/utils"

const PUSH_AUTOMATICALLY = false

const roots = ["package.json", ".github/workflows/deploy.yml", "config", "data",
    "webapp/content", "webapp/exporters"]
const excluded = ["data/ingest/raw", "data/ingest/lifted"]
const snapshotGitignore = "# Publication snapshots are generated with git add --force.\n"
    + "# Ignore untracked files left behind when switching from the source branch.\n*\n"

export function prepareSnapshot(root, destination) {
    for (const file of ["package.json", ".github/workflows/deploy.yml", "config/federation.ttl", "data/directory.ttl"]) {
        const target = path.join(root, file)
        if (!fs.existsSync(target) || !fs.statSync(target).isFile())
            throw new Error(`Required file is missing or not a regular file: ${file}`)
    }
    if (!parseTtl(fs.readFileSync(path.join(root, "data/directory.ttl"), "utf8")).length)
        throw new Error("directory.ttl contains no triples")

    let files = 0, bytes = 0
    for (const entry of roots) {
        const source = path.join(root, entry)
        if (!fs.existsSync(source)) continue
        fs.cpSync(source, path.join(destination, entry), {
            recursive: true,
            filter(file) {
                const relative = path.relative(root, file).split(path.sep).join("/")
                if (excluded.some((p) => relative === p || relative.startsWith(`${p}/`))) return false
                if (relative !== ".github/workflows/deploy.yml" && relative.split("/").some((p) => p.startsWith("."))) return false
                // Do not carry over indexes that link to excluded files.
                if (relative.startsWith("data/") && path.basename(file) === "index.html") return false
                const stat = fs.lstatSync(file)
                if (stat.isSymbolicLink()) throw new Error(`Cannot publish symlink: ${relative}`)
                if (stat.isFile()) {
                    if (stat.size >= 100 * 1024 * 1024) throw new Error(`File reaches GitHub's 100 MiB limit: ${relative}`)
                    files++
                    bytes += stat.size
                }
                return true
            },
        })
    }
    fs.writeFileSync(path.join(destination, ".gitignore"), snapshotGitignore)
    return { files: files + 1, bytes: bytes + Buffer.byteLength(snapshotGitignore) }
}

export function publishPages(root, args, execute = execFileSync) {
    if (args.includes("--help")) {
        console.log("Usage: npm run publish:pages -- [--reuse-data] [--dry-run]\n"
            + "Default: run and validate the pipeline, then prepare a commit for a manual push.\n"
            + "To push automatically, set PUSH_AUTOMATICALLY to true at the top of this script.\n"
            + "--reuse-data: prepare existing output without running the pipeline.\n"
            + "--dry-run: stage existing output only; no pipeline, commit or push.")
        return
    }
    if (args.some((arg) => !["--reuse-data", "--dry-run"].includes(arg))) throw new Error("Unknown option; use --help")
    const dryRun = args.includes("--dry-run")
    const run = (command, argv, cwd = root) => execute(command, argv, { cwd, stdio: "inherit" })
    const git = (...argv) => execute("git", argv, { cwd: root, encoding: "utf8" }).trim()
    const gitIdentity = (key, example) => {
        let value
        try { value = git("config", key) }
        catch (error) { if (error.status !== 1) throw error }
        if (!value) throw new Error(`Missing Git ${key}. Set it in this checkout with: git config ${key} "${example}"`)
        return value
    }
    let remote, name, email, previous
    if (!dryRun) {
        remote = git("remote", "get-url", "--push", "origin")
        name = gitIdentity("user.name", "Your Name")
        email = gitIdentity("user.email", "you@example.org")
        previous = git("ls-remote", remote, "refs/heads/gh-pages").split(/\s/)[0]
        if (!args.includes("--reuse-data")) run("npm", ["run", "pipeline"])
        run("npm", ["run", "validate"])
    }

    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "sosuse-pages-"))
    let keepStaging = false
    try {
        const result = prepareSnapshot(root, staging)
        console.log(`Prepared ${result.files} files (${result.bytes} bytes) in ${staging}`)
        if (dryRun) {
            keepStaging = true
            return staging
        }

        run("git", ["init", "--initial-branch=gh-pages"], staging)
        run("git", ["config", "user.name", name], staging)
        run("git", ["config", "user.email", email], staging)
        run("git", ["remote", "add", "origin", remote], staging)
        run("git", ["add", "--force", "."], staging)
        run("git", ["-c", "commit.gpgsign=false", "commit", "-m", "Publish pipeline snapshot"], staging)
        keepStaging = true
        const pushArgs = ["push", `--force-with-lease=refs/heads/gh-pages:${previous}`, "origin",
            "HEAD:refs/heads/gh-pages"]
        const quote = (arg) => `'${arg.replaceAll("'", "'\\''")}'`
        console.log("Commit prepared. To publish it, run:\n"
            + ["git", "-C", staging, ...pushArgs].map(quote).join(" ")
            + "\nKeep this temporary directory until you have pushed; afterwards you can delete it.")
        if (!PUSH_AUTOMATICALLY) return staging

        run("git", pushArgs, staging)
        keepStaging = false
        console.log("Pushed the snapshot. GitHub Actions now builds and deploys the webapp; check its run for completion.")
    } finally {
        if (!keepStaging) fs.rmSync(staging, { recursive: true, force: true })
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { publishPages(path.resolve(import.meta.dirname, ".."), process.argv.slice(2)) }
    catch (error) { console.error(error.message); process.exitCode = 1 }
}
