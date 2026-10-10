export interface PodcastSeries {
  id: number;
  title: string;
  publisher: string;
  artwork?: string;
  pageUrl: string;
  feedUrl?: string;
}

export interface PodcastEpisode {
  id: string;
  title: string;
  description: string;
  releasedAt?: string;
  duration?: string;
  audioUrl?: string;
  mediaType?: string;
  licenseUrl?: string;
}

interface ApplePodcastSearch {
  results?: Array<{
    collectionId?: number;
    trackName?: string;
    collectionName?: string;
    artistName?: string;
    artworkUrl100?: string;
    collectionViewUrl?: string;
    feedUrl?: string;
  }>;
}

const PODCAST_LICENSES = [
  "https://creativecommons.org/licenses/by/4.0/",
  "https://creativecommons.org/licenses/by-sa/4.0/",
  "https://creativecommons.org/licenses/by-nd/4.0/",
  "https://creativecommons.org/publicdomain/zero/1.0/",
  "https://creativecommons.org/publicdomain/mark/1.0/",
];

function explicitLicense(feed: Document): string | undefined {
  const element = feed.getElementsByTagNameNS("*", "license").item(0);
  if (!element) return undefined;
  const declared = element.getAttribute("url") || element.textContent?.trim();
  if (!declared) return undefined;
  const normalized = declared.replace(/^http:/i, "https:").replace(/\/?$/, "/").toLowerCase();
  return PODCAST_LICENSES.find((license) => license.toLowerCase() === normalized);
}

function text(element: Element, selector: string): string {
  return element.getElementsByTagName(selector).item(0)?.textContent?.trim() ?? "";
}

function textByLocalName(element: Element, localName: string, fallback: string): string {
  return element.getElementsByTagNameNS("*", localName).item(0)?.textContent?.trim()
    ?? text(element, fallback);
}

function childrenByLocalName(element: Document | Element, localName: string, fallback: string): Element[] {
  const namespaced = Array.from(element.getElementsByTagNameNS("*", localName));
  return namespaced.length ? namespaced : Array.from(element.getElementsByTagName(fallback));
}

export async function searchPodcasts(term: string, signal?: AbortSignal): Promise<PodcastSeries[]> {
  const params = new URLSearchParams({
    term: term.trim() || "India",
    media: "podcast",
    entity: "podcast",
    country: "in",
    limit: "24",
  });
  const response = await fetch(`https://itunes.apple.com/search?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Podcast directory request failed (HTTP ${response.status}).`);
  const payload = (await response.json()) as ApplePodcastSearch;
  return (payload.results ?? []).flatMap((result) => {
    const id = result.collectionId;
    const pageUrl = result.collectionViewUrl;
    if (!id || !pageUrl) return [];
    return [{
      id,
      title: result.trackName || result.collectionName || "Untitled podcast",
      publisher: result.artistName || "Publisher not listed",
      artwork: result.artworkUrl100,
      pageUrl,
      feedUrl: result.feedUrl,
    }];
  });
}

export async function fetchPodcastEpisodes(
  series: PodcastSeries,
  signal?: AbortSignal,
): Promise<PodcastEpisode[]> {
  if (!series.feedUrl) throw new Error("This publisher has not listed a public RSS feed.");
  const response = await fetch(series.feedUrl, { signal });
  if (!response.ok) throw new Error(`Publisher RSS feed failed (HTTP ${response.status}).`);
  const xml = new DOMParser().parseFromString(await response.text(), "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("The publisher's RSS feed is not valid XML.");
  const licenseUrl = explicitLicense(xml);
  return childrenByLocalName(xml, "item", "item").map((item, index) => {
    const enclosure = childrenByLocalName(item, "enclosure", "enclosure")[0];
    const enclosureUrl = enclosure?.getAttribute("url");
    const enclosureType = enclosure?.getAttribute("type")?.toLowerCase();
    const declaredType = enclosureType?.split(";")[0];
    const extension = enclosureUrl?.match(/\.(mp3|m4a|aac|ogg|opus|wav|flac)(?:$|\?)/i)?.[1]?.toLowerCase();
    const extensionType: Record<string, string> = {
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      aac: "audio/aac",
      ogg: "audio/ogg",
      opus: 'audio/ogg; codecs="opus"',
      wav: "audio/wav",
      flac: "audio/flac",
    };
    const mediaType = declaredType?.startsWith("audio/") ? declaredType : extension ? extensionType[extension] : undefined;
    let audioUrl: string | undefined;
    if (licenseUrl && enclosureUrl && mediaType && /^(audio\/(mpeg|mp3|aac|mp4|ogg|opus|wav|x-wav|flac))$/.test(mediaType.split(";")[0])) {
      try {
        const candidate = new URL(enclosureUrl, series.feedUrl);
        if (candidate.protocol === "https:") audioUrl = candidate.href;
      } catch {
        audioUrl = undefined;
      }
    }
    const releasedAt = textByLocalName(item, "pubDate", "pubDate") || undefined;
    const duration = textByLocalName(item, "duration", "duration") || undefined;
    return {
      id: `${series.id}-${index}-${releasedAt ?? ""}`,
      title: textByLocalName(item, "title", "title") || "Untitled episode",
      description: textByLocalName(item, "description", "description") || textByLocalName(item, "encoded", "content:encoded"),
      releasedAt,
      duration,
      audioUrl,
      mediaType,
      licenseUrl,
    };
  });
}
