import Videogrid from "@/components/Videogrid";

export default function WatchParty() {
  return (
    <main className="flex-1 space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Watch Party</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose a video, open it, and select “Watch together” to create a room.
          You must be signed in to start a party. Open an invitation link to join
          an existing room.
        </p>
      </div>
      <Videogrid />
    </main>
  );
}
