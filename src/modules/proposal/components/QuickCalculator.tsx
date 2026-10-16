// A floating scratch calculator, available on every tab/step of Proposal
// Maker — for quick arithmetic (panel counts, running totals, etc.) without
// leaving the page. Self-contained: no props, no connection to
// ProposalInputs — it's a calculator, not a form field. Styled after a
// typical phone calculator (circular keys, expression trail, history tape)
// per the reference the user shared, in the app's own accent color.
import React, { useEffect, useState } from "react";
import { Calculator, Clock, X } from "lucide-react";

type Op = "+" | "-" | "×" | "÷";

function applyOp(a: number, b: number, op: Op): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "×": return a * b;
    case "÷": return b === 0 ? NaN : a / b;
  }
}

// Kills float noise (0.1+0.2 -> 0.30000000000000004) without a big-decimal lib.
function trimFloat(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  return parseFloat(n.toFixed(10)).toString();
}

// Thousands separators on the integer part only, so a decimal mid-typing
// ("12.") isn't disturbed.
function fmt(s: string): string {
  if (!s || s === "-") return s || "0";
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const [int, dec] = body.split(".");
  const intFmt = Number(int || "0").toLocaleString("en-IN");
  return (neg ? "-" : "") + intFmt + (dec !== undefined ? "." + dec : "");
}

const key = "h-14 rounded-full text-base font-mono font-semibold cursor-pointer transition-colors flex items-center justify-center";
const keyDigit = `${key} bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--hover-bg)]`;
const keyFn = `${key} bg-[var(--hover-bg)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]`;
const keyOp = `${key} bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/20`;
const keyEquals = `${key} bg-[var(--accent-solid)] border border-[var(--accent-solid)] text-white hover:opacity-90`;

export default function QuickCalculator() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"calc" | "history">("calc");
  const [display, setDisplay] = useState("0");
  const [trail, setTrail] = useState("");
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [history, setHistory] = useState<{ expr: string; result: string }[]>([]);

  function inputDigit(d: string) {
    if (waiting) { setDisplay(d); setWaiting(false); return; }
    setDisplay(display === "0" ? d : display + d);
  }
  function inputDot() {
    if (waiting) { setDisplay("0."); setWaiting(false); return; }
    if (!display.includes(".")) setDisplay(display + ".");
  }
  function clearAll() {
    setDisplay("0"); setTrail(""); setPrev(null); setOp(null); setWaiting(false);
  }
  function toggleSign() {
    setDisplay(display === "0" ? display : display.startsWith("-") ? display.slice(1) : "-" + display);
  }
  function percent() {
    setDisplay(trimFloat((parseFloat(display) || 0) / 100));
  }
  function chooseOp(next: Op) {
    const val = parseFloat(display) || 0;
    if (prev !== null && op && !waiting) {
      const result = applyOp(prev, val, op);
      setDisplay(trimFloat(result));
      setPrev(result);
      setTrail(`${fmt(trimFloat(result))} ${next}`);
    } else {
      setPrev(val);
      setTrail(`${fmt(display)} ${next}`);
    }
    setOp(next);
    setWaiting(true);
  }
  function equals() {
    if (prev === null || !op) return;
    const val = parseFloat(display) || 0;
    const result = applyOp(prev, val, op);
    const exprStr = `${trail} ${fmt(display)}`;
    const resultStr = fmt(trimFloat(result));
    setHistory((h) => [{ expr: exprStr, result: resultStr }, ...h].slice(0, 50));
    setDisplay(trimFloat(result));
    setTrail(exprStr);
    setPrev(null);
    setOp(null);
    setWaiting(true);
  }

  // Keyboard support while the calc view is open — skipped if the user is
  // typing into an actual form field elsewhere on the page.
  useEffect(() => {
    if (!open || view !== "calc") return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (e.key >= "0" && e.key <= "9") { inputDigit(e.key); return; }
      if (e.key === ".") { inputDot(); return; }
      if (e.key === "+") { chooseOp("+"); return; }
      if (e.key === "-") { chooseOp("-"); return; }
      if (e.key === "*") { chooseOp("×"); return; }
      if (e.key === "/") { e.preventDefault(); chooseOp("÷"); return; }
      if (e.key === "%") { percent(); return; }
      if (e.key === "Enter" || e.key === "=") { e.preventDefault(); equals(); return; }
      if (e.key === "Backspace") { if (!waiting) setDisplay((d) => (d.length > 1 ? d.slice(0, -1) : "0")); return; }
      if (e.key === "Escape") { clearAll(); return; }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, view, display, trail, prev, op, waiting]);

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 w-72 glass-popover rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
            <span className="text-[13px] text-[var(--text-primary)] font-medium">
              {view === "calc" ? "Calculator" : "History Tape"}
            </span>
            <div className="flex items-center gap-2">
              {view === "history" && history.length > 0 && (
                <button type="button" onClick={() => setHistory([])} className="text-xs text-[var(--accent-green)] font-medium hover:underline cursor-pointer">
                  Clear
                </button>
              )}
              <button type="button" onClick={() => setView((v) => (v === "calc" ? "history" : "calc"))} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer" aria-label="Toggle history">
                <Clock className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer" aria-label="Close calculator">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {view === "history" ? (
            <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border-subtle)]">
              {history.length === 0 ? (
                <div className="px-4 py-8 text-center text-[11px] text-[var(--text-muted)] font-mono">No calculations yet.</div>
              ) : (
                history.map((h, i) => (
                  <div key={i} className="px-4 py-2.5 text-right">
                    <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">{h.expr}</div>
                    <div className="text-base font-mono font-bold text-[var(--text-primary)]">{h.result}</div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="p-4">
              <div className="mb-3 px-2 text-right">
                <div className="h-4 text-[11px] text-[var(--text-muted)] font-mono truncate">{trail}</div>
                <div className="text-3xl font-mono font-bold text-[var(--text-primary)] truncate">{fmt(display)}</div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <button type="button" className={keyFn} onClick={clearAll}>AC</button>
                <button type="button" className={keyFn} onClick={toggleSign}>+/-</button>
                <button type="button" className={keyFn} onClick={percent}>%</button>
                <button type="button" className={keyOp} onClick={() => chooseOp("÷")}>÷</button>

                <button type="button" className={keyDigit} onClick={() => inputDigit("7")}>7</button>
                <button type="button" className={keyDigit} onClick={() => inputDigit("8")}>8</button>
                <button type="button" className={keyDigit} onClick={() => inputDigit("9")}>9</button>
                <button type="button" className={keyOp} onClick={() => chooseOp("×")}>×</button>

                <button type="button" className={keyDigit} onClick={() => inputDigit("4")}>4</button>
                <button type="button" className={keyDigit} onClick={() => inputDigit("5")}>5</button>
                <button type="button" className={keyDigit} onClick={() => inputDigit("6")}>6</button>
                <button type="button" className={keyOp} onClick={() => chooseOp("-")}>−</button>

                <button type="button" className={keyDigit} onClick={() => inputDigit("1")}>1</button>
                <button type="button" className={keyDigit} onClick={() => inputDigit("2")}>2</button>
                <button type="button" className={keyDigit} onClick={() => inputDigit("3")}>3</button>
                <button type="button" className={keyOp} onClick={() => chooseOp("+")}>+</button>

                <button type="button" className={`${keyDigit} col-span-2`} onClick={() => inputDigit("0")}>0</button>
                <button type="button" className={keyDigit} onClick={inputDot}>.</button>
                <button type="button" className={keyEquals} onClick={equals}>=</button>
              </div>
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer text-white bg-[var(--accent-solid)] hover:opacity-90 shadow-lg"
        aria-label="Quick calculator"
        title="Quick calculator"
      >
        {open ? <X className="w-5 h-5" /> : <Calculator className="w-5 h-5" />}
      </button>
    </div>
  );
}
