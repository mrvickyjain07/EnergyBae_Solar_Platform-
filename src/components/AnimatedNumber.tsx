import React, { useEffect, useRef } from "react";
import { motion, useSpring, useTransform } from "motion/react";

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

// Smoothly tweens displayed digits toward `value` whenever it changes,
// instead of snapping — gives every live-recalculated stat a sense of motion.
export default function AnimatedNumber({ value, decimals = 0, prefix = "", suffix = "" }: AnimatedNumberProps) {
  const spring = useSpring(value, { stiffness: 120, damping: 20, mass: 0.5 });
  const display = useTransform(spring, (v) =>
    `${prefix}${v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`
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
