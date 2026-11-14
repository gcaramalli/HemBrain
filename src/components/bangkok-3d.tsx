"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFamily } from "./family-context";

// Bangkok in 3D from 1767 to today, full screen: the engine (`src/lib/bangkok-3d.ts`, three.js, loaded only
// here) draws into this markup. Read-only, a way to learn the city by watching it grow.
export default function Bangkok3D({ back }: { back: string }) {
  const { locale, t } = useFamily();
  const root = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let stop: (() => void) | undefined;
    let gone = false;
    import("@/lib/bangkok-3d")
      .then((m) => {
        if (!gone) stop = m.mountBangkok(host, { lang: locale === "fr" ? "fr" : "en" });
      })
      .catch(() => setFailed(true));
    return () => {
      gone = true;
      stop?.();
    };
  }, [locale]);

  return (
    <div ref={root} className="bk3d fixed inset-0 z-50">
      <style>{CSS}</style>
      <canvas data-k="canvas" />
      <div data-k="labels" className="bk-labels" />

      <div className="bk-top">
        <div className="bk-panel bk-brand">
          <div className="bk-t">Bangkok · 1767 → 2026</div>
          <div className="bk-s">{t("3D timeline · schematic map")}</div>
        </div>
        <div className="bk-tools">
          <button data-k="bLabels" className="bk-chip on">{t("Names")}</button>
          <button data-k="bAuto" className="bk-chip on">{t("Auto view")}</button>
          <Link href={back} className="bk-chip bk-close" aria-label={t("Close")}>
            <X size={16} />
          </Link>
        </div>
      </div>

      <div className="bk-yearbox">
        <div data-k="year" className="bk-year">1767</div>
        <div data-k="era" className="bk-era" />
        <div className="bk-stats">
          <span>{t("Inhabitants")} <b data-k="pop">—</b></span>
          <span>{t("Buildings")} <b data-k="bld">0</b></span>
        </div>
      </div>

      <div data-k="hint" className="bk-panel bk-hint">
        {failed ? t("Couldn't start the 3D view on this device.") : t("Drag to rotate · pinch to zoom")}
        <br />
        {!failed && t("It plays by itself, or move the timeline.")}
      </div>

      <div className="bk-bottom">
        <div className="bk-panel bk-card">
          <div className="bk-row">
            <button data-k="prev" className="bk-nav" aria-label={t("Previous event")}>‹</button>
            <div className="bk-ct">
              <div data-k="cy" className="bk-cy" />
              <div data-k="ctitle" className="bk-ctitle" />
            </div>
            <button data-k="next" className="bk-nav" aria-label={t("Next event")}>›</button>
          </div>
          <p data-k="ctext" className="bk-ctext" />
        </div>
        <div className="bk-panel bk-timeline">
          <button data-k="play" className="bk-play" aria-label={t("Play / pause")}>❚❚</button>
          <div className="bk-trackwrap">
            <div data-k="ticks" className="bk-ticks" />
            <input data-k="slider" type="range" min={1767} max={2026} step={0.1} defaultValue={1767} aria-label={t("Year")} />
          </div>
          <button data-k="speed" className="bk-speed">1×</button>
        </div>
        <div className="bk-note">{t("Monument dates are historical landmarks. Populations are rough orders of magnitude, very approximate before 1900. Neither the geometry nor the scale is real.")}</div>
      </div>
    </div>
  );
}

const CSS = `
.bk3d{background:#14213a;color:#eef2f8;overflow:hidden;font-family:inherit}
.bk3d canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
.bk3d canvas:active{cursor:grabbing}
.bk3d *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.bk-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.bk-lb{position:absolute;left:0;top:0;font-size:11px;line-height:1.2;color:#fff;background:rgba(10,16,30,.62);padding:2px 7px;border-radius:9px;white-space:nowrap;border:1px solid rgba(255,255,255,.16);transition:opacity .25s;opacity:0;will-change:transform}
.bk-panel{background:rgba(10,16,30,.74);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.11);border-radius:16px}
.bk-top{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:flex-start;padding:calc(10px + env(safe-area-inset-top)) 12px 0;pointer-events:none}
.bk-top>*{pointer-events:auto}
.bk-brand{padding:8px 12px}
.bk-t{font-weight:700;font-size:15px;letter-spacing:.02em}
.bk-s{font-size:11px;color:#9fb0c8;margin-top:1px}
.bk-tools{display:flex;gap:6px}
.bk-chip{font:inherit;font-size:12px;color:#c9d6ea;background:rgba(10,16,30,.74);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:7px 12px;cursor:pointer;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:inline-flex;align-items:center}
.bk-chip.on{color:#14213a;background:#f2c14e;border-color:#f2c14e;font-weight:600}
.bk-yearbox{position:absolute;left:14px;top:calc(70px + env(safe-area-inset-top));pointer-events:none;text-shadow:0 2px 14px rgba(0,0,0,.6)}
.bk-year{font-family:Georgia,"Times New Roman",serif;font-weight:700;font-size:clamp(46px,13vw,88px);line-height:1;color:#f2c14e;font-variant-numeric:tabular-nums}
.bk-era{font-size:13px;color:#dfe8f5;margin-top:2px;font-weight:600}
.bk-stats{display:flex;gap:14px;margin-top:6px;font-size:12px;color:#aebfd8}
.bk-stats b{color:#fff;font-weight:600}
.bk-bottom{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(10px + env(safe-area-inset-bottom));width:calc(100% - 20px);max-width:620px;display:flex;flex-direction:column;gap:8px}
.bk-card{padding:10px 12px 12px}
.bk-row{display:flex;align-items:center;gap:8px}
.bk-ct{flex:1;min-width:0}
.bk-cy{font-size:11px;color:#f2c14e;font-weight:700;letter-spacing:.08em}
.bk-ctitle{font-size:15px;font-weight:700;line-height:1.25}
.bk-ctext{margin:7px 0 0;font-size:13px;line-height:1.45;color:#cdd8ea}
.bk-nav{flex:none;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);color:#fff;font-size:20px;line-height:1;cursor:pointer;padding:0 0 3px}
.bk-nav:active{background:rgba(255,255,255,.2)}
.bk-timeline{display:flex;align-items:center;gap:8px;padding:6px 10px}
.bk-play{flex:none;width:40px;height:40px;border-radius:50%;border:0;background:#f2c14e;color:#14213a;font-size:16px;font-weight:700;cursor:pointer}
.bk-speed{flex:none;min-width:42px;height:30px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:transparent;color:#dfe8f5;font-size:12px;cursor:pointer}
.bk-trackwrap{position:relative;flex:1;height:34px}
.bk-ticks{position:absolute;left:11px;right:11px;top:0;height:34px;pointer-events:none;z-index:1}
.bk-ticks i{position:absolute;top:14px;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:rgba(255,255,255,.75);transition:background .2s}
.bk-ticks i.past{background:#14213a}
.bk3d input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:34px;background:transparent;margin:0;position:relative;z-index:2;touch-action:none}
.bk3d input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(90deg,#f2c14e var(--p,0%),rgba(255,255,255,.2) var(--p,0%))}
.bk3d input[type=range]::-moz-range-track{height:6px;border-radius:3px;background:rgba(255,255,255,.2)}
.bk3d input[type=range]::-moz-range-progress{height:6px;border-radius:3px;background:#f2c14e}
.bk3d input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid #f2c14e;margin-top:-8px;box-shadow:0 1px 6px rgba(0,0,0,.5)}
.bk3d input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid #f2c14e}
.bk-hint{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);padding:10px 16px;font-size:13px;color:#e8eef9;text-align:center;max-width:300px;line-height:1.45;pointer-events:none;transition:opacity .8s}
.bk-note{font-size:10.5px;color:#8ea0bb;text-align:center;padding:0 6px 2px}
`;
