import {
  BedDouble,
  Construction,
  Fuel,
  Landmark,
  NotebookPen,
  PackageMinus,
  PackagePlus,
  Scale,
  ShieldCheck,
  ShieldHalf,
  Ticket,
  TriangleAlert,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Kind } from "../domain/events.ts";

export const KIND_ICONS: Record<Kind, LucideIcon> = {
  fuel: Fuel,
  checkpoint: ShieldCheck,
  weighbridge: Scale,
  customs: Landmark,
  border: Construction,
  convoy: ShieldHalf,
  toll: Ticket,
  meal: UtensilsCrossed,
  repair: Wrench,
  breakdown: TriangleAlert,
  rest: BedDouble,
  loading: PackagePlus,
  unloading: PackageMinus,
  other: NotebookPen,
};

/** Order of the quick-entry grid on the driver's screen: the most frequent first. */
export const QUICK: Kind[] = ["fuel", "checkpoint", "weighbridge", "customs", "border", "convoy", "breakdown", "repair", "rest", "meal", "toll", "loading", "unloading", "other"];
