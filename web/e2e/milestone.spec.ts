import type { Page } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Board } from "./fixtures";
import { watchProblems } from "./problems";

// The milestone (ADR 006, decision 5): pick a brand, paste a screenshot, describe it, press Enter, and the item shows in
// the grid and is the last block of the brand's Moodboard, with its image files on disk. In light by the browser's own
// setting and in dark by the page's switch. Delete is not here: it ships with the workflow ADR 018 amendment (ADR 002,
// amendment on the screens). The paste and the drop are simulated in the page with a generated image, because the system
// clipboard is not reliable in a headless browser (ADR 006, decision 6).

const BRAND = "sample-one";
const WIDTH = 64;
const HEIGHT = 48;

/** A generated PNG as a File, made in the page with a canvas, so no image file is kept in the repository. */
async function dispatchImage(page: Page, kind: "paste" | "drop", count = 1): Promise<void> {
  await page.evaluate(
    async ({ kind, count, width, height }) => {
      const files: File[] = [];
      for (let n = 0; n < count; n += 1) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (context === null) throw new Error("no canvas");
        const gradient = context.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, `hsl(${n * 90}, 70%, 40%)`);
        gradient.addColorStop(1, "hsl(200, 70%, 70%)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
        const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
        if (blob === null) throw new Error("no image");
        files.push(new File([blob], `generated-${n}.png`, { type: "image/png" }));
      }
      const data = new DataTransfer();
      files.forEach((file) => data.items.add(file));
      if (kind === "paste") document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      else document.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
    },
    { kind, count, width: WIDTH, height: HEIGHT },
  );
}

async function pasteText(page: Page, text: string): Promise<void> {
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

function moodboard(board: Board, slug = BRAND): string {
  return readFileSync(join(board.vault, "Brands", slug, `${slug} - Moodboard.md`), "utf8");
}

function boardFiles(board: Board, slug = BRAND): string[] {
  const root = join(board.vault, "Board", slug);
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, encoding: "utf8" }).filter((name) => /\.png$/.test(name)).sort();
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`in ${scheme}`, () => {
    test.beforeEach(async ({ page, board }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto(board.url);
      if (scheme === "dark") await page.getByRole("button", { name: "Dark" }).click();
      await expect(page.locator("html")).toHaveClass(scheme === "dark" ? /dark/ : /^(?!.*dark).*$/);
      await expect(page.getByRole("heading", { name: BRAND, level: 2 })).toBeVisible();
    });

    test("a pasted screenshot with a description becomes an item and the last block of the Moodboard", async ({ page, board }) => {
      const problems = watchProblems(page);
      await expect(page.getByText("Nothing here yet")).toBeVisible();

      await dispatchImage(page, "paste");
      await expect(page.getByRole("img", { name: "Preview of the file to add" })).toBeVisible();
      await page.getByLabel("Description").fill("a quiet layout");
      await page.getByLabel("Description").press("Enter");

      const picture = page.getByRole("img", { name: "a quiet layout" });
      await expect(picture).toBeVisible();
      await expect(page.getByRole("img", { name: "Preview of the file to add" })).toHaveCount(0);
      await expect(page.getByLabel("Description")).toHaveValue("");
      await expect(picture).toHaveJSProperty("naturalWidth", WIDTH); // the thumbnail has loaded, not only been placed
      const shape = await picture.evaluate((img: HTMLImageElement) => ({
        loaded: img.naturalWidth,
        ratio: img.clientWidth / img.clientHeight,
        width: img.getAttribute("width"),
        height: img.getAttribute("height"),
      }));
      expect(shape).toMatchObject({ loaded: WIDTH, width: String(WIDTH), height: String(HEIGHT) });
      expect(shape.ratio).toBeCloseTo(WIDTH / HEIGHT, 1); // shown in its own proportions, not cropped

      const text = moodboard(board);
      expect(text).toMatch(/\n!\[\[[0-9a-z-]+\.png\]\]\na quiet layout\n$/);
      const files = boardFiles(board);
      expect(files).toHaveLength(2);
      expect(files.some((name) => name.startsWith("thumbs"))).toBe(true);
      expect(moodboard(board, "sample-two")).not.toContain("quiet");

      // The original opens in a new tab from the picture's link, and it is the image that was pasted.
      const original = page.getByRole("link", { name: "a quiet layout" });
      const [tab] = await Promise.all([page.context().waitForEvent("page"), original.click()]);
      await expect(tab.locator("img")).toBeVisible();
      await tab.close();

      expect(problems).toEqual([]);
    });

    test("a pasted address and a dropped image make one item with a source line", async ({ page, board }) => {
      const problems = watchProblems(page);
      await pasteText(page, "https://example.com/inspiration");
      await expect(page.getByText("https://example.com/inspiration")).toBeVisible();
      await dispatchImage(page, "drop");
      await expect(page.getByRole("img", { name: "Preview of the file to add" })).toBeVisible();
      await page.getByLabel("Description").fill("a footer");
      await page.getByRole("button", { name: "Add", exact: true }).click();

      await expect(page.getByRole("link", { name: "https://example.com/inspiration" })).toBeVisible();
      expect(moodboard(board)).toMatch(/\n!\[\[[0-9a-z-]+\.png\]\]\na footer\n\[source\]\(https:\/\/example\.com\/inspiration\)\n$/);
      expect(problems).toEqual([]);
    });

    test("an item with only a description is added, and a refusal from the server is shown", async ({ page, board }) => {
      const problems = watchProblems(page);
      await page.getByLabel("Description").fill("# a heading is not an item");
      await page.getByLabel("Description").press("Enter");
      await expect(page.getByRole("alert")).toContainText("would not be read back");
      expect(moodboard(board)).not.toContain("heading");

      await page.getByLabel("Description").fill("just words");
      await page.getByLabel("Description").press("Enter");
      await expect(page.getByText("just words")).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      expect(moodboard(board)).toMatch(/\njust words\n$/);
      expect(boardFiles(board)).toEqual([]);
      // The one refusal above is the 422: the browser reports it twice, as a response and as a console line.
      expect(problems.filter((problem) => !problem.startsWith("422:") && !problem.includes("status of 422"))).toEqual([]);
    });

    test("two dropped images are added one after the other, newest first", async ({ page, board }) => {
      await dispatchImage(page, "drop", 2);
      await expect(page.getByText("Image 1 of 2")).toBeVisible();
      await page.getByLabel("Description").fill("first");
      await page.getByLabel("Description").press("Enter");
      await expect(page.getByText("One image ready")).toBeVisible();
      await page.getByLabel("Description").fill("second");
      await page.getByLabel("Description").press("Enter");
      await expect(page.getByRole("img", { name: "second" })).toBeVisible();
      const names = await page.getByRole("list", { name: "Moodboard items" }).getByRole("img").evaluateAll((images) => images.map((i) => i.getAttribute("alt")));
      expect(names).toEqual(["second", "first"]);
      expect(boardFiles(board)).toHaveLength(4);
    });
  });
}

test("the chosen brand is remembered, and each brand shows its own items", async ({ page, board }) => {
  await page.goto(board.url);
  await page.getByLabel("Description").fill("in one");
  await page.getByLabel("Description").press("Enter");
  await expect(page.getByText("in one")).toBeVisible();

  await page.getByRole("button", { name: "sample-two" }).click();
  await expect(page.getByRole("heading", { name: "sample-two", level: 2 })).toBeVisible();
  await expect(page.getByText("in one")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "sample-two", level: 2 })).toBeVisible();
  await page.getByRole("button", { name: "sample-one" }).click();
  await expect(page.getByText("in one")).toBeVisible();
});

test("the brand's summary comes from its hub note", async ({ page, board }) => {
  await page.goto(board.url);
  await expect(page.getByText("A made-up brand called sample-one.")).toBeVisible();
});
