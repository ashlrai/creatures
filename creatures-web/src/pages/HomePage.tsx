import { HeroSection } from '../components/marketing/HeroSection';
import { MarketingNav } from '../components/marketing/MarketingNav';
import { CapabilitiesSection } from '../components/marketing/CapabilitiesSection';
import { ScienceSection } from '../components/marketing/ScienceSection';
import { UseCasesSection } from '../components/marketing/UseCasesSection';
import { CTASection } from '../components/marketing/CTASection';
import { Footer } from '../components/marketing/Footer';
import './HomePage.css';

export default function HomePage() {
  return (
    <div className="hp-page">
      <MarketingNav />
      <HeroSection />
      <CapabilitiesSection />
      <ScienceSection />
      <UseCasesSection />
      <CTASection />
      <Footer />
    </div>
  );
}
