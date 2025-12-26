import {
  Search,
  Wand2,
  Play,
  BarChart3,
  Save,
  Database,
  BookOpen,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Feature {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  size: 'large' | 'medium' | 'small';
  gradient: string;
}

const features: Feature[] = [
  {
    id: 'search',
    title: 'Semantic Search',
    description:
      'RAG-powered context retrieval finds the most relevant schemas, documentation, and past queries to inform SQL generation.',
    icon: Search,
    size: 'large',
    gradient: 'from-blue-500/20 to-cyan-500/20',
  },
  {
    id: 'generate',
    title: 'SQL Generation',
    description:
      'Transform natural language into precise, optimized SQL. Our semantic layer understands your data model and business logic.',
    icon: Wand2,
    size: 'large',
    gradient: 'from-primary/20 to-orange-500/20',
  },
  {
    id: 'execute',
    title: 'Execute Queries',
    description:
      'Run SELECT queries safely with automatic row limits and error handling. Read-only by design.',
    icon: Play,
    size: 'medium',
    gradient: 'from-green-500/20 to-emerald-500/20',
  },
  {
    id: 'visualize',
    title: 'Visualize Data',
    description:
      'Automatic chart generation with Altair. Get instant visual insights rendered as PNG.',
    icon: BarChart3,
    size: 'medium',
    gradient: 'from-purple-500/20 to-pink-500/20',
  },
  {
    id: 'save',
    title: 'Save Patterns',
    description: 'Learn from successful queries to improve future generations.',
    icon: Save,
    size: 'small',
    gradient: 'from-amber-500/20 to-yellow-500/20',
  },
  {
    id: 'list',
    title: 'Multi-Database',
    description: 'Connect and manage multiple database connections.',
    icon: Database,
    size: 'small',
    gradient: 'from-slate-500/20 to-zinc-500/20',
  },
  {
    id: 'context',
    title: 'Business Context',
    description: 'Store domain knowledge for smarter queries.',
    icon: BookOpen,
    size: 'small',
    gradient: 'from-rose-500/20 to-red-500/20',
  },
];

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const Icon = feature.icon;

  const sizeClasses = {
    large: 'md:col-span-2 md:row-span-2',
    medium: 'md:col-span-2',
    small: 'md:col-span-1',
  };

  return (
    <div
      className={cn(
        'group relative rounded-2xl border border-border bg-card p-6 transition-all duration-300',
        'hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5',
        'hover:-translate-y-1',
        sizeClasses[feature.size],
        'animate-fade-in-up'
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Gradient background on hover */}
      <div
        className={cn(
          'absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300',
          `bg-gradient-to-br ${feature.gradient}`
        )}
      />

      <div className="relative">
        {/* Icon */}
        <div
          className={cn(
            'inline-flex items-center justify-center rounded-xl p-3 mb-4',
            'bg-primary/10 text-primary',
            'group-hover:bg-primary group-hover:text-white transition-colors duration-300'
          )}
        >
          <Icon className={cn(feature.size === 'large' ? 'h-6 w-6' : 'h-5 w-5')} />
        </div>

        {/* Title */}
        <h3
          className={cn(
            'font-serif font-bold text-foreground mb-2',
            feature.size === 'large' ? 'text-2xl' : feature.size === 'medium' ? 'text-xl' : 'text-lg'
          )}
        >
          {feature.title}
        </h3>

        {/* Description */}
        <p
          className={cn(
            'text-muted-foreground leading-relaxed',
            feature.size === 'large' ? 'text-base' : 'text-sm'
          )}
        >
          {feature.description}
        </p>

        {/* Large cards get extra visual */}
        {feature.size === 'large' && (
          <div className="mt-6 pt-4 border-t border-border/50">
            <div className="flex items-center gap-2 text-sm text-primary font-medium">
              <span>Learn more</span>
              <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="py-24 bg-background relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            7 powerful tools,{' '}
            <span className="text-primary">one MCP server</span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Everything you need to query databases with natural language. From
            semantic search to visualization, all accessible through the Model
            Context Protocol.
          </p>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {features.map((feature, index) => (
            <FeatureCard key={feature.id} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
