/**
 * Optima Data Importer
 *
 * Fetches and imports Singapore SECONDARY school data from data.gov.sg collection 457.
 *
 * Usage: pnpm --filter @optima/api import:data
 *
 * Steps:
 * 1. Fetch collection 457 metadata to get dataset IDs
 * 2. Download each CSV dataset
 * 3. Filter to SECONDARY schools only
 * 4. Merge datasets by normalized school name
 * 5. Geocode schools via OneMap (optional)
 * 6. Upsert into DB via Prisma
 */

import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

const COLLECTION_METADATA_URL =
  'https://api-production.data.gov.sg/v2/public/api/collections/457/metadata';

// Metadata is on the v2 production API; downloads are on the v1 open API
const DATASETS_META_BASE = 'https://api-production.data.gov.sg/v2/public/api/datasets';
const DATASETS_DOWNLOAD_BASE = 'https://api-open.data.gov.sg/v1/public/api/datasets';

const TMP_DIR = path.join(__dirname, '../tmp');

// ---------------------------------------------------------------------------
// Name normalization — deterministic, no fuzzy matching
// ---------------------------------------------------------------------------
function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .trim()
    .replace(/[.,'\-()/&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Fetch with retry
// ---------------------------------------------------------------------------
async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (resp.ok) return resp;
      console.warn(`  Attempt ${attempt} failed: ${resp.status} ${resp.statusText}`);
    } catch (err) {
      console.warn(`  Attempt ${attempt} error:`, err);
    }

    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
}

// ---------------------------------------------------------------------------
// Get download URL for a dataset via initiate-download + poll
// ---------------------------------------------------------------------------
async function getDatasetDownloadUrl(datasetId: string): Promise<string> {
  const initiateUrl = `${DATASETS_DOWNLOAD_BASE}/${datasetId}/initiate-download`;

  const initiateResp = await fetchWithRetry(initiateUrl, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  const initiateData = (await initiateResp.json()) as {
    data?: { url?: string; token?: string };
  };

  // If url is directly available
  if (initiateData?.data?.url) {
    return initiateData.data.url;
  }

  const token = initiateData?.data?.token;
  if (!token) {
    throw new Error(`No download token returned for dataset ${datasetId}`);
  }

  // Poll for download URL
  const pollUrl = `${DATASETS_DOWNLOAD_BASE}/${datasetId}/poll-download?token=${encodeURIComponent(token)}`;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollResp = await fetchWithRetry(pollUrl);
    const pollData = (await pollResp.json()) as { data?: { url?: string } };

    if (pollData?.data?.url) {
      return pollData.data.url;
    }
    console.log(`  Polling dataset ${datasetId}... attempt ${i + 1}`);
  }

  throw new Error(`Timeout waiting for download URL for dataset ${datasetId}`);
}

// ---------------------------------------------------------------------------
// Download CSV and return parsed records
// ---------------------------------------------------------------------------
async function downloadCsv(datasetId: string, name: string): Promise<Record<string, string>[]> {
  console.log(`\nDownloading dataset: ${name} (${datasetId})`);
  const downloadUrl = await getDatasetDownloadUrl(datasetId);
  console.log(`  Got URL: ${downloadUrl.slice(0, 80)}...`);

  const resp = await fetchWithRetry(downloadUrl);
  const csvText = await resp.text();

  // Save to tmp for debugging
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(path.join(TMP_DIR, `${name}.csv`), csvText);

  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  console.log(`  Parsed ${records.length} rows`);
  return records;
}

// ---------------------------------------------------------------------------
// Identify datasets by name keywords
// ---------------------------------------------------------------------------
interface DatasetMeta {
  datasetId: string;
  name: string;
}

function identifyDatasets(childDatasets: DatasetMeta[]): {
  general: DatasetMeta;
  cca: DatasetMeta;
  subject: DatasetMeta;
  programme: DatasetMeta;
  distinctive: DatasetMeta;
} {
  function find(keywords: string[]): DatasetMeta {
    const found = childDatasets.find((d) => {
      const nameLower = d.name.toLowerCase();
      return keywords.every((k) => nameLower.includes(k));
    });
    if (!found) throw new Error(`Could not find dataset matching keywords: ${keywords.join(', ')}`);
    return found;
  }

  // Try to find each dataset type by keywords
  const general = find(['general information']) || find(['general']) || find(['information']);
  const cca = find(['cca']) || find(['co-curricular']);
  const subject = find(['subject']);

  // Programme: should NOT be distinctive
  const programme = childDatasets.find((d) => {
    const n = d.name.toLowerCase();
    return (n.includes('programme') || n.includes('program')) && !n.includes('distinctive') && !n.includes('alp');
  });

  const distinctive = childDatasets.find((d) => {
    const n = d.name.toLowerCase();
    return n.includes('distinctive') || n.includes('alp') || n.includes('applied learning');
  });

  if (!programme) throw new Error('Could not find programmes dataset');
  if (!distinctive) throw new Error('Could not find distinctive programmes dataset');

  return { general, cca, subject, programme, distinctive };
}

// ---------------------------------------------------------------------------
// OneMap geocoding
// ---------------------------------------------------------------------------
async function geocodePostal(postal: string): Promise<{ lat: number; lng: number } | null> {
  if (!postal) return null;
  try {
    const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(postal)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      found?: number;
      results?: Array<{ LATITUDE?: string; LONGITUDE?: string }>;
    };
    if (!data.found || !data.results?.length) return null;
    const lat = parseFloat(data.results[0].LATITUDE ?? '');
    const lng = parseFloat(data.results[0].LONGITUDE ?? '');
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main import function
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Optima Data Importer ===\n');

  // 1. Fetch collection metadata
  console.log('Fetching collection 457 metadata...');
  const metaResp = await fetchWithRetry(COLLECTION_METADATA_URL);
  const metaData = (await metaResp.json()) as {
    data?: {
      collectionMetadata?: {
        childDatasets?: Array<{ datasetId: string; name: string }>;
      };
    };
  };

  // childDatasets is now string[] (just IDs) in the current API version
  const rawDatasets = metaData?.data?.collectionMetadata?.childDatasets as string[] | undefined;
  if (!rawDatasets?.length) {
    throw new Error('No datasets found in collection 457 metadata');
  }

  console.log(`Found ${rawDatasets.length} datasets — fetching names...`);

  // Fetch individual metadata for each dataset to resolve names
  const childDatasets = await Promise.all(
    rawDatasets.map(async (id) => {
      const r = await fetchWithRetry(`${DATASETS_META_BASE}/${id}/metadata`);
      const d = (await r.json()) as { data?: { datasetId: string; name: string } };
      return { datasetId: d?.data?.datasetId ?? id, name: d?.data?.name ?? '' };
    })
  );

  childDatasets.forEach((d) => console.log(`  - ${d.datasetId}: ${d.name}`));

  // 2. Identify the 5 required datasets
  const { general, cca, subject, programme, distinctive } = identifyDatasets(childDatasets);

  // 3. Download all CSVs sequentially to avoid rate limiting
  const generalRows = await downloadCsv(general.datasetId, 'general');
  await new Promise((r) => setTimeout(r, 1500));
  const ccaRows = await downloadCsv(cca.datasetId, 'cca');
  await new Promise((r) => setTimeout(r, 1500));
  const subjectRows = await downloadCsv(subject.datasetId, 'subject');
  await new Promise((r) => setTimeout(r, 1500));
  const programmeRows = await downloadCsv(programme.datasetId, 'programme');
  await new Promise((r) => setTimeout(r, 1500));
  const distinctiveRows = await downloadCsv(distinctive.datasetId, 'distinctive');

  // 4. Build canonical SECONDARY school set from general info
  //
  //  Inclusion criteria — we want every school that accepts S1–S5 students:
  //
  //    • "SECONDARY (S1-S4)" and "SECONDARY (S1-S5)" — pure secondary schools
  //    • "MIXED LEVEL (S1-JC2)"  — IP schools: Hwa Chong, Raffles, ACS(I), etc.
  //    • "MIXED LEVEL (S1-S5, JC1-JC2)" — Singapore Sports School
  //    • "MIXED LEVEL (P1-S4)"  — integrated primary+secondary: Catholic High,
  //       CHIJ St. Nicholas, Maris Stella
  //
  //  Exclusion: pure primary, pure junior college, centralised institute.
  //
  const secondarySchools = generalRows.filter((row) => {
    const level = (
      row['mainlevel_code'] ??
      row['school_section'] ??
      row['section_code'] ??
      row['Section'] ??
      row['type_code'] ??
      ''
    ).toLowerCase().trim();

    // Pure secondary schools (SECONDARY (S1-S4/S5))
    if (level.startsWith('secondary')) return true;
    if (level === 'sec') return true;

    // Mixed-level schools that include secondary years.
    // A secondary year appears as S1–S5 in the level code.
    // Regex \bs[1-5]\b matches "s1", "s2" … "s5" as word-bounded tokens.
    if (level.startsWith('mixed level') && /\bs[1-5]\b/.test(level)) return true;

    return false;
  });

  if (secondarySchools.length === 0) {
    console.warn('\nWARN: No secondary schools found. Checking available column names:');
    if (generalRows[0]) console.warn('  Columns:', Object.keys(generalRows[0]).join(', '));
    secondarySchools.push(...generalRows);
    console.warn(`  Falling back to all ${secondarySchools.length} rows`);
  }

  console.log(`\nFound ${secondarySchools.length} secondary schools in general info`);

  // Build canonical map: normalizedName -> general info
  type GeneralInfo = {
    name: string;
    section: string;
    isIp: boolean;
    address: string;
    postalCode: string;
    url: string;
    telephone: string;
  };

  const generalByNorm = new Map<string, GeneralInfo>();

  for (const row of secondarySchools) {
    const name =
      row['school_name'] ??
      row['School Name'] ??
      row['Name'] ??
      row['name'] ??
      '';

    if (!name) continue;
    const norm = normalizeName(name);

    generalByNorm.set(norm, {
      name: name.trim(),
      // section: row['school_section'] ?? row['Section'] ?? 'SECONDARY',
      section:
        row['mainlevel_code'] ??
        row['school_section'] ??
        row['section_code'] ??
        row['Section'] ??
        row['type_code'] ??
        'SECONDARY',
      isIp: String(row['ip_ind'] ?? '').trim().toLowerCase() === 'yes',
      address: row['address'] ?? row['Address'] ?? '',
      postalCode: row['postal_code'] ?? row['Postal Code'] ?? row['postal'] ?? '',
      url: row['url_address'] ?? row['URL'] ?? row['website'] ?? '',
      telephone: row['telephone_no'] ?? row['Telephone'] ?? row['telephone'] ?? '',
    });
  }

  console.log(`  ${generalByNorm.size} normalized names in canonical set`);

  // Helper to get school name from a row — handles all CSV variants
  function getSchoolName(row: Record<string, string>): string {
    // Try exact matches for all known column name variants
    return (
      row['school_name'] ??  // general info CSV
      row['School_name'] ??  // CCA CSV (capital S)
      row['School_Name'] ??  // subject CSV (capital S and N)
      row['School Name'] ??  // space-separated variant
      row['school'] ??
      row['School'] ??
      row['name'] ??
      ''
    ).trim();
  }

  // 5. Build lookup maps for each dataset
  const ccasByNorm = new Map<string, { group: string; name: string }[]>();
  let skippedCca = 0;
  for (const row of ccaRows) {
    const sn = getSchoolName(row);
    if (!sn) continue;
    const norm = normalizeName(sn);
    if (!generalByNorm.has(norm)) { skippedCca++; continue; }
    const arr = ccasByNorm.get(norm) ?? [];
    arr.push({
      group: row['cca_grouping_desc'] ?? row['CCA Group'] ?? row['group'] ?? '',
      name: row['cca_generic_name'] ?? row['cca'] ?? row['CCA'] ?? row['name'] ?? '',
    });
    ccasByNorm.set(norm, arr);
  }

  const subjectsByNorm = new Map<string, string[]>();
  let skippedSubject = 0;
  for (const row of subjectRows) {
    const sn = getSchoolName(row);
    if (!sn) continue;
    const norm = normalizeName(sn);
    if (!generalByNorm.has(norm)) { skippedSubject++; continue; }
    const arr = subjectsByNorm.get(norm) ?? [];
    const subj = row['subject_desc'] ?? row['Subject_Desc'] ?? row['Subject'] ?? row['subject'] ?? '';
    if (subj) arr.push(subj.trim());
    subjectsByNorm.set(norm, arr);
  }

  const programmesByNorm = new Map<string, string[]>();
  let skippedProgramme = 0;
  for (const row of programmeRows) {
    const sn = getSchoolName(row);
    if (!sn) continue;
    const norm = normalizeName(sn);
    if (!generalByNorm.has(norm)) { skippedProgramme++; continue; }
    const arr = programmesByNorm.get(norm) ?? [];
    const prog = row['moe_programme_desc'] ?? row['programme'] ?? row['Programme'] ?? '';
    if (prog) arr.push(prog.trim());
    programmesByNorm.set(norm, arr);
  }

  const distinctiveByNorm = new Map<string, { domain: string; title: string }[]>();
  let skippedDistinctive = 0;
  for (const row of distinctiveRows) {
    const sn = getSchoolName(row);
    if (!sn) continue;
    const norm = normalizeName(sn);
    if (!generalByNorm.has(norm)) { skippedDistinctive++; continue; }
    const arr = distinctiveByNorm.get(norm) ?? [];
    arr.push({
      domain: row['alp_domain'] ?? row['domain'] ?? row['Domain'] ?? '',
      title: row['alp_title'] ?? row['title'] ?? row['Title'] ?? '',
    });
    distinctiveByNorm.set(norm, arr);
  }

  console.log(`\nSkipped rows (unknown school name):`);
  console.log(`  CCAs: ${skippedCca}, Subjects: ${skippedSubject}, Programmes: ${skippedProgramme}, Distinctive: ${skippedDistinctive}`);

  // 6. Upsert schools + relations
  console.log('\nUpserting schools into database...');
  let inserted = 0;
  let geocoded = 0;
  let geocodeFailed = 0;
  const GEOCODE_DELAY_MS = 300; // rate limit

  for (const [norm, info] of generalByNorm.entries()) {
    // Geocode
    let lat: number | null = null;
    let lng: number | null = null;

    if (info.postalCode) {
      const coords = await geocodePostal(info.postalCode);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
        geocoded++;
      } else {
        geocodeFailed++;
      }
      await new Promise((r) => setTimeout(r, GEOCODE_DELAY_MS));
    }

    // Upsert School
    const school = await prisma.school.upsert({
      where: { name: info.name },
      create: {
        name: info.name,
        section: info.section,
        isIp: info.isIp,
        address: info.address || null,
        postalCode: info.postalCode || null,
        url: info.url || null,
        telephone: info.telephone || null,
        lat,
        lng,
      },
      update: {
        section: info.section,
        isIp: info.isIp,
        address: info.address || null,
        postalCode: info.postalCode || null,
        url: info.url || null,
        telephone: info.telephone || null,
        ...(lat != null && { lat }),
        ...(lng != null && { lng }),
      },
    });

    // Replace relations: delete-many + create-many
    await prisma.schoolCCA.deleteMany({ where: { schoolId: school.id } });
    const ccas = ccasByNorm.get(norm) ?? [];
    if (ccas.length > 0) {
      await prisma.schoolCCA.createMany({
        data: ccas.map((c) => ({ schoolId: school.id, ccaName: c.name, ccaGroup: c.group || null })),
      });
    }

    await prisma.schoolSubject.deleteMany({ where: { schoolId: school.id } });
    const subjects = subjectsByNorm.get(norm) ?? [];
    if (subjects.length > 0) {
      await prisma.schoolSubject.createMany({
        data: subjects.map((s) => ({ schoolId: school.id, subjectName: s })),
      });
    }

    await prisma.schoolProgramme.deleteMany({ where: { schoolId: school.id } });
    const programmes = programmesByNorm.get(norm) ?? [];
    if (programmes.length > 0) {
      await prisma.schoolProgramme.createMany({
        data: programmes.map((p) => ({ schoolId: school.id, programmeName: p })),
      });
    }

    await prisma.schoolDistinctiveProgramme.deleteMany({ where: { schoolId: school.id } });
    const distinctives = distinctiveByNorm.get(norm) ?? [];
    if (distinctives.length > 0) {
      await prisma.schoolDistinctiveProgramme.createMany({
        data: distinctives.map((d) => ({
          schoolId: school.id,
          domain: d.domain,
          title: d.title,
        })),
      });
    }

    inserted++;
    if (inserted % 20 === 0) {
      process.stdout.write(`  Processed ${inserted}/${generalByNorm.size} schools...\r`);
    }
  }

  console.log(`\n\n=== Import Complete ===`);
  console.log(`  Schools upserted: ${inserted}`);
  console.log(`  Geocoded: ${geocoded} / ${inserted}`);
  console.log(`  Geocode failed: ${geocodeFailed}`);
  console.log(`  CCAs: ${[...ccasByNorm.values()].reduce((s, a) => s + a.length, 0)}`);
  console.log(`  Subjects: ${[...subjectsByNorm.values()].reduce((s, a) => s + a.length, 0)}`);
  console.log(`  Programmes: ${[...programmesByNorm.values()].reduce((s, a) => s + a.length, 0)}`);
  console.log(`  Distinctive: ${[...distinctiveByNorm.values()].reduce((s, a) => s + a.length, 0)}`);
}

main()
  .catch((err) => {
    console.error('\nImport failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
