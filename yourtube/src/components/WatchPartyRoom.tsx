import {
  Camera,
  CameraOff,
  Copy,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Send,
  Users,
  Video,
} from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { toast } from "sonner";
import VideoMedia from "@/components/VideoMedia";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

type PartyVideo = { _id: string; videotitle: string };
type PartyMessage = {
  userId: string;
  name: string;
  image: string;
  text: string;
  createdAt: string;
};
type Participant = {
  userId: string;
  name: string;
  image: string;
  socketId: string;
};
type PlaybackState = { currentTime: number; isPlaying: boolean };
type PartyRoom = { roomId: string; video: PartyVideo; hostId: string };
type PeerState = {
  connection: RTCPeerConnection;
  participant: Participant;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
};

const formatTime = (value: string) => new Date(value).toLocaleTimeString([], {
  hour: "numeric",
  minute: "2-digit",
});

export default function WatchPartyRoom({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { user } = useUser();
  const [party, setParty] = useState<PartyRoom | null>(null);
  const [messages, setMessages] = useState<PartyMessage[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState("Joining party...");
  const [roomError, setRoomError] = useState("");
  const [callError, setCallError] = useState("");
  const [messageText, setMessageText] = useState("");
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [copied, setCopied] = useState(false);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const participantsRef = useRef<Participant[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Map<string, PeerState>>(new Map());
  const desiredPlaybackRef = useRef<PlaybackState | null>(null);
  const pendingRemotePlayRef = useRef<boolean | null>(null);
  const pendingRemoteSeekRef = useRef<number | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!user) {
      setConnectionStatus("");
      setRoomError("Sign in to join this watch party.");
      return;
    }

    let active = true;
    setRoomError("");
    setConnectionStatus("Joining party...");
    axiosInstance.post(`/watch-party/${encodeURIComponent(roomId)}/join`)
      .then((response) => {
        if (active) setParty(response.data);
      })
      .catch((error) => {
        if (active) {
          setRoomError(error.response?.data?.message || "This watch party could not be joined.");
          setConnectionStatus("");
        }
      });

    return () => { active = false; };
  }, [roomId, user?._id]);

  const syncLocalTracks = useCallback((peer: PeerState) => {
    const connection = peer.connection;
    const effectiveVideoTrack = screenStreamRef.current?.getVideoTracks()[0] ||
      mediaStreamRef.current?.getVideoTracks()[0] || null;
    const audioTrack = mediaStreamRef.current?.getAudioTracks()[0] || null;

    for (const [kind, track] of [["audio", audioTrack], ["video", effectiveVideoTrack]] as const) {
      const sender = connection.getSenders().find((item) => item.track?.kind === kind);
      if (sender) {
        if (sender.track !== track) {
          void sender.replaceTrack(track).catch(() => {
            setCallError("A media track could not be shared with the party.");
          });
        }
      } else if (track) {
        const stream = kind === "video" && screenStreamRef.current?.getVideoTracks().includes(track)
          ? screenStreamRef.current
          : mediaStreamRef.current;
        if (stream) connection.addTrack(track, stream);
      }
    }
  }, []);

  const sendSignal = useCallback((targetSocketId: string, signal: RTCSessionDescriptionInit | RTCIceCandidateInit) => {
    socketRef.current?.emit("party:signal", { targetSocketId, signal });
  }, []);

  const getPeer = useCallback((participant: Participant) => {
    const existing = peerConnectionsRef.current.get(participant.userId);
    if (existing) {
      existing.participant = participant;
      return existing;
    }

    if (typeof RTCPeerConnection === "undefined") {
      setCallError("Video calls are not supported by this browser.");
      return null;
    }
    const connection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    const peer: PeerState = {
      connection,
      participant,
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
    };
    peerConnectionsRef.current.set(participant.userId, peer);
    syncLocalTracks(peer);

    connection.onicecandidate = (event) => {
      if (event.candidate) sendSignal(peer.participant.socketId, event.candidate.toJSON());
    };
    connection.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) setRemoteStreams((current) => ({ ...current, [participant.userId]: stream }));
    };
    connection.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await connection.setLocalDescription();
        if (connection.localDescription) {
          sendSignal(peer.participant.socketId, connection.localDescription.toJSON());
        }
      } catch (error) {
        console.error("Watch party WebRTC negotiation failed:", error);
        setCallError("The video call could not negotiate a connection. Try joining the call again.");
      } finally {
        peer.makingOffer = false;
      }
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed") {
        setCallError("The video call connection failed. Check your network and try again.");
      }
    };
    return peer;
  }, [sendSignal, syncLocalTracks]);

  const applyPlayback = useCallback((state: PlaybackState) => {
    desiredPlaybackRef.current = state;
    const player = playerRef.current;
    if (!player) return;
    if (Math.abs(player.currentTime - state.currentTime) > 1.5) {
      pendingRemoteSeekRef.current = state.currentTime;
      try {
        player.currentTime = state.currentTime;
      } catch {
        pendingRemoteSeekRef.current = null;
      }
    }
    if (player.paused === state.isPlaying) {
      pendingRemotePlayRef.current = state.isPlaying;
      if (state.isPlaying) {
        void player.play().catch(() => {
          pendingRemotePlayRef.current = null;
          setCallError("Playback was synchronized, but this browser requires you to press Play.");
        });
      } else {
        player.pause();
      }
    }
  }, []);

  useEffect(() => {
    if (!party || !user) return;
    const backendUrl = (process.env.BACKEND_URL || "").replace(/\/$/, "");
    const connection = io(backendUrl, { withCredentials: true });
    socketRef.current = connection;
    setSocket(connection);

    const joinRoom = () => {
      setConnectionStatus("Connecting to party...");
      connection.emit("party:join", { roomId }, (result: {
        ok: boolean;
        message?: string;
        participants?: Participant[];
        messages?: PartyMessage[];
        playback?: PlaybackState;
      }) => {
        if (!result.ok) {
          setRoomError(result.message || "Unable to connect to this watch party.");
          setConnectionStatus("");
          connection.disconnect();
          return;
        }
        setRoomError("");
        const roomParticipants = result.participants || [];
        participantsRef.current = roomParticipants;
        setParticipants(roomParticipants);
        setMessages(result.messages || []);
        setConnectionStatus("Connected");
        if (result.playback) applyPlayback(result.playback);
        for (const participant of roomParticipants) {
          if (participant.userId !== String(user._id)) getPeer(participant);
        }
      });
    };
    const handleParticipantJoined = (participant: Participant) => {
      if (participant.userId === String(user._id)) return;
      const updated = [
        ...participantsRef.current.filter((item) => item.userId !== participant.userId),
        participant,
      ];
      participantsRef.current = updated;
      setParticipants(updated);
      getPeer(participant);
    };
    const handleParticipants = (updated: Participant[]) => {
      participantsRef.current = updated;
      setParticipants(updated);
      const activeUsers = new Set(updated.map((participant) => participant.userId));
      for (const [userId, peer] of peerConnectionsRef.current) {
        if (!activeUsers.has(userId)) {
          peer.connection.close();
          peerConnectionsRef.current.delete(userId);
          setRemoteStreams((current) => {
            const next = { ...current };
            delete next[userId];
            return next;
          });
        }
      }
    };
    const handleMessage = (message: PartyMessage) => {
      setMessages((current) => [...current, message].slice(-100));
    };
    const handlePlayback = (state: PlaybackState) => applyPlayback(state);
    const handleSignal = async ({ from, fromSocketId, signal }: {
      from: Participant;
      fromSocketId: string;
      signal: RTCSessionDescriptionInit | RTCIceCandidateInit;
    }) => {
      const peer = getPeer({ ...from, socketId: fromSocketId });
      if (!peer) return;
      const peerConnection = peer.connection;
      try {
        if ("type" in signal && signal.type) {
          const description = signal as RTCSessionDescriptionInit;
          const offerCollision = description.type === "offer" &&
            (peer.makingOffer || peerConnection.signalingState !== "stable");
          peer.ignoreOffer = description.type === "offer" && offerCollision &&
            String(user._id) < from.userId;
          if (peer.ignoreOffer) return;
          if (offerCollision) await peerConnection.setLocalDescription({ type: "rollback" });
          await peerConnection.setRemoteDescription(description);
          for (const candidate of peer.pendingCandidates.splice(0)) {
            await peerConnection.addIceCandidate(candidate);
          }
          if (description.type === "offer") {
            await peerConnection.setLocalDescription(await peerConnection.createAnswer());
            if (peerConnection.localDescription) {
              sendSignal(fromSocketId, peerConnection.localDescription.toJSON());
            }
          }
        } else if ("candidate" in signal && signal.candidate && !peer.ignoreOffer) {
          const candidate = signal as RTCIceCandidateInit;
          if (peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(candidate);
          } else {
            peer.pendingCandidates.push(candidate);
          }
        }
      } catch (error) {
        console.error("Watch party signaling message failed:", error);
        setCallError("A participant's video call connection could not be completed.");
      }
    };
    const handleError = (event: { message?: string }) => setCallError(event.message || "The party connection encountered an error.");
    const handleConnectError = (error: Error) => {
      setConnectionStatus("");
      setRoomError(error.message || "Unable to connect to the watch party.");
    };
    const handleDisconnect = () => {
      setConnectionStatus("Connection lost. Reconnecting...");
      for (const peer of peerConnectionsRef.current.values()) peer.connection.close();
      peerConnectionsRef.current.clear();
      participantsRef.current = [];
      setParticipants([]);
      setRemoteStreams({});
    };
    connection.on("connect", joinRoom);
    connection.on("party:participant-joined", handleParticipantJoined);
    connection.on("party:participants", handleParticipants);
    connection.on("party:message", handleMessage);
    connection.on("party:playback", handlePlayback);
    connection.on("party:signal", handleSignal);
    connection.on("party:error", handleError);
    connection.on("connect_error", handleConnectError);
    connection.on("disconnect", handleDisconnect);

    return () => {
      connection.removeAllListeners();
      connection.disconnect();
      socketRef.current = null;
      setSocket(null);
      for (const peer of peerConnectionsRef.current.values()) peer.connection.close();
      peerConnectionsRef.current.clear();
      setRemoteStreams({});
    };
  }, [applyPlayback, getPeer, party, roomId, sendSignal, user]);

  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (party?.roomId) {
      document.title = `Watch party | ${party.video.videotitle}`;
    }
  }, [party]);

  const attachPlayer = useCallback((element: HTMLVideoElement | null) => {
    playerRef.current = element;
    if (element && desiredPlaybackRef.current) applyPlayback(desiredPlaybackRef.current);
  }, [applyPlayback]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !socket) return;
    const emitPlayback = (action: "play" | "pause" | "seek") => {
      const shouldPlay = !player.paused;
      if (pendingRemotePlayRef.current === shouldPlay) {
        pendingRemotePlayRef.current = null;
        return;
      }
      socket.emit("party:playback", {
        action,
        currentTime: player.currentTime,
        isPlaying: shouldPlay,
      });
    };
    const handlePlay = () => emitPlayback("play");
    const handlePause = () => emitPlayback("pause");
    const handleSeeked = () => {
      const pendingTime = pendingRemoteSeekRef.current;
      if (pendingTime !== null && Math.abs(player.currentTime - pendingTime) < 1.5) {
        pendingRemoteSeekRef.current = null;
        return;
      }
      emitPlayback("seek");
    };
    player.addEventListener("play", handlePlay);
    player.addEventListener("pause", handlePause);
    player.addEventListener("seeked", handleSeeked);
    return () => {
      player.removeEventListener("play", handlePlay);
      player.removeEventListener("pause", handlePause);
      player.removeEventListener("seeked", handleSeeked);
    };
  }, [socket, party]);

  const startCall = async () => {
    if (mediaStreamRef.current) return;
    setCallError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      mediaStreamRef.current = stream;
      setMediaStream(stream);
      setMicEnabled(true);
      setCameraEnabled(true);
      for (const peer of peerConnectionsRef.current.values()) syncLocalTracks(peer);
    } catch (error) {
      console.error("Watch party camera/microphone access failed:", error);
      const mediaError = error as DOMException;
      setCallError(mediaError.name === "NotAllowedError"
        ? "Camera and microphone permission was denied. Allow access in your browser settings and try again."
        : "Camera and microphone could not be started. Check that they are connected and not in use.");
    }
  };

  const toggleMicrophone = () => {
    const enabled = !micEnabled;
    mediaStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
    setMicEnabled(enabled);
  };

  const toggleCamera = () => {
    const enabled = !cameraEnabled;
    mediaStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = enabled; });
    setCameraEnabled(enabled);
  };

  const leaveCall = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    screenStreamRef.current = null;
    setMediaStream(null);
    setScreenStream(null);
    setMicEnabled(true);
    setCameraEnabled(true);
    for (const peer of peerConnectionsRef.current.values()) syncLocalTracks(peer);
  };

  const stopScreenShare = () => {
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    for (const peer of peerConnectionsRef.current.values()) syncLocalTracks(peer);
  };

  const shareScreen = async () => {
    if (screenStreamRef.current) {
      stopScreenShare();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setCallError("Screen sharing is not supported by this browser.");
      return;
    }
    setCallError("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      setScreenStream(stream);
      stream.getVideoTracks()[0].addEventListener("ended", stopScreenShare, { once: true });
      for (const peer of peerConnectionsRef.current.values()) syncLocalTracks(peer);
    } catch (error) {
      const mediaError = error as DOMException;
      if (mediaError.name !== "NotAllowedError" && mediaError.name !== "AbortError") {
        setCallError("Screen sharing could not be started. Check your browser permissions and try again.");
      }
    }
  };

  const leaveParty = async () => {
    socketRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    screenStreamRef.current = null;
    try {
      await axiosInstance.post(`/watch-party/${encodeURIComponent(roomId)}/leave`);
    } catch (error) {
      console.error("Watch party membership could not be removed:", error);
      toast.error(axios.isAxiosError(error)
        ? error.response?.data?.message || "You left the party, but your membership could not be updated."
        : "You left the party, but your membership could not be updated.");
    }
    await router.push("/");
  };

  const sendMessage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = messageText.trim();
    if (!text || !socket?.connected) return;
    socket.emit("party:message", { text });
    setMessageText("");
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/watch-party/${roomId}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Invite link could not be copied. Copy the URL from your browser address bar.");
    }
  };

  if (roomError) {
    return (
      <main className="min-h-[70vh] flex-1 px-4 py-12">
        <div className="mx-auto max-w-xl rounded-xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Watch party unavailable</h1>
          <p className="mt-3 text-sm text-muted-foreground">{roomError}</p>
          {!user && <p className="mt-2 text-sm text-muted-foreground">Please sign in, then open the invite link again.</p>}
          <Button className="mt-6" onClick={() => router.push("/")}>Back to videos</Button>
        </div>
      </main>
    );
  }

  if (!party) {
    return <main className="min-h-[70vh] flex-1 p-8 text-center text-muted-foreground">{connectionStatus || "Loading party..."}</main>;
  }

  return (
    <main className="min-w-0 flex-1 px-3 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" />
              <span>{participants.length} {participants.length === 1 ? "participant" : "participants"}</span>
              <span aria-hidden="true">·</span>
              <span>{connectionStatus}</span>
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold sm:text-2xl">Watch party</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void copyInvite()} aria-label="Copy party invite link">
              <Copy className="size-4" />{copied ? "Copied" : "Invite"}
            </Button>
            <Button variant="destructive" onClick={() => void leaveParty()}>
              <PhoneOff className="size-4" />Leave
            </Button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <section className="min-w-0 space-y-4">
            <div className="overflow-hidden rounded-xl bg-black shadow-sm">
              <VideoMedia
                videoId={party.video._id}
                controls
                trackWatchTime
                onVideoElement={attachPlayer}
                className="h-full w-full"
              />
            </div>
            <h2 className="text-lg font-medium">{party.video.videotitle}</h2>

            <section className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Call & participants</h2>
                <span className="text-sm text-muted-foreground">{participants.length} here</span>
              </div>
              {callError && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{callError}</p>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                <div className="relative aspect-video overflow-hidden rounded-lg bg-neutral-900">
                  {mediaStream || screenStream ? (
                    <video
                      autoPlay
                      muted
                      playsInline
                      ref={(element) => {
                        if (element) element.srcObject = screenStream || mediaStream;
                      }}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-white">
                      <Avatar className="size-10">
                        <AvatarImage src={user?.image} />
                        <AvatarFallback>{user?.name?.[0] || "Y"}</AvatarFallback>
                      </Avatar>
                      <span className="max-w-full truncate px-2 text-xs">You</span>
                    </div>
                  )}
                  <span className="absolute bottom-1 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">You</span>
                </div>
                {participants.filter((participant) => participant.userId !== String(user?._id)).map((participant) => (
                  <div key={participant.userId} className="relative aspect-video overflow-hidden rounded-lg bg-neutral-900">
                    {remoteStreams[participant.userId] ? (
                      <video
                        autoPlay
                        playsInline
                        ref={(element) => {
                          if (element) element.srcObject = remoteStreams[participant.userId];
                        }}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 text-white">
                        <Avatar className="size-10">
                          <AvatarImage src={participant.image} />
                          <AvatarFallback>{participant.name[0] || "P"}</AvatarFallback>
                        </Avatar>
                        <span className="max-w-full truncate px-2 text-xs">{participant.name}</span>
                      </div>
                    )}
                    <span className="absolute bottom-1 left-2 max-w-[90%] truncate rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">{participant.name}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {mediaStream ? (
                  <Button variant="destructive" onClick={leaveCall}>
                    <PhoneOff className="size-4" />Leave call
                  </Button>
                ) : (
                  <Button onClick={() => void startCall()}>
                    <Video className="size-4" />Join call
                  </Button>
                )}
                <Button variant="outline" onClick={toggleMicrophone} disabled={!mediaStream} aria-label={micEnabled ? "Mute microphone" : "Unmute microphone"}>
                  {micEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                  {micEnabled ? "Mute" : "Unmute"}
                </Button>
                <Button variant="outline" onClick={toggleCamera} disabled={!mediaStream} aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"}>
                  {cameraEnabled ? <Camera className="size-4" /> : <CameraOff className="size-4" />}
                  {cameraEnabled ? "Camera off" : "Camera on"}
                </Button>
                <Button variant="outline" onClick={() => void shareScreen()}>
                  <MonitorUp className="size-4" />{screenStream ? "Stop sharing" : "Share screen"}
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Camera and microphone are only shared after you join the call. Recording is unavailable; this party does not record audio or video.
              </p>
            </section>
          </section>

          <aside className="flex min-h-[24rem] flex-col overflow-hidden rounded-xl border bg-card lg:h-[calc(100vh-9rem)] lg:min-h-[32rem]">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">Party chat</h2>
              <p className="text-xs text-muted-foreground">Messages are shared with everyone in this room.</p>
            </div>
            <div ref={messageListRef} className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
              {messages.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">Say hello to start the conversation.</p>
              )}
              {messages.map((message, index) => (
                <article key={`${message.createdAt}-${message.userId}-${index}`} className="flex items-start gap-2">
                  <Avatar className="mt-0.5 size-7 shrink-0">
                    <AvatarImage src={message.image} />
                    <AvatarFallback>{message.name[0] || "P"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-xs font-medium">{message.userId === String(user?._id) ? "You" : message.name}</span>
                      <time className="shrink-0 text-[10px] text-muted-foreground">{formatTime(message.createdAt)}</time>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
                  </div>
                </article>
              ))}
            </div>
            <form onSubmit={sendMessage} className="flex gap-2 border-t p-3">
              <Input
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                maxLength={1000}
                placeholder="Message the party"
                aria-label="Chat message"
                disabled={!socket?.connected}
              />
              <Button type="submit" size="icon" disabled={!messageText.trim() || !socket?.connected} aria-label="Send message">
                <Send className="size-4" />
              </Button>
            </form>
          </aside>
        </div>
      </div>
    </main>
  );
}
