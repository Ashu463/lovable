import {
  Briefcase,
  ChefHat,
  LayoutDashboard,
  Luggage,
  ScissorsSquare,
  ShoppingBag,
  StickyNote,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface Template {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: LucideIcon;
  prompt: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "portfolio",
    title: "Designer portfolio",
    description: "A clean, image-forward portfolio for showcasing project case studies.",
    category: "Personal",
    icon: Briefcase,
    prompt: "Build a portfolio site for a product designer, with a case-study grid and an about page.",
  },
  {
    id: "crm",
    title: "CRM for creators",
    description: "Pipeline, contacts, and deal tracking for a small creative studio.",
    category: "B2B App",
    icon: Users,
    prompt: "Build a lightweight CRM for creators to track leads, deals, and follow-ups.",
  },
  {
    id: "recipe-finder",
    title: "Recipe finder",
    description: "Search recipes by ingredients you already have on hand.",
    category: "Consumer App",
    icon: ChefHat,
    prompt: "Build a recipe finder app where you enter ingredients you have and get matching recipes.",
  },
  {
    id: "booking",
    title: "Booking site for a barber",
    description: "Service list, calendar picker, and confirmation flow.",
    category: "Website",
    icon: ScissorsSquare,
    prompt: "Build a booking site for a barbershop with services, a calendar picker, and booking confirmation.",
  },
  {
    id: "travel-planner",
    title: "AI travel planner",
    description: "Day-by-day itinerary generation from a destination and trip length.",
    category: "Consumer App",
    icon: Luggage,
    prompt: "Build an AI travel planner that generates a day-by-day itinerary for a destination and trip length.",
  },
  {
    id: "storefront",
    title: "E-commerce storefront",
    description: "Product grid, cart, and checkout for a small storefront.",
    category: "B2B App",
    icon: ShoppingBag,
    prompt: "Build an e-commerce storefront with a product grid, cart, and checkout flow.",
  },
  {
    id: "habit-tracker",
    title: "Habit tracker with streaks",
    description: "Daily check-ins, streak counters, and a weekly overview.",
    category: "Personal",
    icon: StickyNote,
    prompt: "Build a habit tracker with daily check-ins, streak counters, and a weekly overview.",
  },
  {
    id: "admin-dashboard",
    title: "Internal admin dashboard",
    description: "Tables, filters, and charts for an internal ops dashboard.",
    category: "Internal Tools",
    icon: LayoutDashboard,
    prompt: "Build an internal admin dashboard with a data table, filters, and a couple of summary charts.",
  },
];
