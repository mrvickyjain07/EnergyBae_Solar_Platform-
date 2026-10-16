// src/components/ui/ai-loader.tsx
// A large blurred glowing orb with the status text centered on top of it.
// Adapted from the source component: `text` is a prop instead of a
// hardcoded "Generating" (BillEnhancer cycles through several status
// labels), attributes fixed to valid JSX (class -> className), and the
// unused counter state dropped. Colors come entirely from this app's theme
// tokens (--accent-blue/--accent-cyan/--accent-green-light in
// src/index.css), so the orb automatically matches light/dark mode instead
// of the original's fixed purple/magenta palette.
import { cn } from "@/lib/utils";

interface ComponentProps {
  text?: string;
  className?: string;
}

export const Component = ({ text = "Generating", className }: ComponentProps) => {
  return (
    <div className={cn("loader-wrapper", className)}>
      <div className="loader" />
      <div className="loader-text">
        {text.split("").map((char, i) => (
          <span key={i} className="loader-letter" style={{ animationDelay: `${i * 60}ms` }}>
            {char}
          </span>
        ))}
      </div>
    </div>
  );
};
