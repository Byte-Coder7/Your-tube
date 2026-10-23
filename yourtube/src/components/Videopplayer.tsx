"use client";

import { useRouter } from "next/router";
import VideoMedia from "./VideoMedia";

interface VideoPlayerProps {
  video: {
    _id: string;
    videotitle: string;
    filepath: string;
  };
  nextVideo?: { _id: string };
}

export default function VideoPlayer({ video, nextVideo }: VideoPlayerProps) {
  const router = useRouter();

  return (
    <div className="aspect-video bg-black rounded-lg overflow-hidden">
      <VideoMedia
        videoId={video?._id}
        controls
        trackWatchTime
        onNextVideo={nextVideo ? () => { void router.push(`/watch/${nextVideo._id}`); } : undefined}
        className="h-full w-full"
      />
    </div>
  );
}
