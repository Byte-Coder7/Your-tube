import DownloadsContent from "@/components/DownloadsContent";

export default function DownloadsPage() {
  return (
    <main className="flex-1 p-6">
      <div className="max-w-4xl">
        <h1 className="mb-6 text-2xl font-bold">Downloads</h1>
        <DownloadsContent />
      </div>
    </main>
  );
}