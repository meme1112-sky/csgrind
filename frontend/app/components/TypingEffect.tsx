"use client";

import { useState, useEffect } from "react";

const PHRASES = [
  "play with",
  "queue with",
  "trust",
  "rely on",
];

const TYPING_MS = 80;
const PAUSE_MS = 2200;
const DELETING_MS = 45;

export default function TypingEffect() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const phrase = PHRASES[phraseIndex];
    const delay = isDeleting ? DELETING_MS : TYPING_MS;

    if (!isDeleting && displayText === phrase) {
      const pause = setTimeout(() => setIsDeleting(true), PAUSE_MS);
      return () => clearTimeout(pause);
    }

    if (isDeleting && displayText === "") {
      setIsDeleting(false);
      setPhraseIndex((i) => (i + 1) % PHRASES.length);
      return;
    }

    const timeout = setTimeout(
      () => {
        setDisplayText((prev) =>
          isDeleting ? phrase.slice(0, prev.length - 1) : phrase.slice(0, prev.length + 1)
        );
      },
      delay
    );

    return () => clearTimeout(timeout);
  }, [phraseIndex, displayText, isDeleting]);

  return (
    <span className="block sm:inline">
      <span className="cursor-blink">{displayText}</span>
    </span>
  );
}
