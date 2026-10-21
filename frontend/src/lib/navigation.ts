import {
  Compass,
  FileText,
  GraduationCap,
  Lightbulb,
  House,
  LifeBuoy,
  Map,
  MessagesSquare,
  Settings,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
};

export const primaryNav: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/counselor", label: "AI Counselor", shortLabel: "Counselor", icon: Sparkles },
  { href: "/discover", label: "Interest Quiz", shortLabel: "Quiz", icon: Lightbulb },
  { href: "/explore", label: "Explore Careers", shortLabel: "Explore", icon: Compass },
  { href: "/plan", label: "My Career Plan", shortLabel: "Plan", icon: Map },
  { href: "/profile", label: "My Profile", shortLabel: "Profile", icon: UserRound },
];

export const secondaryNav: NavItem[] = [
  { href: "/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/documents", label: "My Documents", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: LifeBuoy },
];

// Only shown to verified school counselors.
export const staffNav: NavItem = { href: "/staff", label: "Counselor Dashboard", icon: GraduationCap };

export function moreNav(isStaff: boolean): NavItem[] {
  return isStaff ? [staffNav, ...secondaryNav] : secondaryNav;
}

// Five destinations fit a phone's bottom bar; the rest live in the menu.
const MOBILE_TABS = ["/", "/counselor", "/discover", "/explore", "/plan"];

export const mobileTabs = primaryNav.filter((item) => MOBILE_TABS.includes(item.href));

export function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export const mobileMenuPrimary = primaryNav.filter((item) => !MOBILE_TABS.includes(item.href));
