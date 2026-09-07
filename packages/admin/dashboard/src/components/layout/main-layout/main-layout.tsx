import {
  Buildings,
  BuildingStorefront,
  ChevronDownMini,
  CogSixTooth,
  CurrencyDollar,
  EllipsisHorizontal,
  MagnifyingGlass,
  MinusMini,
  OpenRectArrowOut,
  ReceiptPercent,
  ShoppingCart,
  SquaresPlus,
  Tag,
  Users,
} from "@medusajs/icons"
import { Avatar, clx, Divider, DropdownMenu, Text } from "@medusajs/ui"
import { Collapsible as RadixCollapsible } from "radix-ui"
import { useTranslation } from "react-i18next"

import { useStore } from "../../../hooks/api/store"
import { PermissionGuard } from "../../common/permission-guard"
import { Skeleton } from "../../common/skeleton"
import { INavItem, NavItem } from "../../layout/nav-item"
import { Shell } from "../../layout/shell"

import { Link, useLocation, useNavigate } from "react-router-dom"
import { useLogout } from "../../../hooks/api"
import { queryClient } from "../../../lib/query-client"
import { useExtension } from "../../../providers/extension-provider"
import { useSearch } from "../../../providers/search-provider"
import { UserMenu } from "../user-menu"
import { useDocumentDirection } from "../../../hooks/use-document-direction"
import { useNavBadges } from "./use-nav-badges"

export const MainLayout = () => {
  return (
    <Shell>
      <MainSidebar />
    </Shell>
  )
}

const MainSidebar = () => {
  return (
    <aside className="flex flex-1 flex-col justify-between overflow-y-auto">
      <div className="flex flex-1 flex-col">
        <PermissionGuard resource="store" operation="read">
          <div className="bg-ui-bg-subtle sticky top-0">
            <Header />
            <div className="px-3">
              <Divider variant="dashed" />
            </div>
          </div>
        </PermissionGuard>
        <div className="flex flex-1 flex-col justify-between">
          <div className="flex flex-1 flex-col">
            <CoreRouteSection />
            <ExtensionRouteSection />
          </div>
          <UtilitySection />
        </div>
        <div className="bg-ui-bg-subtle sticky bottom-0">
          <UserSection />
        </div>
      </div>
    </aside>
  )
}

const Logout = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const { mutateAsync: logoutMutation } = useLogout()

  const handleLogout = async () => {
    await logoutMutation(undefined, {
      onSuccess: () => {
        /**
         * When the user logs out, we want to clear the query cache
         */
        queryClient.clear()
        navigate("/login")
      },
    })
  }

  return (
    <DropdownMenu.Item onClick={handleLogout}>
      <div className="flex items-center gap-x-2">
        <OpenRectArrowOut className="text-ui-fg-subtle" />
        <span>{t("app.menus.actions.logout")}</span>
      </div>
    </DropdownMenu.Item>
  )
}

const Header = () => {
  const { t } = useTranslation()
  const { store, isPending, isError, error } = useStore()
  const direction = useDocumentDirection()
  const name = store?.name
  const fallback = store?.name?.slice(0, 1).toUpperCase()

  const isLoaded = !isPending && !!store && !!name && !!fallback

  if (isError) {
    throw error
  }

  return (
    <div className="w-full p-3">
      <DropdownMenu dir={direction}>
        <DropdownMenu.Trigger
          disabled={!isLoaded}
          className={clx(
            "bg-ui-bg-subtle transition-fg grid w-full grid-cols-[24px_1fr_15px] items-center gap-x-3 rounded-md p-0.5 pe-2 outline-none",
            "hover:bg-ui-bg-subtle-hover",
            "data-[state=open]:bg-ui-bg-subtle-hover",
            "focus-visible:shadow-borders-focus"
          )}
        >
          {fallback ? (
            <Avatar variant="squared" size="xsmall" fallback={fallback} />
          ) : (
            <Skeleton className="h-6 w-6 rounded-md" />
          )}
          <div className="block overflow-hidden text-start">
            {name ? (
              <Text
                size="small"
                weight="plus"
                leading="compact"
                className="truncate"
              >
                {store.name}
              </Text>
            ) : (
              <Skeleton className="h-[9px] w-[120px]" />
            )}
          </div>
          <EllipsisHorizontal className="text-ui-fg-muted" />
        </DropdownMenu.Trigger>
        {isLoaded && (
          <DropdownMenu.Content className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-0">
            <div className="flex items-center gap-x-3 px-2 py-1">
              <Avatar variant="squared" size="small" fallback={fallback} />
              <div className="flex flex-col overflow-hidden">
                <Text
                  size="small"
                  weight="plus"
                  leading="compact"
                  className="truncate"
                >
                  {name}
                </Text>
                <Text
                  size="xsmall"
                  leading="compact"
                  className="text-ui-fg-subtle"
                >
                  {t("app.nav.main.store")}
                </Text>
              </div>
            </div>
            <DropdownMenu.Separator />
            <DropdownMenu.Item className="gap-x-2" asChild>
              <Link to="/settings/store">
                <BuildingStorefront className="text-ui-fg-subtle" />
                {t("app.nav.main.storeSettings")}
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <Logout />
          </DropdownMenu.Content>
        )}
      </DropdownMenu>
    </div>
  )
}

type NavGroup = {
  /**
   * Stable key, also used to persist the collapsed/expanded state.
   */
  key: string
  label: string
  items: Omit<INavItem, "pathname">[]
}

const useCoreRoutes = (): Omit<INavItem, "pathname">[] => {
  const { t } = useTranslation()
  const badges = useNavBadges()

  return [
    {
      icon: <ShoppingCart />,
      label: t("orders.domain"),
      description: t("app.nav.descriptions.orders"),
      badge: badges.orders,
      to: "/orders",
      items: [
        // TODO: Enable when domin is introduced
        // {
        //   label: t("draftOrders.domain"),
        //   to: "/draft-orders",
        // },
      ],
    },
    {
      icon: <Tag />,
      label: t("products.domain"),
      description: t("app.nav.descriptions.products"),
      to: "/products",
      items: [
        {
          label: t("collections.domain"),
          to: "/collections",
        },
        {
          label: t("categories.domain"),
          to: "/categories",
        },
        {
          label: t("productOptions.domain"),
          to: "/product-options",
        },
        // TODO: Enable when domin is introduced
        // {
        //   label: t("giftCards.domain"),
        //   to: "/gift-cards",
        // },
      ],
    },
    {
      icon: <Buildings />,
      label: t("inventory.domain"),
      description: t("app.nav.descriptions.inventory"),
      to: "/inventory",
      items: [
        {
          label: t("reservations.domain"),
          to: "/reservations",
        },
      ],
    },
    {
      icon: <Users />,
      label: t("customers.domain"),
      description: t("app.nav.descriptions.customers"),
      to: "/customers",
      items: [
        {
          label: t("customerGroups.domain"),
          to: "/customer-groups",
        },
      ],
    },
    {
      icon: <ReceiptPercent />,
      label: t("promotions.domain"),
      description: t("app.nav.descriptions.promotions"),
      to: "/promotions",
      items: [
        {
          label: t("campaigns.domain"),
          to: "/campaigns",
        },
      ],
    },
    {
      icon: <CurrencyDollar />,
      label: t("priceLists.domain"),
      description: t("app.nav.descriptions.priceLists"),
      to: "/price-lists",
    },
  ]
}

/**
 * Groups the core routes into labelled sections.
 *
 * Only routes that actually exist in the router are referenced here, so no
 * group can produce a dead link. The module counter is derived from the
 * group's real contents rather than being hard-coded, which means it stays
 * correct when a route is added, removed or hidden by permissions.
 */
const useCoreRouteGroups = (): NavGroup[] => {
  const { t } = useTranslation()
  const coreRoutes = useCoreRoutes()

  const byPath = (path: string) => coreRoutes.find((r) => r.to === path)

  const groups: NavGroup[] = [
    {
      key: "sales",
      label: t("app.nav.groups.sales"),
      items: ["/orders", "/customers", "/promotions", "/price-lists"]
        .map(byPath)
        .filter((r): r is Omit<INavItem, "pathname"> => !!r),
    },
    {
      key: "catalog",
      label: t("app.nav.groups.catalog"),
      items: ["/products", "/inventory"]
        .map(byPath)
        .filter((r): r is Omit<INavItem, "pathname"> => !!r),
    },
  ]

  // Anything not explicitly assigned to a group still has to be reachable,
  // otherwise adding a new core route would silently hide it from the nav.
  const grouped = new Set(groups.flatMap((g) => g.items.map((i) => i.to)))
  const ungrouped = coreRoutes.filter((r) => !grouped.has(r.to))

  if (ungrouped.length) {
    groups.push({
      key: "other",
      label: t("app.nav.groups.other"),
      items: ungrouped,
    })
  }

  return groups.filter((g) => g.items.length > 0)
}

const Searchbar = () => {
  const { t } = useTranslation()
  const { toggleSearch } = useSearch()

  return (
    <div className="px-3">
      <button
        onClick={toggleSearch}
        className={clx(
          "bg-ui-bg-subtle text-ui-fg-subtle flex w-full items-center gap-x-2.5 rounded-md px-2 py-1 outline-none",
          "hover:bg-ui-bg-subtle-hover",
          "focus-visible:shadow-borders-focus"
        )}
      >
        <MagnifyingGlass />
        <div className="flex-1 text-start">
          <Text size="small" leading="compact" weight="plus">
            {t("app.search.label")}
          </Text>
        </div>
        <Text size="small" leading="compact" className="text-ui-fg-muted">
          ⌘K
        </Text>
      </button>
    </div>
  )
}

const CoreRouteGroup = ({ group }: { group: NavGroup }) => {
  const { t } = useTranslation()

  return (
    <RadixCollapsible.Root defaultOpen>
      <div className="px-4">
        <RadixCollapsible.Trigger asChild className="group/trigger">
          <button className="text-ui-fg-subtle flex w-full items-center justify-between gap-x-2 px-2 py-1">
            <div className="flex min-w-0 flex-col text-start">
              <Text
                size="xsmall"
                weight="plus"
                leading="compact"
                className="truncate"
              >
                {group.label}
              </Text>
              <Text
                size="xsmall"
                leading="compact"
                className="text-ui-fg-muted"
              >
                {t("app.nav.groups.moduleCount", {
                  count: group.items.length,
                })}
              </Text>
            </div>
            <div className="text-ui-fg-muted shrink-0">
              <ChevronDownMini className="group-data-[state=open]/trigger:hidden" />
              <MinusMini className="group-data-[state=closed]/trigger:hidden" />
            </div>
          </button>
        </RadixCollapsible.Trigger>
      </div>
      <RadixCollapsible.Content>
        <div className="flex flex-col gap-y-0.5 py-1">
          {group.items.map((route) => (
            <NavItem key={route.to} {...route} />
          ))}
        </div>
      </RadixCollapsible.Content>
    </RadixCollapsible.Root>
  )
}

const CoreRouteSection = () => {
  const groups = useCoreRouteGroups()

  const { getMenu } = useExtension()

  const menuItems = getMenu("coreExtensions")

  menuItems.forEach((item) => {
    if (item.nested) {
      const route = groups
        .flatMap((group) => group.items)
        .find((route) => route.to === item.nested)
      if (route) {
        route.items?.push(item)
      }
    }
  })

  return (
    <nav className="flex flex-col gap-y-3 py-3">
      <Searchbar />
      {groups.map((group) => (
        <CoreRouteGroup key={group.key} group={group} />
      ))}
    </nav>
  )
}

const ExtensionRouteSection = () => {
  const { t } = useTranslation()
  const { getMenu } = useExtension()

  const menuItems = getMenu("coreExtensions").filter((item) => !item.nested)

  if (!menuItems.length) {
    return null
  }

  return (
    <div>
      <div className="px-3">
        <Divider variant="dashed" />
      </div>
      <div className="flex flex-col gap-y-1 py-3">
        <RadixCollapsible.Root defaultOpen>
          <div className="px-4">
            <RadixCollapsible.Trigger asChild className="group/trigger">
              <button className="text-ui-fg-subtle flex w-full items-center justify-between px-2">
                <Text size="xsmall" weight="plus" leading="compact">
                  {t("app.nav.common.extensions")}
                </Text>
                <div className="text-ui-fg-muted">
                  <ChevronDownMini className="group-data-[state=open]/trigger:hidden" />
                  <MinusMini className="group-data-[state=closed]/trigger:hidden" />
                </div>
              </button>
            </RadixCollapsible.Trigger>
          </div>
          <RadixCollapsible.Content>
            <nav className="flex flex-col gap-y-0.5 py-1 pb-4">
              {menuItems.map((item, i) => {
                return (
                  <NavItem
                    key={i}
                    to={item.to}
                    label={item.label}
                    icon={item.icon ? item.icon : <SquaresPlus />}
                    items={item.items}
                    translationNs={item.translationNs}
                    type="extension"
                  />
                )
              })}
            </nav>
          </RadixCollapsible.Content>
        </RadixCollapsible.Root>
      </div>
    </div>
  )
}

const UtilitySection = () => {
  const location = useLocation()
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-y-0.5 py-3">
      <NavItem
        label={t("app.nav.settings.header")}
        to="/settings"
        from={location.pathname}
        icon={<CogSixTooth />}
      />
    </div>
  )
}

const UserSection = () => {
  return (
    <div>
      <div className="px-3">
        <Divider variant="dashed" />
      </div>
      <UserMenu />
    </div>
  )
}
