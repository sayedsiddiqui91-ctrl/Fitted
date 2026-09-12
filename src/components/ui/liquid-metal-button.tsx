"use client";

import type { ShaderMount } from "@paper-design/shaders";
import { Sparkles } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

/* Liquid-metal CTA button. Adapted for @paper-design/shaders 0.0.80 (full uniform set, dispose()),
   keyboard focus ring, readable label contrast, touch press states and prefers-reduced-motion.
   The metal and its glow are tinted with the site accent (follows light/dark theme). */

interface LiquidMetalButtonProps {
  label?: string;
  onClick?: () => void;
  viewMode?: "text" | "icon";
  /** Glow/tint colour — any CSS colour or variable. Defaults to the site's purple accent. */
  glow?: string;
}

type RGB = [number, number, number];
const FALLBACK: RGB = [91, 91, 214]; // #5b5bd6

// A lightened accent keeps the metal bright while giving the stripes the accent's hue (colour-burn tint)
const tintFor = ([r, g, b]: RGB) => [(r + (255 - r) * 0.45) / 255, (g + (255 - g) * 0.45) / 255, (b + (255 - b) * 0.45) / 255, 1];

const baseUniforms = (tint: number[]) => ({
  u_colorBack: [0, 0, 0, 0],
  u_colorTint: tint,
  u_image: undefined,
  u_isImage: false,
  u_repetition: 4,
  u_softness: 0.5,
  u_shiftRed: 0.3,
  u_shiftBlue: 0.3,
  u_distortion: 0,
  u_contour: 0,
  u_angle: 45,
  u_shape: 1, // circle
  u_fit: 1, // contain
  u_scale: 8,
  u_rotation: 0,
  u_originX: 0.5,
  u_originY: 0.5,
  u_offsetX: 0.1,
  u_offsetY: -0.1,
  u_worldWidth: 0,
  u_worldHeight: 0,
});

/** Resolves any CSS colour (incl. var(--accent)) to RGB via the browser's computed style. */
function readColor(el: HTMLElement | null): RGB | null {
  if (!el) return null;
  const c = getComputedStyle(el).color;
  const nums = c.match(/-?\d*\.?\d+/g)?.map(Number);
  if (!nums || nums.length < 3) return null;
  const [r, g, b] = nums;
  return c.startsWith("color(") ? [r * 255, g * 255, b * 255] : [r, g, b];
}

export function LiquidMetalButton({ label = "Get Started", onClick, viewMode = "text", glow = "var(--accent)" }: LiquidMetalButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);
  const [glowRgb, setGlowRgb] = useState<RGB>(FALLBACK);
  const shaderRef = useRef<HTMLDivElement>(null);
  const shaderMount = useRef<ShaderMount | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const rippleId = useRef(0);
  const hoveredRef = useRef(false);
  const reducedMotion = useRef(false);

  const dimensions = useMemo(
    () =>
      viewMode === "icon"
        ? { width: 46, height: 46, innerWidth: 42, innerHeight: 42, shaderWidth: 46, shaderHeight: 46 }
        : { width: 142, height: 46, innerWidth: 138, innerHeight: 42, shaderWidth: 142, shaderHeight: 46 },
    [viewMode],
  );

  const speed = (s: number) => shaderMount.current?.setSpeed(reducedMotion.current ? 0 : s);

  useEffect(() => {
    const styleId = "shader-canvas-style-exploded";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .shader-container-exploded canvas {
          width: 100% !important;
          height: 100% !important;
          display: block !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          border-radius: 100px !important;
        }
        @keyframes ripple-animation {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 0.6; }
          100% { transform: translate(-50%, -50%) scale(4); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = media.matches;
    const onMotionChange = () => {
      reducedMotion.current = media.matches;
      speed(hoveredRef.current ? 1 : 0.6);
    };
    media.addEventListener("change", onMotionChange);

    const rgb = readColor(probeRef.current) ?? FALLBACK;
    setGlowRgb(rgb);

    /* The animated metal is a finishing touch, not the button. Its shader library is ~90 KB and it keeps a
       WebGL canvas redrawing, which is exactly the wrong trade on a phone or a modest laptop — so it is
       fetched only when the device can clearly spare it, and only once the page is idle. The button looks
       and works the same without it. */
    let cancelled = false;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const spareCapacity = !reducedMotion.current && !window.matchMedia("(max-width: 767px)").matches && (nav.hardwareConcurrency ?? 8) >= 4 && (nav.deviceMemory ?? 8) >= 4;
    const startShader = async () => {
      if (cancelled || !shaderRef.current) return;
      try {
        const { ShaderMount: Mount, liquidMetalFragmentShader } = await import("@paper-design/shaders");
        if (cancelled || !shaderRef.current) return;
        shaderMount.current?.dispose();
        shaderMount.current = new Mount(shaderRef.current, liquidMetalFragmentShader, baseUniforms(tintFor(rgb)), undefined, 0.6);
      } catch {
        // No WebGL, or the library didn't load: the button still works and looks fine without the animated rim
        shaderMount.current = null;
      }
    };
    if (spareCapacity) {
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle(() => void startShader(), { timeout: 2500 });
      else window.setTimeout(() => void startShader(), 400);
    }

    // Follow the theme: the accent is lighter in dark mode
    const theme = new MutationObserver(() => {
      const next = readColor(probeRef.current);
      if (!next) return;
      setGlowRgb(next);
      shaderMount.current?.setUniforms({ u_colorTint: tintFor(next) });
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });

    return () => {
      cancelled = true;
      media.removeEventListener("change", onMotionChange);
      theme.disconnect();
      shaderMount.current?.dispose();
      shaderMount.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glow]);

  const handlePointerEnter = () => {
    hoveredRef.current = true;
    setIsHovered(true);
    speed(1);
  };

  const handlePointerLeave = () => {
    hoveredRef.current = false;
    setIsHovered(false);
    setIsPressed(false);
    speed(0.6);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    speed(2.4);
    setTimeout(() => speed(hoveredRef.current ? 1 : 0.6), 300);

    if (buttonRef.current && !reducedMotion.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Keyboard activation has no pointer position — ripple from the centre
      const x = e.clientX ? e.clientX - rect.left : rect.width / 2;
      const y = e.clientY ? e.clientY - rect.top : rect.height / 2;
      const ripple = { x, y, id: rippleId.current++ };
      setRipples((prev) => [...prev, ripple]);
      setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== ripple.id)), 600);
    }

    onClick?.();
  };

  const [gr, gg, gb] = glowRgb.map(Math.round);
  const glowA = (a: number) => `rgba(${gr}, ${gg}, ${gb}, ${a})`;

  const layer = (z: number, pressed = false): React.CSSProperties => ({
    position: "absolute",
    top: 0,
    left: 0,
    width: `${dimensions.width}px`,
    height: `${dimensions.height}px`,
    transformStyle: "preserve-3d",
    transition: "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.4s ease, height 0.4s ease",
    transform: `translateZ(${z}px)${pressed ? (isPressed ? " translateY(1px) scale(0.98)" : " translateY(0) scale(1)") : ""}`,
  });

  return (
    <div className="relative inline-block">
      {/* Resolves the glow colour (CSS variables included) */}
      <span ref={probeRef} aria-hidden style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", color: glow }} />
      <div style={{ perspective: "1000px", perspectiveOrigin: "50% 50%" }}>
        <div
          style={{
            position: "relative",
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            transformStyle: "preserve-3d",
            transition: "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.4s ease, height 0.4s ease",
          }}
        >
          {/* Label */}
          <div style={{ ...layer(20), display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", zIndex: 30, pointerEvents: "none" }}>
            {viewMode === "icon" ? (
              <Sparkles size={16} aria-hidden style={{ color: "#e4e4f7", filter: `drop-shadow(0px 0px 6px ${glowA(0.7)})` }} />
            ) : (
              <span style={{ fontSize: "14px", color: "#ececf8", fontWeight: 500, textShadow: `0px 1px 2px rgba(0, 0, 0, 0.5), 0px 0px 10px ${glowA(0.55)}`, whiteSpace: "nowrap" }}>{label}</span>
            )}
          </div>

          {/* Inner pill: near-black with a hint of the accent */}
          <div style={{ ...layer(10, true), zIndex: 20 }}>
            <div
              style={{
                width: `${dimensions.innerWidth}px`,
                height: `${dimensions.innerHeight}px`,
                margin: "2px",
                borderRadius: "100px",
                background: `radial-gradient(120% 140% at 50% 0%, ${glowA(0.28)} 0%, rgba(0, 0, 0, 0) 60%), linear-gradient(180deg, #1c1b2b 0%, #06060c 100%)`,
                boxShadow: isPressed ? "inset 0px 2px 4px rgba(0, 0, 0, 0.4), inset 0px 1px 2px rgba(0, 0, 0, 0.3)" : "none",
                transition: "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
          </div>

          {/* Liquid-metal rim (shader) + accent glow */}
          <div style={{ ...layer(0, true), zIndex: 10 }}>
            <div
              style={{
                height: `${dimensions.height}px`,
                width: `${dimensions.width}px`,
                borderRadius: "100px",
                boxShadow: isPressed
                  ? `0px 0px 0px 1px ${glowA(0.6)}, 0px 0px 10px 1px ${glowA(0.4)}, 0px 1px 2px 0px rgba(0, 0, 0, 0.3)`
                  : isHovered
                    ? `0px 0px 0px 1px ${glowA(0.55)}, 0px 0px 26px 5px ${glowA(0.5)}, 0px 8px 5px 0px rgba(0, 0, 0, 0.1), 0px 4px 4px 0px rgba(0, 0, 0, 0.15)`
                    : `0px 0px 0px 1px ${glowA(0.45)}, 0px 0px 18px 2px ${glowA(0.32)}, 0px 20px 12px 0px rgba(0, 0, 0, 0.08), 0px 9px 9px 0px rgba(0, 0, 0, 0.12), 0px 2px 5px 0px rgba(0, 0, 0, 0.15)`,
                transition: "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                background: glowA(0.85),
              }}
            >
              <div
                ref={shaderRef}
                className="shader-container-exploded"
                style={{ borderRadius: "100px", overflow: "hidden", position: "relative", width: `${dimensions.shaderWidth}px`, maxWidth: `${dimensions.shaderWidth}px`, height: `${dimensions.shaderHeight}px` }}
              />
            </div>
          </div>

          {/* Hit area (keyboard focusable, visible focus ring) */}
          <button
            ref={buttonRef}
            type="button"
            onClick={handleClick}
            onPointerEnter={(e) => e.pointerType === "mouse" && handlePointerEnter()}
            onPointerLeave={handlePointerLeave}
            onPointerDown={() => setIsPressed(true)}
            onPointerUp={() => setIsPressed(false)}
            onPointerCancel={() => setIsPressed(false)}
            aria-label={label}
            className="focus-visible:ring-3 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            style={{
              ...layer(25),
              background: "transparent",
              border: "none",
              cursor: "pointer",
              outline: "none",
              zIndex: 40,
              overflow: "hidden",
              borderRadius: "100px",
              touchAction: "manipulation",
            }}
          >
            {ripples.map((ripple) => (
              <span
                key={ripple.id}
                aria-hidden
                style={{
                  position: "absolute",
                  left: `${ripple.x}px`,
                  top: `${ripple.y}px`,
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${glowA(0.55)} 0%, rgba(255, 255, 255, 0) 70%)`,
                  pointerEvents: "none",
                  animation: "ripple-animation 0.6s ease-out",
                }}
              />
            ))}
          </button>
        </div>
      </div>
    </div>
  );
}
