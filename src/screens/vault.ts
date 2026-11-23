import Konva from "konva";

/** The vault door's outer casing, in design coordinates. */
export const VAULT = { x: 350, y: 235, width: 740, height: 590 };
/** How far the inner door frame sits inside the casing. */
export const VAULT_INSET = 44;

/** The inner door frame, where content drawn over the vault should sit. */
export const VAULT_DOOR = {
  x: VAULT.x + VAULT_INSET,
  y: VAULT.y + VAULT_INSET,
  width: VAULT.width - VAULT_INSET * 2,
  height: VAULT.height - VAULT_INSET * 2,
};

/**
 * The grey vault door from the Start Screen design: casing, inner frame,
 * locking-wheel rings and two hinges. Not interactive.
 */
export function createVaultDoor(): Konva.Group {
  const vaultGroup = new Konva.Group({ listening: false, name: "vault-door" });

  // Outer grey vault casing
  vaultGroup.add(new Konva.Rect({
    ...VAULT,
    fill: "#d3d3d3",
    stroke: "#111111",
    strokeWidth: 4,
  }));

  // Inner recessed door frame
  vaultGroup.add(new Konva.Rect({
    ...VAULT_DOOR,
    fill: "#d9d9d9",
    stroke: "#111111",
    strokeWidth: 4,
  }));

  // Central vault locking wheel rings
  const centerX = VAULT.x + VAULT.width / 2;
  const centerY = VAULT.y + VAULT.height / 2 + 12;
  for (const radius of [175, 82]) {
    vaultGroup.add(new Konva.Circle({
      x: centerX,
      y: centerY,
      radius,
      stroke: "#6b6b6b",
      strokeWidth: 9,
    }));
  }

  // Two left-side door hinges overlapping the inner seam
  const hingeX = VAULT.x + VAULT_INSET - 16;
  for (const hy of [VAULT.y + 150, VAULT.y + 345]) {
    vaultGroup.add(new Konva.Rect({
      x: hingeX,
      y: hy,
      width: 32,
      height: 85,
      fill: "#bfbfbf",
      stroke: "#111111",
      strokeWidth: 3.5,
    }));
  }

  return vaultGroup;
}
