import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AudioLines,
  Check,
  ChevronDown,
  CircleHelp,
  Disc3,
  ExternalLink,
  Headphones,
  Heart,
  Home,
  ListMusic,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat,
  Repeat1,
  RotateCcw,
  Search,
  SkipBack,
  SkipForward,
  Shuffle,
  Signal,
  Volume2,
  X,
} from "lucide-react";
import {
  isPermittedLicense,
  licenseLabel,
  resolveArchiveTrack,
  searchArchive,
  type ArchiveRecord,
  type QualityMode,
  type ResolvedTrack,
} from "./lib/archive";
import { EMPTY_LIBRARY, readLibrary, writeLibrary, type LibraryState } from "./lib/library";
import {
  fetchPodcastEpisodes,
  searchPodcasts,
  type PodcastEpisode,
  type PodcastSeries,
} from "./lib/podcasts";
import { RightsReviewDialog } from "./components/RightsReviewDialog";

type View = "home" | "radio" | "podcasts" | "library";
type RepeatMode = "off" | "all" | "one";
type ReviewRequest = { record: ArchiveRecord; queue?: ArchiveRecord[]; index?: number };

const CATEGORIES = [
  "Hindi / Bollywood", "Marathi", "Punjabi", "Tamil", "Telugu", "Malayalam", "Kannada",
  "Bengali", "Gujarati", "Bhojpuri", "Odia", "Assamese", "Indian classical", "Folk",
  "Sufi", "Ghazals", "Bhajans", "Aartis", "Instrumental", "Meditation", "Patriotic",
  "Indie music", "Children's music",
];

const LISTENING_CATEGORIES = ["Indian FM radio", "Podcasts from India", "News", "Stories", "Education", "Entertainment"];
const AIR_STATIONS = ["Vividh Bharati", "FM Gold", "FM Rainbow", "Regional stations"];
const AKASHVANI_LIVE_PAGE = "https://akashvani.gov.in/radio/live.php";

const ERROR_COPY =
  "Playback could not start. The source may be unavailable, blocked by CORS, or use a codec this browser cannot play.";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function recordFromResolved(track: ResolvedTrack): ArchiveRecord {
  return {
    id: track.id,
    title: track.title,
    creator: track.creator,
    licenseUrl: track.licenseUrl,
    date: track.date,
    album: track.album,
  };
}

function artworkUrl(record: ArchiveRecord): string {
  return `https://archive.org/services/img/${encodeURIComponent(record.id)}`;
}

function App() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const restorePosition = useRef<number | undefined>(undefined);
  const savedPosition = useRef(0);
  const resolutionSequence = useRef(0);
  const episodeController = useRef<AbortController | undefined>(undefined);
  const [library, setLibrary] = useState<LibraryState>(EMPTY_LIBRARY);
  const [libraryReady, setLibraryReady] = useState(false);
  const [view, setView] = useState<View>("home");
  const [searchInput, setSearchInput] = useState("");
  const [archiveQuery, setArchiveQuery] = useState("");
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<ArchiveRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [musicLoading, setMusicLoading] = useState(true);
  const [podcastInput, setPodcastInput] = useState("");
  const [podcastQuery, setPodcastQuery] = useState("");
  const [podcastLoading, setPodcastLoading] = useState(false);
  const [podcastSeries, setPodcastSeries] = useState<PodcastSeries[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<PodcastSeries>();
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<ResolvedTrack>();
  const [queue, setQueue] = useState<ArchiveRecord[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [pendingPlay, setPendingPlay] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [playlistName, setPlaylistName] = useState("");
  const [showPlaylistForm, setShowPlaylistForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showQueue, setShowQueue] = useState(false);
  const [reviewRequest, setReviewRequest] = useState<ReviewRequest>();
  const [confirmedRecords, setConfirmedRecords] = useState<Set<string>>(() => new Set());
  const [volume, setVolume] = useState(0.8);
  const moveQueueRef = useRef<(step: number) => void>(() => undefined);

  useEffect(() => {
    let alive = true;
    readLibrary()
      .then((saved) => {
        if (!alive) return;
        setLibrary(saved);
        setLibraryReady(true);
      })
      .catch((reason: unknown) => {
        if (!alive) return;
        setError(reason instanceof Error ? reason.message : "Could not load your saved library.");
        setLibraryReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!libraryReady) return;
    writeLibrary(library).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not save your library.");
    });
  }, [library, libraryReady]);

  useEffect(() => {
    if (view !== "home") return;
    const controller = new AbortController();
    setMusicLoading(true);
    searchArchive(archiveQuery, page, controller.signal)
      .then(({ tracks, total: resultTotal }) => {
        setRecords((existing) => page === 1 ? tracks : [...existing, ...tracks]);
        setTotal(resultTotal);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Music search failed.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setMusicLoading(false);
      });
    return () => controller.abort();
  }, [archiveQuery, page, view]);

  useEffect(() => {
    if (view !== "podcasts") return;
    const controller = new AbortController();
    setPodcastLoading(true);
    searchPodcasts(podcastQuery, controller.signal)
      .then(setPodcastSeries)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Podcast search failed.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPodcastLoading(false);
      });
    return () => controller.abort();
  }, [podcastQuery, view]);

  useEffect(() => {
    if (!currentTrack) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.load();
    const play = () => {
      if (restorePosition.current !== undefined) {
        audio.currentTime = Number.isFinite(audio.duration)
          ? Math.min(restorePosition.current, audio.duration)
          : restorePosition.current;
        restorePosition.current = undefined;
      }
      audio.play()
        .then(() => {
          setPlaying(true);
          setPendingPlay(false);
          setError("");
        })
        .catch(() => {
          setPlaying(false);
          setPendingPlay(false);
          setError(ERROR_COPY);
        });
    };
    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) play();
    else {
      setPendingPlay(true);
      audio.addEventListener("canplay", play, { once: true });
      return () => audio.removeEventListener("canplay", play);
    }
  }, [currentTrack]);

  useEffect(() => {
    if (!currentTrack || !("mediaSession" in navigator)) return;
    if (typeof MediaMetadata !== "undefined") {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.creator,
        album: currentTrack.id.startsWith("podcast-") ? "BharatBeats · Podcast" : "BharatBeats · Internet Archive",
        artwork: [{ src: currentTrack.artwork || artworkUrl(recordFromResolved(currentTrack)), sizes: "512x512", type: "image/jpeg" }],
      });
    }
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => audioRef.current?.play().catch(() => setError(ERROR_COPY))],
      ["pause", () => audioRef.current?.pause()],
      ["nexttrack", () => moveQueueRef.current(1)],
      ["previoustrack", () => {
        const audio = audioRef.current;
        if (audio && audio.currentTime > 3) audio.currentTime = 0;
        else if (!queue.length && audio) audio.currentTime = 0;
        else moveQueueRef.current(-1);
      }],
      ["seekto", (details) => {
        if (details.seekTime !== undefined && audioRef.current) audioRef.current.currentTime = details.seekTime;
      }],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some browsers implement only a subset of Media Session actions.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // A removed or unsupported action needs no fallback.
        }
      }
    };
  }, [currentTrack, playing, queue.length]);

  useEffect(() => {
    if (!currentTrack || !("mediaSession" in navigator) || !duration) return;
    try {
      navigator.mediaSession.setPositionState({ duration, playbackRate: 1, position: Math.min(currentTime, duration) });
    } catch {
      // Position state is optional and not supported in every browser.
    }
  }, [currentTime, currentTrack, duration]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const playableRecords = useMemo(() => records, [records]);
  const isFavorite = useCallback((id: string) => library.favorites.some((record) => record.id === id), [library.favorites]);

  const resolveAndPlay = useCallback(async (
    record: ArchiveRecord,
    selectedQueue?: ArchiveRecord[],
    index?: number,
  ) => {
    const requestId = ++resolutionSequence.current;
    setBuffering(true);
    setError("");
    try {
      const resolved = await resolveArchiveTrack(record, library.quality);
      const audio = audioRef.current;
      if (audio && !audio.canPlayType(resolved.mediaType)) {
        throw new Error(`This browser does not report support for the verified ${resolved.format} audio codec.`);
      }
      if (requestId !== resolutionSequence.current) return;
      if (selectedQueue) {
        setQueue(selectedQueue);
        setQueueIndex(index ?? selectedQueue.findIndex((item) => item.id === record.id));
      }
      setCurrentTime(0);
      setDuration(resolved.duration ?? 0);
      setCurrentTrack(resolved);
      restorePosition.current = library.lastTrack?.id === record.id ? library.lastPosition : undefined;
      savedPosition.current = library.lastTrack?.id === record.id ? library.lastPosition : 0;
      setLibrary((previous) => ({
        ...previous,
        lastTrack: recordFromResolved(resolved),
        recent: [recordFromResolved(resolved), ...previous.recent.filter((item) => item.id !== record.id)].slice(0, 30),
        lastPosition: library.lastTrack?.id === record.id ? library.lastPosition : 0,
      }));
      setPendingPlay(true);
    } catch (reason) {
      if (requestId === resolutionSequence.current) {
        setError(reason instanceof Error ? reason.message : "This recording could not be verified.");
      }
    } finally {
      if (requestId === resolutionSequence.current) setBuffering(false);
    }
  }, [library.lastPosition, library.lastTrack, library.quality]);

  const requestPlay = useCallback((record: ArchiveRecord, selectedQueue?: ArchiveRecord[], index?: number) => {
    if (confirmedRecords.has(record.id)) {
      void resolveAndPlay(record, selectedQueue, index);
      return;
    }
    audioRef.current?.pause();
    setReviewRequest({ record, queue: selectedQueue, index });
  }, [confirmedRecords, resolveAndPlay]);

  const confirmReviewedRights = () => {
    if (!reviewRequest) return;
    const request = reviewRequest;
    setConfirmedRecords((previous) => new Set(previous).add(request.record.id));
    setReviewRequest(undefined);
    void resolveAndPlay(request.record, request.queue, request.index);
  };

  const moveQueue = useCallback((step: number) => {
    if (repeat === "one" && step === 1) {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => setError(ERROR_COPY));
      }
      return;
    }
    if (!queue.length) {
      if (step < 0 && audioRef.current) audioRef.current.currentTime = 0;
      return;
    }
    let next = queueIndex + step;
    if (shuffle && step === 1 && queue.length > 1) {
      next = Math.floor(Math.random() * queue.length);
      if (next === queueIndex) next = (next + 1) % queue.length;
    } else if (next >= queue.length && repeat === "all") next = 0;
    if (next < 0 || next >= queue.length) {
      if (step === 1) setPlaying(false);
      return;
    }
    requestPlay(queue[next], queue, next);
  }, [queue, queueIndex, repeat, shuffle, requestPlay]);

  useEffect(() => {
    moveQueueRef.current = moveQueue;
  }, [moveQueue]);

  const previousTrack = useCallback(() => {
    if (audioRef.current && currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    moveQueue(-1);
  }, [currentTime, moveQueue]);

  const playFromList = (list: ArchiveRecord[], index: number) => {
    const record = list[index];
    if (record) requestPlay(record, list, index);
  };

  const playPodcast = (episode: PodcastEpisode) => {
    if (!episode.audioUrl || !episode.licenseUrl || !isPermittedLicense(episode.licenseUrl) || !selectedSeries) return;
    const mediaType = episode.mediaType ?? "audio/mpeg";
    if (audioRef.current && !audioRef.current.canPlayType(mediaType)) {
      setError(`This browser does not report support for the podcast's ${mediaType} codec.`);
      return;
    }
    resolutionSequence.current += 1;
    setBuffering(true);
    setError("");
    const podcastTrack: ResolvedTrack = {
      id: `podcast-${episode.id}`,
      title: episode.title,
      creator: selectedSeries.publisher,
      licenseUrl: episode.licenseUrl,
      src: episode.audioUrl,
      sourceUrl: selectedSeries.pageUrl,
      artwork: selectedSeries.artwork,
      format: "Publisher RSS audio",
      mediaType,
      bitrate: undefined,
    };
    setQueue([]);
    setQueueIndex(-1);
    setCurrentTime(0);
    setDuration(0);
    setCurrentTrack(podcastTrack);
    setPendingPlay(true);
    setBuffering(false);
  };

  const toggleFavorite = (record: ArchiveRecord) => {
    setLibrary((previous) => ({
      ...previous,
      favorites: previous.favorites.some((item) => item.id === record.id)
        ? previous.favorites.filter((item) => item.id !== record.id)
        : [record, ...previous.favorites],
    }));
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (view === "podcasts") {
      setPodcastQuery(podcastInput.trim());
      setSelectedSeries(undefined);
      setEpisodes([]);
      return;
    }
    setView("home");
    setArchiveQuery(searchInput.trim());
    setPage(1);
  };

  const browseCategory = (category: string) => {
    if (category === "Indian FM radio") {
      setView("radio");
      return;
    }
    if (category === "Podcasts from India" || ["News", "Stories", "Education", "Entertainment"].includes(category)) {
      setView("podcasts");
      setPodcastInput(category === "Podcasts from India" ? "" : category);
      setPodcastQuery(category === "Podcasts from India" ? "" : category);
      return;
    }
    setView("home");
    setSearchInput(category);
    setArchiveQuery(category);
    setPage(1);
  };

  const loadMore = () => {
    if (!musicLoading && page * 24 < total) setPage((value) => value + 1);
  };

  const loadEpisodes = async (series: PodcastSeries) => {
    episodeController.current?.abort();
    const controller = new AbortController();
    episodeController.current = controller;
    setSelectedSeries(series);
    setEpisodes([]);
    setEpisodesLoading(true);
    setError("");
    try {
      setEpisodes(await fetchPodcastEpisodes(series, controller.signal));
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "The publisher feed could not be loaded.");
    } finally {
      if (!controller.signal.aborted) setEpisodesLoading(false);
    }
  };

  const createPlaylist = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = playlistName.trim();
    if (!name) return;
    setLibrary((previous) => ({
      ...previous,
      playlists: [...previous.playlists, { id: crypto.randomUUID(), name, tracks: [] }],
    }));
    setPlaylistName("");
    setShowPlaylistForm(false);
  };

  const addToPlaylist = (playlistId: string, record: ArchiveRecord) => {
    setLibrary((previous) => ({
      ...previous,
      playlists: previous.playlists.map((playlist) =>
        playlist.id === playlistId && !playlist.tracks.some((track) => track.id === record.id)
          ? { ...playlist, tracks: [...playlist.tracks, record] }
          : playlist,
      ),
    }));
    setNotice("Added to playlist");
    window.setTimeout(() => setNotice(""), 2200);
  };

  const setQuality = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setLibrary((previous) => ({ ...previous, quality: event.target.value as QualityMode }));
  };

  const switchView = (next: View) => {
    setView(next);
    if (next === "library") setShowPlaylistForm(false);
  };

  const trackList = (list: ArchiveRecord[], emptyText: string) => {
    if (!list.length) return <div className="empty-state"><Music2 size={22} /><p>{emptyText}</p></div>;
    return (
      <div className="track-list">
        {list.map((record, index) => (
          <TrackRow
            key={`${record.id}-${index}`}
            record={record}
            active={currentTrack?.id === record.id}
            playing={playing && currentTrack?.id === record.id}
            favorite={isFavorite(record.id)}
            playlists={library.playlists}
            onPlay={() => playFromList(list, index)}
            onFavorite={() => toggleFavorite(record)}
            onAddToPlaylist={(id) => addToPlaylist(id, record)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => switchView("home")} aria-label="BharatBeats home">
          <span className="brand-mark"><AudioLines size={23} /></span>
          <span>Bharat<span className="brand-accent">Beats</span></span>
        </button>
        <form className="search-form" onSubmit={handleSearch} role="search">
          <Search size={19} aria-hidden="true" />
          <input
            aria-label={view === "podcasts" ? "Search Indian podcasts" : "Search openly licensed music"}
            placeholder={view === "podcasts" ? "Search Indian podcasts..." : "Search artists, songs, genres..."}
            value={view === "podcasts" ? podcastInput : searchInput}
            onChange={(event) => view === "podcasts" ? setPodcastInput(event.target.value) : setSearchInput(event.target.value)}
          />
          <button type="submit" aria-label="Search"><Search size={17} /></button>
        </form>
        <label className="quality-picker">
          <Signal size={16} aria-hidden="true" />
          <span className="sr-only">Audio data quality</span>
          <select aria-label="Audio quality mode" value={library.quality} onChange={setQuality}>
            <option value="low">Low Data</option>
            <option value="balanced">Balanced</option>
            <option value="best">Best available</option>
          </select>
          <ChevronDown size={13} aria-hidden="true" />
        </label>
      </header>

      <aside className="sidebar" aria-label="Main navigation">
        <nav>
          <NavButton active={view === "home"} onClick={() => switchView("home")} icon={<Home size={19} />}>Home</NavButton>
          <NavButton active={view === "radio"} onClick={() => switchView("radio")} icon={<Radio size={19} />}>Radio</NavButton>
          <NavButton active={view === "podcasts"} onClick={() => switchView("podcasts")} icon={<Headphones size={19} />}>Podcasts</NavButton>
          <NavButton active={view === "library"} onClick={() => switchView("library")} icon={<ListMusic size={19} />}>Your library</NavButton>
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          <p>Open sources only.<br /><span>No pirated music.</span></p>
        </div>
      </aside>

      <main className="main-content">
        {error && (
          <div className="notice notice-error" role="alert">
            <CircleHelp size={17} /><span>{error}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => setError("")}><X size={16} /></button>
          </div>
        )}
        {notice && <div className="notice notice-success" role="status"><Check size={16} />{notice}</div>}

        {view === "home" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow"><span className="eyebrow-line" /> MUSIC, WITH PERMISSION</div>
                <h1>India sounds<br />like <span>this.</span></h1>
                <p>Find openly licensed recordings, radio and stories from across India. Every playable track links back to its source.</p>
                <button className="primary-button" type="button" onClick={() => document.getElementById("discover")?.scrollIntoView({ behavior: "smooth" })}>
                  <Play size={16} fill="currentColor" /> Explore music
                </button>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="hero-disc"><div className="disc-center"><AudioLines size={39} /></div></div>
                <span className="hero-label">SOUNDS OF<br />THE SUBCONTINENT</span>
                <span className="hero-spark spark-one">✳</span><span className="hero-spark spark-two">✳</span>
              </div>
            </section>

            <section className="section-block" id="discover">
              <div className="section-heading">
                <div><p className="eyebrow">FIND YOUR FREQUENCY</p><h2>Explore India</h2></div>
                <span className="section-caption">Browse a region, mood or tradition</span>
              </div>
              <div className="category-grid">
                {CATEGORIES.map((category, index) => (
                  <button type="button" className={`category-tile tone-${index % 6}`} key={category} onClick={() => browseCategory(category)}>
                    <span className="category-icon">{index % 3 === 0 ? <Music2 size={17} /> : index % 3 === 1 ? <AudioLines size={17} /> : <Disc3 size={17} />}</span>
                    <span>{category}</span><span className="category-arrow">↗</span>
                  </button>
                ))}
              </div>
              <div className="category-grid listening-grid">
                {LISTENING_CATEGORIES.map((category) => (
                  <button type="button" className="listening-tile" key={category} onClick={() => browseCategory(category)}>
                    {category === "Indian FM radio" ? <Radio size={17} /> : <Headphones size={17} />}
                    <span>{category}</span><span className="category-arrow">↗</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div><p className="eyebrow">INTERNET ARCHIVE · OPEN LICENSES</p><h2>{archiveQuery ? `Results for “${archiveQuery}”` : "Open recordings"}</h2></div>
                <span className="section-caption">{total.toLocaleString()} matching archive items</span>
              </div>
              <p className="legal-note">Before first play, review the source item and confirm its uploader-declared license actually covers the recording. BharatBeats checks the item metadata and audio file, but cannot independently verify the uploader's rights.</p>
              {musicLoading && page === 1 ? <LoadingState label="Searching the Internet Archive..." /> : records.length
                ? <TrackGrid records={playableRecords} currentId={currentTrack?.id} playing={playing} favorites={library.favorites} playlists={library.playlists}
                    onPlay={(index) => playFromList(playableRecords, index)}
                    onFavorite={toggleFavorite}
                    onAddToPlaylist={(playlistId, record) => addToPlaylist(playlistId, record)} />
                : <>
                    <div className="empty-state"><Music2 size={22} /><p>{error ? "Search could not be completed. Check your connection and try again." : "No eligible recordings found. Try another search."}</p></div>
                    {!error && <div className="authorized-links">
                      <p>Looking for a commercial release? Search an authorized service:</p>
                      <a href={`https://music.apple.com/search?term=${encodeURIComponent(archiveQuery || "Indian music")}`} target="_blank" rel="noreferrer">Search Apple Music <ExternalLink size={13} /></a>
                      <a href={`https://open.spotify.com/search/${encodeURIComponent(archiveQuery || "Indian music")}`} target="_blank" rel="noreferrer">Search Spotify <ExternalLink size={13} /></a>
                    </div>}
                  </>}
              {musicLoading && page > 1 && <LoadingState label="Loading more recordings..." />}
              {page * 24 < total && <button type="button" className="load-more" disabled={musicLoading} onClick={loadMore}>{musicLoading ? "Loading…" : "Load more"}</button>}
            </section>

            {library.recent.length > 0 && (
              <section className="section-block">
                <div className="section-heading"><div><p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2>Recently played</h2></div></div>
                {trackList(library.recent.slice(0, 6), "Your recent recordings will appear here.")}
              </section>
            )}
          </>
        )}

        {view === "radio" && (
          <section className="feature-page">
            <div className="feature-hero radio-hero">
              <div className="feature-icon"><Radio size={28} /></div>
              <p className="eyebrow">AKASHVANI · PRASAR BHARATI</p>
              <h1>India, live.</h1>
              <p>Listen to Akashvani on its official live-radio page. Station streams change and may require the broadcaster's player, so BharatBeats never guesses or embeds an unverified stream URL.</p>
              <a className="primary-button link-button" href={AKASHVANI_LIVE_PAGE} target="_blank" rel="noreferrer">
                Open official live radio <ExternalLink size={15} />
              </a>
            </div>
            <div className="section-heading"><div><p className="eyebrow">OFFICIAL SERVICES</p><h2>Choose a station</h2></div></div>
            <div className="station-list">
              {AIR_STATIONS.map((station) => (
                <article className="station-card" key={station}>
                  <span className="station-symbol"><Radio size={20} /></span>
                  <div><h3>{station}</h3><p>Open this station in the official Akashvani live-radio service</p></div>
                  <a href={AKASHVANI_LIVE_PAGE} target="_blank" rel="noreferrer" aria-label={`Open official Akashvani live radio for ${station}`}><ExternalLink size={18} /></a>
                </article>
              ))}
            </div>
            <p className="legal-note">A direct stream is not embedded unless its official authorization and current URL can be verified. These links open the verified official listening page; streaming availability is controlled by the broadcaster.</p>
          </section>
        )}

        {view === "podcasts" && (
          <section className="feature-page">
            <div className="section-heading podcast-heading">
              <div><p className="eyebrow">INDIA · PUBLIC DIRECTORY</p><h1>Listen & learn.</h1></div>
              <span className="section-caption">Series found via Apple's public podcast directory</span>
            </div>
            <p className="legal-note">Episodes are read from publishers' RSS feeds. Playback is available only when a feed explicitly declares a compatible open license; otherwise open the official publisher listing.</p>
            {podcastLoading ? <LoadingState label="Searching the podcast directory..." /> : podcastSeries.length ? (
              <div className="podcast-grid">
                {podcastSeries.map((series) => (
                  <article className={`podcast-card ${selectedSeries?.id === series.id ? "selected" : ""}`} key={series.id}>
                    {series.artwork ? <img src={series.artwork} alt="" loading="lazy" /> : <span className="podcast-art-fallback"><Headphones size={24} /></span>}
                    <div className="podcast-info"><h2>{series.title}</h2><p>{series.publisher}</p></div>
                    <div className="podcast-actions">
                      {series.feedUrl && <button type="button" className="icon-button" onClick={() => void loadEpisodes(series)} aria-label={`Show episodes for ${series.title}`}><ChevronDown size={19} /></button>}
                      <a href={series.pageUrl} target="_blank" rel="noreferrer" aria-label={`Open ${series.title} on its official listing`}><ExternalLink size={17} /></a>
                    </div>
                    {selectedSeries?.id === series.id && (
                      <div className="episode-list">
                        {episodesLoading ? <LoadingState label="Loading publisher episodes..." /> : episodes.length ? episodes.map((episode) => (
                          <article className="episode" key={episode.id}>
                            <div className="episode-topline"><h3>{episode.title}</h3>{episode.duration && <span>{episode.duration}</span>}</div>
                            {episode.releasedAt && <time>{episode.releasedAt}</time>}
                            {episode.description && <p>{episode.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 220)}</p>}
                            {episode.audioUrl && episode.licenseUrl ? (
                              <button className="episode-play" type="button" onClick={() => playPodcast(episode)}><Play size={14} fill="currentColor" /> Play · {licenseLabel(episode.licenseUrl)}</button>
                            ) : <p className="episode-locked">No compatible open-playback license declared. Use the publisher listing.</p>}
                          </article>
                        )) : <p className="episode-locked">No episodes were provided by this feed. Try the publisher listing.</p>}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : <div className="empty-state"><Headphones size={22} /><p>{error ? "The podcast directory could not be reached." : "No podcast series found for this search."}</p></div>}
          </section>
        )}

        {view === "library" && (
          <section className="feature-page library-page">
            <div className="section-heading"><div><p className="eyebrow">SAVED ON THIS DEVICE</p><h1>Your library.</h1></div></div>
            <div className="library-actions">
              <button className="secondary-button" type="button" onClick={() => setShowPlaylistForm((value) => !value)}><Plus size={16} /> New playlist</button>
            </div>
            {showPlaylistForm && <form className="playlist-form" onSubmit={createPlaylist}>
              <label htmlFor="playlist-name">Playlist name</label>
              <input id="playlist-name" value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} required maxLength={60} />
              <button type="submit" className="primary-button">Create</button>
            </form>}
            {library.lastTrack && <button type="button" className="resume-card" onClick={() => requestPlay(library.lastTrack!)}>
              <span className="resume-icon"><Play size={18} fill="currentColor" /></span>
              <span><small>RESUME LAST RECORDING</small><strong>{library.lastTrack.title}</strong><em>{library.lastTrack.creator} · {formatTime(library.lastPosition)}</em></span>
            </button>}
            <section className="library-section"><div className="section-heading"><h2><Heart size={18} /> Favorites</h2></div>{trackList(library.favorites, "Tap the heart on a recording to save it here.")}</section>
            <section className="library-section"><div className="section-heading"><h2><RotateCcw size={18} /> Recently played</h2></div>{trackList(library.recent, "Your recent recordings will appear here.")}</section>
            <section className="library-section"><div className="section-heading"><h2><ListMusic size={18} /> Playlists</h2></div>
              {library.playlists.length ? library.playlists.map((playlist) => (
                <article className="playlist-card" key={playlist.id}>
                  <div className="section-heading"><h3>{playlist.name}</h3><span>{playlist.tracks.length} tracks</span></div>
                  {trackList(playlist.tracks, "Add recordings from the music list using the playlist menu.")}
                </article>
              )) : <div className="empty-state"><ListMusic size={22} /><p>Create a playlist, then add recordings from a music card.</p></div>}
            </section>
          </section>
        )}
      </main>

      {reviewRequest && <RightsReviewDialog
        record={reviewRequest.record}
        onConfirm={confirmReviewedRights}
        onCancel={() => setReviewRequest(undefined)}
      />}

      <footer className="player-bar" aria-label="Audio player">
        <audio
          ref={audioRef}
          src={currentTrack?.src}
          preload="none"
          onLoadStart={() => setBuffering(true)}
          onWaiting={() => setBuffering(true)}
          onCanPlay={() => setBuffering(false)}
          onPlaying={() => { setPlaying(true); setBuffering(false); }}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => {
            const position = event.currentTarget.currentTime;
            setCurrentTime(position);
            if (!currentTrack?.id.startsWith("podcast-") && Math.abs(position - savedPosition.current) >= 5) {
              savedPosition.current = position;
              setLibrary((previous) => ({ ...previous, lastPosition: position }));
            }
          }}
          onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
          onEnded={() => currentTrack?.id.startsWith("podcast-")
            ? setPlaying(false)
            : repeat === "one"
              ? (audioRef.current && (audioRef.current.currentTime = 0, audioRef.current.play().catch(() => setError(ERROR_COPY))))
              : moveQueue(1)}
          onError={() => { setPlaying(false); setBuffering(false); setError(ERROR_COPY); }}
        />
        <div className="player-track">
          {currentTrack ? <img src={currentTrack.artwork || artworkUrl(recordFromResolved(currentTrack))} alt="" /> : <span className="player-placeholder"><Music2 size={19} /></span>}
          <div className="player-track-info">
            <strong title={currentTrack?.title}>{currentTrack?.title ?? "Choose a recording"}</strong>
            <span>{currentTrack?.creator ?? "Open catalog · legal streams"}</span>
          </div>
          {currentTrack && !currentTrack.id.startsWith("podcast-") && (
            <button className={`player-favorite ${isFavorite(currentTrack.id) ? "active" : ""}`} type="button" aria-label={isFavorite(currentTrack.id) ? "Remove from favorites" : "Add to favorites"} onClick={() => toggleFavorite(recordFromResolved(currentTrack))}>
              <Heart size={17} fill={isFavorite(currentTrack.id) ? "currentColor" : "none"} />
            </button>
          )}
        </div>
        <div className="player-center">
          <div className="player-controls">
            <button type="button" className={`plain-control ${shuffle ? "control-on" : ""}`} aria-label="Toggle shuffle" aria-pressed={shuffle} onClick={() => setShuffle((value) => !value)}><Shuffle size={17} /></button>
            <button type="button" className="plain-control" aria-label="Previous recording" disabled={!currentTrack} onClick={previousTrack}><SkipBack size={19} fill="currentColor" /></button>
            <button type="button" className="play-button" aria-label={playing ? "Pause" : "Play"} disabled={!currentTrack || buffering && !pendingPlay} onClick={() => {
              const audio = audioRef.current;
              if (!audio) return;
              if (playing) audio.pause();
              else audio.play().then(() => setError("")).catch(() => setError(ERROR_COPY));
            }}>{buffering ? <LoaderCircle className="spin" size={18} /> : playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
            <button type="button" className="plain-control" aria-label="Next recording" disabled={!currentTrack || !queue.length} onClick={() => moveQueue(1)}><SkipForward size={19} fill="currentColor" /></button>
            <button type="button" className={`plain-control ${repeat !== "off" ? "control-on" : ""}`} aria-label={`Repeat ${repeat}`} onClick={() => setRepeat((mode) => mode === "off" ? "all" : mode === "all" ? "one" : "off")}>{repeat === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}</button>
          </div>
          <div className="seek-row">
            <span>{formatTime(currentTime)}</span>
            <input aria-label="Seek audio" type="range" min="0" max={duration || 0} step="1" value={Math.min(currentTime, duration || 0)} disabled={!duration} onChange={(event) => {
              const position = Number(event.target.value);
              if (audioRef.current) audioRef.current.currentTime = position;
            }} />
            <span>{duration ? formatTime(duration) : currentTrack?.bitrate ?? "—:—"}</span>
          </div>
        </div>
        <div className="player-extras">
          {currentTrack && <span className="format-badge" title={currentTrack.licenseUrl}>{[currentTrack.format, currentTrack.bitrate, currentTrack.sampleRate, currentTrack.bitDepth && `${currentTrack.bitDepth}-bit`].filter(Boolean).join(" · ")}</span>}
          {buffering && <span className="buffer-label"><LoaderCircle className="spin" size={13} /> Buffering</span>}
          <Volume2 size={17} aria-hidden="true" />
          <input className="volume-control" type="range" min="0" max="1" step="0.05" value={volume} aria-label="Volume" onChange={(event) => {
            const nextVolume = Number(event.target.value);
            setVolume(nextVolume);
            if (audioRef.current) audioRef.current.volume = nextVolume;
          }} />
          <button type="button" className={`plain-control queue-toggle ${showQueue ? "control-on" : ""}`} aria-label="Show play queue" onClick={() => setShowQueue((value) => !value)}><ListMusic size={18} /></button>
          {currentTrack && <button type="button" className="retry-button" aria-label="Retry playback" onClick={() => {
            if (currentTrack.id.startsWith("podcast-") && audioRef.current) {
              audioRef.current.load();
              audioRef.current.play().catch(() => setError(ERROR_COPY));
            } else {
              void resolveAndPlay(recordFromResolved(currentTrack), queue, queueIndex);
            }
          }}><RotateCcw size={15} /></button>}
        </div>
        {showQueue && (
          <div className="queue-popover">
            <div className="section-heading"><h2>Up next</h2><button type="button" className="plain-control" onClick={() => setShowQueue(false)} aria-label="Close queue"><X size={17} /></button></div>
            {queue.length ? trackList(queue.slice(Math.max(0, queueIndex)), "Queue is empty.") : <p className="empty-queue">Play a music result to add it to your queue.</p>}
          </div>
        )}
      </footer>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <NavButton active={view === "home"} onClick={() => switchView("home")} icon={<Home size={19} />}>Home</NavButton>
        <NavButton active={view === "radio"} onClick={() => switchView("radio")} icon={<Radio size={19} />}>Radio</NavButton>
        <NavButton active={view === "podcasts"} onClick={() => switchView("podcasts")} icon={<Headphones size={19} />}>Podcasts</NavButton>
        <NavButton active={view === "library"} onClick={() => switchView("library")} icon={<ListMusic size={19} />}>Library</NavButton>
      </nav>
    </div>
  );
}

function NavButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button type="button" className={`nav-button ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={onClick}>{icon}<span>{children}</span></button>;
}

function TrackGrid({
  records,
  currentId,
  playing,
  favorites,
  playlists,
  onPlay,
  onFavorite,
  onAddToPlaylist,
}: {
  records: ArchiveRecord[];
  currentId?: string;
  playing: boolean;
  favorites: ArchiveRecord[];
  playlists: LibraryState["playlists"];
  onPlay: (index: number) => void;
  onFavorite: (record: ArchiveRecord) => void;
  onAddToPlaylist: (playlistId: string, record: ArchiveRecord) => void;
}) {
  return (
    <div className="record-grid">
      {records.map((record, index) => {
        const favorite = favorites.some((item) => item.id === record.id);
        return (
          <article className={`record-card ${currentId === record.id ? "is-current" : ""}`} key={record.id}>
            <button type="button" className="record-art-button" onClick={() => onPlay(index)} aria-label={`Review rights and play ${record.title}`}>
              <img src={artworkUrl(record)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
              <span className="art-fallback"><Music2 size={27} /></span>
              <span className="art-play">{currentId === record.id && playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</span>
            </button>
            <div className="record-details"><h3 title={record.title}>{record.title}</h3><p>{[record.creator, record.album].filter(Boolean).join(" · ")}</p></div>
            <div className="record-meta">
              <a className="license-link" href={record.licenseUrl} target="_blank" rel="noreferrer" title="View the declared license">
                <span>{licenseLabel(record.licenseUrl)}</span>
              </a>
              <a className="source-link" href={`https://archive.org/details/${encodeURIComponent(record.id)}`} target="_blank" rel="noreferrer" aria-label={`View source item for ${record.title}`} title="View source item">
                <ExternalLink size={13} />
              </a>
              <div className="record-tools">
                {playlists.length > 0 && <label className="playlist-select"><span className="sr-only">Add {record.title} to playlist</span><select defaultValue="" onChange={(event) => {
                  if (event.target.value) onAddToPlaylist(event.target.value, record);
                  event.target.value = "";
                }}><option value="">+ List</option>{playlists.map((playlist) => <option value={playlist.id} key={playlist.id}>{playlist.name}</option>)}</select></label>}
                <button type="button" className={`favorite-button ${favorite ? "active" : ""}`} aria-label={favorite ? `Remove ${record.title} from favorites` : `Add ${record.title} to favorites`} onClick={() => onFavorite(record)}><Heart size={16} fill={favorite ? "currentColor" : "none"} /></button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function TrackRow({
  record,
  active,
  playing,
  favorite,
  playlists,
  onPlay,
  onFavorite,
  onAddToPlaylist,
}: {
  record: ArchiveRecord;
  active: boolean;
  playing: boolean;
  favorite: boolean;
  playlists: LibraryState["playlists"];
  onPlay: () => void;
  onFavorite: () => void;
  onAddToPlaylist: (id: string) => void;
}) {
  return (
    <article className={`track-row ${active ? "active" : ""}`}>
      <button type="button" className="row-play" aria-label={`Review rights and play ${record.title}`} onClick={onPlay}>{playing ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}</button>
      <div className="row-info"><strong>{record.title}</strong><span>{[record.creator, record.album].filter(Boolean).join(" · ")}</span></div>
      <a className="row-license" href={record.licenseUrl} target="_blank" rel="noreferrer">{licenseLabel(record.licenseUrl)}</a>
      <a className="row-source" href={`https://archive.org/details/${encodeURIComponent(record.id)}`} target="_blank" rel="noreferrer" aria-label={`View source item for ${record.title}`}><ExternalLink size={13} /></a>
      {playlists.length > 0 && <select className="row-list-select" aria-label={`Add ${record.title} to playlist`} defaultValue="" onChange={(event) => { if (event.target.value) onAddToPlaylist(event.target.value); event.target.value = ""; }}><option value="">+ List</option>{playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}</select>}
      <button type="button" className={`favorite-button ${favorite ? "active" : ""}`} aria-label={favorite ? "Remove from favorites" : "Add to favorites"} onClick={onFavorite}><Heart size={16} fill={favorite ? "currentColor" : "none"} /></button>
    </article>
  );
}

function LoadingState({ label }: { label: string }) {
  return <div className="loading-state" role="status"><LoaderCircle className="spin" size={19} />{label}</div>;
}

export default App;
