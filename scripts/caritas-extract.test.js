import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import prepare from "../sources/caritas/extract.js"

const { DataFactory: df } = createRequire(import.meta.resolve("@directory-builder/core"))("n3")
const XYZ = "http://sparql.xyz/facade-x/data/"

test("Caritas cleans HTML text while preserving paragraphs, identities and original HTML", () => {
    const subject = df.namedNode("urn:caritas:record")
    const quad = (field, value, language) => df.quad(subject, df.namedNode(XYZ + field), df.literal(value, language))
    const originals = [
        quad("title", "Katholische Kita<br> St. Marien"),
        quad("officeHours", "<p>&Ouml;ffnungszeiten</p><p>Montag &#160&#160 8–17 Uhr<br>Dienstag 8–12 Uhr</p>"),
        quad("descriptionText", 'Erster Absatz\n\nZweiter Absatz mit <a href="https://example.org">Beratung &amp; Hilfe</a>.', "de"),
        quad("description", "<p>Original HTML</p>"),
        quad("descriptionText", "Beratung < 5 Minuten\n\nKostenlos"),
        quad("id", "record-123"),
    ]
    const result = [...prepare(originals, df)]
    assert.equal(result.length, originals.length)
    assert.ok(result.every(q => q.subject.equals(subject)))
    assert.equal(result[0].object.value, "Katholische Kita St. Marien")
    assert.match(result[1].object.value, /^Öffnungszeiten\n\nMontag +8–17 Uhr\nDienstag 8–12 Uhr$/)
    assert.equal(result[2].object.value, "Erster Absatz\n\nZweiter Absatz mit Beratung & Hilfe.")
    assert.equal(result[2].object.language, "de")
    for (let i = 3; i < originals.length; i++) assert.equal(result[i], originals[i])
})
