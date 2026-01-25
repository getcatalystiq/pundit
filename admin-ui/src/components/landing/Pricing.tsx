import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PricingTier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  ctaLink: string;
  highlighted?: boolean;
}

const tiers: PricingTier[] = [
  {
    name: 'Community',
    price: '$0',
    period: 'forever',
    description: 'Open source and free for the community.',
    features: [
      'Basic RAG training',
      'Community support',
      'Standard response time',
    ],
    cta: 'Get Started',
    ctaLink: '/login',
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    description: 'For teams that need more power and faster responses.',
    features: [
      '5 database connections',
      '10,000 queries per day',
      'Advanced RAG training',
      'Priority support',
      'Faster response times',
      'Custom business context',
      'Query analytics',
    ],
    cta: 'Start Free Trial',
    ctaLink: '/login',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'pricing',
    description: 'For organizations with advanced security and scale needs.',
    features: [
      'Unlimited database connections',
      'Unlimited queries',
      'SSO / SAML integration',
      'Dedicated support manager',
      'Custom SLA',
      'On-premise deployment option',
      'Advanced audit logging',
      'Custom integrations',
    ],
    cta: 'Contact Sales',
    ctaLink: 'mailto:sales@pundit.dev',
  },
];

function PricingCard({ tier, index }: { tier: PricingTier; index: number }) {
  const isExternal = tier.ctaLink.startsWith('mailto:');

  return (
    <div
      className={cn(
        'relative rounded-2xl border p-8 h-full flex flex-col',
        'animate-fade-in-up',
        tier.highlighted
          ? 'bg-gray-950 border-primary shadow-2xl shadow-primary/10'
          : 'bg-card border-border'
      )}
      style={{ animationDelay: `${index * 150}ms` }}
    >
      {/* Popular badge */}
      {tier.highlighted && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-white text-sm font-medium shadow-lg">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Most Popular</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h3
          className={cn(
            'font-serif text-xl font-bold mb-2',
            tier.highlighted ? 'text-white' : 'text-foreground'
          )}
        >
          {tier.name}
        </h3>
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              'font-serif text-4xl font-bold',
              tier.highlighted ? 'text-white' : 'text-foreground'
            )}
          >
            {tier.price}
          </span>
          <span
            className={cn(
              'text-sm',
              tier.highlighted ? 'text-gray-400' : 'text-muted-foreground'
            )}
          >
            {tier.period}
          </span>
        </div>
        <p
          className={cn(
            'mt-3 text-sm leading-relaxed',
            tier.highlighted ? 'text-gray-400' : 'text-muted-foreground'
          )}
        >
          {tier.description}
        </p>
      </div>

      {/* Features */}
      <ul className="space-y-3 mb-8 flex-1">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <Check
              className={cn(
                'h-5 w-5 flex-shrink-0 mt-0.5',
                tier.highlighted ? 'text-primary' : 'text-green-500'
              )}
            />
            <span
              className={cn(
                'text-sm',
                tier.highlighted ? 'text-gray-300' : 'text-muted-foreground'
              )}
            >
              {feature}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isExternal ? (
        <Button
          className={cn('w-full', tier.highlighted && 'shadow-lg shadow-primary/30')}
          variant={tier.highlighted ? 'default' : 'outline'}
          size="lg"
          asChild
        >
          <a href={tier.ctaLink}>{tier.cta}</a>
        </Button>
      ) : (
        <Button
          className={cn('w-full', tier.highlighted && 'shadow-lg shadow-primary/30')}
          variant={tier.highlighted ? 'default' : 'outline'}
          size="lg"
          asChild
        >
          <Link to={tier.ctaLink}>{tier.cta}</Link>
        </Button>
      )}
    </div>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-background relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Simple,{' '}
            <span className="text-primary">transparent pricing</span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Start free, upgrade when you need more. No hidden fees, no surprise
            charges.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-3 gap-8 items-stretch">
          {tiers.map((tier, index) => (
            <PricingCard key={tier.name} tier={tier} index={index} />
          ))}
        </div>

        {/* FAQ teaser */}
        <div className="mt-16 text-center">
          <p className="text-muted-foreground">
            Have questions?{' '}
            <a href="#faq" className="text-primary hover:underline font-medium">
              Check our FAQ
            </a>{' '}
            or{' '}
            <a
              href="mailto:support@pundit.dev"
              className="text-primary hover:underline font-medium"
            >
              contact us
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
