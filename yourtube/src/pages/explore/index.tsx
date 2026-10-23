import CategoryTabs from "@/components/category-tabs";
import Videogrid from "@/components/Videogrid";
import { Suspense } from "react";

export default function Explore() {
  return (
    <main className="flex-1 p-4">
      <h1 className="mb-4 text-2xl font-semibold">Explore</h1>
      <CategoryTabs />
      <Suspense fallback={<div>Loading videos...</div>}>
        <Videogrid />
      </Suspense>
    </main>
  );
}
