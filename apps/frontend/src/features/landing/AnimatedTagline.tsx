import { useEffect, useState } from "react";

const WORDS = ["Lovable", "Likeable"];

export function AnimatedTagline() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % WORDS.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <p className="text-lg text-muted">
      Build something{" "}
      <span key={index} className="animate-word-swap inline-block font-semibold text-gradient-accent">
        {WORDS[index]}
      </span>
    </p>
  );
}
