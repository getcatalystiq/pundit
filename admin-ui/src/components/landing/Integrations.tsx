import { cn } from '@/lib/utils';
import { Check, Clock } from 'lucide-react';

interface Integration {
  name: string;
  description: string;
  status: 'available' | 'coming-soon';
  color: string;
  logo: string;
}

const integrations: Integration[] = [
  {
    name: 'PostgreSQL',
    description: 'Full support including pgvector for embeddings',
    status: 'available',
    color: '#336791',
    logo: 'https://www.postgresql.org/media/img/about/press/elephant.png',
  },
  {
    name: 'MySQL',
    description: 'Complete MySQL and MariaDB compatibility',
    status: 'available',
    color: '#00758f',
    logo: 'https://www.mysql.com/common/logos/logo-mysql-170x115.png',
  },
  {
    name: 'Snowflake',
    description: 'Cloud data warehouse integration',
    status: 'available',
    color: '#29B5E8',
    logo: 'https://www.snowflake.com/wp-content/themes/snowflake/assets/img/logo-blue.svg',
  },
  {
    name: 'BigQuery',
    description: 'Google Cloud analytics at scale',
    status: 'available',
    color: '#4285F4',
    logo: 'https://cdn.worldvectorlogo.com/logos/google-bigquery-logo-1.svg',
  },
  {
    name: 'SQLite',
    description: 'Lightweight embedded databases',
    status: 'available',
    color: '#003B57',
    logo: 'https://www.sqlite.org/images/sqlite370_banner.gif',
  },
  {
    name: 'Supabase',
    description: 'Open source Firebase alternative',
    status: 'available',
    color: '#3ECF8E',
    logo: 'https://supabase.com/dashboard/img/supabase-logo.svg',
  },
  {
    name: 'MongoDB',
    description: 'Document database support via SQL interface',
    status: 'coming-soon',
    color: '#47A248',
    logo: 'https://www.mongodb.com/assets/images/global/leaf.png',
  },
  {
    name: 'Redshift',
    description: 'AWS data warehouse integration',
    status: 'coming-soon',
    color: '#8C4FFF',
    logo: 'https://d2908q01vomqb2.cloudfront.net/22d200f8670dbdb3e253a90eee5098477c95c23d/2023/10/06/Amazon-Redshift.png',
  },
];

function IntegrationCard({ integration, index }: { integration: Integration; index: number }) {
  const isAvailable = integration.status === 'available';

  return (
    <div
      className={cn(
        'group relative bg-card rounded-2xl border border-border p-6',
        'hover:border-primary/20 hover:shadow-lg transition-all duration-300',
        !isAvailable && 'opacity-70',
        'animate-fade-in-up'
      )}
      style={{ animationDelay: `${index * 75}ms` }}
    >
      {/* Status badge */}
      <div className="absolute top-4 right-4">
        {isAvailable ? (
          <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
            <Check className="h-3.5 w-3.5" />
            <span>Available</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Coming soon</span>
          </div>
        )}
      </div>

      {/* Database icon */}
      <div
        className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center mb-4 p-2',
          'transition-transform duration-300 group-hover:scale-110'
        )}
        style={{ backgroundColor: `${integration.color}15` }}
      >
        <img
          src={integration.logo}
          alt={integration.name}
          className="w-full h-full object-contain"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            e.currentTarget.parentElement!.innerHTML = `<span class="text-xl font-bold" style="color: ${integration.color}">${integration.name.charAt(0)}</span>`;
          }}
        />
      </div>

      {/* Name */}
      <h3 className="font-serif text-lg font-bold text-foreground mb-1">
        {integration.name}
      </h3>

      {/* Description */}
      <p className="text-sm text-muted-foreground">
        {integration.description}
      </p>
    </div>
  );
}

export function Integrations() {
  return (
    <section className="py-24 bg-muted/30 relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Connect to{' '}
            <span className="text-primary">any database</span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Pundit works with the databases you already use. More integrations
            are added regularly based on user feedback.
          </p>
        </div>

        {/* Integrations grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {integrations.map((integration, index) => (
            <IntegrationCard
              key={integration.name}
              integration={integration}
              index={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
