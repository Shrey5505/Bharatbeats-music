import { describe, expect, it, vi } from "vitest";
import { isPermittedLicense, licenseLabel, resolveArchiveTrack, searchArchive } from "./archive";

describe("Internet Archive licensing", () => {
  it("accepts only explicitly listed playback licenses", () => {
    expect(licenseLabel("http://creativecommons.org/licenses/by/4.0")).toBe("CC BY 4.0");
    expect(isPermittedLicense("https://creativecommons.org/publicdomain/zero/1.0/")).toBe(true);
    expect(isPermittedLicense("https://creativecommons.org/licenses/by-nc/4.0/")).toBe(false);
    expect(isPermittedLicense(undefined)).toBe(false);
  });

  it("searches the Archive with encoded license restrictions and pagination", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      response: {
        numFound: 1,
        docs: [
          { identifier: "verified-recording", title: "Raga", creator: "Artist", licenseurl: "https://creativecommons.org/licenses/by/4.0/" },
          { identifier: "unlicensed-recording", title: "Unlicensed", licenseurl: "https://creativecommons.org/licenses/by-nc/4.0/" },
        ],
      },
    }), { status: 200 }));
    const result = await searchArchive("Raga", 2);
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.searchParams.get("page")).toBe("2");
    expect(requestUrl.searchParams.get("q")).toContain("licenseurl:");
    expect(requestUrl.searchParams.get("q")).toContain("subject:music");
    expect(result.tracks[0]?.id).toBe("verified-recording");
    expect(result.total).toBe(1);
  });

  it("requires item metadata to confirm a real supported audio file before playback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      metadata: {
        mediatype: "audio",
        title: "Verified recording",
        creator: "Artist",
        licenseurl: "https://creativecommons.org/licenses/by/4.0/",
      },
      files: [{ name: "actual track.mp3", format: "VBR MP3", size: "3600000", length: "180", source: "original" }],
    }), { status: 200 }));
    const resolved = await resolveArchiveTrack({
      id: "verified-recording",
      title: "Archive title",
      creator: "Archive artist",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    }, "low");
    expect(resolved.src).toBe("https://archive.org/download/verified-recording/actual%20track.mp3");
    expect(resolved.bitrate).toContain("file estimate");
    expect(resolved.sourceUrl).toBe("https://archive.org/details/verified-recording");
  });

  it("blocks a supported audio file when its actual item license is not allowed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      metadata: { mediatype: "audio", licenseurl: "https://creativecommons.org/licenses/by-nc/4.0/" },
      files: [{ name: "track.mp3", format: "MP3" }],
    }), { status: 200 }));
    await expect(resolveArchiveTrack({
      id: "unverified", title: "Track", creator: "Artist", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    }, "balanced")).rejects.toThrow("license; playback is blocked");
  });

  it("selects a smaller stream in Low Data mode and the best listed format in Best Available mode", async () => {
    const metadata = JSON.stringify({
      metadata: { mediatype: "audio", licenseurl: "https://creativecommons.org/licenses/by/4.0/" },
      files: [
        { name: "recording.mp3", format: "VBR MP3", size: "1800000", length: "180", source: "original" },
        { name: "recording.flac", format: "FLAC", size: "18000000", length: "180", bitdepth: "24", sample_rate: "96000", source: "original" },
      ],
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(new Response(metadata, { status: 200 })));
    const record = {
      id: "quality-test",
      title: "Recording",
      creator: "Artist",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    };
    expect((await resolveArchiveTrack(record, "low")).format).toBe("MP3");
    const best = await resolveArchiveTrack(record, "best");
    expect(best.format).toBe("FLAC");
    expect(best.sampleRate).toBe("96000");
    expect(best.bitDepth).toBe("24");
  });

  it("does not create a playback URL when the item has no supported audio file", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      metadata: { mediatype: "audio", licenseurl: "https://creativecommons.org/licenses/by/4.0/" },
      files: [{ name: "cover.jpg", format: "JPEG", source: "original" }],
    }), { status: 200 }));
    await expect(resolveArchiveTrack({
      id: "no-audio",
      title: "Recording",
      creator: "Artist",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    }, "balanced")).rejects.toThrow("No supported audio file");
  });
});
