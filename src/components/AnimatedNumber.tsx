import React, { useEffect, useRef } from "react";
import { motion, useSpring, useTransform } from "motion/react";

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Overrides the default locale formatting — pass fmtINR for ₹1,20,500
   *  Indian grouping, which the browser default locale doesn't guarantee. */
  format?: (value: number) => string;
}

// Smoothly tweens displayed digits toward `value` whenever it changes,
// instead of snapping — gives every live-recalculated stat a sense of motion.
export default function AnimatedNumber({ value, decimals = 0, prefix = "", suffix = "", format }: AnimatedNumberProps) {
  const spring = useSpring(value, { stiffness: 120, damping: 20, mass: 0.5 });
  const display = useTransform(spring, (v) =>
    format
      ? format(v)
      : `${prefix}${v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`
  );
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      spring.jump(value);
      isFirstRender.current = false;
    } else {
      spring.set(value);
    }
  }, [value, spring]);

  return <motion.span>{display}</motion.span>;
}
