import { useEffect, useRef, useState } from "react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";

interface VideoMediaProps {
  videoId?: string;
  className?: string;
  controls?: boolean;
  trackWatchTime?: boolean;
  onNextVideo?: () => void;
  onVideoElement?: (video: HTMLVideoElement | null) => void;
}

export default function VideoMedia({
  videoId,
  className = "",
  controls = false,
  trackWatchTime = false,
  onNextVideo,
  onVideoElement,
}: VideoMediaProps) {
  const { user } = useUser();
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const heartbeatRef = useRef<number | null>(null);
  const heartbeatActive = useRef(false);
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const previousVolumeRef = useRef(1);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [limitMessage, setLimitMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<"back" | "forward" | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setSource("");
    setError("");
    setLimitMessage("");
    setIsLoading(true);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (!videoId) {
      setError("Video unavailable.");
      setIsLoading(false);
      return;
    }

    axiosInstance
      .get(`/video/${videoId}/playback-token`)
      .then((response) => {
        if (!active) return;
        const backendUrl = (process.env.BACKEND_URL || "").replace(/\/$/, "");
        setSource(`${backendUrl}/video/${videoId}/stream?token=${encodeURIComponent(response.data.token)}`);
      })
      .catch((requestError: any) => {
        if (active) {
          setError(requestError.response?.data?.message || "Video playback is unavailable.");
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [videoId, user?._id, retryCount]);

  useEffect(() => () => {
    if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    if (feedbackTimeoutRef.current) window.clearTimeout(feedbackTimeoutRef.current);
  }, []);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  const stopHeartbeat = () => {
    if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    heartbeatActive.current = false;
  };

  const startHeartbeat = () => {
    if (!trackWatchTime || !user || !videoId || heartbeatRef.current) return;
    const report = async () => {
      if (heartbeatActive.current) return;
      heartbeatActive.current = true;
      try {
        await axiosInstance.post("/subscriptions/watch-time", { videoId });
      } catch (requestError: any) {
        if (requestError.response?.status === 429) {
          stopHeartbeat();
          videoRef.current?.pause();
          setLimitMessage("Your daily watch-time limit has been reached.");
        }
      } finally {
        heartbeatActive.current = false;
      }
    };
    void report();
    heartbeatRef.current = window.setInterval(report, 15000);
  };

  const seekBy = (seconds: number) => {
    const player = videoRef.current;
    if (!player) return;
    player.currentTime = Math.max(0, Math.min(player.duration || 0, player.currentTime + seconds));
    setCurrentTime(player.currentTime);
    setSeekFeedback(seconds < 0 ? "back" : "forward");
    if (feedbackTimeoutRef.current) window.clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = window.setTimeout(() => setSeekFeedback(null), 650);
  };

  const togglePlayback = async () => {
    const player = videoRef.current;
    if (!player) return;
    if (player.paused) {
      try {
        await player.play();
      } catch {
        setError("Playback could not start. Please try again.");
      }
    } else {
      player.pause();
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await playerRef.current?.requestFullscreen();
      }
    } catch {
      setError("Fullscreen is unavailable in this browser.");
    }
  };

  const formatTime = (time: number) => {
    if (!Number.isFinite(time)) return "0:00";
    const totalSeconds = Math.floor(time);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLVideoElement>) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    const now = Date.now();
    const previousTap = lastTapRef.current;
    lastTapRef.current = { time: now, x: touch.clientX };
    if (!previousTap || now - previousTap.time > 320 || Math.abs(touch.clientX - previousTap.x) > 48) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    seekBy(touch.clientX >= bounds.left + bounds.width / 2 ? 10 : -10);
    lastTapRef.current = null;
  };

  if (!source) {
    return (
      <div className={`flex aspect-video flex-col items-center justify-center gap-3 bg-neutral-900 px-4 text-center text-sm text-white ${className}`} role="status">
        {isLoading ? <span className="animate-pulse">Loading video...</span> : <span>{error || "Video unavailable."}</span>}
        {error && videoId && (
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="rounded bg-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/25"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={playerRef} className="group relative aspect-video overflow-hidden bg-black">
      <video
        ref={(element) => {
          videoRef.current = element;
          onVideoElement?.(element);
        }}
        src={source}
        className={className || "h-full w-full"}
        controls={false}
        preload="metadata"
        onLoadStart={() => setIsLoading(true)}
        onWaiting={() => setIsLoading(true)}
        onCanPlay={() => setIsLoading(false)}
        onPlaying={() => { setIsLoading(false); setIsPlaying(true); setError(""); }}
        onPause={() => { setIsPlaying(false); stopHeartbeat(); }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setIsMuted(event.currentTarget.muted);
          if (event.currentTarget.volume > 0) previousVolumeRef.current = event.currentTarget.volume;
        }}
        onError={() => {
          setIsLoading(false);
          setIsPlaying(false);
          setError("This video is unavailable or its format is not supported.");
          stopHeartbeat();
        }}
        onTouchEnd={controls ? handleTouchEnd : undefined}
        onPlay={startHeartbeat}
        onEnded={() => { setIsPlaying(false); stopHeartbeat(); }}
      />
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25" role="status" aria-label="Buffering video">
          <span className="size-10 animate-spin rounded-full border-4 border-white/35 border-t-white" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 px-5 text-center text-sm text-white" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="rounded bg-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/25">
            Retry
          </button>
        </div>
      )}
      {controls && !error && (
        <>
          {seekFeedback && (
            <div className={`pointer-events-none absolute inset-y-0 flex w-1/3 items-center justify-center bg-black/20 text-white ${seekFeedback === "back" ? "left-0" : "right-0"}`} aria-live="polite">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {seekFeedback === "back" ? <RotateCcw className="size-5" /> : <RotateCw className="size-5" />}
                10 seconds
              </span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-2 pt-8 text-white sm:px-4">
            <input
              aria-label="Seek video"
              type="range"
              min={0}
              max={duration || 0}
              step="0.1"
              value={Math.min(currentTime, duration || 0)}
              onChange={(event) => {
                const nextTime = Number(event.target.value);
                if (videoRef.current) videoRef.current.currentTime = nextTime;
                setCurrentTime(nextTime);
              }}
              className="mb-1.5 h-1.5 w-full cursor-pointer accent-red-600"
            />
            <div className="flex items-center gap-0 sm:gap-2">
              <button type="button" onClick={() => void togglePlayback()} aria-label={isPlaying ? "Pause" : "Play"} title={isPlaying ? "Pause" : "Play"} className="rounded p-1 hover:bg-white/15 sm:p-1.5">
                {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
              </button>
              <button type="button" onClick={() => seekBy(-10)} aria-label="Rewind 10 seconds" title="Rewind 10 seconds" className="rounded p-1 hover:bg-white/15 sm:p-1.5">
                <RotateCcw className="size-5" />
              </button>
              <button type="button" onClick={() => seekBy(10)} aria-label="Forward 10 seconds" title="Forward 10 seconds" className="rounded p-1 hover:bg-white/15 sm:p-1.5">
                <RotateCw className="size-5" />
              </button>
              <span className="min-w-[4rem] text-[10px] tabular-nums sm:min-w-[5.5rem] sm:text-sm" aria-live="off">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              <button
                type="button"
                onClick={() => {
                  const player = videoRef.current;
                  if (!player) return;
                  if (player.muted || player.volume === 0) {
                    if (player.volume === 0) player.volume = previousVolumeRef.current;
                    player.muted = false;
                  } else {
                    player.muted = true;
                  }
                  setIsMuted(player.muted);
                }}
                aria-label={isMuted ? "Unmute" : "Mute"}
                title={isMuted ? "Unmute" : "Mute"}
                className="ml-auto rounded p-1 hover:bg-white/15 sm:p-1.5"
              >
                {isMuted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </button>
              <input
                aria-label="Volume"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(event) => {
                  const nextVolume = Number(event.target.value);
                  if (videoRef.current) {
                    videoRef.current.volume = nextVolume;
                    videoRef.current.muted = nextVolume === 0;
                  }
                  setVolume(nextVolume);
                  setIsMuted(nextVolume === 0);
                }}
                className="h-1 w-9 cursor-pointer accent-white sm:w-16"
              />
              {onNextVideo && (
                <button type="button" onClick={onNextVideo} aria-label="Next video" title="Next video" className="rounded p-1 hover:bg-white/15 sm:p-1.5">
                  <SkipForward className="size-5" />
                </button>
              )}
              <button type="button" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} className="rounded p-1 hover:bg-white/15 sm:p-1.5">
                {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
              </button>
            </div>
          </div>
        </>
      )}
      {limitMessage && (
        <div className="absolute inset-x-0 bottom-12 bg-black/80 px-4 py-3 text-sm text-white" role="status">
          {limitMessage} <a className="underline" href="/subscriptions">View plans</a>
        </div>
      )}
    </div>
  );
}