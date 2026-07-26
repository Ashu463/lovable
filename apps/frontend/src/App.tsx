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

function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""}>
      <ThemeProvider>
        <AuthProvider>
          <RunProvider>
            <BrowserRouter>
              <div className="min-h-screen bg-background text-foreground">
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
            </BrowserRouter>
          </RunProvider>
        </AuthProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
