const XYZ = "http://sparql.xyz/facade-x/data/"

export const contactFields = {
    eMail: "email", email: "email", office_email: "email",
    internetAddress: "url", website: "url", webseite: "url",
    phone: "phone", telefon: "phone", office_phone: "phone",
    postalCode: "postcode",
}

const email = /^[^\s@<>,;|/]+@(?:[\p{L}\p{N}-]+\.)+[\p{L}\p{N}-]+$/u
const website = value => {
    if (/\s/.test(value)) return false
    try {
        const url = new URL(/^[a-z]+:/i.test(value) ? value : `https://${value}`)
        return ["http:", "https:"].includes(url.protocol) && url.hostname.includes(".")
            && /[a-z]/i.test(url.hostname) && !url.username && !url.password
    } catch { return false }
}
const result = (values, issue) => ({ values: [...new Set(values)], ...(issue && { issue }) })

function phone(value) {
    let number = value.replace(/^(?:tel(?:efon)?|fon|mobil(?:e)?)[.:]*\s*/i, "").trim()
    const extension = number.match(/(?:;ext=|\b(?:ext(?:ension)?\.?|durchwahl|dw\.?|x)\s*[:=]?\s*)(\d+)$/i)
    if (extension) number = number.slice(0, extension.index).trim()
    const parts = number.split(/\s*(?:[;,|\n]+|\/(?=\s*(?:\+|0\d)))\s*/)
    if (parts.length > 1 && !extension) {
        const parsed = parts.map(phone)
        if (parsed.every(p => !p.issue && p.values.every(v => v.startsWith("+"))))
            return result(parsed.flatMap(p => p.values))
        return result([value], "Ambiguous telephone list or extension")
    }
    if (/^fax\b/i.test(number)) return result([value], "Fax number in telephone field")
    if (/[^+\d\s()./-]/.test(number) || /\/\s*-/.test(number))
        return result([value], "Unrecognized telephone format or extension")
    if (number.includes("/")) {
        const [area, subscriber, extra] = number.split("/")
        if (extra !== undefined || !/^(?:0\d{1,5}|\+490?\d{2,5})$/.test(area.replace(/[\s().-]/g, ""))
            || !/^\s*\d[\d\s.-]*$/.test(subscriber))
            return result([value], "Ambiguous telephone list or extension")
    }
    number = number.replace(/[\s()./-]/g, "").replace(/^00/, "+")
    if (number.startsWith("+4900")) return result([value], "Ambiguous German country or area code")
    if (number.startsWith("+49")) number = number.replace(/^\+490/, "+49")
    else if (/^0\d{5,}$/.test(number)) number = `+49${number.slice(1)}`
    if (!/^\+[1-9]\d{5,14}$/.test(number) && !/^\d{3,5}$/.test(number))
        return result([value], "Telephone number has no clear area or country code")
    return result([number + (extension ? ` ext. ${extension[1]}` : "")])
}

export function cleanContact(kind, raw) {
    const value = raw.replace(/\u00a0/g, " ").trim()
    if (!value) return result([value])
    if (kind === "phone") return phone(value)
    if (kind === "postcode") return result([raw], /^\d{5}$/.test(value) ? null : "Expected a five-digit German postcode")
    if (kind === "email") {
        const parts = value.replace(/^mailto:/i, "").replace(/\s*(?:\(at\)|\[at\])\s*/gi, "@")
            .split(/[\s,;|/]+/).filter(Boolean)
        if (parts.length && parts.every(p => email.test(p)))
            return result(parts.map(p => p.replace(/@(.+)$/, (_, domain) => `@${domain.toLowerCase()}`)))
        return result([value], website(value) ? "Website-like value in email field" : "Unrecognized email format or list")
    }
    const parts = value.split(/\s+\/\s+|\s*\|\s*|[;,]\s+(?=(?:https?:\/\/|www\.))|\s+(?=(?:https?:\/\/|www\.))|[\r\n]+/i)
    return parts.every(website) ? result(parts) : result([value], "Unrecognized website format or list")
}

export default function* prepareContacts(quads, df) {
    for (const q of quads) {
        const kind = q.predicate.value.startsWith(XYZ) && contactFields[q.predicate.value.slice(XYZ.length)]
        if (!kind || kind === "postcode" || q.object.termType !== "Literal") { yield q; continue }
        for (const value of cleanContact(kind, q.object.value).values)
            yield df.quad(q.subject, q.predicate, df.literal(value, q.object.language || q.object.datatype), q.graph)
    }
}
