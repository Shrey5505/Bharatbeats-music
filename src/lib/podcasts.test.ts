import { describe, expect, it, vi } from "vitest";
import { fetchPodcastEpisodes, searchPodcasts } from "./podcasts";

describe("podcast directory and RSS adapter", () => {
  it("searches Apple's India directory and returns only published series", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      results: [{
        collectionId: 22,
        trackName: "History of India",
        artistName: "Publisher",
        collectionViewUrl: "https://podcasts.apple.com/in/podcast/history/id22",
        feedUrl: "https://publisher.example/feed.xml",
      }],
    }), { status: 200 }));
    const series = await searchPodcasts("history");
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("country")).toBe("in");
    expect(series[0]?.title).toBe("History of India");
  });

  it("does not enable episode playback when the RSS feed declares no compatible license", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      `<rss><channel><item><title>Episode 1</title><description>Episode notes</description><enclosure url="https://publisher.example/audio.mp3" type="audio/mpeg"/></item></channel></rss>`,
      { status: 200, headers: { "Content-Type": "application/rss+xml" } },
    ));
    const episodes = await fetchPodcastEpisodes({
      id: 22,
      title: "Show",
      publisher: "Publisher",
      pageUrl: "https://podcasts.apple.com/in/podcast/history/id22",
      feedUrl: "https://publisher.example/feed.xml",
    });
    expect(episodes[0]?.title).toBe("Episode 1");
    expect(episodes[0]?.audioUrl).toBeUndefined();
  });

  it("plays an HTTPS episode only when its RSS metadata declares an allowed license", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      `<rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
        <channel>
          <podcast:license url="https://creativecommons.org/licenses/by/4.0/"/>
          <item>
            <title>Licensed episode</title>
            <description>Episode notes</description>
            <itunes:duration>01:02:03</itunes:duration>
            <enclosure url="https://publisher.example/audio.mp3" type="audio/mpeg"/>
          </item>
        </channel>
      </rss>`,
      { status: 200, headers: { "Content-Type": "application/rss+xml" } },
    ));
    const episodes = await fetchPodcastEpisodes({
      id: 22,
      title: "Show",
      publisher: "Publisher",
      pageUrl: "https://podcasts.apple.com/in/podcast/history/id22",
      feedUrl: "https://publisher.example/feed.xml",
    });
    expect(episodes[0]?.audioUrl).toBe("https://publisher.example/audio.mp3");
    expect(episodes[0]?.mediaType).toBe("audio/mpeg");
    expect(episodes[0]?.licenseUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(episodes[0]?.duration).toBe("01:02:03");
  });

  it("does not stream RSS enclosure audio over plain HTTP", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      `<rss xmlns:podcast="https://podcastindex.org/namespace/1.0">
        <channel><podcast:license url="https://creativecommons.org/licenses/by/4.0/"/>
          <item><title>Episode</title><enclosure url="http://publisher.example/audio.mp3" type="audio/mpeg"/></item>
        </channel>
      </rss>`,
      { status: 200 },
    ));
    const episodes = await fetchPodcastEpisodes({
      id: 22,
      title: "Show",
      publisher: "Publisher",
      pageUrl: "https://podcasts.apple.com/in/podcast/history/id22",
      feedUrl: "https://publisher.example/feed.xml",
    });
    expect(episodes[0]?.audioUrl).toBeUndefined();
  });
});
