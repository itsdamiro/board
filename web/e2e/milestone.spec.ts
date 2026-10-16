import type { Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Board } from "./fixtures";
import { watchProblems } from "./problems";

// The milestone (ADR 006, decision 5): pick a brand, paste a screenshot, describe it, press Enter, and the item shows in
// the grid and is the last block of the brand's Moodboard, with its image files on disk, and a delete takes it away again.
// In light by the browser's own setting and in dark by the page's toggle. The paste and the drop are simulated in the page with a generated image, because the system
// clipboard is not reliable in a headless browser (ADR 006, decision 6).

const BRAND = "sample-one";
const ROOT = resolve(import.meta.dirname, "..", "..");
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

/** The page's title is the brand menu: it shows the brand being looked at. */
function menu(page: Page) {
  return page.getByRole("button", { name: /^Brand/ });
}

async function chooseBrand(page: Page, slug: string): Promise<void> {
  await menu(page).click();
  await page.getByRole("menuitemradio", { name: slug }).click();
}

function moodboard(board: Board, slug = BRAND): string {
  return readFileSync(join(board.vault, "Brands", slug, `${slug} - Moodboard.md`), "utf8");
}

function boardFiles(board: Board, slug = BRAND): string[] {
  const root = join(board.vault, "Board", slug);
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, encoding: "utf8" }).filter((name) => /\.png$/.test(name)).sort();
}

/** Keeps a lookup for an address as the server would after a fetch (no test reaches the internet, ADR 008, decision 12): a title and a 64 by 40 picture. */
function keepLookup(board: Board, address: string, title: string): void {
  const code = [
    "import io, sys",
    "from PIL import Image",
    "from board import links, lookup",
    "buffer = io.BytesIO()",
    "Image.new('RGB', (64, 40), (200, 60, 60)).save(buffer, 'PNG')",
    "assert links.store(sys.argv[1], sys.argv[2], sys.argv[3], lookup.Found(sys.argv[4], buffer.getvalue(), 'png'))",
  ].join("\n");
  const made = spawnSync(join(ROOT, ".venv", "bin", "python"), ["-c", code, board.vault, BRAND, address, title], { cwd: ROOT, encoding: "utf8" });
  if (made.status !== 0) throw new Error(`the lookup was not kept: ${made.stderr}`);
}

function linkFiles(board: Board): string[] {
  const root = join(board.vault, "Board", BRAND, "links");
  return existsSync(root) ? readdirSync(root).sort() : [];
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`in ${scheme}`, () => {
    test.beforeEach(async ({ page, board }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto(board.url);
      if (scheme === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click();
      await expect(page.locator("html")).toHaveClass(scheme === "dark" ? /dark/ : /^(?!.*dark).*$/);
      await expect(menu(page)).toContainText(BRAND);
      await expect(page.getByRole("form", { name: "Add an item" })).toBeVisible();
    });

    test("a pasted screenshot with a description becomes an item and the last block of the Moodboard", async ({ page, board }) => {
      const problems = watchProblems(page);
      await expect(page.getByRole("form", { name: "Add an item" })).toHaveText("paste / drop image here");

      await dispatchImage(page, "paste");
      await expect(page.getByRole("img", { name: "Preview of the file to add" })).toBeVisible();
      await page.getByLabel("Description").fill("a quiet layout");
      await page.getByLabel("Description").press("Enter");

      const picture = page.getByRole("img", { name: "a quiet layout" });
      await expect(picture).toBeVisible();
      await expect(page.getByRole("img", { name: "Preview of the file to add" })).toHaveCount(0);
      await expect(page.getByLabel("Description")).toHaveCount(0); // back to the empty box
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

      // The original opens over the blurred page from the picture, it is the image that was pasted, and Escape closes it. The
      // console stays clean, which is what shows that the viewer's non-modal dialog writes no style element the policy refuses.
      await page.getByRole("button", { name: "View a quiet layout" }).click();
      const viewer = page.getByRole("dialog", { name: "a quiet layout" });
      await expect(viewer).toBeVisible();
      await expect(viewer.getByRole("img", { name: "a quiet layout" })).toHaveJSProperty("naturalWidth", WIDTH);
      await expect(viewer.getByRole("button", { name: "Previous image" })).toBeDisabled();
      await expect(viewer.getByRole("button", { name: "Next image" })).toBeDisabled(); // the only image of the brand
      await page.keyboard.press("Escape");
      await expect(viewer).toHaveCount(0);

      expect(problems).toEqual([]);
    });

    test("the delete button shows only over the card, asks first, and removes the block and its image files", async ({ page, board }) => {
      const problems = watchProblems(page);
      const before = moodboard(board);
      await dispatchImage(page, "paste");
      await page.getByLabel("Description").fill("to delete");
      await page.getByLabel("Description").press("Enter");
      await expect(page.getByRole("img", { name: "to delete" })).toBeVisible();
      expect(boardFiles(board)).toHaveLength(2);

      const remove = page.getByRole("button", { name: "Delete to delete" });
      await expect(remove).toHaveCSS("opacity", "0"); // pointer away from the card
      await page.getByRole("img", { name: "to delete" }).hover();
      await expect(remove).toHaveCSS("opacity", "1");

      await remove.click();
      const dialog = page.getByRole("dialog", { name: "Delete this item?" });
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toHaveCount(0);
      expect(moodboard(board)).toContain("to delete");

      await page.getByRole("img", { name: "to delete" }).hover();
      await remove.click();
      await dialog.getByRole("button", { name: "Delete" }).click();
      await expect(page.getByRole("img", { name: "to delete" })).toHaveCount(0);
      expect(moodboard(board)).not.toContain("to delete");
      expect(moodboard(board).trimEnd()).toBe(before.trimEnd());
      expect(boardFiles(board)).toEqual([]);
      expect(problems).toEqual([]);
    });

    test("shift-click picks several cards, and one confirmation deletes them all", async ({ page, board }) => {
      const problems = watchProblems(page);
      for (const words of ["one", "two", "three"]) {
        await dispatchImage(page, "paste");
        await page.getByLabel("Description").fill(words);
        await page.getByLabel("Description").press("Enter");
        await expect(page.getByRole("img", { name: words })).toBeVisible();
      }
      expect(boardFiles(board)).toHaveLength(6);

      await page.getByRole("img", { name: "one" }).click({ modifiers: ["Shift"] });
      await page.getByRole("img", { name: "three" }).click({ modifiers: ["Shift"] });
      await expect(page.getByRole("dialog")).toHaveCount(0); // the picture did not open the viewer
      await expect(page.getByRole("status", { name: "Selection" })).toContainText("2 selected");
      await page.getByRole("button", { name: "Delete 2" }).click();
      await page.getByRole("dialog", { name: "Delete 2 items?" }).getByRole("button", { name: "Delete" }).click();

      await expect(page.getByRole("img", { name: "one" })).toHaveCount(0);
      await expect(page.getByRole("img", { name: "three" })).toHaveCount(0);
      await expect(page.getByRole("img", { name: "two" })).toBeVisible();
      await expect(page.getByRole("status", { name: "Selection" })).toHaveCount(0);
      expect(moodboard(board)).toContain("two");
      expect(moodboard(board)).not.toMatch(/\bone\b|\bthree\b/);
      expect(boardFiles(board)).toHaveLength(2);
      expect(problems).toEqual([]);
    });

    test("a pasted address and a dropped image make one item with a source line", async ({ page, board }) => {
      const problems = watchProblems(page);
      await pasteText(page, "https://example.com/inspiration");
      await expect(page.getByText("https://example.com/inspiration")).toBeVisible();
      await dispatchImage(page, "drop");
      await expect(page.getByRole("img", { name: "Preview of the file to add" })).toBeVisible();
      await page.getByLabel("Description").fill("a footer");
      await page.getByLabel("Description").press("Enter");

      await expect(page.getByRole("link", { name: "https://example.com/inspiration" })).toBeVisible();
      expect(moodboard(board)).toMatch(/\n!\[\[[0-9a-z-]+\.png\]\]\na footer\n\[source\]\(https:\/\/example\.com\/inspiration\)\n$/);
      expect(problems).toEqual([]);
    });

    test("an address with no picture offers the lookup, remembers it unchecked, and shows a kept title and preview on its card", async ({ page, board }) => {
      const problems = watchProblems(page);
      const address = "https://example.com/looked-up";
      await pasteText(page, address);
      const checkbox = page.getByLabel("Look up the page's title and preview");
      await expect(checkbox).toBeChecked();
      await checkbox.uncheck(); // so the server makes no request: no test reaches the internet
      await page.getByLabel("Description").fill("a reference");
      const sent = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/items"));
      await page.getByLabel("Description").press("Enter");
      expect((await sent).postDataJSON()).toEqual({ description: "a reference", source: address, image: null, lookup: false });
      await expect(page.getByRole("link", { name: address })).toBeVisible();
      expect(moodboard(board)).toMatch(/\na reference\n\[source\]\(https:\/\/example\.com\/looked-up\)\n$/);
      expect(linkFiles(board)).toEqual([]);

      // The owner's choice is kept for the next address, across a reload.
      await page.reload();
      await expect(page.getByRole("form", { name: "Add an item" })).toBeVisible(); // the page listens for a paste once its box is there
      await pasteText(page, "https://example.com/another");
      await expect(page.getByLabel("Look up the page's title and preview")).not.toBeChecked();

      // What a lookup keeps is shown on the card: the picture (served by the app, so the policy lets it load), the owner's words, the title apart.
      keepLookup(board, address, "The page's own title");
      await page.reload();
      const preview = page.getByRole("img", { name: "The page's own title" });
      await expect(preview).toBeVisible();
      await expect(preview).toHaveJSProperty("naturalWidth", 64);
      const card = page.getByRole("listitem").filter({ has: preview });
      await expect(card).toContainText("a reference");
      await expect(card.getByText("The page's own title", { exact: true }).and(page.locator("p"))).toBeVisible();
      await preview.click();
      await expect(page.getByRole("dialog")).toHaveCount(0); // the viewer does not open a preview

      // Deleting the item takes the kept lookup with it.
      await card.hover();
      await page.getByRole("button", { name: "Delete a reference" }).click();
      await page.getByRole("dialog", { name: "Delete this item?" }).getByRole("button", { name: "Delete" }).click();
      await expect(preview).toHaveCount(0);
      expect(linkFiles(board)).toEqual([]);
      expect(problems).toEqual([]);
    });

    test("an address on this computer is not looked up, and is added all the same", async ({ page, board }) => {
      const problems = watchProblems(page);
      await pasteText(page, "http://127.0.0.1/private"); // refused by the server before any connection (ADR 008, decision 3)
      await expect(page.getByLabel("Look up the page's title and preview")).toBeChecked();
      await page.getByLabel("Description").fill("a local page");
      await page.getByLabel("Description").press("Enter");
      await expect(page.getByRole("link", { name: "http://127.0.0.1/private" })).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      expect(moodboard(board)).toMatch(/\na local page\n\[source\]\(http:\/\/127\.0\.0\.1\/private\)\n$/);
      expect(linkFiles(board)).toEqual([]);
      expect(problems).toEqual([]);
    });

    test("a refusal from the server is shown, and the same image can be sent again with other words", async ({ page, board }) => {
      const problems = watchProblems(page);
      await dispatchImage(page, "paste");
      await page.getByLabel("Description").fill("x".repeat(4001)); // longer than a line a person types: the server refuses it
      await page.getByLabel("Description").press("Enter");
      await expect(page.getByRole("alert")).toContainText("too long");
      expect(moodboard(board)).not.toContain("xxxx");
      expect(boardFiles(board)).toEqual([]);

      await page.getByLabel("Description").fill("just words");
      await page.getByLabel("Description").press("Enter");
      await expect(page.getByText("just words")).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      expect(moodboard(board)).toMatch(/\njust words\n$/);
      expect(boardFiles(board)).toHaveLength(2);
      // The one refusal above is the 422: the browser reports it twice, as a response and as a console line.
      expect(problems.filter((problem) => !problem.startsWith("422:") && !problem.includes("status of 422"))).toEqual([]);
    });

    test("two dropped images are added one after the other, newest first", async ({ page, board }) => {
      await dispatchImage(page, "drop", 2);
      await expect(page.getByText("Image 1 of 2")).toBeVisible();
      await page.getByLabel("Description").fill("first");
      await page.getByLabel("Description").press("Enter");
      await expect(page.getByText("Image 1 of 2")).toHaveCount(0);
      await expect(page.getByRole("img", { name: "Preview of the file to add" })).toBeVisible();
      await page.getByLabel("Description").fill("second");
      await page.getByLabel("Description").press("Enter");
      await expect(page.getByRole("img", { name: "second" })).toBeVisible();
      const names = await page.getByRole("list", { name: "Cards" }).getByRole("img").evaluateAll((images) => images.map((i) => i.getAttribute("alt")));
      expect(names).toEqual(["second", "first"]);
      expect(boardFiles(board)).toHaveLength(4);
    });
  });
}

test("the chosen brand is remembered, and each brand shows its own items", async ({ page, board }) => {
  const problems = watchProblems(page); // opening the menu must not break the Content-Security-Policy
  await page.goto(board.url);
  await dispatchImage(page, "paste");
  await page.getByLabel("Description").fill("in one");
  await page.getByLabel("Description").press("Enter");
  await expect(page.getByText("in one")).toBeVisible();

  await chooseBrand(page, "sample-two");
  await expect(menu(page)).toContainText("sample-two");
  await expect(page.getByText("in one")).toHaveCount(0);

  await page.reload();
  await expect(menu(page)).toContainText("sample-two");
  await chooseBrand(page, "sample-one");
  await expect(page.getByText("in one")).toBeVisible();
  expect(problems).toEqual([]);
});

test("the brand's summary is the first card, from its hub note", async ({ page, board }) => {
  await page.goto(board.url);
  await expect(page.getByRole("region", { name: "About this brand" })).toContainText("A made-up brand called sample-one.");
});
