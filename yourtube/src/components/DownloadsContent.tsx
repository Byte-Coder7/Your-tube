"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import VideoMedia from "./VideoMedia";

export default function DownloadsContent() {
  const [downloads, setDownloads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  useEffect(() => {
    if (!user) {
      setDownloads([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let active = true;
    axiosInstance
      .get("/downloads")
      .then((response) => {
        if (active) setDownloads(response.data.downloads);
      })
      .catch((error) => console.error("Error loading downloads:", error))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  if (!user) {
    return (
      <div className="py-12 text-center">
        <Download className="mx-auto mb-4 h-12 w-12 text-gray-400" />
        <h2 className="mb-2 text-xl font-semibold">Your downloaded videos</h2>
        <p className="text-gray-600">Sign in to view your downloads.</p>
      </div>
    );
  }

  if (loading) return <div>Loading downloads...</div>;

  if (downloads.length === 0) {
    return (
      <div className="py-12 text-center">
        <Download className="mx-auto mb-4 h-12 w-12 text-gray-400" />
        <h2 className="mb-2 text-xl font-semibold">No downloads yet</h2>
        <p className="text-gray-600">Videos you download will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{downloads.length} downloads</p>
      {downloads.map((item) => (
        <div key={item._id} className="flex gap-4">
          <Link
            href={`/watch/${item.videoId?._id || item.videoId}`}
            className="w-40 flex-shrink-0 overflow-hidden rounded bg-gray-100"
          >
            {item.videoId?._id ? (
              <VideoMedia videoId={item.videoId._id} className="h-full w-full object-cover" />
            ) : (
              <div className="flex aspect-video items-center justify-center">
                <Download className="h-6 w-6 text-gray-400" />
              </div>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={`/watch/${item.videoId?._id || item.videoId}`}>
              <h2 className="line-clamp-2 text-sm font-medium hover:text-blue-600">
                {item.videoTitle}
              </h2>
            </Link>
            <p className="mt-1 text-sm text-gray-600">
              {item.videoId?.videochanel || "Video unavailable"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Downloaded {format(new Date(item.downloadDate), "PPp")} · {item.plan} plan
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}