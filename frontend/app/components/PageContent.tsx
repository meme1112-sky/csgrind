import type { ReactNode } from "react";

type PageContentProps = {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
};

export default function PageContent({
  children,
  className = "",
  narrow = false,
}: PageContentProps) {
  return (
    <div
      className={`mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 ${
        narrow ? "max-w-3xl" : "max-w-4xl"
      } ${className}`.trim()}
    >
      {children}
    </div>
  );
}
