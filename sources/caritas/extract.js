import { compile } from "html-to-text"

const XYZ = "http://sparql.xyz/facade-x/data/"
const fields = new Set(["title", "subTitle", "officeHours", "descriptionText"].map(name => XYZ + name))
const singleLine = new Set([XYZ + "title", XYZ + "subTitle"])
const html = /<\/?[a-z][^>]*>|&(?:#(?:x[\da-f]+|\d+);?|[a-z][\da-z]+;)/i
const text = compile({
    wordwrap: false,
    preserveNewlines: true,
    selectors: [{ selector: "a", options: { ignoreHref: true } }],
})

export default function* prepare(quads, df) {
    for (const q of quads) {
        if (q.object.termType !== "Literal" || !fields.has(q.predicate.value) || !html.test(q.object.value)) {
            yield q
            continue
        }
        let value = text(q.object.value).replace(/[^\S\r\n]+/g, " ").replace(/ *\r?\n */g, "\n").trim()
        if (singleLine.has(q.predicate.value)) value = value.replace(/\s+/g, " ")
        yield df.quad(q.subject, q.predicate, df.literal(value, q.object.language || q.object.datatype), q.graph)
    }
}
