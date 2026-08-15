"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

// The stored theme lives in localStorage, so the server cannot know it and the
// first client render must not read it - the two would disagree and hydration
// would fail. This is a value that is genuinely different on the server than in
// the browser, which is precisely what `useSyncExternalStore`'s third argument
// is for: React renders the server snapshot, then re-renders with the client
// one, knowingly. The `setState`-in-an-effect version of this did the same job
// by surprising React into a second render pass after commit.
//
// Hoisted to module scope because a new function identity on every render makes
// `useSyncExternalStore` resubscribe on every render.
const neverChangesAfterHydration = () => () => {};
const hydrated = () => true;
const notHydrated = () => false;

const ThemeSwitcher = () => {
  const mounted = useSyncExternalStore(
    neverChangesAfterHydration,
    hydrated,
    notHydrated,
  );
  const { theme, setTheme } = useTheme();

  if (!mounted) {
    // The button's exact footprint, not `null`. This control sits in the header
    // now, immediately left of Sign in / Logout - returning nothing would let
    // those shift sideways the moment hydration finishes.
    return <div className="size-8 shrink-0" aria-hidden />;
  }

  const ICON_SIZE = 16;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Icon-only, so it needs a name of its own - without one it reaches
            the accessibility tree as an unlabelled button. */}
        <Button variant="ghost" size="icon-sm" aria-label="Change theme">
          {theme === "light" ? (
            <Sun
              key="light"
              size={ICON_SIZE}
              className={"text-muted-foreground"}
            />
          ) : theme === "dark" ? (
            <Moon
              key="dark"
              size={ICON_SIZE}
              className={"text-muted-foreground"}
            />
          ) : (
            <Laptop
              key="system"
              size={ICON_SIZE}
              className={"text-muted-foreground"}
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      {/* `end` since the move: anchored to the top-right corner, a menu aligned
          to its left edge opens off the side of the viewport. */}
      <DropdownMenuContent className="w-content" align="end">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(e) => setTheme(e)}
        >
          <DropdownMenuRadioItem className="flex gap-2" value="light">
            <Sun size={ICON_SIZE} className="text-muted-foreground" />{" "}
            <span>Light</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem className="flex gap-2" value="dark">
            <Moon size={ICON_SIZE} className="text-muted-foreground" />{" "}
            <span>Dark</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem className="flex gap-2" value="system">
            <Laptop size={ICON_SIZE} className="text-muted-foreground" />{" "}
            <span>System</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export { ThemeSwitcher };
