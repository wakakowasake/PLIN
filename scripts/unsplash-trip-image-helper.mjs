import fs from 'fs';
import path from 'path';

import {
  getPopularTripDestinationById,
  popularTripDestinations
} from '../shared/features/trips/trip-destinations-data.js';

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
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];

    if (arg.startsWith('--') && nextValue && !nextValue.startsWith('--')) {
      options[arg.slice(2)] = nextValue;
      index += 1;
    } else if (arg.startsWith('--')) {
      options[arg.slice(2)] = 'true';
    }
  }

  return options;
}

function uniqueStrings(values) {
  return Array.from(new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ));
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

function isCodeLikeKeyword(value) {
  return /^[A-Z]{2,4}$/.test(String(value || '').trim());
}

function isAirportLikeKeyword(value) {
  return /\bairport\b/i.test(String(value || ''));
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

function resolveCountryName(destination) {
  return COUNTRY_NAME_BY_CODE[destination.countryCode] || '';
}

function buildSearchProfile(destination) {
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

  const primaryAlias = sortedAliases[0] || (destination.id.length > 3 ? destination.id : '');
  const query = uniqueStrings([primaryAlias, countryName]).join(' ').trim();

  return {
    primaryAlias,
    aliases: uniqueStrings([primaryAlias, ...sortedAliases]),
    countryName,
    query,
    searchPath: encodeSearchPath(query)
  };
}

function buildGlobalAliasIndex(destinations) {
  const aliasMap = new Map();

  for (const destination of destinations) {
    const profile = buildSearchProfile(destination);
    for (const alias of uniqueStrings([destination.name, profile.countryName, ...profile.aliases])) {
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

function extractDehydratedData(html) {
  const marker = 'window.__DEHYDRATED_DATA__ = "';
  const startIndex = html.indexOf(marker);
  if (startIndex < 0) {
    throw new Error('Unable to locate Unsplash dehydrated data.');
  }

  let currentIndex = startIndex + marker.length;
  let escaped = false;
  let stringBuffer = '';

  while (currentIndex < html.length) {
    const character = html[currentIndex];
    if (escaped) {
      stringBuffer += character;
      escaped = false;
    } else if (character === '\\') {
      stringBuffer += character;
      escaped = true;
    } else if (character === '"') {
      break;
    } else {
      stringBuffer += character;
    }
    currentIndex += 1;
  }

  return JSON.parse(JSON.parse(`"${stringBuffer}"`));
}

function getSearchResultsFromDehydratedData(dehydratedData) {
  const queries = dehydratedData?.queryClientCache?.queries || [];
  const photosQuery = queries.find((query) => (
    Array.isArray(query?.queryKey)
    && query.queryKey[2] === '/search/photos'
  ));

  return photosQuery?.state?.data?.pages?.[0]?.results || [];
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
  let aliasMatchedInAlt = false;

  for (const alias of searchProfile.aliases) {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias || normalizedAlias === countryText) {
      continue;
    }

    if (altSlugText.includes(normalizedAlias)) {
      aliasMatchedInAlt = true;
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

  if (!aliasMatchedInAlt) {
    score -= 32;
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

    score -= 65;
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

function appendUtm(url) {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) {
    return '';
  }

  const separator = normalizedUrl.includes('?') ? '&' : '?';
  return `${normalizedUrl}${separator}utm_source=plin_trip_destinations&utm_medium=referral`;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractRegexValue(html, pattern) {
  const match = String(html || '').match(pattern);
  return decodeHtmlEntities(match?.[1] || '');
}

function extractMetaContent(html, metaName) {
  const escapedName = escapeRegExp(metaName);
  return (
    extractRegexValue(
      html,
      new RegExp(`<meta\\s+(?:property|name)="${escapedName}"\\s+content="([^"]+)"`, 'i')
    )
    || extractRegexValue(
      html,
      new RegExp(`<meta\\s+content="([^"]+)"\\s+(?:property|name)="${escapedName}"`, 'i')
    )
  );
}

function extractLinkHref(html, relValue) {
  const escapedRel = escapeRegExp(relValue);
  return extractRegexValue(
    html,
    new RegExp(`<link\\s+[^>]*rel="${escapedRel}"[^>]*href="([^"]+)"`, 'i')
  );
}

function parseSrcSet(srcSetText) {
  return decodeHtmlEntities(srcSetText)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, widthToken] = entry.split(/\s+/);
      const width = Number.parseInt(String(widthToken || '').replace(/w$/i, ''), 10);

      return {
        url: String(url || '').trim(),
        width: Number.isFinite(width) ? width : 0
      };
    })
    .filter((entry) => entry.url);
}

function pickPhotoPageImageUrl(html) {
  const srcSetText = extractRegexValue(
    html,
    /<link\s+rel="preload"\s+as="image"\s+imageSrcSet="([^"]+)"/i
  );
  const srcSetEntries = parseSrcSet(srcSetText);
  if (srcSetEntries.length === 0) {
    return '';
  }

  const preferredEntry = (
    srcSetEntries
      .filter((entry) => entry.width >= 1200)
      .sort((left, right) => left.width - right.width)[0]
    || srcSetEntries.sort((left, right) => right.width - left.width)[0]
  );

  return preferredEntry?.url || '';
}

function extractPhotoPageAuthor(html) {
  const match = String(html || '').match(/<a[^>]+href="(\/\@[^"]+)"[^>]*>([^<]+)<\/a>/i);
  if (!match) {
    return {
      photographerName: '',
      photographerUsername: '',
      photographerProfileUrl: ''
    };
  }

  const profilePath = decodeHtmlEntities(match[1] || '');
  const absoluteProfileUrl = profilePath.startsWith('http')
    ? profilePath
    : `https://unsplash.com${profilePath}`;
  const photographerUsername = absoluteProfileUrl.split('/@')[1]?.split(/[/?#]/)[0] || '';

  return {
    photographerName: decodeHtmlEntities(match[2] || '').trim(),
    photographerUsername,
    photographerProfileUrl: appendUtm(absoluteProfileUrl)
  };
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function escapeCsv(value) {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function writeAttributionOutputs(results, failures, csvPath, jsonPath) {
  const sortedResults = [...results].sort((left, right) => (
    (Number(left.popularityOrder) || Number.MAX_SAFE_INTEGER)
    - (Number(right.popularityOrder) || Number.MAX_SAFE_INTEGER)
  ));
  const sortedFailures = [...failures].sort((left, right) => (
    (Number(left.popularityOrder) || Number.MAX_SAFE_INTEGER)
    - (Number(right.popularityOrder) || Number.MAX_SAFE_INTEGER)
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
    'failed'
  ];

  const csvLines = [
    csvHeader.join(','),
    ...sortedResults.map((row) => csvHeader.map((column) => escapeCsv(row[column])).join(','))
  ];

  fs.writeFileSync(csvPath, `${csvLines.join('\n')}\n`);
  fs.writeFileSync(jsonPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalSucceeded: sortedResults.length,
    totalFailed: sortedFailures.length,
    results: sortedResults,
    failures: sortedFailures
  }, null, 2)}\n`);

  process.stdout.write(JSON.stringify({
    csvPath,
    jsonPath,
    totalSucceeded: sortedResults.length,
    totalFailed: sortedFailures.length
  }));
}

function runWorklistMode(options) {
  const inputCsvPath = path.resolve(process.cwd(), options.input || 'public/static/images/trip-destinations/destination-image-file-list.csv');
  const startOrder = Math.max(1, Number.parseInt(options['start-order'] || '1', 10) || 1);
  const limit = Math.max(1, Number.parseInt(options.limit || `${Number.MAX_SAFE_INTEGER}`, 10) || Number.MAX_SAFE_INTEGER);
  const rows = parseCsv(fs.readFileSync(inputCsvPath, 'utf8'))
    .filter((row) => (Number.parseInt(row.popularityOrder, 10) || 0) >= startOrder)
    .slice(0, limit);

  for (const row of rows) {
    const destination = getPopularTripDestinationById(row.id);
    if (!destination) {
      continue;
    }

    const profile = buildSearchProfile(destination);
    process.stdout.write([
      row.popularityOrder,
      destination.id,
      destination.name,
      row.filename,
      destination.scope,
      destination.categoryId,
      destination.countryCode,
      profile.query,
      profile.searchPath
    ].join('\t'));
    process.stdout.write('\n');
  }
}

function runSelectHtmlMode(options) {
  const destinationId = String(options['destination-id'] || '').trim();
  const htmlFilePath = path.resolve(process.cwd(), options['html-file'] || '');
  const searchQuery = String(options['search-query'] || '').trim();

  if (!destinationId || !fs.existsSync(htmlFilePath)) {
    throw new Error('destination-id and html-file are required');
  }

  const destination = getPopularTripDestinationById(destinationId);
  if (!destination) {
    throw new Error(`Unknown destination id: ${destinationId}`);
  }

  const html = fs.readFileSync(htmlFilePath, 'utf8');
  const dehydratedData = extractDehydratedData(html);
  const results = getSearchResultsFromDehydratedData(dehydratedData);
  const searchProfile = buildSearchProfile(destination);
  const globalAliasIndex = buildGlobalAliasIndex(popularTripDestinations);

  let bestCandidate = null;
  for (const result of results) {
    const score = scorePhoto(result, destination, searchProfile, globalAliasIndex);
    if (!Number.isFinite(score)) {
      continue;
    }

    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = { result, score };
    }
  }

  if (!bestCandidate) {
    throw new Error(`No free Unsplash photo candidate for ${destinationId}`);
  }

  process.stdout.write(JSON.stringify({
    destinationId,
    searchQuery,
    selectionScore: bestCandidate.score,
    selectionConfidence: classifyConfidence(bestCandidate.score),
    unsplashPhotoId: bestCandidate.result.id,
    unsplashPhotoSlug: bestCandidate.result.slug,
    unsplashPhotoUrl: appendUtm(bestCandidate.result.links?.html || ''),
    unsplashDownloadUrl: bestCandidate.result.links?.download || '',
    imageUrl: bestCandidate.result.urls?.regular || '',
    photographerName: bestCandidate.result.user?.name || '',
    photographerUsername: bestCandidate.result.user?.username || '',
    photographerProfileUrl: appendUtm(bestCandidate.result.user?.links?.html || ''),
    altDescription: bestCandidate.result.alt_description || '',
    description: bestCandidate.result.description || '',
    width: Number(bestCandidate.result.width) || null,
    height: Number(bestCandidate.result.height) || null
  }));
}

function runFinalizeMode(options) {
  const resultsJsonlPath = path.resolve(process.cwd(), options['results-jsonl'] || '');
  const failuresJsonlPath = path.resolve(process.cwd(), options['failures-jsonl'] || '');
  const csvPath = path.resolve(process.cwd(), options['csv-path'] || '');
  const jsonPath = path.resolve(process.cwd(), options['json-path'] || '');

  const results = readJsonLines(resultsJsonlPath);
  const failures = readJsonLines(failuresJsonlPath);

  writeAttributionOutputs(results, failures, csvPath, jsonPath);
}

function runPhotoPageMode(options) {
  const destinationId = String(options['destination-id'] || '').trim();
  const htmlFilePath = path.resolve(process.cwd(), options['html-file'] || '');
  const searchQuery = String(options['search-query'] || '').trim();
  const filename = String(options.filename || `${destinationId}.jpg`).trim();
  const popularityOrder = Number.parseInt(options['popularity-order'] || '0', 10) || 0;
  const fallbackPhotoUrl = String(options['photo-url'] || '').trim();

  if (!destinationId || !fs.existsSync(htmlFilePath)) {
    throw new Error('destination-id and html-file are required');
  }

  const destination = getPopularTripDestinationById(destinationId);
  if (!destination) {
    throw new Error(`Unknown destination id: ${destinationId}`);
  }

  const html = fs.readFileSync(htmlFilePath, 'utf8');
  const canonicalUrl = extractLinkHref(html, 'canonical') || fallbackPhotoUrl;
  const imageUrl = pickPhotoPageImageUrl(html);
  const metaDescription = extractMetaContent(html, 'description');
  const title = extractRegexValue(html, /<title>([^<]+)<\/title>/i);
  const { photographerName, photographerUsername, photographerProfileUrl } = extractPhotoPageAuthor(html);
  const photoSlug = canonicalUrl.split('/').pop()?.split(/[?#]/)[0] || '';
  const photoId = photoSlug.split('-').pop() || photoSlug;

  process.stdout.write(JSON.stringify({
    popularityOrder,
    id: destination.id,
    name: destination.name,
    filename,
    scope: destination.scope,
    categoryId: destination.categoryId,
    countryCode: destination.countryCode,
    searchQuery,
    selectionConfidence: 'manual',
    selectionScore: 1000,
    selectionMethod: 'manual-photo-page',
    unsplashPhotoId: photoId,
    unsplashPhotoSlug: photoSlug,
    unsplashPhotoUrl: appendUtm(canonicalUrl),
    photographerName,
    photographerUsername,
    photographerProfileUrl,
    imageUrl,
    downloadedAt: new Date().toISOString(),
    failed: false,
    title,
    description: metaDescription
  }));
}

function runMergeAttributionMode(options) {
  const existingJsonPath = path.resolve(process.cwd(), options['existing-json'] || '');
  const manualResultsJsonlPath = path.resolve(process.cwd(), options['manual-results-jsonl'] || '');
  const csvPath = path.resolve(process.cwd(), options['csv-path'] || existingJsonPath.replace(/\.json$/i, '.csv'));
  const jsonPath = path.resolve(process.cwd(), options['json-path'] || existingJsonPath);

  const existingData = fs.existsSync(existingJsonPath)
    ? JSON.parse(fs.readFileSync(existingJsonPath, 'utf8'))
    : { results: [], failures: [] };
  const manualResults = readJsonLines(manualResultsJsonlPath);
  const manualIds = new Set(manualResults.map((row) => row.id));

  const mergedResultMap = new Map();
  for (const row of existingData.results || []) {
    mergedResultMap.set(row.id, row);
  }
  for (const row of manualResults) {
    mergedResultMap.set(row.id, row);
  }

  const mergedFailures = (existingData.failures || []).filter((row) => !manualIds.has(row.id));
  writeAttributionOutputs(Array.from(mergedResultMap.values()), mergedFailures, csvPath, jsonPath);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const mode = String(options.mode || '').trim();

  if (mode === 'worklist') {
    runWorklistMode(options);
    return;
  }

  if (mode === 'select-html') {
    runSelectHtmlMode(options);
    return;
  }

  if (mode === 'finalize') {
    runFinalizeMode(options);
    return;
  }

  if (mode === 'photo-page') {
    runPhotoPageMode(options);
    return;
  }

  if (mode === 'merge-attribution') {
    runMergeAttributionMode(options);
    return;
  }

  throw new Error(`Unsupported mode: ${mode}`);
}

main();
