import { Page, Locator } from "@playwright/test";

/**
 * Perform a drag and drop operation that works with @dnd-kit
 * This uses explicit mouse movements with pointer events
 *
 * NOTE: dnd-kit requires careful timing for drag activation. In CI environments,
 * we need longer delays and more movement steps for reliable detection.
 */
export async function dragAndDropWithDndKit(
  page: Page,
  sourceLocator: Locator,
  targetLocator: Locator
): Promise<void> {
  // Ensure elements are visible and stable before getting bounding boxes
  await sourceLocator.waitFor({ state: "visible", timeout: 5000 });
  await targetLocator.waitFor({ state: "visible", timeout: 5000 });

  // Small delay to ensure layout is stable
  await page.waitForTimeout(100);

  const sourceBox = await sourceLocator.boundingBox();
  const targetBox = await targetLocator.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error("Could not find source or target element bounds");
  }

  // Start drag from the center of the source element
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;

  // End drag at the center of the target element
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  // Move to source element first
  await page.mouse.move(startX, startY);
  await page.waitForTimeout(50);

  // Press and hold - dnd-kit needs time to activate the drag sensor
  await page.mouse.down();
  await page.waitForTimeout(300); // Longer delay for CI - dnd-kit activation threshold

  // Move slightly first to trigger drag detection (dnd-kit has a distance threshold)
  const smallMoveX = startX + 10;
  const smallMoveY = startY + 10;
  await page.mouse.move(smallMoveX, smallMoveY, { steps: 3 });
  await page.waitForTimeout(100);

  // Now move to target with slower, more deliberate movement
  await page.mouse.move(endX, endY, { steps: 25 });

  // Pause over target for drop detection
  await page.waitForTimeout(200);

  // Release
  await page.mouse.up();

  // Allow time for the drop handler to process
  await page.waitForTimeout(100);
}
