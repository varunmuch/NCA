import {
  Compass,
  GraduationCap,
  Lightbulb,
  House,
  LifeBuoy,
  Map,
  Settings,
  MessageCircle,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
};

// The flow: build your profile (grades, resume, quiz), talk it through,
// explore, then one plan.
export const primaryNav: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/profile", label: "My Profile", shortLabel: "Profile", icon: UserRound },
  { href: "/counselor", label: "AI Counselor", shortLabel: "Counselor", icon: MessageCircle },
  { href: "/explore", label: "Explore Careers", shortLabel: "Explore", icon: Compass },
  { href: "/plan", label: "My Path", shortLabel: "Path", icon: Map },
];

export const secondaryNav: NavItem[] = [
  { href: "/discover", label: "Interest Quiz", icon: Lightbulb },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: LifeBuoy },
];

// Only shown to verified school counselors.
export const staffNav: NavItem = { href: "/staff", label: "Counselor Dashboard", icon: GraduationCap };

export function moreNav(isStaff: boolean): NavItem[] {
  return isStaff ? [staffNav, ...secondaryNav] : secondaryNav;
}

// Five destinations fit a phone's bottom bar; the rest live in the menu.
const MOBILE_TABS = ["/", "/profile", "/counselor", "/explore", "/plan"];

export const mobileTabs = primaryNav.filter((item) => MOBILE_TABS.includes(item.href));

export function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export const mobileMenuPrimary = primaryNav.filter((item) => !MOBILE_TABS.includes(item.href));
