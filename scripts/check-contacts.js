import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { cleanContact, contactFields } from "../sources/contacts.js"

const { StreamParser } = createRequire(import.meta.resolve("@directory-builder/core"))("n3")
const root = path.resolve(import.meta.dirname, "..")
const directory = path.join(root, "data/pipeline/extracted")
const issues = []
for (const file of fs.readdirSync(directory).filter(file => file.endsWith(".ttl")).sort()) {
    for await (const q of fs.createReadStream(path.join(directory, file)).pipe(new StreamParser())) {
        const field = q.predicate.value.replace("http://sparql.xyz/facade-x/data/", "")
        const kind = contactFields[field]
        if (!kind || q.object.termType !== "Literal") continue
        const { issue } = cleanContact(kind, q.object.value)
        if (issue) issues.push({ source: file.slice(0, -4), record: q.subject.value, field, value: q.object.value, issue })
    }
}
const counts = {}
for (const { issue } of issues) counts[issue] = (counts[issue] ?? 0) + 1
const output = path.join(root, "data/pipeline/contact-issues.json")
fs.writeFileSync(output, JSON.stringify({ counts, issues }, null, 2) + "\n")
console.log(`${issues.length} values need review: ${output}`)
console.log(counts)
