import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: 'What is an MCP server?',
    answer:
      'MCP (Model Context Protocol) is an open protocol developed by Anthropic for connecting AI models like Claude to external tools and data sources. Pundit is a hosted MCP server that provides database tools, allowing Claude to search schemas, generate SQL, execute queries, and visualize results.',
  },
  {
    question: 'How does the RAG semantic layer work?',
    answer:
      'Pundit uses Retrieval-Augmented Generation (RAG) to understand your database. When you upload schemas, documentation, and example queries, we generate embeddings using pgvector. When a question is asked, we find the most relevant context and provide it to Claude for accurate SQL generation.',
  },
  {
    question: 'Is my database data secure?',
    answer:
      "Absolutely. Pundit uses OAuth 2.1 with PKCE for authentication, stores credentials in AWS Secrets Manager, and runs all queries as read-only SELECT statements. Your data never leaves your database—we only receive query results. All connections use TLS, and we maintain complete tenant isolation.",
  },
  {
    question: 'What databases are currently supported?',
    answer:
      'We currently support PostgreSQL (including Supabase), MySQL, SQLite, Snowflake, and BigQuery. MongoDB and Redshift support are coming soon. Each database type has optimized connectors and query generation tailored to its SQL dialect.',
  },
  {
    question: 'How do I integrate Pundit with Claude Desktop?',
    answer:
      'Integration is simple: add the Pundit MCP server URL to your Claude Desktop configuration, authenticate via OAuth, and start querying. Our documentation provides step-by-step guides for Claude Desktop, Claude.ai, and custom MCP client implementations.',
  },
];

function FAQAccordionItem({
  item,
  index,
  isOpen,
  onToggle,
}: {
  item: FAQItem;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        'border-b border-border last:border-b-0',
        'animate-fade-in-up'
      )}
      style={{ animationDelay: `${index * 75}ms` }}
    >
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center justify-between py-6 text-left',
          'group transition-colors'
        )}
        aria-expanded={isOpen}
      >
        <span className="font-serif text-lg font-medium text-foreground pr-8 group-hover:text-primary transition-colors">
          {item.question}
        </span>
        <ChevronDown
          className={cn(
            'h-5 w-5 text-muted-foreground flex-shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-out',
          isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <p className="text-muted-foreground leading-relaxed pb-6 pr-8">
          {item.answer}
        </p>
      </div>
    </div>
  );
}

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 bg-muted/30 relative">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Frequently asked{' '}
            <span className="text-primary">questions</span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Everything you need to know about Pundit and how it works.
          </p>
        </div>

        {/* FAQ accordion */}
        <div className="bg-card rounded-2xl border border-border px-6 sm:px-8">
          {faqs.map((faq, index) => (
            <FAQAccordionItem
              key={index}
              item={faq}
              index={index}
              isOpen={openIndex === index}
              onToggle={() => setOpenIndex(openIndex === index ? null : index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
