import {
  Shield,
  Lock,
  Eye,
  Users,
  Key,
  FileCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const securityFeatures = [
  {
    icon: Shield,
    title: 'OAuth 2.1 + PKCE',
    description: 'Industry-standard authentication with mandatory PKCE for enhanced security.',
  },
  {
    icon: Lock,
    title: 'VPC Isolation',
    description: 'Aurora Serverless runs in private subnets. No public database access.',
  },
  {
    icon: Eye,
    title: 'Read-Only Queries',
    description: 'Only SELECT statements allowed. No mutations, no data changes.',
  },
  {
    icon: Users,
    title: 'Tenant Separation',
    description: 'Complete multi-tenant isolation. Your data never mixes with others.',
  },
  {
    icon: Key,
    title: 'Encrypted Connections',
    description: 'TLS everywhere. Credentials stored in AWS Secrets Manager.',
  },
  {
    icon: FileCheck,
    title: 'Audit Logging',
    description: 'Every query logged in CloudTrail for compliance and debugging.',
  },
];

export function Security() {
  return (
    <section className="py-24 bg-gray-950 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'%3E%3Cpath d='M0 40L40 0H20L0 20M40 40V20L20 40'/%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-gray-400 mb-6">
            <Shield className="h-4 w-4 text-green-400" />
            <span>Enterprise-grade security</span>
          </div>

          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Security built in,{' '}
            <span className="text-primary">not bolted on</span>
          </h2>
          <p className="text-lg text-gray-400 leading-relaxed">
            Your database credentials and data are protected by multiple layers
            of security. We never see your data, and neither does Claude.
          </p>
        </div>

        {/* Security features grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {securityFeatures.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className={cn(
                  'group relative rounded-2xl border border-white/10 bg-white/[0.02] p-6',
                  'hover:border-white/20 hover:bg-white/[0.04] transition-all duration-300',
                  'animate-fade-in-up'
                )}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Icon */}
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 mb-4 group-hover:bg-primary/20 transition-colors">
                  <Icon className="h-6 w-6 text-primary" />
                </div>

                {/* Title */}
                <h3 className="font-serif text-lg font-bold text-white mb-2">
                  {feature.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Trust badges */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
              <span className="text-xs font-bold">SOC2</span>
            </div>
            <span className="text-sm">Type II Ready</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
              <span className="text-xs font-bold">GDPR</span>
            </div>
            <span className="text-sm">Compliant</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
              <Shield className="h-5 w-5" />
            </div>
            <span className="text-sm">AWS Hosted</span>
          </div>
        </div>
      </div>
    </section>
  );
}
