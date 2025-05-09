"use client";

import { LibraryBig } from "lucide-react";
import Link from "next/link";

interface HeaderProps {
  children?: React.ReactNode;
}

export default function Header(props: HeaderProps) {
  return (
    <header className="flex items-center justify-between p-4 border-b bg-background shadow-sm">
      {/* Left part */}
      <Link href="/shelves">
        <div className="flex items-center gap-2">
          <LibraryBig className="size-6 text-foreground" />
          <h1 className="text-lg font-semibold text-foreground">Placarr</h1>
        </div>
      </Link>

      {/* Right part */}
      <div className="flex items-center gap-2">{props.children}</div>
    </header>
  );
}
