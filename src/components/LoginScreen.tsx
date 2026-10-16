import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, ArrowLeft } from "lucide-react";
import energyBaeLogo from "../assets/brand/energybae-logo.png";
import wallpaper from "../assets/brand/login-background.png";
import { loadScript } from "../services/scriptLoader";
import { useAuth } from "../contexts/AuthContext";

// window.google's type (both the oauth2 flow googleAuthService.ts uses and
// the id flow this file uses) is declared once, in googleAuthService.ts —
// TS ambient globals apply project-wide, no import needed to see it here.
const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";

type ButtonState = "idle" | "loading" | "success";

/** onBack: standalone scanner — employee sign-in is optional, so offer a way back to the public scanner. */
export default function LoginScreen({ onBack }: { onBack?: () => void } = {}) {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [buttonState, setButtonState] = useState<ButtonState>("idle");
  const googleBtnBoxRef = useRef<HTMLDivElement>(null);
  const googleBtnMountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    loadScript(GIS_SCRIPT_URL)
      .then(() => {
        if (cancelled || !window.google) return;
        const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
        if (!clientId) {
          setError("Google sign-in isn't configured for this app.");
          return;
        }
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (resp) => {
            try {
              setError(null);
              setButtonState("loading");
              await loginWithGoogle(resp.credential);
              setButtonState("success");
            } catch (err: any) {
              setButtonState("idle");
              setError(err?.message || "Sign-in failed.");
            }
          },
        });
        // Renders Google's real button, invisible, stacked over the custom-
        // styled one below so clicks land on it. prompt() (One Tap) was used
        // here before, but Google silently suppresses it in common cases
        // (dismissal cooldown, no active Google session, third-party cookies
        // blocked) with no way to force it open — a real button click is a
        // direct user gesture and doesn't hit that suppression.
        if (googleBtnMountRef.current) {
          window.google.accounts.id.renderButton(googleBtnMountRef.current, {
            theme: "filled_white",
            size: "large",
            width: Math.round(Math.min(googleBtnBoxRef.current?.offsetWidth || 320, 400)),
            text: "continue_with",
          });
        }
        setReady(true);
      })
      .catch(() => setError("Couldn't load Google sign-in. Check your connection and try again."));

    return () => {
      cancelled = true;
    };
  }, [loginWithGoogle]);

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-black">
      {onBack && (
        <button type="button" onClick={onBack}
          className="absolute top-4 left-4 z-20 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium text-white backdrop-blur cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Back to scanner
        </button>
      )}
      {/* ── Wallpaper: full bleed on mobile, left ~58% on desktop ──────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.1, ease: "easeOut" }}
        className="absolute inset-0 overflow-hidden"
      >
        {/* Anchored left/bottom on desktop so the tagline + feature icons
            baked into the image stay in frame; on narrow/tall mobile
            viewports that same crop cuts the tagline mid-word, so mobile
            anchors higher/centered and the bottom fade below hides whatever
            text sliver still shows. */}
        <div
          className="absolute inset-0 bg-cover bg-no-repeat bg-[position:center_5%] lg:bg-[position:left_75%]"
          style={{ backgroundImage: `url(${wallpaper})` }}
        />
        {/* Dark scrim: strong and flat on mobile (the card sits directly on
            top of the image, wherever it lands); on desktop it fades in
            left-to-right so the card's right-hand corner is legible while
            the left side (logo mark, tagline) stays clear. */}
        <div className="absolute inset-0 bg-black/65 lg:bg-gradient-to-r lg:from-black/10 lg:via-black/25 lg:to-black/70" />
        {/* Desktop-only: a radial ellipse anchored under the card's corner,
            layered on top of the linear scrim above, tightens legibility
            right around the card without darkening the rest of the scene. */}
        <div
          className="absolute inset-0 hidden lg:block"
          style={{ backgroundImage: "radial-gradient(ellipse 1000px 700px at 100% 100%, rgba(4,9,14,0.35), transparent 60%)" }}
        />
        {/* Mobile-only bottom fade: the baked-in tagline/icons don't fit this
            crop cleanly, so hide them fully rather than show a cut-off sliver
            — the sr-only text below covers the a11y content. */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/95 via-black/70 to-transparent lg:hidden" />
        {/* Screen-reader text for the tagline/feature list baked into the
            image's pixels — invisible to assistive tech otherwise. */}
        <span className="sr-only">Powering a sustainable tomorrow. Sustainable future, smart energy, reliable solutions.</span>
      </motion.div>

      {/* ── Sign-in card ─────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex items-center justify-center lg:justify-end p-5 sm:p-8 lg:pr-[6%]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
          // Fixed dark glass, NOT the theme's card colour: this screen always
          // sits on the dark wallpaper with white text, so in the (default)
          // light theme a themed card turned white and hid the text.
          className="rounded-3xl w-full max-w-[400px] p-8 sm:p-9 flex flex-col items-center gap-2 text-center border border-sky-400/25 backdrop-blur-xl"
          style={{
            background: "linear-gradient(160deg, rgba(15, 28, 44, 0.82), rgba(6, 12, 22, 0.88))",
            boxShadow:
              "0 30px 80px -20px rgba(0, 0, 0, 0.65), 0 4px 30px rgba(37, 99, 235, 0.18), inset 0 1px 1px rgba(96, 165, 250, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
          }}
        >
          <motion.img
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            src={energyBaeLogo}
            alt="EnergyBae"
            className="w-[150px] object-contain mb-2"
          />

          <h1 className="text-2xl sm:text-3xl font-bold font-display text-white">Welcome Back!</h1>
          <p className="text-sm text-white/60 mb-6">Sign in with Google to continue to your account</p>

          <div className="relative w-full mt-2">
            {/* Ambient dual-tone glow behind the button, breathing slowly. */}
            <div
              className="absolute -inset-4 rounded-2xl pointer-events-none z-0 opacity-55 animate-[googleGlowPulse_3.6s_ease-in-out_infinite] motion-reduce:animate-none"
              style={{
                background:
                  "radial-gradient(circle at 25% 30%, rgba(63,178,232,0.40), transparent 60%), radial-gradient(circle at 75% 70%, rgba(142,226,75,0.34), transparent 60%)",
                filter: "blur(22px)",
              }}
            />
            {/* Spinning conic-gradient ring, only visible through the 1.5px padding below. */}
            <div ref={googleBtnBoxRef} className="relative z-[1] p-[1.5px] rounded-2xl overflow-hidden group">
              <div
                className="absolute -inset-y-[60%] -inset-x-[20%] animate-[googleRingSpin_4.5s_linear_infinite] group-hover:![animation-duration:2.2s] motion-reduce:animate-none"
                style={{
                  background:
                    "conic-gradient(from 0deg, #1878B4 0%, #8EE24B 26%, #3FB2E8 52%, #5CB82E 78%, #1878B4 100%)",
                }}
              />
              <motion.div
                whileHover={ready && buttonState === "idle" ? { y: -2 } : undefined}
                whileTap={ready && buttonState === "idle" ? { y: 0 } : undefined}
                className="relative z-[1] w-full min-h-[52px] px-4 py-3.5 rounded-[14.5px] bg-white text-[#1F2430] font-semibold text-[14.5px] flex items-center justify-center shadow-[0_14px_32px_-10px_rgba(0,0,0,0.55)]"
              >
                {/* Google's real button — invisible, sits on top, receives the click. */}
                <div
                  ref={googleBtnMountRef}
                  className={`absolute inset-0 opacity-0 overflow-hidden flex items-center justify-center ${
                    !ready || buttonState !== "idle" ? "pointer-events-none" : ""
                  }`}
                />
                {buttonState === "idle" && (
                  <span className="pointer-events-none flex items-center justify-center gap-2.5">
                    <svg width="19" height="19" viewBox="0 0 48 48">
                      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.3 29.4 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.3 2.8l6-6C33.6 6.5 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
                      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 15.9 18.9 13 24 13c2.8 0 5.3 1 7.3 2.8l6-6C33.6 6.5 29.1 4.5 24 4.5c-7.7 0-14.3 4.3-17.7 10.6z" />
                      <path fill="#4CAF50" d="M24 43.5c5 0 9.5-1.9 12.9-5.1l-6.3-5.3C28.6 34.5 26.4 35 24 35c-5.4 0-9.9-2.7-11.3-7.9l-6.5 5C9.6 39.1 16.2 43.5 24 43.5z" />
                      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.9 2.6-2.8 4.7-5.7 5.9l6.3 5.3C39.5 36.5 43.5 30.9 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
                    </svg>
                    <span>{ready ? "Continue with Google" : "Loading Google Sign-In…"}</span>
                  </span>
                )}
                {buttonState === "loading" && (
                  <span className="flex items-center justify-center gap-2.5">
                    <span className="w-[17px] h-[17px] rounded-full border-[2.5px] border-[#1F2430]/15 border-t-[#1878B4] animate-spin" />
                    <span>Connecting…</span>
                  </span>
                )}
                {buttonState === "success" && (
                  <span className="flex items-center justify-center gap-2.5">
                    <span className="w-[19px] h-[19px] rounded-full bg-gradient-to-br from-[#5CB82E] to-[#8EE24B] flex items-center justify-center shrink-0">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#06110a" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 12 10 18 20 6" />
                      </svg>
                    </span>
                    <span>Redirecting…</span>
                  </span>
                )}
              </motion.div>
            </div>
          </div>

          {error && (
            <div role="alert" className="w-full mt-4 p-3 bg-red-950/40 border border-red-900/50 rounded-xl flex items-start gap-2 text-xs text-red-300 text-left">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
              <span className="font-mono text-[11px] leading-relaxed">{error}</span>
            </div>
          )}

          <p className="text-xs text-white/40 leading-relaxed mt-5">
            By continuing, you agree to EnergyBae's{" "}
            <a href="#" onClick={(e) => e.preventDefault()} className="text-sky-400 hover:underline font-medium">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" onClick={(e) => e.preventDefault()} className="text-sky-400 hover:underline font-medium">
              Privacy Policy
            </a>
            .
          </p>
        </motion.div>
      </div>
    </div>
  );
}
