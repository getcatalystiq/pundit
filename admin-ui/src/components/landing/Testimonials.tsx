import { Quote } from 'lucide-react';
import { cn } from '@/lib/utils';

const testimonials = [
  {
    id: 1,
    quote:
      "Pundit saved our data team 10+ hours per week. Analysts who never touched SQL are now self-sufficient with their queries.",
    author: 'Sarah Chen',
    role: 'Head of Data',
    company: 'Fintech Startup',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face',
  },
  {
    id: 2,
    quote:
      "The semantic layer actually learns from our queries. After a few weeks, it understood our business terminology better than some of our new hires.",
    author: 'Michael Roberts',
    role: 'CTO',
    company: 'E-commerce Platform',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face',
  },
  {
    id: 3,
    quote:
      "Finally, a database tool that takes security seriously. Read-only queries, proper auth, and tenant isolation were non-negotiable for us.",
    author: 'Jessica Park',
    role: 'Security Engineer',
    company: 'Healthcare Tech',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face',
  },
];

export function Testimonials() {
  return (
    <section className="py-24 bg-background relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-64 h-64 bg-primary/5 rounded-full blur-[80px]" />
      <div className="absolute bottom-20 right-10 w-64 h-64 bg-primary/5 rounded-full blur-[80px]" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Trusted by{' '}
            <span className="text-primary">data teams</span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            See what teams are saying about transforming their data workflows with Pundit.
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={testimonial.id}
              className={cn(
                'group relative bg-card rounded-2xl border border-border p-8',
                'hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5',
                'transition-all duration-300',
                'animate-fade-in-up'
              )}
              style={{ animationDelay: `${index * 150}ms` }}
            >
              {/* Quote icon */}
              <div className="absolute -top-4 left-8">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                  <Quote className="h-4 w-4 text-white" />
                </div>
              </div>

              {/* Quote text */}
              <blockquote className="text-foreground leading-relaxed mb-6 pt-2">
                "{testimonial.quote}"
              </blockquote>

              {/* Author info */}
              <div className="flex items-center gap-4 pt-4 border-t border-border">
                {/* Avatar */}
                {testimonial.avatar ? (
                  <img
                    src={testimonial.avatar}
                    alt={testimonial.author}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-serif font-bold text-lg">
                    {testimonial.author.charAt(0)}
                  </div>
                )}

                <div>
                  <div className="font-medium text-foreground">
                    {testimonial.author}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {testimonial.role}, {testimonial.company}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
