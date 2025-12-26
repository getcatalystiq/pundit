import { cn } from '@/lib/utils';

const databases = [
  {
    name: 'PostgreSQL',
    logo: 'https://www.postgresql.org/media/img/about/press/elephant.png',
  },
  {
    name: 'MySQL',
    logo: 'https://www.mysql.com/common/logos/logo-mysql-170x115.png',
  },
  {
    name: 'Snowflake',
    logo: 'https://www.snowflake.com/wp-content/themes/snowflake/assets/img/logo-blue.svg',
  },
  {
    name: 'BigQuery',
    logo: 'https://cdn.worldvectorlogo.com/logos/google-bigquery-logo-1.svg',
  },
  {
    name: 'SQLite',
    logo: 'https://www.sqlite.org/images/sqlite370_banner.gif',
  },
  {
    name: 'Supabase',
    logo: 'https://supabase.com/dashboard/img/supabase-logo.svg',
  },
];

function DatabaseLogo({ name, logo }: { name: string; logo: string }) {
  return (
    <div className="flex flex-col items-center gap-3 group">
      <div
        className={cn(
          'w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 p-3',
          'bg-gray-100 dark:bg-white/10 group-hover:scale-110 group-hover:shadow-lg'
        )}
      >
        <img
          src={logo}
          alt={name}
          className="w-full h-full object-contain"
          onError={(e) => {
            // Fallback to text if image fails to load
            e.currentTarget.style.display = 'none';
            e.currentTarget.parentElement!.innerHTML = `<span class="text-xl font-bold text-gray-600 dark:text-gray-300">${name.charAt(0)}</span>`;
          }}
        />
      </div>
      <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
        {name}
      </span>
    </div>
  );
}

export function TrustLogos() {
  return (
    <section className="py-20 bg-background relative overflow-hidden">
      {/* Subtle top border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm font-medium text-muted-foreground mb-12">
          Works with your favorite databases
        </p>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-8 md:gap-12">
          {databases.map((db, index) => (
            <div
              key={db.name}
              className="animate-fade-in-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <DatabaseLogo {...db} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
