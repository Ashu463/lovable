import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "@/lib/auth";
import { Nav } from "@/features/landing/Nav";
import { Hero } from "@/features/landing/Hero";
import { TrustLogos } from "@/features/landing/TrustLogos";
import { CommunityGrid } from "@/features/landing/CommunityGrid";
import { FeaturesGrid } from "@/features/landing/FeaturesGrid";
import { HowItWorks } from "@/features/landing/HowItWorks";
import { Testimonials } from "@/features/landing/Testimonials";
import { PricingCards } from "@/features/landing/PricingCards";
import { FaqAccordion } from "@/features/landing/FaqAccordion";
import { FinalCta } from "@/features/landing/FinalCta";
import { Footer } from "@/features/landing/Footer";
import { PromptBuilder } from "@/features/build/PromptBuilder";

function scrollToHero() {
  document.getElementById("top")?.scrollIntoView({ behavior: "smooth" });
}

function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""}>
      <AuthProvider>
        <div className="min-h-screen bg-background text-foreground">
          <Nav onGetStarted={scrollToHero} />
          <Hero>
            <PromptBuilder />
          </Hero>
          <TrustLogos />
          <CommunityGrid />
          <FeaturesGrid />
          <HowItWorks />
          <Testimonials />
          <PricingCards />
          <FaqAccordion />
          <FinalCta onStartBuilding={scrollToHero} />
          <Footer />
        </div>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
