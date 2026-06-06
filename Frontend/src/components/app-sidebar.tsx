"use client";

import * as React from "react";
import {
  BadgeCheck,
  Bell,
  CalendarClock,
  ChevronsUpDown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Settings2,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { NavLink, useFetcher, useLocation } from "react-router";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  loadAppointmentSettings,
  updateAppointmentSettings,
} from "@/lib/appointments";
import { type AuthSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

const navItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Appointments",
    url: "/appointments",
    icon: CalendarClock,
  },
  {
    title: "Clients",
    url: "/clients",
    icon: UsersRound,
  },
];

const weekdayOptions = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 0 },
];

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  session?: AuthSession;
  onSignOut: () => void | Promise<void>;
};

export function AppSidebar({ session, onSignOut, ...props }: AppSidebarProps) {
  const user = {
    name: session?.user.name || session?.user.email || "User",
    email: session?.user.email || "",
    avatar: session?.user.image || "",
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} onSignOut={onSignOut} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
}) {
  const location = useLocation();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Office</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const isActive =
            item.url === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.url);

          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                isActive={isActive}
                tooltip={item.title}
                render={<NavLink to={item.url} end={item.url === "/"} />}
              >
                {item.icon ? <item.icon /> : null}
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function NavUser({
  user,
  onSignOut,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
  onSignOut: () => void | Promise<void>;
}) {
  const { isMobile } = useSidebar();
  const initials = getInitials(user.name || user.email);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />
              }
            >
              <Avatar>
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="start"
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar>
                      <AvatarImage src={user.avatar} alt={user.name} />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-xs">{user.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <Sparkles />
                  Upgrade to Pro
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <BadgeCheck />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <CreditCard />
                  Billing
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Bell />
                  Notifications
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                  <Settings2 />
                  Appointment settings
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void onSignOut()}>
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <AppointmentSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </Dialog>
  );
}

function AppointmentSettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const fetcher = useFetcher<
    | Awaited<ReturnType<typeof loadAppointmentSettings>>
    | Awaited<ReturnType<typeof updateAppointmentSettings>>
  >();
  const fetcherData = fetcher.data;
  const settings = fetcherData && "settings" in fetcherData ? fetcherData.settings : null;
  const actionError =
    fetcherData && "ok" in fetcherData && fetcherData.ok === false
      ? fetcherData
      : null;
  const isSubmitting = fetcher.state !== "idle";
  const wasSavingRef = React.useRef(false);

  React.useEffect(() => {
    if (open && !settings && fetcher.state === "idle") {
      void fetcher.load("/appointment-settings");
    }
  }, [fetcher, open, settings]);

  React.useEffect(() => {
    if (fetcher.state === "submitting") {
      wasSavingRef.current = true;
    }

    if (
      wasSavingRef.current &&
      fetcher.state === "idle" &&
      fetcherData &&
      "ok" in fetcherData &&
      fetcherData.ok
    ) {
      wasSavingRef.current = false;
      const closeTimer = window.setTimeout(onClose, 0);

      return () => window.clearTimeout(closeTimer);
    }

    if (fetcher.state === "idle" && fetcherData && "ok" in fetcherData) {
      wasSavingRef.current = false;
    }
  }, [fetcherData, fetcher.state, onClose]);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Appointment settings</DialogTitle>
        <DialogDescription>
          Configure slot length, office hours, and working days for scheduling.
        </DialogDescription>
      </DialogHeader>
      {settings ? (
        <fetcher.Form
          method="post"
          action="/appointment-settings"
          className="grid gap-4"
        >
          {actionError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {actionError.message}
            </p>
          ) : null}
          <label className="grid gap-1 text-xs font-medium">
            Time slot size
            <select
              className="h-8 w-full rounded-md border border-input bg-input/20 px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 md:text-xs dark:bg-input/30"
              name="timeSlotSize"
              defaultValue={String(settings.timeSlotSize)}
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
            </select>
            {actionError?.errors.timeSlotSize ? (
              <span className="text-xs font-normal text-destructive">
                {actionError.errors.timeSlotSize}
              </span>
            ) : null}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium">
              From
              <Input
                aria-invalid={Boolean(actionError?.errors.officeHoursStart) || undefined}
                name="officeHoursStart"
                type="time"
                defaultValue={settings.officeHoursStart}
                required
              />
              {actionError?.errors.officeHoursStart ? (
                <span className="text-xs font-normal text-destructive">
                  {actionError.errors.officeHoursStart}
                </span>
              ) : null}
            </label>
            <label className="grid gap-1 text-xs font-medium">
              To
              <Input
                aria-invalid={Boolean(actionError?.errors.officeHoursEnd) || undefined}
                name="officeHoursEnd"
                type="time"
                defaultValue={settings.officeHoursEnd}
                required
              />
              {actionError?.errors.officeHoursEnd ? (
                <span className="text-xs font-normal text-destructive">
                  {actionError.errors.officeHoursEnd}
                </span>
              ) : null}
            </label>
          </div>
          <div className="grid gap-2">
            <p className="text-xs font-medium">Working days</p>
            <WorkingDaysToggleGroup
              key={settings.workingDays.join(",")}
              initialWorkingDays={settings.workingDays}
            />
            {actionError?.errors.workingDays ? (
              <span className="text-xs font-normal text-destructive">
                {actionError.errors.workingDays}
              </span>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Settings2 className="size-4" />
              )}
              Save settings
            </Button>
          </DialogFooter>
        </fetcher.Form>
      ) : (
        <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
          <RefreshCw className="mr-2 size-4 animate-spin" />
          Loading settings
        </div>
      )}
    </DialogContent>
  );
}

function WorkingDaysToggleGroup({
  initialWorkingDays,
}: {
  initialWorkingDays: number[];
}) {
  const [workingDays, setWorkingDays] = React.useState(initialWorkingDays);

  return (
    <>
      <ButtonGroup className="w-full flex-wrap">
        {weekdayOptions.map((day) => {
          const selected = workingDays.includes(day.value);

          return (
            <Button
              key={day.value}
              type="button"
              size="sm"
              variant={selected ? "default" : "outline"}
              aria-pressed={selected}
              className={cn("min-w-14 flex-1", selected && "z-10")}
              onClick={() =>
                setWorkingDays((currentDays) =>
                  currentDays.includes(day.value)
                    ? currentDays.filter((value) => value !== day.value)
                    : [...currentDays, day.value],
                )
              }
            >
              {day.label}
            </Button>
          );
        })}
      </ButtonGroup>
      {workingDays.map((day) => (
        <input key={day} type="hidden" name="workingDays" value={day} />
      ))}
    </>
  );
}

function getInitials(value: string) {
  const [first = "U", second] = value
    .split(/\s|@/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase());

  return `${first}${second ?? ""}`.slice(0, 2);
}
