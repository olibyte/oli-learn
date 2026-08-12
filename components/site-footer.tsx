import { ThemeSwitcher } from "@/components/theme-switcher";

export function SiteFooter() {
  return (
    <footer className="mt-auto w-full border-t">
      <div className="mx-auto flex w-full max-w-5xl flex-col-reverse items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
        <p>Mini-LMS — consultation booking</p>
        <ThemeSwitcher />
      </div>
    </footer>
  );
}
