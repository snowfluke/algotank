// The landing page as static HTML, one file per language. Rendered at build time
// with React so every text is escaped; the browser gets plain HTML, the CSS and the
// demo's script, and no React.

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import type { ActionRef } from "@game/engine";
import { paths } from "../src/app/route.ts";
import { PresenterArenaArt, PrivateArenaArt } from "../src/home/EntryArt.tsx";
import { ArenaArt } from "../src/publicplay/ArenaArt.tsx";
import { TankBadge } from "../src/tank/TankBadge.tsx";
import { actionText, conditionText } from "../src/vocabulary/sentence.ts";
import type { LandingCopy } from "./copy.ts";
import { DEMO_FALLBACK, DEMO_RULES, START_ORDER } from "./demo-round.ts";

export interface PageInput {
  readonly copy: LandingCopy;
  /** The game's address with no slash at the end. Every link into the game starts with it. */
  readonly gameUrl: string;
  /** From this page to the output root: "" for the Indonesian page, "../" for the English one. */
  readonly base: string;
  /** The other language's page, relative to this one. */
  readonly otherLanguageHref: string;
  readonly css: string;
  /** The board's floor and grid, and its viewBox, from board-markup.tsx. */
  readonly floor: string;
  readonly viewBox: string;
  /** The demo tank's hull, for the marker that points at the rule the tank used. */
  readonly markerTank: string;
}

const ICON = { size: 20, strokeWidth: 2.5, "aria-hidden": true } as const;

function RuleCard({ copy, ruleKey, index }: { copy: LandingCopy; ruleKey: keyof typeof DEMO_RULES; index: number }) {
  const rule = DEMO_RULES[ruleKey];
  const condition = rule.conditions[0];
  if (condition === undefined || "steps" in rule.action) throw new Error(`The demo rule "${ruleKey}" must have one condition and one action.`);
  const v = copy.vocabulary;
  return (
    <li className="rule" data-rule={ruleKey}>
      <span className="rule-number" aria-hidden="true">
        {index + 1}
      </span>
      <p className="rule-text">
        <span className="rule-when">{v.rule.when}</span> {conditionText(v, condition)}
        <span className="rule-then"> → </span>
        <span className="rule-action">{actionText(v, rule.action as ActionRef)}</span>
      </p>
      <span className="rule-move">
        <button type="button" className="icon-button press" data-move="up" aria-label={copy.demo.moveUp} disabled={index === 0}>
          <ChevronUp {...ICON} />
        </button>
        <button type="button" className="icon-button press" data-move="down" aria-label={copy.demo.moveDown} disabled={index === START_ORDER.length - 1}>
          <ChevronDown {...ICON} />
        </button>
      </span>
    </li>
  );
}

function Hero({ input }: { input: PageInput }) {
  const { copy, gameUrl } = input;
  const v = copy.vocabulary;
  return (
    <section className="hero" aria-labelledby="hero-heading">
      <div className="hero-copy">
        <h1 id="hero-heading">{copy.hero.heading}</h1>
        <p className="lead">{copy.hero.sentence}</p>
      </div>
      <div className="rules" data-demo-rules="">
        <h2 className="sr-only">{copy.hero.rulesLabel}</h2>
        <ol className="rule-list">
          {START_ORDER.map((key, index) => (
            <RuleCard key={key} copy={copy} ruleKey={key} index={index} />
          ))}
        </ol>
        <p className="rule rule-fallback" data-rule="fallback">
          <span className="rule-text">
            <span className="rule-when">{v.rule.fallbackLead}</span>
            <span className="rule-then"> → </span>
            <span className="rule-action">{actionText(v, DEMO_FALLBACK)}</span>
          </span>
        </p>
        <span className="rule-marker" aria-hidden="true">
          <svg viewBox="-6 -6 12 12" dangerouslySetInnerHTML={{ __html: input.markerTank }} />
        </span>
      </div>
      <figure className="demo">
        <div className="board">
          <svg className="board-svg" data-demo-board="" role="img" aria-label={copy.hero.boardLabel} viewBox={input.viewBox}>
            <g dangerouslySetInnerHTML={{ __html: input.floor }} />
            <g data-layer="under" />
            <g data-layer="tanks" />
            <g data-layer="over" />
            <g data-layer="gauges" />
          </svg>
          <noscript>
            <p className="board-noscript">{copy.hero.noScript}</p>
          </noscript>
        </div>
        <figcaption className="demo-status">
          <span className="demo-counters">
            <span data-demo-turn="" className="tabular" />
            <span data-demo-points="" className="tabular demo-points" />
          </span>
          <span className="demo-result" data-demo-result="" aria-live="polite" />
          <button type="button" className="button button-secondary press" data-demo-replay="" hidden>
            {copy.demo.playAgain}
          </button>
          <span className="demo-you">
            <span className="you-ring" aria-hidden="true" />
            {copy.hero.yourTank}
          </span>
        </figcaption>
      </figure>
      <div className="hero-actions">
        <a className="button button-primary press" href={`${gameUrl}${paths.play()}`}>
          {copy.actions.playNow}
        </a>
        <a className="button button-secondary press" href={`${gameUrl}${paths.join()}`}>
          {copy.actions.joinCode}
        </a>
      </div>
    </section>
  );
}

function HowItWorks({ copy }: { copy: LandingCopy }) {
  return (
    <section className="steps" aria-labelledby="steps-heading">
      <h2 id="steps-heading">{copy.round.heading}</h2>
      <ol className="step-list">
        {copy.round.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}

function ArenaRowLink({ href, art, name, text }: { href: string; art: ReactNode; name: string; text: string }) {
  return (
    <li>
      <a className="arena-row" href={href}>
        <span className="arena-art">{art}</span>
        <span className="arena-copy">
          <span className="arena-name">{name}</span>
          <span className="arena-text">{text}</span>
        </span>
        <ArrowRight {...ICON} className="arena-arrow" />
      </a>
    </li>
  );
}

function Arenas({ input }: { input: PageInput }) {
  const { copy, gameUrl } = input;
  const a = copy.arenas;
  return (
    <section className="arenas" aria-labelledby="arenas-heading">
      <div className="section-head">
        <h2 id="arenas-heading">{a.heading}</h2>
        <p>{a.sentence}</p>
      </div>
      <ul className="arena-list">
        <ArenaRowLink href={`${gameUrl}${paths.playIn("practice")}`} art={<ArenaArt kind="practice" />} {...a.practice} />
        <ArenaRowLink href={`${gameUrl}${paths.playIn("tournament")}`} art={<ArenaArt kind="tournament" />} {...a.tournament} />
        <ArenaRowLink href={`${gameUrl}${paths.monthly()}`} art={<ArenaArt kind="monthly" />} {...a.monthly} />
        <ArenaRowLink href={`${gameUrl}${paths.create("private")}`} art={<PrivateArenaArt />} {...a.private} />
        <ArenaRowLink href={`${gameUrl}${paths.create("presenter")}`} art={<PresenterArenaArt />} {...a.presenter} />
      </ul>
    </section>
  );
}

function Organisers({ input }: { input: PageInput }) {
  const { copy, gameUrl, base } = input;
  const o = copy.organisers;
  return (
    <section className="organisers" aria-labelledby="organisers-heading">
      <div className="organisers-inner">
        <div className="organisers-copy">
          <h2 id="organisers-heading">{o.heading}</h2>
          <p className="lead">{o.sentence}</p>
          <ul className="organiser-points">
            {o.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <p className="organisers-action">
            <a className="button button-primary press" href={`${gameUrl}${paths.create("presenter")}`}>
              {o.create}
            </a>
            <span className="note">{o.signInNeeded}</span>
          </p>
        </div>
        <img
          className="screenshot"
          src={`${base}assets/tournament-result.png`}
          alt={o.screenshotAlt}
          width={1280}
          height={720}
          loading="lazy"
          decoding="async"
        />
      </div>
    </section>
  );
}

function Page({ input }: { input: PageInput }) {
  const { copy, base, gameUrl } = input;
  return (
    <html lang={copy.language}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{copy.title}</title>
        <meta name="description" content={copy.description} />
        <meta property="og:title" content={copy.title} />
        <meta property="og:description" content={copy.description} />
        <meta property="og:image" content={`${gameUrl}/og-image.png`} />
        <meta name="theme-color" content="#f6f3ec" />
        <link rel="icon" href={`${base}assets/favicon.svg`} type="image/svg+xml" />
        <link rel="preload" href={`${base}assets/fredoka.woff2`} as="font" type="font/woff2" crossOrigin="" />
        <style dangerouslySetInnerHTML={{ __html: input.css }} />
      </head>
      <body>
        <header className="site-header">
          <a className="brand" href="./" aria-label={copy.header.home}>
            <TankBadge colour={1} size={36} name={null} angle={-20} />
            <span>AlgoTank</span>
          </a>
          <nav className="header-nav">
            <a className="language" href={input.otherLanguageHref} hrefLang={copy.language === "id" ? "en" : "id"}>
              {copy.header.otherLanguage}
            </a>
            <a className="button button-primary button-small press" href={`${gameUrl}${paths.play()}`}>
              {copy.header.playNow}
            </a>
          </nav>
        </header>
        <main>
          <Hero input={input} />
          <HowItWorks copy={copy} />
          <Arenas input={input} />
          <Organisers input={input} />
        </main>
        <script type="module" src={`${base}assets/demo.js`} data-demo={`${base}assets/demo.json`} />
      </body>
    </html>
  );
}

export function renderPage(input: PageInput): string {
  return `<!doctype html>\n${renderToStaticMarkup(<Page input={input} />)}\n`;
}
