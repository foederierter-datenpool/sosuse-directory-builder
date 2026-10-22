import assert from "node:assert/strict"
import test from "node:test"
import { cleanContact } from "../sources/contacts.js"

test("contact lists split only when every entry is recognizable", () => {
    assert.deepEqual(cleanContact("email", " Alice@EXAMPLE.org; bob@example.org / bob@example.org ").values,
        ["Alice@example.org", "bob@example.org"])
    assert.deepEqual(cleanContact("email", "mailto:beratung[at]example.org").values, ["beratung@example.org"])
    assert.deepEqual(cleanContact("url", "www.example.org / https://hilfe.example.org").values,
        ["www.example.org", "https://hilfe.example.org"])
    const path = "https://example.org/path,a?one=1;two=2"
    assert.deepEqual(cleanContact("url", path).values, [path])
    for (const [kind, value] of [
        ["email", "a@example.org (Beratung); b@example.org (Prävention)"],
        ["email", "www.example.org"],
        ["email", ";"],
        ["url", "Pfarrer-Grimm-Str. 1 55124 Mainz"],
        ["url", "www.example.org / anderer Standort"],
        ["postcode", "(auf Anfrage)"],
        ["postcode", "8371"],
    ]) {
        const result = cleanContact(kind, value)
        assert.ok(result.issue)
        assert.deepEqual(result.values, [value])
    }
})

test("phones normalize without joining lists or losing extension shorthand", () => {
    for (const value of ["+49 (030) 1234-56", "030/123456", "0049 (0)30 123456", "Tel.: 030 123456"])
        assert.deepEqual(cleanContact("phone", value), { values: ["+4930123456"] })
    assert.deepEqual(cleanContact("phone", "030 123456 ext. 7").values, ["+4930123456 ext. 7"])
    assert.deepEqual(cleanContact("phone", "tel:+4930123456;ext=7").values, ["+4930123456 ext. 7"])
    assert.deepEqual(cleanContact("phone", "030 123456 / 040 987654").values, ["+4930123456", "+4940987654"])
    assert.deepEqual(cleanContact("phone", "+43 1 234567").values, ["+431234567"])
    for (const value of ["030 1234-30/-33", "+49 (06506) 899-0,-105", "030/01234", "030123456/654321", "Fax.: 030 123456"]) {
        const result = cleanContact("phone", value)
        assert.ok(result.issue)
        assert.deepEqual(result.values, [value])
    }
})
