import { describe, expect, test } from "bun:test";
import { FLAG_COUNTRIES } from "@game/arena";
import { countriesIn, searchCountries } from "./countries.ts";

describe("the countries of the flag part", () => {
  test("are named in the page's language and sorted by that name", () => {
    const id = countriesIn("id");
    expect(id).toHaveLength(FLAG_COUNTRIES.length);
    expect(id.find((c) => c.code === "jp")?.name).toBe("Jepang");
    expect(countriesIn("en").find((c) => c.code === "jp")?.name).toBe("Japan");
    const names = id.map((c) => c.name);
    expect(names).toEqual([...names].sort(new Intl.Collator("id").compare));
  });

  test("a search finds a name by any part of it, without case or accents", () => {
    const en = countriesIn("en");
    expect(searchCountries(en, "indo").map((c) => c.code)).toEqual(["id"]);
    expect(searchCountries(en, "COTE").map((c) => c.code)).toContain("ci");
    expect(searchCountries(en, "  ")).toHaveLength(en.length);
    expect(searchCountries(en, "zzzz")).toEqual([]);
  });
});
