import React, { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { formatDistanceToNow } from "date-fns";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { toast } from "sonner";
import {
  ThumbsUp,
  ThumbsDown,
  Flag,
  Languages,
  MapPin,
  Loader2,
} from "lucide-react";

interface Comment {
  _id: string;
  videoid: string;
  userid: string;
  commentbody: string;
  usercommented: string;
  commentedon: string;
  likes?: number;
  dislikes?: number;
  reports?: number;
  flagged?: boolean;
  userlocation?: string;
}

// Preferred languages for translation.
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "zh-CN", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "pt", label: "Portuguese" },
  { code: "ja", label: "Japanese" },
  { code: "ru", label: "Russian" },
];

interface ReactionState {
  liked: boolean;
  disliked: boolean;
  reported: boolean;
}

const Comments = ({ videoId }: any) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [includeLocation, setIncludeLocation] = useState(false);
  const [reactionStates, setReactionStates] = useState<Record<
    string,
    ReactionState
  >>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [translatedText, setTranslatedText] = useState<Record<string, string>>(
    {}
  );
  const [translatedVo, setTranslatedTo] = useState<Record<string, string>>({});
  const [targetLang, setTargetLang] = useState("en");

  useEffect(() => {
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Load the user's existing reactions (like/dislike/report) once logged in.
  useEffect(() => {
    if (user) {
      loadReactionStatus();
    } else {
      setReactionStates({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadComments = async () => {
    try {
      const res = await axiosInstance.get(`/comment/${videoId}`);
      setComments(res.data);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  const loadReactionStatus = async () => {
    try {
      const res = await axiosInstance.get(`/comment/reactions/${user._id}`);
      const reactions = res.data.reactions || [];
      const map: Record<string, ReactionState> = {};
      reactions.forEach((r: any) => {
        if (!map[r.commentid]) {
          map[r.commentid] = { liked: false, disliked: false, reported: false };
        }
        if (r.type === "like") map[r.commentid].liked = true;
        if (r.type === "dislike") map[r.commentid].disliked = true;
        if (r.type === "report") map[r.commentid].reported = true;
      });
      setReactionStates(map);
    } catch (error) {
      console.log(error);
    }
  };

  const handleSubmitComment = async () => {
    if (!user || !newComment.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await axiosInstance.post("/comment/postcomment", {
        videoid: videoId,
        userid: user._id,
        commentbody: newComment,
        usercommented: user.name,
        userlocation: includeLocation ? getCountryLevel() : "",
      });
      if (res.data.comment) {
        const newCommentObj: Comment = {
          _id: res.data.data?._id || Date.now().toString(),
          videoid: videoId,
          userid: user._id,
          commentbody: newComment,
          usercommented: user.name || "Anonymous",
          commentedon: new Date().toISOString(),
          likes: 0,
          dislikes: 0,
          reports: 0,
          flagged: false,
          userlocation: includeLocation ? getCountryLevel() : "",
        };
        setComments([newCommentObj, ...comments]);
        toast.success("Comment posted successfully!");
      }
      setNewComment("");
      setIncludeLocation(false);
    } catch (error: any) {
      const msg =
        error?.response?.data?.message ||
        "Your comment could not be posted.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Simplified location: show a country-level label if enabled (no exact city).
  const getCountryLevel = () => {
    return "Country level"; // Placeholder to demonstrate privacy-preserving granularity.
  };

  const handleEdit = (comment: Comment) => {
    setEditingCommentId(comment._id);
    setEditText(comment.commentbody);
  };

  const handleUpdateComment = async () => {
    if (!editText.trim()) return;
    try {
      const res = await axiosInstance.post(
        `/comment/editcomment/${editingCommentId}`,
        { commentbody: editText }
      );
      if (res.data) {
        setComments((prev) =>
          prev.map((c) =>
            c._id === editingCommentId ? { ...c, commentbody: editText } : c
          )
        );
        setEditingCommentId(null);
        setEditText("");
        toast.success("Comment updated!");
      }
    } catch (error: any) {
      const msg =
        error?.response?.data?.message || "Could not update the comment.";
      toast.error(msg);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await axiosInstance.delete(`/comment/deletecomment/${id}`);
      if (res.data.comment) {
        setComments((prev) => prev.filter((c) => c._id !== id));
        toast.success("Comment deleted.");
      }
    } catch (error) {
      console.log(error);
    }
  };

  const optimisticCount = (id: string, field: "likes" | "dislikes") => {
    setComments((prev) =>
      prev.map((c) =>
        c._id === id
          ? { ...c, [field]: Math.max(0, (c[field] || 0) + 1) }
          : c
      )
    );
  };

  const handleLike = async (comment: Comment) => {
    if (!user) {
      toast.error("Please log in to like comments.");
      return;
    }
    const state = reactionStates[comment._id] || {
      liked: false,
      disliked: false,
      reported: false,
    };
    const wasLiked = state.liked;
    // optimistic update
    setReactionStates((prev) => ({
      ...prev,
      [comment._id]: {
        ...state,
        liked: !wasLiked,
        disliked: false,
      },
    }));
    setComments((prev) =>
      prev.map((c) =>
        c._id === comment._id
          ? {
              ...c,
              likes: Math.max(0, (c.likes || 0) + (wasLiked ? -1 : 1)),
              dislikes: wasLiked
                ? c.dislikes
                : state.disliked
                ? Math.max(0, (c.dislikes || 0) - 1)
                : c.dislikes,
            }
          : c
      )
    );
    try {
      const res = await axiosInstance.post(`/comment/like/${comment._id}`, {
        userId: user._id,
      });
      const result = res.data;
      // reconcile with server
      setReactionStates((prev) => ({
        ...prev,
        [comment._id]: {
          ...state,
          liked: !!result.liked,
          disliked: false,
        },
      }));
      setComments((prev) =>
        prev.map((c) =>
          c._id === comment._id
            ? {
                ...c,
                likes: result.liked
                  ? (c.likes || 0) + (state.liked ? 0 : 1)
                  : Math.max(0, (c.likes || 0) - 0),
              }
            : c
        )
      );
    } catch (error) {
      toast.error("Could not update like.");
    }
  };

  const handleDislike = async (comment: Comment) => {
    if (!user) {
      toast.error("Please log in to dislike comments.");
      return;
    }
    const state = reactionStates[comment._id] || {
      liked: false,
      disliked: false,
      reported: false,
    };
    const wasDisliked = state.disliked;
    setReactionStates((prev) => ({
      ...prev,
      [comment._id]: {
        ...state,
        disliked: !wasDisliked,
        liked: false,
      },
    }));
    setComments((prev) =>
      prev.map((c) =>
        c._id === comment._id
          ? {
              ...c,
              dislikes: Math.max(
                0,
                (c.dislikes || 0) + (wasDisliked ? -1 : 1)
              ),
              likes: wasDisliked
                ? c.likes
                : state.liked
                ? Math.max(0, (c.likes || 0) - 1)
                : c.likes,
            }
          : c
      )
    );
    try {
      const res = await axiosInstance.post(`/comment/dislike/${comment._id}`, {
        userId: user._id,
      });
      const result = res.data;
      setReactionStates((prev) => ({
        ...prev,
        [comment._id]: {
          ...state,
          disliked: !!result.disliked,
          liked: false,
        },
      }));
    } catch (error) {
      toast.error("Could not update dislike.");
    }
  };

  const handleReport = async (comment: Comment) => {
    if (!user) {
      toast.error("Please log in to report comments.");
      return;
    }
    const state = reactionStates[comment._id] || {
      liked: false,
      disliked: false,
      reported: false,
    };
    if (state.reported) {
      toast.info("You have already reported this comment.");
      return;
    }
    try {
      const res = await axiosInstance.post(`/comment/report/${comment._id}`, {
        userId: user._id,
        reason: window.prompt("Reason for reporting (optional):") || "",
      });
      if (res.data.reported) {
        setReactionStates((prev) => ({
          ...prev,
          [comment._id]: { ...state, reported: true },
        }));
        toast.success("Comment reported for review.");
      }
    } catch (error: any) {
      const msg =
        error?.response?.data?.message ||
        "Could not report the comment.";
      toast.error(msg);
    }
  };

  const handleTranslate = async (comment: Comment) => {
    if (!comment.commentbody) return;
    setTranslatingId(comment._id);
    try {
      const res = await axiosInstance.post(`/comment/translate/${comment._id}`, {
        target: targetLang,
      });
      if (res.data.translated) {
        setTranslatedText((prev) => ({
          ...prev,
          [comment._id]: res.data.translated,
        }));
        setTranslatedTo((prev) => ({
          ...prev,
          [comment._id]: targetLang,
        }));
        toast.success("Comment translated!");
      }
    } catch (error) {
      toast.error("Translation failed. Please try again.");
    } finally {
      setTranslatingId(null);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-500">Loading comments...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{comments.length} Comments</h2>

      {user && (
        <div className="flex gap-4">
          <Avatar className="w-10 h-10">
            <AvatarImage src={user.image || ""} />
            <AvatarFallback>{user.name?.[0] || "U"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e: any) => setNewComment(e.target.value)}
              className="min-h-[80px] resize-none border-0 border-b-2 rounded-none focus-visible:ring-0"
            />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLocation}
                  onChange={(e) => setIncludeLocation(e.target.checked)}
                  className="accent-black"
                />
                Include my location (country only)
              </label>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setNewComment("")}
                  disabled={!newComment.trim() || isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitComment}
                  disabled={!newComment.trim() || isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Comment"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Translation target selector */}
      <div className="flex items-center gap-2 text-sm">
        <Languages className="w-4 h-4 text-gray-500" />
        <span className="text-gray-600">Translate to:</span>
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="border rounded-md px-2 py-1 bg-white text-sm"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No comments yet. Be the first to comment!
          </p>
        ) : (
          comments.map((comment) => {
            const state = reactionStates[comment._id] || {
              liked: false,
              disliked: false,
              reported: false,
            };
            const isTranslated = translatedText[comment._id];
            return (
              <div key={comment._id} className="flex gap-4">
                <Avatar className="w-10 h-10">
                  <AvatarImage src="/placeholder.svg?height=40&width=40" />
                  <AvatarFallback>
                    {comment.usercommented?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">
                      {comment.usercommented}
                    </span>
                    <span className="text-xs text-gray-600">
                      {formatDistanceToNow(new Date(comment.commentedon))} ago
                    </span>
                    {comment.userlocation && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <MapPin className="w-3 h-3" />
                        {comment.userlocation}
                      </span>
                    )}
                  </div>

                  {editingCommentId === comment._id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          onClick={handleUpdateComment}
                          disabled={!editText.trim()}
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditingCommentId(null);
                            setEditText("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm">
                        {isTranslated
                          ? isTranslated
                          : comment.commentbody}
                        {isTranslated && (
                          <span className="ml-2 text-xs text-gray-500">
                            (Translated from original)
                          </span>
                        )}
                      </p>

                      {/* Action row */}
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <button
                          className={`flex items-center gap-1 hover:text-black ${
                            state.liked ? "text-black font-semibold" : ""
                          }`}
                          onClick={() => handleLike(comment)}
                          title="Like"
                        >
                          <ThumbsUp
                            className={`w-4 h-4 ${
                              state.liked ? "fill-black" : ""
                            }`}
                          />
                          {comment.likes || 0}
                        </button>
                        <button
                          className={`flex items-center gap-1 hover:text-black ${
                            state.disliked ? "text-black font-semibold" : ""
                          }`}
                          onClick={() => handleDislike(comment)}
                          title="Dislike"
                        >
                          <ThumbsDown
                            className={`w-4 h-4 ${
                              state.disliked ? "fill-black" : ""
                            }`}
                          />
                          {comment.dislikes || 0}
                        </button>

                        <button
                          className="flex items-center gap-1 hover:text-black"
                          onClick={() => handleTranslate(comment)}
                          title="Translate"
                          disabled={translatingId === comment._id}
                        >
                          {translatingId === comment._id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Languages className="w-4 h-4" />
                          )}
                          Translate
                        </button>

                        <button
                          className={`flex items-center gap-1 hover:text-red-600 ${
                            state.reported ? "text-red-600" : ""
                          }`}
                          onClick={() => handleReport(comment)}
                          title="Report"
                          disabled={state.reported}
                        >
                          <Flag className="w-4 h-4" />
                          {state.reported ? "Reported" : "Report"}
                        </button>

                        {comment.userid === user?._id && (
                          <>
                            <button onClick={() => handleEdit(comment)}>
                              Edit
                            </button>
                            <button
                              className="hover:text-red-600"
                              onClick={() => handleDelete(comment._id)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Comments;
