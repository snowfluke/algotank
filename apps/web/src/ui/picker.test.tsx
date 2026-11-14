/// <reference types="bun" />
// The game's own dropdown: paging with a current choice, type-ahead, the grouped flow, where
// the laptop list opens, and what the closed button renders without a DOM.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { planPages, shownPage } from "./paging.ts";
import { Picker } from "./Picker.tsx";
import { findChoice, openGroup, openPicker, placeList, stepRow, typeAhead, viewRows, type PickerOptions } from "./picker.ts";

const flat: PickerOptions<string> = {
  kind: "flat",
  choices: ["Apple", "Banana", "Blueberry", "Cherry"].map((label) => ({ value: label.toLowerCase(), label })),
};
const grouped: PickerOptions<string> = {
  kind: "grouped",
  groups: [
    { name: "Other tanks", choices: [{ value: "enemyAhead", label: "A tank is ahead" }] },
    { name: "One chosen tank", choices: [{ value: "targetAimed", label: "It aims at me" }, { value: "targetJustHit", label: "It just hit me" }] },
  ],
};

describe("paging with a current choice", () => {
  // 10 rows of 50 px in a 200 px list: 4 rows a page, so row 6 is on the second page.
  const plan = planPages(Array.from({ length: 10 }, () => 50), 200, 0, null);

  test("the list opens on the page that holds the current choice", () => {
    expect(shownPage(plan, 0, 6)).toBe(1);
    expect(shownPage(plan, 0, 9)).toBe(2);
  });

  test("an arrow key past the last row of a page shows the next page", () => {
    expect(shownPage(plan, 0, stepRow(10, 3, "ArrowDown") ?? -1)).toBe(1);
  });

  test("without an active row the page the person turned to stays, kept inside the page count", () => {
    expect(shownPage(plan, 1, null)).toBe(1);
    expect(shownPage(plan, 7, null)).toBe(2);
  });
});

describe("keys", () => {
  test("arrows move one row and stop at the ends; Home and End jump", () => {
    expect(stepRow(4, 0, "ArrowUp")).toBe(0);
    expect(stepRow(4, 3, "ArrowDown")).toBe(3);
    expect(stepRow(4, 1, "ArrowDown")).toBe(2);
    expect(stepRow(4, 2, "Home")).toBe(0);
    expect(stepRow(4, 0, "End")).toBe(3);
    expect(stepRow(4, 0, "Enter")).toBeNull();
  });

  test("a letter jumps to the next choice that starts with it, going round to the top", () => {
    const labels = ["Apple", "Banana", "Blueberry", "Cherry"];
    expect(typeAhead(labels, 0, "b")).toBe(1);
    expect(typeAhead(labels, 1, "B")).toBe(2);
    expect(typeAhead(labels, 2, "b")).toBe(1);
    expect(typeAhead(labels, 3, "a")).toBe(0);
    expect(typeAhead(labels, 0, "z")).toBeNull();
    expect(typeAhead(labels, 0, "Enter")).toBeNull();
    expect(typeAhead(labels, 0, " ")).toBeNull();
  });
});

describe("the grouped flow", () => {
  test("a flat list opens on its current choice, or on the first row for a value it does not know", () => {
    expect(openPicker(flat, "cherry")).toEqual({ view: { kind: "choices" }, active: 3 });
    expect(openPicker(flat, "mango")).toEqual({ view: { kind: "choices" }, active: 0 });
  });

  test("a grouped list opens on the group names, with the current choice's group highlighted and named", () => {
    expect(openPicker(grouped, "targetJustHit")).toEqual({ view: { kind: "groups" }, active: 1 });
    expect(viewRows(grouped, { kind: "groups" }, "targetJustHit")).toEqual([
      { kind: "group", group: 0, name: "Other tanks", current: null },
      { kind: "group", group: 1, name: "One chosen tank", current: "It just hit me" },
    ]);
  });

  test("opening a group shows its choices with the current one marked and highlighted", () => {
    const open = openGroup(grouped, 1, "targetJustHit");
    expect(open).toEqual({ view: { kind: "group", group: 1 }, active: 1 });
    expect(viewRows(grouped, open.view, "targetJustHit").map((row) => row.kind === "choice" && row.chosen)).toEqual([false, true]);
    expect(openGroup(grouped, 0, "targetJustHit").active).toBe(0);
  });

  test("findChoice looks in every group", () => {
    expect(findChoice(grouped, "enemyAhead")?.label).toBe("A tank is ahead");
    expect(findChoice(grouped, "gone")).toBeNull();
  });
});

describe("where the laptop list opens", () => {
  const viewport = { width: 1000, height: 600 };
  const pane = { left: 500, top: 60, right: 984, bottom: 540 };
  const button = (top: number) => ({ left: 520, top, right: 900, bottom: top + 48 });

  test("downward when its natural height fits below the button", () => {
    const place = placeList(button(100), viewport, pane, { width: 300, height: 300 });
    expect(place).toMatchObject({ direction: "down", top: 154, left: 520 });
    // 600 - 148 - 6 - 16
    expect(place.maxHeight).toBe(430);
  });

  test("upward when it fits only above", () => {
    const place = placeList(button(400), viewport, pane, { width: 300, height: 300 });
    // bottom edge 6 px above the button's top: 600 - 400 + 6
    expect(place).toMatchObject({ direction: "up", bottom: 206, maxHeight: 378 });
  });

  test("over the button, inside the window, when it fits on neither side", () => {
    // 412 px fits neither 230 px below nor 278 above, so it ends 16 px above the window's bottom: 600 - 16 - 412.
    expect(placeList(button(300), viewport, pane, { width: 300, height: 412 })).toMatchObject({ direction: "down", top: 172, maxHeight: 412 });
  });

  test("from the top of the window, and paged, when it is taller than the window", () => {
    expect(placeList(button(300), viewport, pane, { width: 300, height: 900 })).toMatchObject({ direction: "down", top: 16, maxHeight: 568 });
  });

  test("as wide as its longest choice, moved left to stay inside the pane, and never wider than the pane", () => {
    expect(placeList(button(100), viewport, pane, { width: 600, height: 100 })).toMatchObject({ left: 500, maxWidth: 484 });
    expect(placeList(button(100), viewport, pane, { width: 420, height: 100 }).left).toBe(520);
    // A button at 800: 984 - 420 = 564, so the list moves left until its right edge meets the pane's.
    expect(placeList({ left: 800, top: 100, right: 960, bottom: 148 }, viewport, pane, { width: 420, height: 100 }).left).toBe(564);
  });
});

describe("Picker, closed", () => {
  test("a field shows its label above a combobox button with the current choice", () => {
    const html = renderToStaticMarkup(<Picker label="Bot styles" value="banana" choices={flat.kind === "flat" ? flat.choices : []} onChange={() => undefined} data-picker="fruit" />);
    expect(html).toMatch(/<label id="[^"]+-label" for="[^"]+"[^>]*>Bot styles<\/label>/);
    expect(html).toMatch(/role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="[^"]+-label"/);
    expect(html).toContain('data-picker="fruit"');
    expect(html).toContain(">Banana</span>");
  });

  test("inline in a sentence the label is the accessible name, and a value it does not know shows the placeholder", () => {
    const html = renderToStaticMarkup(<Picker look="inline" label="Condition 1, tank" value="gone" placeholder="something unknown" groups={grouped.kind === "grouped" ? grouped.groups : []} onChange={() => undefined} />);
    expect(html).not.toContain("<label");
    expect(html).toContain('aria-label="Condition 1, tank"');
    expect(html).toContain("something unknown");
  });

  test("without a placeholder an unknown value asks the player to choose, in their language", () => {
    const html = renderToStaticMarkup(
      <I18nProvider store={createLanguageStore({ store: null, initial: "id" })}>
        <Picker label="Gaya bot" value="" choices={[{ value: "a", label: "A" }]} onChange={() => undefined} />
      </I18nProvider>,
    );
    expect(html).toContain("Pilih satu");
  });
});
