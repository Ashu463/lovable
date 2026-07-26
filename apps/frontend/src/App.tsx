import { GoogleOAuthProvider } from "@react-oauth/google";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { RunProvider } from "@/lib/run";
import { ThemeProvider } from "@/lib/theme";
import { Home } from "@/pages/Home";
import { Workspace } from "@/pages/Workspace";
import { Architecture } from "@/pages/Architecture";
import { Docs } from "@/pages/Docs";
import { Resources } from "@/pages/Resources";
import { Projects } from "@/pages/Projects";
import { Search } from "@/pages/Search";
import { HeartGlow } from "@/features/landing/HeartGlow";

function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""}>
      <ThemeProvider>
        <AuthProvider>
          <RunProvider>
            <BrowserRouter>
              {/* lovable.dev insets its whole app in a bordered, rounded frame
                  rather than running edge-to-edge — mirroring that here. */}
              <div className="h-screen w-screen bg-black p-2 text-foreground sm:p-3">
                <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border bg-background">
                  {/* Behind the whole app shell (sidebar + whichever page is
                      active), not scoped to any one page — clipped to the
                      frame by the overflow-hidden above. */}
                  <HeartGlow />
                  <div className="relative z-10 h-full">
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/w/:runId" element={<Workspace />} />
                      <Route path="/architecture" element={<Architecture />} />
                      <Route path="/docs" element={<Docs />} />
                      <Route path="/resources" element={<Resources />} />
                      <Route path="/projects" element={<Projects />} />
                      <Route path="/search" element={<Search />} />
                    </Routes>
                  </div>
                </div>
              </div>
            </BrowserRouter>
          </RunProvider>
        </AuthProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
