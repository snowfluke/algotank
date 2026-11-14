// The demo on the landing page: plays a recorded round on the board, lights the rule
// the demo tank used on each turn, and swaps to another recorded round when the
// visitor moves a rule. Under reduced motion nothing plays by itself: a new order
// shows its last turn and its result at once, and "Play the round" plays it.

import { DEMO_COPY, type LandingLanguage } from "./demo-copy.ts";
import type { DemoData, DemoFrame, DemoRoundData } from "./demo-data.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Fields per tank in DemoFrame.bots: x, y, heading, water, points. */
const FIELDS = 5;

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`The landing page has no element "${selector}".`);
  return element;
}

function svgGroup(className?: string): SVGGElement {
  const group = document.createElementNS(SVG_NS, "g");
  if (className !== undefined) group.setAttribute("class", className);
  return group;
}

/** The angle equal to `target` that is closest to `previous`, so a turn goes the short way (board/boardHelpers.ts, unwrapAngle). */
function unwrapAngle(previous: number, target: number): number {
  let delta = (((target - previous) % 360) + 360) % 360;
  if (delta > 180) delta -= 360;
  return previous + delta;
}

interface TankNodes {
  readonly place: SVGGElement;
  readonly turn: SVGGElement;
  readonly react: SVGGElement;
  readonly hatch: SVGGElement | null;
  readonly gauge: SVGGElement;
  angle: number;
  water: number;
}

function restart(element: Element, className: string): void {
  element.setAttribute("class", "ab-anim");
  // Reading the box restarts the CSS animation when the same class comes back.
  element.getBoundingClientRect();
  element.setAttribute("class", `ab-anim ${className}`);
}

async function start(): Promise<void> {
  const script = document.querySelector<HTMLScriptElement>("script[data-demo]");
  const source = script?.dataset.demo;
  if (source === undefined) throw new Error("The demo script has no data-demo address.");
  const response = await fetch(source);
  if (!response.ok) throw new Error(`The demo data did not load (HTTP ${response.status}).`);
  const data = (await response.json()) as DemoData;

  const language: LandingLanguage = document.documentElement.lang === "en" ? "en" : "id";
  const copy = DEMO_COPY[language];
  const board = required<SVGSVGElement>(document, "[data-demo-board]");
  const rulesBox = required<HTMLElement>(document, "[data-demo-rules]");
  const list = required<HTMLOListElement>(rulesBox, ".rule-list");
  const fallback = required<HTMLElement>(rulesBox, ".rule-fallback");
  const marker = required<HTMLElement>(rulesBox, ".rule-marker");
  const turnText = required<HTMLElement>(document, "[data-demo-turn]");
  const pointsText = required<HTMLElement>(document, "[data-demo-points]");
  const resultText = required<HTMLElement>(document, "[data-demo-result]");
  const replay = required<HTMLButtonElement>(document, "[data-demo-replay]");
  const layers = {
    under: required<SVGGElement>(board, '[data-layer="under"]'),
    tanks: required<SVGGElement>(board, '[data-layer="tanks"]'),
    over: required<SVGGElement>(board, '[data-layer="over"]'),
    gauges: required<SVGGElement>(board, '[data-layer="gauges"]'),
  };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const { cell, tankScale, tankLift, turretX } = data.board;
  const fxMs = Math.max(300, Math.min(700, data.tickMs));
  board.style.setProperty("--tick-ms", `${data.tickMs}ms`);
  board.style.setProperty("--fx-ms", `${fxMs}ms`);

  const selfIndex = data.tanks.findIndex((tank) => tank.self);
  // SVG has no z-index: the demo tank is added last, so it stays on top.
  const drawOrder = [...data.tanks.keys()].sort((a, b) => Number(a === selfIndex) - Number(b === selfIndex));
  const tanks = new Map<number, TankNodes>();
  for (const index of drawOrder) {
    const tank = data.tanks[index];
    if (tank === undefined) continue;
    const place = svgGroup("ab-move");
    const lift = svgGroup();
    lift.setAttribute("transform", `translate(0 ${-tankLift}) scale(${tankScale})`);
    const turn = svgGroup("ab-move");
    const react = svgGroup("ab-anim");
    react.innerHTML = tank.hull;
    turn.append(react);
    let hatch: SVGGElement | null = null;
    if (tank.hatch !== null) {
      const at = svgGroup();
      at.setAttribute("transform", `translate(${turretX} 0)`);
      hatch = svgGroup("ab-move");
      hatch.innerHTML = tank.hatch;
      at.append(hatch);
      turn.append(at);
    }
    lift.append(turn);
    place.append(lift);
    layers.tanks.append(place);
    const gauge = svgGroup("ab-move");
    layers.gauges.append(gauge);
    tanks.set(index, { place, turn, react, hatch, gauge, angle: 0, water: -1 });
  }

  let order = [...list.querySelectorAll<HTMLElement>("li[data-rule]")].map((item) => item.dataset.rule ?? "");
  let round = roundFor(order);
  let frameIndex = 0;
  let timer: number | null = null;

  function roundFor(keys: readonly string[]): DemoRoundData {
    const found = data.rounds[keys.join("-")];
    if (found === undefined) throw new Error(`The demo has no round for the order ${keys.join(", ")}.`);
    return found;
  }

  function showFrame(frame: DemoFrame, animate: boolean): void {
    board.classList.toggle("ab-live", animate);
    for (const [index, nodes] of tanks) {
      const at = index * FIELDS;
      const [x = 0, y = 0, heading = 0, water = 0] = frame.bots.slice(at, at + 4);
      const cx = (x + 0.5) * cell;
      const cy = (y + 0.5) * cell;
      nodes.angle = unwrapAngle(nodes.angle, heading);
      nodes.place.style.transform = `translate(${cx}px, ${cy}px)`;
      nodes.gauge.style.transform = `translate(${cx}px, ${cy}px)`;
      nodes.turn.style.transform = `rotate(${nodes.angle}deg)`;
      if (nodes.hatch !== null) nodes.hatch.style.transform = `rotate(${-nodes.angle}deg)`;
      if (nodes.water !== water) {
        nodes.gauge.innerHTML = data.gauges[water] ?? "";
        nodes.water = water;
      }
      if (animate && frame.hit.includes(index)) restart(nodes.react, "ab-wobble");
      else if (animate && frame.fired.includes(index)) restart(nodes.react, "ab-recoil");
    }
    const shots = frame.shots.map((id) => data.shots[id]).filter((shot) => shot !== undefined);
    layers.under.innerHTML = shots.map((shot) => shot.under).join("");
    layers.over.innerHTML = shots.map((shot) => shot.over).join("");
    lightRule(frame.rule);
    const points = frame.bots[selfIndex * FIELDS + 4] ?? 0;
    const total = round.frames.length - 1;
    turnText.textContent = copy.turn(frameIndex, total);
    pointsText.textContent = copy.points(points);
  }

  function lightRule(position: number): void {
    const items = [...list.querySelectorAll<HTMLElement>("li[data-rule]")];
    const active = position < 0 ? (frameIndex === 0 ? null : fallback) : (items[position] ?? null);
    for (const item of [...items, fallback]) item.toggleAttribute("data-active", item === active);
    if (active === null) {
      marker.removeAttribute("data-shown");
      return;
    }
    marker.setAttribute("data-shown", "");
    marker.style.transform = `translateY(${active.offsetTop + active.offsetHeight / 2}px)`;
  }

  function stop(): void {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  }

  function finish(): void {
    stop();
    resultText.textContent = copy.finished(round.rank, data.tanks.length);
    replay.textContent = copy.playAgain;
    replay.hidden = false;
  }

  function play(): void {
    stop();
    frameIndex = 0;
    resultText.textContent = "";
    replay.hidden = true;
    showFrame(round.frames[0] ?? fail(), false);
    timer = window.setInterval(() => {
      frameIndex += 1;
      const frame = round.frames[frameIndex];
      if (frame === undefined) {
        finish();
        return;
      }
      showFrame(frame, !reduceMotion.matches);
      if (frameIndex === round.frames.length - 1) finish();
    }, data.tickMs);
  }

  /** Reduced motion: the last turn and the result, with no movement. */
  function showEnd(): void {
    stop();
    frameIndex = round.frames.length - 1;
    showFrame(round.frames[frameIndex] ?? fail(), false);
    resultText.textContent = copy.finished(round.rank, data.tanks.length);
    replay.textContent = copy.playRound;
    replay.hidden = false;
  }

  function begin(): void {
    if (reduceMotion.matches) showEnd();
    else play();
  }

  function fail(): never {
    throw new Error("A demo round has no turns.");
  }

  function move(item: HTMLElement, way: "up" | "down"): void {
    const items = [...list.querySelectorAll<HTMLElement>("li[data-rule]")];
    const from = items.indexOf(item);
    const to = way === "up" ? from - 1 : from + 1;
    const other = items[to];
    if (from < 0 || other === undefined) return;
    if (way === "up") list.insertBefore(item, other);
    else list.insertBefore(other, item);
    const moved = [...list.querySelectorAll<HTMLElement>("li[data-rule]")];
    moved.forEach((li, index) => {
      const number = li.querySelector(".rule-number");
      if (number !== null) number.textContent = String(index + 1);
      required<HTMLButtonElement>(li, '[data-move="up"]').disabled = index === 0;
      required<HTMLButtonElement>(li, '[data-move="down"]').disabled = index === moved.length - 1;
    });
    // Keep the focus on the moved rule; at the end of the list, on its other button.
    const same = required<HTMLButtonElement>(item, `[data-move="${way}"]`);
    (same.disabled ? required<HTMLButtonElement>(item, `[data-move="${way === "up" ? "down" : "up"}"]`) : same).focus();
    order = moved.map((li) => li.dataset.rule ?? "");
    round = roundFor(order);
    begin();
  }

  list.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button[data-move]");
    const item = button?.closest<HTMLElement>("li[data-rule]");
    if (button === null || button === undefined || item === null || item === undefined) return;
    move(item, button.dataset.move === "up" ? "up" : "down");
  });
  replay.addEventListener("click", play);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || timer === null) return;
    // A hidden tab stops the round instead of playing it unseen; the button starts it again.
    stop();
    replay.textContent = copy.playAgain;
    replay.hidden = false;
  });

  rulesBox.setAttribute("data-ready", "");
  begin();
}

start().catch((error: unknown) => {
  // The rest of the page works without the demo, so it says so under the board and keeps going.
  const result = document.querySelector("[data-demo-result]");
  if (result !== null) result.textContent = DEMO_COPY[document.documentElement.lang === "en" ? "en" : "id"].failed;
  console.error(error);
});
