import path from "path"
import fs from "fs"

// Static-file source:
//   - organisations_filtered.json     --> names, webseite, hierarchy
//   - organisations_all_filtered.json --> BAGFW service categories
//   - locations_filtered.json         --> addresses
// Org records share one id per org (the extract step unifies them); location
// records carry an organisation_id back-link, joined to orgs in the extract step.

const OUT_DIR = process.argv[2]
const SRC_DIR = process.argv[3]
const read = (f) => JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), "utf8")).data

// The static files cover Bezirk Mitte plus two adjacent PLZs (16 PLZs in
// 10115–13407: Kreisverband Berlin-Mitte + Stiftung SPI)
const orgs    = read("organisations_filtered.json")
const orgsAll = read("organisations_all_filtered.json")
const locations = read("locations_filtered.json")
const records = [...orgs, ...orgsAll, ...locations]

fs.mkdirSync(OUT_DIR, { recursive: true })
const outPath = path.join(OUT_DIR, "awo.json")
fs.writeFileSync(outPath, JSON.stringify(records, null, 2))
console.log(`  ${records.length} records (3 supplied files) → ${outPath}`)
