import { GoogleOAuthProvider } from "@react-oauth/google";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { RunProvider } from "@/lib/run";
import { Home } from "@/pages/Home";
import { Workspace } from "@/pages/Workspace";
import { Architecture } from "@/pages/Architecture";
import { Docs } from "@/pages/Docs";

function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""}>
      <AuthProvider>
        <RunProvider>
          <BrowserRouter>
            <div className="min-h-screen bg-background text-foreground">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/w/:runId" element={<Workspace />} />
                <Route path="/architecture" element={<Architecture />} />
                <Route path="/docs" element={<Docs />} />
              </Routes>
            </div>
          </BrowserRouter>
        </RunProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
