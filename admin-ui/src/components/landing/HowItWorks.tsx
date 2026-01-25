import { Database, GraduationCap, MessageSquare, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const steps = [
  {
    number: 1,
    title: 'Connect',
    description: 'Add your database credentials securely. We support PostgreSQL, MySQL, Snowflake, BigQuery, and more.',
    icon: Database,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    number: 2,
    title: 'Train',
    description: 'Upload your schema, documentation, and example queries. The RAG system learns your data model.',
    icon: GraduationCap,
    color: 'from-primary to-orange-500',
  },
  {
    number: 3,
    title: 'Ask',
    description: 'Query in natural language through MCP tools. Claude understands context and generates accurate SQL.',
    icon: MessageSquare,
    color: 'from-purple-500 to-pink-500',
  },
  {
    number: 4,
    title: 'Visualize',
    description: 'Get instant charts and insights. Results are automatically visualized and exportable.',
    icon: BarChart3,
    color: 'from-green-500 to-emerald-500',
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 bg-muted/30 relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]">
        <svg className="w-full h-full">
          <pattern id="diagonal-lines" patternUnits="userSpaceOnUse" width="40" height="40" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="40" stroke="currentColor" strokeWidth="1" />
          </pattern>
          <rect fill="url(#diagonal-lines)" width="100%" height="100%" />
        </svg>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            From setup to insights{' '}
            <span className="text-primary">in minutes</span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Four simple steps to transform how your team interacts with data.
          </p>
        </div>

        {/* Steps grid */}
        <div className="grid md:grid-cols-4 gap-8">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="relative animate-fade-in-up"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                {/* Connector line (hidden on mobile, last item) */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-full h-px bg-gradient-to-r from-border via-border to-transparent" />
                )}

                {/* Step content */}
                <div className="relative bg-card rounded-2xl border border-border p-6 h-full hover:shadow-lg hover:border-primary/20 transition-all duration-300">
                  {/* Step number badge */}
                  <div
                    className={cn(
                      'absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center',
                      'text-white text-sm font-bold shadow-lg',
                      `bg-gradient-to-br ${step.color}`
                    )}
                  >
                    {step.number}
                  </div>

                  {/* Icon */}
                  <div
                    className={cn(
                      'inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4',
                      step.number === 1 && 'bg-blue-100 dark:bg-blue-950',
                      step.number === 2 && 'bg-orange-100 dark:bg-orange-950',
                      step.number === 3 && 'bg-purple-100 dark:bg-purple-950',
                      step.number === 4 && 'bg-green-100 dark:bg-green-950'
                    )}
                  >
                    <Icon className={cn(
                      'h-6 w-6',
                      step.number === 1 && 'text-blue-600 dark:text-blue-400',
                      step.number === 2 && 'text-orange-600 dark:text-orange-400',
                      step.number === 3 && 'text-purple-600 dark:text-purple-400',
                      step.number === 4 && 'text-green-600 dark:text-green-400'
                    )} />
                  </div>

                  {/* Title */}
                  <h3 className="font-serif text-xl font-bold text-foreground mb-2">
                    {step.title}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
