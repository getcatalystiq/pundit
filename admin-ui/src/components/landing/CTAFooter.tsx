import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';

export function CTAFooter() {
  return (
    <section className="py-24 bg-gradient-to-br from-primary via-primary to-orange-600 relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full">
          <pattern
            id="cta-pattern"
            patternUnits="userSpaceOnUse"
            width="80"
            height="80"
            patternTransform="rotate(30)"
          >
            <circle cx="40" cy="40" r="2" fill="white" />
          </pattern>
          <rect fill="url(#cta-pattern)" width="100%" height="100%" />
        </svg>
      </div>

      {/* Glow effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-white/10 rounded-full blur-[100px]" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-white/10 rounded-full blur-[100px]" />

      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 relative text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-sm text-white/90 mb-8 animate-fade-in">
          <Sparkles className="h-4 w-4" />
          <span>No credit card required</span>
        </div>

        {/* Headline */}
        <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 animate-fade-in-up">
          Ready to query your data with AI?
        </h2>

        {/* Subtext */}
        <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up animation-delay-100">
          Get started in minutes. Connect your database, train the semantic
          layer, and start asking questions in natural language.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up animation-delay-200">
          <Button
            size="lg"
            className="text-base px-8 py-6 bg-white text-primary hover:bg-white/90 shadow-xl"
            asChild
          >
            <Link to="/login">
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="text-base px-8 py-6 border-white/60 bg-white/20 text-white hover:bg-white/30 hover:text-white hover:border-white/80"
            asChild
          >
            <a href="https://docs.pundit.dev" target="_blank" rel="noopener noreferrer">
              View Documentation
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
