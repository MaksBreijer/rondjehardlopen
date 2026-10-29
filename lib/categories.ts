import type { Category } from "./types";

export interface CategoryInfo {
  id: Category;
  label: string;
  emoji: string;
  icon: "coffee" | "croissant" | "cart" | "pine" | "spark";
  blurb: string;
  /** catchy route name when a stop of this category is part of the route */
  routeName: string;
  noun: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: "coffee", label: "Koffie", emoji: "☕", icon: "coffee", blurb: "Koffietentjes en cafés", routeName: "De koffiepauze", noun: "koffiestop" },
  { id: "bakery", label: "Bakker", emoji: "🥐", icon: "croissant", blurb: "Brood, gebak, iets lekkers", routeName: "De bakkersronde", noun: "bakkerstop" },
  { id: "supermarket", label: "Supermarkt", emoji: "🛒", icon: "cart", blurb: "Onderweg iets halen", routeName: "De boodschappenronde", noun: "supermarktstop" },
  { id: "green", label: "Groen", emoji: "🌳", icon: "pine", blurb: "Parken en natuur", routeName: "De groene omweg", noun: "groene stop" },
  { id: "surprise", label: "Verrassing", emoji: "📍", icon: "spark", blurb: "Een bijzondere plek", routeName: "De verrassingsbestemming", noun: "verrassingsstop" },
];

export const categoryInfo = (id: Category) => CATEGORIES.find((c) => c.id === id)!;
