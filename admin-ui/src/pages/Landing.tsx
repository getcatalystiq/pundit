import { Header } from '@/components/landing/Header';
import { Hero } from '@/components/landing/Hero';
import { TrustLogos } from '@/components/landing/TrustLogos';
import { Features } from '@/components/landing/Features';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Security } from '@/components/landing/Security';
import { Integrations } from '@/components/landing/Integrations';
import { FAQ } from '@/components/landing/FAQ';
import { CTAFooter } from '@/components/landing/CTAFooter';
import { Footer } from '@/components/landing/Footer';

export function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Hero />
        <TrustLogos />
        <Features />
        <HowItWorks />
        <Security />
        <Integrations />
        <FAQ />
        <CTAFooter />
      </main>
      <Footer />
    </div>
  );
}
