import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

const sqlQuery = `SELECT
  DATE_TRUNC('month', created_at) as month,
  SUM(total) as sales
FROM orders
WHERE created_at >= NOW() - INTERVAL '6 months'
GROUP BY month
ORDER BY month;`;

const naturalLanguageQuery = "Show me sales over the last 6 months";

const salesData = [
  { month: 'Jul', sales: 142500, formatted: '$142.5K' },
  { month: 'Aug', sales: 168300, formatted: '$168.3K' },
  { month: 'Sep', sales: 156200, formatted: '$156.2K' },
  { month: 'Oct', sales: 189400, formatted: '$189.4K' },
  { month: 'Nov', sales: 215800, formatted: '$215.8K' },
  { month: 'Dec', sales: 248600, formatted: '$248.6K' },
];


export function Hero() {
  const [displayedSQL, setDisplayedSQL] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    // Start typing animation after a delay
    const startDelay = setTimeout(() => {
      setIsTyping(true);
      let currentIndex = 0;

      const typingInterval = setInterval(() => {
        if (currentIndex <= sqlQuery.length) {
          setDisplayedSQL(sqlQuery.slice(0, currentIndex));
          currentIndex++;
        } else {
          clearInterval(typingInterval);
          setIsTyping(false);
          // Show results after a brief pause
          setTimeout(() => {
            setShowResults(true);
          }, 500);
        }
      }, 30);

      return () => clearInterval(typingInterval);
    }, 800);

    return () => clearTimeout(startDelay);
  }, []);

  // Blinking cursor effect
  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 530);
    return () => clearInterval(cursorInterval);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gray-950 pt-20">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-950 to-gray-950" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      {/* Radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-primary/10 rounded-full blur-[120px] opacity-60" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left column - Text content */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-gray-400 mb-8 animate-fade-in">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Powered by RAG + MCP</span>
            </div>

            {/* Headline */}
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-6 animate-fade-in-up">
              Ask your database anything,{' '}
              <span className="text-primary">without writing any SQL.</span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg sm:text-xl text-gray-400 max-w-xl mx-auto lg:mx-0 mb-10 leading-relaxed animate-fade-in-up animation-delay-100">
              Pundit is a hosted MCP server that turns natural language into SQL
              using RAG-powered semantic understanding. Connect your database,
              and start querying.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start animate-fade-in-up animation-delay-200">
              <Button size="lg" variant="outline" className="text-base px-8 py-6 border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white hover:border-white/60" asChild>
                <a href="https://github.com/getcatalystiq/pundit" target="_blank" rel="noopener noreferrer">
                  View Documentation
                </a>
              </Button>
            </div>
          </div>

          {/* Right column - Code mockup */}
          <div className="relative animate-fade-in-up animation-delay-200">
            {/* Glow behind the card */}
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent rounded-3xl blur-2xl opacity-60" />

            {/* Code window */}
            <div className="relative bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
              {/* Window header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-gray-900/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <span className="text-xs text-gray-500 ml-2 font-mono">pundit-query.sql</span>
              </div>

              {/* Query input */}
              <div className="p-4 border-b border-white/5">
                <div className="flex items-start gap-3">
                  <span className="text-primary font-mono text-sm mt-0.5">Q:</span>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    {naturalLanguageQuery}
                  </p>
                </div>
              </div>

              {/* SQL output or Query Results */}
              {!showResults ? (
                <div className="p-4 font-mono text-sm">
                  <div className="flex items-start gap-3">
                    <span className="text-green-400 text-sm mt-0.5">SQL:</span>
                    <pre className="text-gray-300 whitespace-pre-wrap leading-relaxed flex-1 overflow-x-auto">
                      <code>
                        {displayedSQL}
                        {(isTyping || displayedSQL.length < sqlQuery.length) && (
                          <span className={`inline-block w-2 h-4 bg-primary ml-0.5 ${showCursor ? 'opacity-100' : 'opacity-0'}`} />
                        )}
                      </code>
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="p-4 animate-fade-in">
                  {/* Data Table */}
                  <div className="overflow-hidden rounded-lg border border-white/10 mb-3">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="bg-white/5">
                          <th className="text-left px-2 py-1 text-gray-400 font-medium">month</th>
                          <th className="text-right px-2 py-1 text-gray-400 font-medium">sales</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesData.map((row, i) => (
                          <tr key={i} className="border-t border-white/5">
                            <td className="px-2 py-1 text-gray-300">{row.month} 2024</td>
                            <td className="px-2 py-1 text-green-400 text-right font-medium">{row.formatted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Line Chart */}
                  <div className="rounded-lg border border-white/10 p-3 bg-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">Sales Over Time</span>
                      <span className="text-xs text-gray-500">Last 6 months</span>
                    </div>

                    {/* Chart area */}
                    <div className="relative h-48">
                      {/* Y-axis labels */}
                      <div className="absolute left-0 top-0 bottom-4 w-8 flex flex-col justify-between text-right pr-1">
                        <span className="text-[9px] text-gray-500">$250K</span>
                        <span className="text-[9px] text-gray-500">$175K</span>
                        <span className="text-[9px] text-gray-500">$100K</span>
                      </div>

                      {/* Grid lines */}
                      <div className="absolute left-8 right-0 top-0 bottom-4">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="absolute w-full border-t border-white/5"
                            style={{ top: `${i * 50}%` }}
                          />
                        ))}
                      </div>

                      {/* Line chart SVG */}
                      <svg
                        className="absolute left-8 right-2 top-0 bottom-4"
                        viewBox="-8 -8 316 116"
                        preserveAspectRatio="none"
                      >
                        {/* Gradient fill under line */}
                        <defs>
                          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#e07856" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#e07856" stopOpacity="0" />
                          </linearGradient>
                        </defs>

                        {/* Area fill */}
                        <path
                          d={`M${salesData.map((d, i) => `${(i / (salesData.length - 1)) * 300},${100 - ((d.sales - 100000) / 150000) * 100}`).join(' L')} L300,100 L0,100 Z`}
                          fill="url(#lineGradient)"
                          className="animate-fade-in"
                        />

                        {/* Line */}
                        <path
                          d={`M${salesData.map((d, i) => `${(i / (salesData.length - 1)) * 300},${100 - ((d.sales - 100000) / 150000) * 100}`).join(' L')}`}
                          fill="none"
                          stroke="#e07856"
                          strokeWidth="2"
                          className="animate-draw-line"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Data points */}
                        {salesData.map((d, i) => (
                          <circle
                            key={i}
                            cx={(i / (salesData.length - 1)) * 300}
                            cy={100 - ((d.sales - 100000) / 150000) * 100}
                            r="4"
                            fill="#1a1a1a"
                            stroke="#e07856"
                            strokeWidth="2"
                            className="animate-fade-in"
                            style={{ animationDelay: `${i * 100}ms` }}
                          />
                        ))}
                      </svg>

                      {/* X-axis labels */}
                      <div className="absolute left-8 right-0 bottom-0 flex justify-between">
                        {salesData.map((d, i) => (
                          <span key={i} className="text-[9px] text-gray-500">{d.month}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Status bar */}
              <div className="px-4 py-2 border-t border-white/5 bg-gray-900/50 flex items-center justify-between">
                <span className="text-xs text-gray-500">PostgreSQL</span>
                <span className="text-xs text-green-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Connected
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom gradient fade to cream */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
