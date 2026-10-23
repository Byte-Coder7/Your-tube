import { useRouter } from "next/router";
import WatchPartyRoom from "@/components/WatchPartyRoom";

export default function WatchPartyPage() {
  const router = useRouter();
  const { roomId } = router.query;

  if (!router.isReady || typeof roomId !== "string") {
    return <main className="min-h-[70vh] flex-1 p-8 text-center">Loading watch party...</main>;
  }

  return <WatchPartyRoom roomId={roomId} />;
}
