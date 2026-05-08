import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

import {
  getPopularTripDestinationById
} from '../shared/features/trips/trip-destinations-data.js';

const execFileAsync = promisify(execFile);

const DEFAULT_INPUT_CSV = 'public/static/images/trip-destinations/destination-image-file-list.csv';
const DEFAULT_IMAGE_DIR = 'public/static/images/trip-destinations';
const DEFAULT_ATTRIBUTION_CSV = 'public/static/images/trip-destinations/destination-image-attribution.csv';
const DEFAULT_ATTRIBUTION_JSON = 'public/static/images/trip-destinations/destination-image-attribution.json';
const DEFAULT_USER_AGENT = (
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
  + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
);

const COUNTRY_NAME_BY_CODE = {
  KR: 'South Korea',
  JP: 'Japan',
  TW: 'Taiwan',
  HK: 'Hong Kong',
  MO: 'Macau',
  TH: 'Thailand',
  VN: 'Vietnam',
  SG: 'Singapore',
  PH: 'Philippines',
  MY: 'Malaysia',
  ID: 'Indonesia',
  KH: 'Cambodia',
  LA: 'Laos',
  MM: 'Myanmar',
  BN: 'Brunei',
  CN: 'China',
  IN: 'India',
  LK: 'Sri Lanka',
  NP: 'Nepal',
  BD: 'Bangladesh',
  MV: 'Maldives',
  PK: 'Pakistan',
  AE: 'United Arab Emirates',
  QA: 'Qatar',
  SA: 'Saudi Arabia',
  TR: 'Turkey',
  IL: 'Israel',
  JO: 'Jordan',
  BH: 'Bahrain',
  OM: 'Oman',
  KW: 'Kuwait',
  KZ: 'Kazakhstan',
  GE: 'Georgia',
  AM: 'Armenia',
  UZ: 'Uzbekistan',
  MN: 'Mongolia',
  EG: 'Egypt',
  ZA: 'South Africa',
  ET: 'Ethiopia',
  KE: 'Kenya',
  MA: 'Morocco',
  TN: 'Tunisia',
  DZ: 'Algeria',
  MU: 'Mauritius',
  SC: 'Seychelles',
  NG: 'Nigeria',
  GH: 'Ghana',
  TZ: 'Tanzania',
  GB: 'United Kingdom',
  FR: 'France',
  DE: 'Germany',
  NL: 'Netherlands',
  BE: 'Belgium',
  CH: 'Switzerland',
  AT: 'Austria',
  CZ: 'Czech Republic',
  HU: 'Hungary',
  PL: 'Poland',
  PT: 'Portugal',
  ES: 'Spain',
  IT: 'Italy',
  GR: 'Greece',
  IE: 'Ireland',
  DK: 'Denmark',
  SE: 'Sweden',
  NO: 'Norway',
  FI: 'Finland',
  IS: 'Iceland',
  RO: 'Romania',
  BG: 'Bulgaria',
  RS: 'Serbia',
  AU: 'Australia',
  NZ: 'New Zealand',
  GU: 'Guam',
  MP: 'Northern Mariana Islands',
  US: 'United States',
  CA: 'Canada',
  MX: 'Mexico',
  BR: 'Brazil',
  AR: 'Argentina',
  CL: 'Chile',
  CO: 'Colombia',
  PE: 'Peru',
  PA: 'Panama',
  PR: 'Puerto Rico',
  DO: 'Dominican Republic',
  JM: 'Jamaica',
  AW: 'Aruba',
  SV: 'El Salvador',
  GT: 'Guatemala',
  CR: 'Costa Rica',
  EC: 'Ecuador'
};

const GENERIC_SEARCH_TERMS = new Set([
  'airport',
  'international airport',
  'city',
  'travel',
  'tourism',
  'tourist',
  'trip',
  'vacation',
  'holiday',
  'south korea',
  'korea',
  'japan',
  'taiwan',
  'hong kong',
  'macau',
  'thailand',
  'vietnam',
  'singapore',
  'philippines',
  'malaysia',
  'indonesia',
  'china',
  'france',
  'italy',
  'spain',
  'germany',
  'usa',
  'united states'
]);

const VISUAL_POSITIVE_PATTERN = (
  /\b(city|cityscape|skyline|island|beach|coast|coastal|harbor|harbour|mountain|temple|palace|street|night|sunset|sunrise|tower|bridge|lake|forest|village|bay|ocean|sea|travel)\b/i
);
const PEOPLE_HEAVY_PATTERN = /\b(person|people|woman|women|man|men|friends|portrait|restaurant|dining|fashion)\b/i;

function parseArgs(argv) {
  const options = {
    inputCsvPath: DEFAULT_INPUT_CSV,
    imageDirPath: DEFAULT_IMAGE_DIR,
    attributionCsvPath: DEFAULT_ATTRIBUTION_CSV,
    attributionJsonPath: DEFAULT_ATTRIBUTION_JSON,
    concurrency: 2,
    delayMs: 250,
    limit: Number.POSITIVE_INFINITY,
    startOrder: 1,
    overwrite: true,
    userAgent: DEFAULT_USER_AGENT
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];

    if (arg === '--input' && nextValue) {
      options.inputCsvPath = nextValue;
      index += 1;
    } else if (arg === '--image-dir' && nextValue) {
      options.imageDirPath = nextValue;
      index += 1;
    } else if (arg === '--attribution-csv' && nextValue) {
      options.attributionCsvPath = nextValue;
      index += 1;
    } else if (arg === '--attribution-json' && nextValue) {
      options.attributionJsonPath = nextValue;
      index += 1;
    } else if (arg === '--concurrency' && nextValue) {
      options.concurrency = Math.max(1, Number.parseInt(nextValue, 10) || 1);
      index += 1;
    } else if (arg === '--delay-ms' && nextValue) {
      options.delayMs = Math.max(0, Number.parseInt(nextValue, 10) || 0);
      index += 1;
    } else if (arg === '--limit' && nextValue) {
      options.limit = Math.max(1, Number.parseInt(nextValue, 10) || 1);
      index += 1;
    } else if (arg === '--start-order' && nextValue) {
      options.startOrder = Math.max(1, Number.parseInt(nextValue, 10) || 1);
      index += 1;
    } else if (arg === '--no-overwrite') {
      options.overwrite = false;
    }
  }

  return options;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['"`’.,()/_|:;-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasLatinText(value) {
  return /[A-Za-z]/.test(String(value || ''));
}

function isAirportLikeKeyword(value) {
  return /\bairport\b/i.test(String(value || ''));
}

function isCodeLikeKeyword(value) {
  return /^[A-Z]{2,4}$/.test(String(value || '').trim());
}

function encodeSearchPath(query) {
  return encodeURIComponent(String(query || '').trim().replace(/\s+/g, ' '))
    .replace(/%20/g, '-');
}

function parseCsv(text) {
  const rows = [];
  let currentField = '';
  let currentRow = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (inQuotes) {
      if (character === '"' && nextCharacter === '"') {
        currentField += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        currentField += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
    } else if (character === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (character === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentField = '';
      currentRow = [];
    } else if (character !== '\r') {
      currentField += character;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return [];
  }

  const [headerRow, ...bodyRows] = rows;
  return bodyRows
    .filter((row) => row.some((value) => String(value || '').trim()))
    .map((row) => Object.fromEntries(
      headerRow.map((header, index) => [header, row[index] ?? ''])
    ));
}

function escapeCsv(value) {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function resolveCountryName(destination) {
  return COUNTRY_NAME_BY_CODE[destination.countryCode] || '';
}

function uniqueStrings(values) {
  return Array.from(new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ));
}

function buildAliasSet(destination) {
  const countryName = resolveCountryName(destination);
  const normalizedCountryName = normalizeText(countryName);

  const rawAliases = uniqueStrings([
    destination.name,
    ...(destination.keywords || [])
  ]);

  const latinAliases = rawAliases
    .filter(hasLatinText)
    .filter((value) => !isCodeLikeKeyword(value))
    .filter((value) => !isAirportLikeKeyword(value))
    .filter((value) => {
      const normalized = normalizeText(value);
      return normalized && !GENERIC_SEARCH_TERMS.has(normalized);
    });

  const sortedAliases = uniqueStrings(latinAliases).sort((left, right) => {
    const leftNormalized = normalizeText(left);
    const rightNormalized = normalizeText(right);

    const leftCountryPenalty = leftNormalized === normalizedCountryName ? 1 : 0;
    const rightCountryPenalty = rightNormalized === normalizedCountryName ? 1 : 0;
    if (leftCountryPenalty !== rightCountryPenalty) {
      return leftCountryPenalty - rightCountryPenalty;
    }

    const leftPriority = /\s/.test(left) ? 0 : 1;
    const rightPriority = /\s/.test(right) ? 0 : 1;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return right.length - left.length;
  });

  let primaryAlias = sortedAliases[0] || '';
  if (!primaryAlias && destination.id.length > 3 && hasLatinText(destination.id)) {
    primaryAlias = destination.id;
  }

  return {
    countryName,
    primaryAlias,
    aliases: uniqueStrings([primaryAlias, ...sortedAliases]).filter(Boolean)
  };
}

function buildSearchQueries(destination) {
  const { primaryAlias, aliases, countryName } = buildAliasSet(destination);
  const alias = primaryAlias || aliases[0] || destination.id;
  const queryBase = uniqueStrings([alias, countryName]).join(' ').trim();

  const queries = uniqueStrings([
    queryBase,
    destination.scope === 'domestic'
      ? `${queryBase} travel`
      : `${queryBase} cityscape`,
    destination.scope === 'domestic'
      ? `${alias} South Korea`
      : `${alias} ${countryName} travel`
  ]).filter(Boolean);

  return {
    alias,
    aliases,
    countryName,
    queries
  };
}

async function runCurl(args) {
  const { stdout } = await execFileAsync('curl', args, {
    maxBuffer: 20 * 1024 * 1024
  });
  return stdout;
}

async function runCurlWithRetry(args, retries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await runCurl(args);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(350 * (attempt + 1));
      }
    }
  }

  throw lastError;
}

function extractDehydratedData(html) {
  const match = html.match(/window\.__DEHYDRATED_DATA__ = ("(?:\\.|[^"])*")/);
  if (!match) {
    throw new Error('Unable to locate Unsplash dehydrated data.');
  }

  const dehydratedText = JSON.parse(match[1]);
  return JSON.parse(dehydratedText);
}

function getSearchResultsFromDehydratedData(dehydratedData) {
  const queries = dehydratedData?.queryClientCache?.queries || [];
  const photosQuery = queries.find((query) => (
    Array.isArray(query?.queryKey)
    && query.queryKey[2] === '/search/photos'
  ));

  return photosQuery?.state?.data?.pages?.[0]?.results || [];
}

function buildGlobalAliasIndex(destinations) {
  const aliasMap = new Map();

  for (const destination of destinations) {
    const { aliases, countryName } = buildSearchQueries(destination);
    for (const alias of uniqueStrings([destination.name, countryName, ...aliases])) {
      const normalizedAlias = normalizeText(alias);
      if (!normalizedAlias || normalizedAlias.length < 4) {
        continue;
      }

      if (GENERIC_SEARCH_TERMS.has(normalizedAlias)) {
        continue;
      }

      if (!aliasMap.has(normalizedAlias)) {
        aliasMap.set(normalizedAlias, new Set());
      }

      aliasMap.get(normalizedAlias).add(destination.id);
    }
  }

  return aliasMap;
}

function scorePhoto(result, destination, searchProfile, globalAliasIndex) {
  if (!result || result.asset_type !== 'photo' || result.premium || result.plus) {
    return Number.NEGATIVE_INFINITY;
  }

  const altSlugText = normalizeText([
    result.slug,
    result.alt_description,
    ...(result.alternative_slugs ? Object.values(result.alternative_slugs) : [])
  ].join(' '));
  const descriptionText = normalizeText(result.description);
  const countryText = normalizeText(searchProfile.countryName);

  let score = 0;

  for (const alias of searchProfile.aliases) {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias || normalizedAlias === countryText) {
      continue;
    }

    if (altSlugText.includes(normalizedAlias)) {
      score += 110;
      continue;
    }

    if (descriptionText.includes(normalizedAlias)) {
      score += 35;
      continue;
    }

    const aliasTokens = normalizedAlias.split(' ').filter((token) => token.length >= 4);
    const tokenHits = aliasTokens.filter((token) => altSlugText.includes(token)).length;
    score += tokenHits * 18;
  }

  if (countryText && altSlugText.includes(countryText)) {
    score += 24;
  } else if (countryText && descriptionText.includes(countryText)) {
    score += 8;
  }

  if (VISUAL_POSITIVE_PATTERN.test(altSlugText)) {
    score += 6;
  }

  if (PEOPLE_HEAVY_PATTERN.test(altSlugText)) {
    score -= 18;
  }

  if (!result.alt_description) {
    score -= 6;
  }

  const aspectRatio = Number(result.width) && Number(result.height)
    ? Number(result.width) / Number(result.height)
    : null;
  if (aspectRatio) {
    if (aspectRatio >= 0.9 && aspectRatio <= 2.2) {
      score += 4;
    } else if (aspectRatio < 0.6 || aspectRatio > 3.0) {
      score -= 12;
    }
  }

  for (const [otherAlias, destinationIds] of globalAliasIndex.entries()) {
    if (destinationIds.has(destination.id) || !altSlugText.includes(otherAlias)) {
      continue;
    }

    score -= 24;
  }

  return score;
}

function classifyConfidence(score) {
  if (score >= 120) {
    return 'high';
  }

  if (score >= 70) {
    return 'medium';
  }

  return 'low';
}

async function fetchUnsplashSearchResults(query, userAgent) {
  const searchUrl = `https://unsplash.com/s/photos/${encodeSearchPath(query)}`;
  const html = await runCurlWithRetry([
    '-sS',
    '-A',
    userAgent,
    '-H',
    'Accept-Language: en-US,en;q=0.9',
    searchUrl
  ]);
  const dehydratedData = extractDehydratedData(html);
  const results = getSearchResultsFromDehydratedData(dehydratedData);

  return {
    searchUrl,
    results
  };
}

async function selectPhotoForDestination(destination, globalAliasIndex, userAgent) {
  const searchProfile = buildSearchQueries(destination);
  let bestCandidate = null;

  for (const query of searchProfile.queries) {
    const { searchUrl, results } = await fetchUnsplashSearchResults(query, userAgent);

    for (const result of results) {
      const score = scorePhoto(result, destination, searchProfile, globalAliasIndex);
      if (!Number.isFinite(score)) {
        continue;
      }

      const candidate = {
        query,
        searchUrl,
        score,
        confidence: classifyConfidence(score),
        result
      };

      if (!bestCandidate || candidate.score > bestCandidate.score) {
        bestCandidate = candidate;
      }
    }

    if (bestCandidate && bestCandidate.score >= 100) {
      break;
    }
  }

  if (!bestCandidate) {
    throw new Error(`No Unsplash candidate found for ${destination.id}`);
  }

  return bestCandidate;
}

function appendUtm(url) {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) {
    return '';
  }

  const separator = normalizedUrl.includes('?') ? '&' : '?';
  return `${normalizedUrl}${separator}utm_source=plin_trip_destinations&utm_medium=referral`;
}

async function downloadImageFile(imageUrl, filePath, userAgent) {
  await runCurlWithRetry([
    '-sS',
    '-L',
    '-A',
    userAgent,
    '-H',
    'Accept-Language: en-US,en;q=0.9',
    '-o',
    filePath,
    imageUrl
  ]);
}

async function processDestination(row, options, globalAliasIndex) {
  const destination = getPopularTripDestinationById(row.id);
  if (!destination) {
    throw new Error(`Unknown destination id: ${row.id}`);
  }

  const outputFilePath = path.join(options.imageDirPath, row.filename);
  if (!options.overwrite && fs.existsSync(outputFilePath)) {
    return {
      popularityOrder: Number.parseInt(row.popularityOrder, 10) || null,
      id: destination.id,
      name: destination.name,
      filename: row.filename,
      skipped: true
    };
  }

  const selected = await selectPhotoForDestination(destination, globalAliasIndex, options.userAgent);
  const imageUrl = selected.result.urls.regular;
  await downloadImageFile(imageUrl, outputFilePath, options.userAgent);

  return {
    popularityOrder: Number.parseInt(row.popularityOrder, 10) || null,
    id: destination.id,
    name: destination.name,
    filename: row.filename,
    scope: destination.scope,
    categoryId: destination.categoryId,
    countryCode: destination.countryCode,
    searchQuery: selected.query,
    searchUrl: selected.searchUrl,
    selectionScore: selected.score,
    selectionConfidence: selected.confidence,
    unsplashPhotoId: selected.result.id,
    unsplashPhotoSlug: selected.result.slug,
    unsplashPhotoUrl: appendUtm(selected.result.links?.html || ''),
    unsplashDownloadUrl: selected.result.links?.download || '',
    imageUrl,
    photographerName: selected.result.user?.name || '',
    photographerUsername: selected.result.user?.username || '',
    photographerProfileUrl: appendUtm(selected.result.user?.links?.html || ''),
    altDescription: selected.result.alt_description || '',
    description: selected.result.description || '',
    width: Number(selected.result.width) || null,
    height: Number(selected.result.height) || null,
    downloadedAt: new Date().toISOString(),
    skipped: false
  };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const inputCsvPath = path.resolve(process.cwd(), options.inputCsvPath);
  const imageDirPath = path.resolve(process.cwd(), options.imageDirPath);
  const attributionCsvPath = path.resolve(process.cwd(), options.attributionCsvPath);
  const attributionJsonPath = path.resolve(process.cwd(), options.attributionJsonPath);

  fs.mkdirSync(imageDirPath, { recursive: true });

  const csvText = fs.readFileSync(inputCsvPath, 'utf8');
  const orderedRows = parseCsv(csvText)
    .filter((row) => (Number.parseInt(row.popularityOrder, 10) || 0) >= options.startOrder)
    .slice(0, options.limit);

  const destinations = orderedRows
    .map((row) => getPopularTripDestinationById(row.id))
    .filter(Boolean);
  const globalAliasIndex = buildGlobalAliasIndex(destinations);

  const results = [];
  const failures = [];
  let nextIndex = 0;

  async function worker(workerIndex) {
    while (nextIndex < orderedRows.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const row = orderedRows[currentIndex];

      try {
        const result = await processDestination(row, {
          ...options,
          imageDirPath
        }, globalAliasIndex);
        results.push(result);

        const summary = result.skipped
          ? `skipped ${result.filename}`
          : `${result.filename} <- ${result.photographerName} (${result.selectionConfidence}, score=${result.selectionScore})`;
        console.log(
          `[${currentIndex + 1}/${orderedRows.length}] worker ${workerIndex} ${summary}`
        );
      } catch (error) {
        failures.push({
          popularityOrder: row.popularityOrder,
          id: row.id,
          filename: row.filename,
          error: error instanceof Error ? error.message : String(error)
        });
        console.error(
          `[${currentIndex + 1}/${orderedRows.length}] worker ${workerIndex} failed ${row.filename}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      if (options.delayMs > 0) {
        await sleep(options.delayMs);
      }
    }
  }

  await Promise.all(
    Array.from({ length: options.concurrency }, (_, index) => worker(index + 1))
  );

  results.sort((left, right) => (
    (left.popularityOrder || Number.MAX_SAFE_INTEGER)
    - (right.popularityOrder || Number.MAX_SAFE_INTEGER)
  ));

  const csvHeader = [
    'popularityOrder',
    'id',
    'name',
    'filename',
    'scope',
    'categoryId',
    'countryCode',
    'searchQuery',
    'selectionConfidence',
    'selectionScore',
    'unsplashPhotoId',
    'unsplashPhotoSlug',
    'unsplashPhotoUrl',
    'photographerName',
    'photographerUsername',
    'photographerProfileUrl',
    'imageUrl',
    'downloadedAt',
    'skipped'
  ];
  const csvLines = [
    csvHeader.join(','),
    ...results.map((row) => csvHeader.map((column) => escapeCsv(row[column])).join(','))
  ];

  fs.writeFileSync(attributionCsvPath, `${csvLines.join('\n')}\n`);
  fs.writeFileSync(attributionJsonPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalRequested: orderedRows.length,
    totalSucceeded: results.length,
    totalFailed: failures.length,
    results,
    failures
  }, null, 2)}\n`);

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalRequested: orderedRows.length,
    totalSucceeded: results.length,
    totalFailed: failures.length,
    attributionCsvPath,
    attributionJsonPath
  }, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
