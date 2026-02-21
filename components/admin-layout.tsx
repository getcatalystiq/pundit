"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/databases", label: "Databases" },
  { path: "/users", label: "Users" },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <nav className="w-60 bg-gray-900 dark:bg-gray-950 text-white flex flex-col fixed top-0 left-0 bottom-0">
        <div className="p-6 border-b border-white/10">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-xl font-bold">
              P
            </div>
            <div>
              <h1 className="text-2xl font-bold">Pundit</h1>
              <span className="text-xs text-gray-500 uppercase tracking-wider">
                Admin
              </span>
            </div>
          </Link>
        </div>

        <ul className="py-4 flex-1">
          {navItems.map((item) => (
            <li key={item.path}>
              <Link
                href={item.path}
                className={cn(
                  "block px-6 py-3 text-gray-300 no-underline transition-colors hover:bg-white/5 hover:text-white",
                  pathname?.startsWith(item.path) &&
                    "bg-indigo-600/20 text-indigo-400 border-l-[3px] border-indigo-500"
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="p-4 border-t border-white/10">
          <div className="mb-3">
            <span className="block text-sm font-medium truncate">
              {user?.email}
            </span>
            <span className="block text-xs text-gray-500 capitalize">
              {user?.role}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={logout}
          >
            Logout
          </Button>
        </div>
      </nav>

      <main className="flex-1 ml-60 p-8 min-h-screen">{children}</main>
    </div>
  );
}
