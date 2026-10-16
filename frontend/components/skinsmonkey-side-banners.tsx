import Image from "next/image";

export const SKINSMONKEY_REF_URL = "https://skinsmonkey.com/r/CSGRIND";

/** Native creative size — keep display at or below this for a sharp downscale. */
const BANNER_W = 300;
const BANNER_H = 500;

function SkinsMonkeySideBanner() {
  return (
    <a
      href={SKINSMONKEY_REF_URL}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="relative block w-full max-w-[18.75rem] overflow-hidden rounded-lg border border-border/60 bg-card shadow-sm outline-none transition-[opacity,box-shadow] hover:opacity-95 hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent"
      aria-label="Trade CS2 skins on SkinsMonkey — claim $5 free"
    >
      <Image
        src="/images/partners/skinsmonkey-banner.webp"
        alt="Trade CS2 skins on SkinsMonkey — claim $5 free"
        width={BANNER_W}
        height={BANNER_H}
        quality={100}
        unoptimized
        priority
        className="h-auto w-full"
      />
    </a>
  );
}

/**
 * Profile content uses the same max-w-6xl + horizontal padding as the header.
 * Side banners sit in the leftover viewport columns so they do not shrink the cards.
 */
export function ProfileWithSidePromos({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-16 grid w-full grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,72rem)_minmax(0,1fr)]">
      <div className="hidden self-start 2xl:sticky 2xl:top-20 2xl:flex 2xl:justify-end 2xl:px-3 2xl:pt-4">
        <SkinsMonkeySideBanner />
      </div>
      <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-4 sm:px-6 sm:py-6 2xl:max-w-none">
        {children}
      </div>
      <div className="hidden self-start 2xl:sticky 2xl:top-20 2xl:flex 2xl:justify-start 2xl:px-3 2xl:pt-4">
        <SkinsMonkeySideBanner />
      </div>
    </div>
  );
}
