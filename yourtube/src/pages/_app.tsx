import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { UserProvider } from "../lib/AuthContext";
import { useUser } from "../lib/AuthContext";

function AppLayout({ Component, pageProps }: AppProps) {
  const { resolvedTheme } = useUser();
  return (
    <div className={`${resolvedTheme === "dark" ? "dark" : ""} min-h-screen bg-background text-foreground`}>
      <title>Your-Tube Clone</title>
      <Header />
      <Toaster />
      <div className="flex">
        <Sidebar />
        <Component {...pageProps} />
      </div>
    </div>
  );
}

export default function App(props: AppProps) {
  return <UserProvider><AppLayout {...props} /></UserProvider>;
}
