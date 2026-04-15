/**
 * Patch: add the mixed-level secondary schools that were excluded by the
 * incorrect `mainlevel_code === "SECONDARY"` filter in the original import.
 *
 * Uses the already-downloaded CSV files in apps/api/tmp/.
 * Run: pnpm --filter @optima/api exec tsx scripts/patch-missing-schools.ts
 */

import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const TMP = path.join(__dirname, '../tmp');

function normalizeName(name: string): string {
  return name.toUpperCase().trim().replace(/[.,'\-()/&]/g, ' ').replace(/\s+/g, ' ').trim();
}

function readCsv(filename: string): Record<string, string>[] {
  const file = path.join(TMP, filename);
  if (!fs.existsSync(file)) throw new Error(`Missing cached CSV: ${file}. Run pnpm import:data first.`);
  return parse(fs.readFileSync(file, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
}

async function geocodePostal(postal: string): Promise<{ lat: number; lng: number } | null> {
  if (!postal) return null;
  try {
    const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(postal)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { found?: number; results?: { LATITUDE?: string; LONGITUDE?: string }[] };
    if (!data.found || !data.results?.length) return null;
    const lat = parseFloat(data.results[0].LATITUDE ?? '');
    const lng = parseFloat(data.results[0].LONGITUDE ?? '');
    return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
  } catch {
    return null;
  }
}

function getSchoolName(row: Record<string, string>): string {
  return (
    row['school_name'] ?? row['School_name'] ?? row['School_Name'] ??
    row['School Name'] ?? row['school'] ?? row['School'] ?? row['name'] ?? ''
  ).trim();
}

async function main() {
  console.log('=== Patch: add mixed-level secondary schools ===\n');

  const generalRows = readCsv('general.csv');
  const ccaRows     = readCsv('cca.csv');
  const subjectRows = readCsv('subject.csv');
  const programmeRows = readCsv('programme.csv');
  const distinctiveRows = readCsv('distinctive.csv');

  // Identify schools to patch: MIXED LEVEL with secondary years (S1–S5)
  // that are NOT already in the DB.
  const existingNames = new Set(
    (await prisma.school.findMany({ select: { name: true } })).map((s) => s.name.toUpperCase().trim())
  );

  const toAdd = generalRows.filter((row) => {
    const level = (row['mainlevel_code'] ?? '').toLowerCase();
    const hasSecondaryYears = level.startsWith('mixed level') && /\bs[1-5]\b/.test(level);
    if (!hasSecondaryYears) return false;
    const name = (row['school_name'] ?? '').trim().toUpperCase();
    return !existingNames.has(name);
  });

  if (toAdd.length === 0) {
    console.log('Nothing to patch — all mixed-level secondary schools already in DB.');
    return;
  }

  console.log(`Schools to add (${toAdd.length}):`);
  toAdd.forEach((r) => console.log(`  • ${r['school_name']} [${r['mainlevel_code']}]`));
  console.log();

  // Build lookup maps (norm → data) for the detail datasets
  const normSet = new Set(toAdd.map((r) => normalizeName(r['school_name'] ?? '')));

  const ccasByNorm        = new Map<string, { group: string; name: string }[]>();
  const subjectsByNorm    = new Map<string, string[]>();
  const programmesByNorm  = new Map<string, string[]>();
  const distinctiveByNorm = new Map<string, { domain: string; title: string }[]>();

  for (const row of ccaRows) {
    const norm = normalizeName(getSchoolName(row));
    if (!normSet.has(norm)) continue;
    const arr = ccasByNorm.get(norm) ?? [];
    arr.push({ group: row['cca_grouping_desc'] ?? '', name: row['cca_generic_name'] ?? '' });
    ccasByNorm.set(norm, arr);
  }
  for (const row of subjectRows) {
    const norm = normalizeName(getSchoolName(row));
    if (!normSet.has(norm)) continue;
    const arr = subjectsByNorm.get(norm) ?? [];
    const s = row['subject_desc'] ?? row['Subject_Desc'] ?? '';
    if (s) arr.push(s.trim());
    subjectsByNorm.set(norm, arr);
  }
  for (const row of programmeRows) {
    const norm = normalizeName(getSchoolName(row));
    if (!normSet.has(norm)) continue;
    const arr = programmesByNorm.get(norm) ?? [];
    const p = row['moe_programme_desc'] ?? '';
    if (p) arr.push(p.trim());
    programmesByNorm.set(norm, arr);
  }
  for (const row of distinctiveRows) {
    const norm = normalizeName(getSchoolName(row));
    if (!normSet.has(norm)) continue;
    const arr = distinctiveByNorm.get(norm) ?? [];
    arr.push({ domain: row['alp_domain'] ?? '', title: row['alp_title'] ?? '' });
    distinctiveByNorm.set(norm, arr);
  }

  // Upsert each school
  for (const row of toAdd) {
    const name = (row['school_name'] ?? '').trim();
    const norm = normalizeName(name);
    const postal = row['postal_code'] ?? '';

    console.log(`Processing: ${name}`);

    let lat: number | null = null;
    let lng: number | null = null;
    if (postal) {
      const coords = await geocodePostal(postal);
      if (coords) { lat = coords.lat; lng = coords.lng; console.log(`  Geocoded: ${lat}, ${lng}`); }
      else console.log(`  Geocode failed`);
      await new Promise((r) => setTimeout(r, 350));
    }

    const school = await prisma.school.upsert({
      where: { name },
      create: {
        name,
        section: row['mainlevel_code'] ?? 'SECONDARY',
        address: row['address'] ?? null,
        postalCode: postal || null,
        url: row['url_address'] ?? null,
        telephone: row['telephone_no'] ?? null,
        lat,
        lng,
      },
      update: {
        section: row['mainlevel_code'] ?? 'SECONDARY',
        address: row['address'] ?? null,
        postalCode: postal || null,
        url: row['url_address'] ?? null,
        telephone: row['telephone_no'] ?? null,
        ...(lat != null && { lat }),
        ...(lng != null && { lng }),
      },
    });

    // Replace relations
    await prisma.schoolCCA.deleteMany({ where: { schoolId: school.id } });
    const ccas = ccasByNorm.get(norm) ?? [];
    if (ccas.length) await prisma.schoolCCA.createMany({ data: ccas.map((c) => ({ schoolId: school.id, ccaName: c.name, ccaGroup: c.group || null })) });

    await prisma.schoolSubject.deleteMany({ where: { schoolId: school.id } });
    const subjects = subjectsByNorm.get(norm) ?? [];
    if (subjects.length) await prisma.schoolSubject.createMany({ data: subjects.map((s) => ({ schoolId: school.id, subjectName: s })) });

    await prisma.schoolProgramme.deleteMany({ where: { schoolId: school.id } });
    const programmes = programmesByNorm.get(norm) ?? [];
    if (programmes.length) await prisma.schoolProgramme.createMany({ data: programmes.map((p) => ({ schoolId: school.id, programmeName: p })) });

    await prisma.schoolDistinctiveProgramme.deleteMany({ where: { schoolId: school.id } });
    const distinctives = distinctiveByNorm.get(norm) ?? [];
    if (distinctives.length) await prisma.schoolDistinctiveProgramme.createMany({ data: distinctives.map((d) => ({ schoolId: school.id, domain: d.domain, title: d.title })) });

    console.log(`  ✓ Upserted — CCAs: ${ccas.length}, Subjects: ${subjects.length}, Programmes: ${programmes.length}`);
  }

  const total = await prisma.school.count();
  console.log(`\n=== Patch complete. Total schools in DB: ${total} ===`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
