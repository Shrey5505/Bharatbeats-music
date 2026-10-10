export type QualityMode = "low" | "balanced" | "best";

export interface ArchiveRecord {
  id: string;
  title: string;
  creator: string;
  licenseUrl: string;
  date?: string;
  album?: string;
}

export interface ResolvedTrack extends ArchiveRecord {
  src: string;
  sourceUrl: string;
  format: string;
  mediaType: string;
  artwork?: string;
  bitrate?: string;
  sampleRate?: string;
  bitDepth?: string;
  fileSize?: number;
  duration?: number;
}

interface ArchiveSearchResponse {
  response?: {
    numFound?: number;
    docs?: Array<{
      identifier?: string;
      title?: string | string[];
      creator?: string | string[];
      subject?: string | string[];
      licenseurl?: string | string[];
      date?: string;
      year?: string;
      album?: string | string[];
    }>;
  };
  error?: string;
}

interface ArchiveFile {
  name?: string;
  format?: string;
  source?: string;
  size?: string;
  length?: string;
  bitrate?: string;
  sample_rate?: string;
  bitdepth?: string;
}

interface ArchiveMetadataResponse {
  metadata?: {
    mediatype?: string;
    title?: string | string[];
    creator?: string | string[];
    licenseurl?: string | string[];
    date?: string;
    year?: string;
    album?: string | string[];
  };
  files?: ArchiveFile[];
  error?: string;
}

export const LICENSES: ReadonlyArray<{ url: string; label: string }> = [
  { url: "https://creativecommons.org/licenses/by/4.0/", label: "CC BY 4.0" },
  { url: "https://creativecommons.org/licenses/by/3.0/", label: "CC BY 3.0" },
  { url: "https://creativecommons.org/licenses/by/2.0/", label: "CC BY 2.0" },
  { url: "https://creativecommons.org/licenses/by-sa/4.0/", label: "CC BY-SA 4.0" },
  { url: "https://creativecommons.org/licenses/by-sa/3.0/", label: "CC BY-SA 3.0" },
  { url: "https://creativecommons.org/licenses/by-sa/2.0/", label: "CC BY-SA 2.0" },
  { url: "https://creativecommons.org/licenses/by-nd/4.0/", label: "CC BY-ND 4.0" },
  { url: "https://creativecommons.org/licenses/by-nd/3.0/", label: "CC BY-ND 3.0" },
  { url: "https://creativecommons.org/licenses/by-nd/2.0/", label: "CC BY-ND 2.0" },
  { url: "https://creativecommons.org/publicdomain/zero/1.0/", label: "CC0 1.0" },
  { url: "https://creativecommons.org/publicdomain/mark/1.0/", label: "Public Domain Mark" },
];

const AUDIO_FORMATS: ReadonlyArray<{ pattern: RegExp; label: string; score: number }> = [
  { pattern: /flac/i, label: "FLAC", score: 100 },
  { pattern: /wave|wav|pcm/i, label: "WAV", score: 90 },
  { pattern: /ogg|opus/i, label: "OGG", score: 70 },
  { pattern: /aac|m4a|mp4 audio/i, label: "AAC", score: 60 },
  { pattern: /mpeg|mp3/i, label: "MP3", score: 50 },
];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function licenseLabel(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const normalized = url.trim().replace(/^http:/i, "https:").replace(/\/?$/, "/").toLowerCase();
  return LICENSES.find((license) => license.url.toLowerCase() === normalized)?.label;
}

export function isPermittedLicense(url: string | undefined): url is string {
  return licenseLabel(url) !== undefined;
}

function escapeLucene(value: string): string {
  return value.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&");
}

function getAudioFormat(file: ArchiveFile): (typeof AUDIO_FORMATS)[number] | undefined {
  if (file.source === "metadata" || !file.name) return undefined;
  return AUDIO_FORMATS.find(
    (candidate) =>
      candidate.pattern.test(file.format ?? "") ||
      candidate.pattern.test(file.name ?? ""),
  );
}

function getMediaType(format: string, filename: string): string {
  if (format === "FLAC") return "audio/flac";
  if (format === "WAV") return "audio/wav";
  if (format === "OGG") return filename.toLowerCase().endsWith(".opus") ? 'audio/ogg; codecs="opus"' : "audio/ogg";
  if (/\.m4a$/i.test(filename)) return "audio/mp4";
  if (/\.aac$/i.test(filename)) return "audio/aac";
  return "audio/mpeg";
}

function numeric(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function formattedBitrate(file: ArchiveFile): string | undefined {
  const given = numeric(file.bitrate);
  if (given) return `${Math.round(given)} kb/s`;
  const size = numeric(file.size);
  const duration = numeric(file.length);
  if (size && duration) return `~${Math.round((size * 8) / duration / 1000)} kb/s (file estimate)`;
  return undefined;
}

function averageBitrate(file: ArchiveFile): number | undefined {
  const given = numeric(file.bitrate);
  if (given) return given;
  const size = numeric(file.size);
  const duration = numeric(file.length);
  return size && duration ? (size * 8) / duration / 1000 : undefined;
}

function fileScore(file: ArchiveFile, mode: QualityMode): number {
  const format = getAudioFormat(file);
  if (!format) return -Infinity;
  const rate = averageBitrate(file);
  const codec = format.score;
  if (mode === "low") return (rate ? Math.max(0, 220 - rate) : 40) + (codec <= 70 ? 30 : 0);
  if (mode === "balanced") {
    return (rate ? 100 - Math.abs(rate - 160) : 30) + (codec < 90 ? 20 : 0);
  }
  return codec + (rate ? Math.min(rate, 1500) / 10 : 0);
}

function chooseFile(files: ArchiveFile[], mode: QualityMode): ArchiveFile | undefined {
  return files
    .filter((file) => getAudioFormat(file))
    .sort((a, b) => fileScore(b, mode) - fileScore(a, mode))[0];
}

function archiveFileUrl(identifier: string, filename: string): string {
  const encodedName = filename.split("/").map(encodeURIComponent).join("/");
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodedName}`;
}

export async function searchArchive(
  term: string,
  page: number,
  signal?: AbortSignal,
): Promise<{ tracks: ArchiveRecord[]; total: number }> {
  const licenses = LICENSES
    .flatMap((license) => [license.url, license.url.replace(/^https:/i, "http:")])
    .map((url) => `licenseurl:"${url}"`)
    .join(" OR ");
  const words = term.trim().split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
  const textQuery = words
    .map((word) => {
      const escaped = escapeLucene(word);
      return `(title:"${escaped}" OR creator:"${escaped}" OR album:"${escaped}" OR subject:"${escaped}")`;
    })
    .join(" AND ");
  const query = `mediatype:audio AND subject:music AND (${licenses})${textQuery ? ` AND ${textQuery}` : ""}`;
  const params = new URLSearchParams({
    q: query,
    fl: "identifier,title,creator,album,licenseurl,date,year",
    rows: "24",
    page: String(page),
    output: "json",
  });
  const response = await fetch(`https://archive.org/advancedsearch.php?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Internet Archive search failed (HTTP ${response.status}).`);
  const payload = (await response.json()) as ArchiveSearchResponse;
  if (payload.error) throw new Error(`Internet Archive search failed: ${payload.error}`);
  const docs = payload.response?.docs ?? [];
  const tracks = docs.flatMap((doc) => {
    const licenseUrl = first(doc.licenseurl);
    const id = doc.identifier;
    if (!id || !isPermittedLicense(licenseUrl)) return [];
    return [{
      id,
      title: first(doc.title) || "Untitled recording",
      creator: first(doc.creator) || "Artist not listed",
      licenseUrl,
      date: doc.date || doc.year,
      album: first(doc.album),
    }];
  });
  return { tracks, total: payload.response?.numFound ?? tracks.length };
}

export async function resolveArchiveTrack(
  record: ArchiveRecord,
  mode: QualityMode,
  signal?: AbortSignal,
): Promise<ResolvedTrack> {
  const response = await fetch(`https://archive.org/metadata/${encodeURIComponent(record.id)}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Could not verify this recording (HTTP ${response.status}).`);
  const item = (await response.json()) as ArchiveMetadataResponse;
  if (item.error) throw new Error(`Could not verify this recording: ${item.error}`);
  const metadata = item.metadata;
  if (metadata?.mediatype !== "audio" || !isPermittedLicense(first(metadata.licenseurl))) {
    throw new Error("This Archive item does not have a supported audio license; playback is blocked.");
  }
  const file = chooseFile(item.files ?? [], mode);
  if (!file?.name) {
    throw new Error("No supported audio file is listed for this recording.");
  }
  const format = getAudioFormat(file);
  if (!format) throw new Error("The source file format is not supported.");
  const metadataLicense = first(metadata.licenseurl);
  if (!metadataLicense) throw new Error("The item's license could not be verified.");
  const size = numeric(file.size);
  return {
    ...record,
    title: first(metadata.title) || record.title,
    creator: first(metadata.creator) || record.creator,
    licenseUrl: metadataLicense,
    date: metadata.date || metadata.year || record.date,
    album: first(metadata.album) || record.album,
    src: archiveFileUrl(record.id, file.name),
    sourceUrl: `https://archive.org/details/${encodeURIComponent(record.id)}`,
    format: format.label,
    mediaType: getMediaType(format.label, file.name),
    bitrate: formattedBitrate(file),
    sampleRate: file.sample_rate,
    bitDepth: file.bitdepth,
    fileSize: size,
    duration: numeric(file.length),
  };
}
