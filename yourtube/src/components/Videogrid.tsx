import React, { useEffect, useState } from "react";
import axios from "axios";
import Videocard from "./videocard";
import axiosInstance from "@/lib/axiosinstance";

const Videogrid = () => {
  const [videos, setvideo] = useState<any[]>([]);
  const [loading, setloading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const fetchvideo = async () => {
      try {
        const res = await axiosInstance.get("/video/getall");
        if (!Array.isArray(res.data)) {
          throw new Error("The video service returned an invalid response.");
        }
        setvideo(res.data);
      } catch (error) {
        if (axios.isAxiosError<{ message?: string }>(error)) {
          setError(
            error.response?.data?.message ??
              "Unable to load videos. Check that the backend and video database are available."
          );
        } else {
          setError(
            error instanceof Error
              ? error.message
              : "Unable to load videos."
          );
        }
      } finally {
        setloading(false);
      }
    };
    fetchvideo();
  }, []);

  // const videos = [
  //   {
  //     _id: "1",
  //     videotitle: "Amazing Nature Documentary",
  //     filename: "nature-doc.mp4",
  //     filetype: "video/mp4",
  //     filepath: "/videos/nature-doc.mp4",
  //     filesize: "500MB",
  //     videochanel: "Nature Channel",
  //     Like: 1250,
  //     views: 45000,
  //     uploader: "nature_lover",
  //     createdAt: new Date().toISOString(),
  //   },
  //   {
  //     _id: "2",
  //     videotitle: "Cooking Tutorial: Perfect Pasta",
  //     filename: "pasta-tutorial.mp4",
  //     filetype: "video/mp4",
  //     filepath: "/videos/pasta-tutorial.mp4",
  //     filesize: "300MB",
  //     videochanel: "Chef's Kitchen",
  //     Like: 890,
  //     views: 23000,
  //     uploader: "chef_master",
  //     createdAt: new Date(Date.now() - 86400000).toISOString(),
  //   },
  // ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {loading ? (
        <>Loading..</>
      ) : error ? (
        <p className="col-span-full text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : videos.length === 0 ? (
        <p className="col-span-full text-center text-sm text-gray-500">
          No videos available.
        </p>
      ) : (
        videos.map((video: any) => <Videocard key={video._id} video={video} />)
      )}
    </div>
  );
};

export default Videogrid;
