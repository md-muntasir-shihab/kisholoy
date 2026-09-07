import { Badge, Kbd, Text, clx } from "@medusajs/ui"
import { Collapsible as RadixCollapsible } from "radix-ui"
import {
  PropsWithChildren,
  ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { NavLink, To, useLocation } from "react-router-dom"
import { useGlobalShortcuts } from "../../../providers/keybind-provider/hooks"
import { ConditionalTooltip } from "../../common/conditional-tooltip"

type ItemType = "core" | "extension" | "setting"

type NestedItemProps = {
  label: string
  to: string
  translationNs?: string
}

export type NavItemBadge = {
  /**
   * Text rendered inside the badge, e.g. "2 pending".
   */
  label: string
  /**
   * Semantic color of the badge. Defaults to "grey".
   */
  color?: "grey" | "green" | "red" | "orange" | "blue"
  /**
   * Accessible description announced by screen readers, since the badge
   * label on its own ("2 pending") lacks the module context.
   */
  srLabel?: string
}

export type INavItem = {
  icon?: ReactNode
  label: string
  to: string
  /**
   * Optional secondary line rendered under the label. Truncated to a single
   * line so long Bangla strings cannot break the sidebar layout.
   */
  description?: string
  /**
   * Optional live counter rendered on the right of the label.
   */
  badge?: NavItemBadge
  items?: NestedItemProps[]
  type?: ItemType
  from?: string
  nested?: string
  translationNs?: string
}

const BASE_NAV_LINK_CLASSES =
  "text-ui-fg-subtle transition-fg hover:bg-ui-bg-subtle-hover flex items-center gap-x-2 rounded-md py-0.5 pl-0.5 pr-2 outline-none [&>svg]:text-ui-fg-subtle focus-visible:shadow-borders-focus"
const ACTIVE_NAV_LINK_CLASSES =
  "bg-ui-bg-base shadow-elevation-card-rest text-ui-fg-base hover:bg-ui-bg-base"
const NESTED_NAV_LINK_CLASSES = "pl-[34px] pr-2 py-1 w-full text-ui-fg-muted"
const SETTING_NAV_LINK_CLASSES = "pl-2 py-1"

const getIsOpen = (
  to: string,
  items: NestedItemProps[] | undefined,
  pathname: string
) => {
  return [to, ...(items?.map((i) => i.to) ?? [])].some((p) =>
    pathname.startsWith(p)
  )
}

const NavItemTooltip = ({
  to,
  children,
}: PropsWithChildren<{ to: string }>) => {
  const { t } = useTranslation()
  const globalShortcuts = useGlobalShortcuts()
  const shortcut = globalShortcuts.find((s) => s.to === to)

  return (
    <ConditionalTooltip
      showTooltip={!!shortcut}
      maxWidth={9999} // Don't limit the width of the tooltip
      content={
        <div className="txt-compact-xsmall flex h-5 items-center justify-between gap-x-2 whitespace-nowrap">
          <span>{shortcut?.label}</span>
          <div className="flex items-center gap-x-1">
            {shortcut?.keys.Mac?.map((key, index) => (
              <div className="flex items-center gap-x-1" key={index}>
                <Kbd key={key}>{key}</Kbd>
                {index < (shortcut.keys.Mac?.length || 0) - 1 && (
                  <span className="text-ui-fg-muted txt-compact-xsmall">
                    {t("app.keyboardShortcuts.then")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      }
      side="right"
      delayDuration={1500}
    >
      <div className="w-full">{children}</div>
    </ConditionalTooltip>
  )
}

const NavItemSubItem = ({
  item,
  isSetting,
  navLinkClassNames,
  getLinkTarget,
}: {
  item: NestedItemProps
  isSetting: boolean
  navLinkClassNames: (props: {
    to: string
    isActive: boolean
    isNested?: boolean
    isSetting?: boolean
  }) => string
  getLinkTarget: (target: string) => To
}) => {
  const { t } = useTranslation(item.translationNs as any)
  const itemLabel: string = item.translationNs ? t(item.label) : item.label

  return (
    <li className="flex h-7 items-center">
      <NavItemTooltip to={item.to}>
        <NavLink
          to={getLinkTarget(item.to)}
          end
          className={({ isActive }) => {
            return clx(
              navLinkClassNames({
                to: item.to,
                isActive,
                isSetting,
                isNested: true,
              })
            )
          }}
        >
          <Text size="small" weight="plus" leading="compact">
            {itemLabel}
          </Text>
        </NavLink>
      </NavItemTooltip>
    </li>
  )
}

const NavItemBadgeTag = ({ badge }: { badge: NavItemBadge }) => {
  return (
    <Badge
      size="2xsmall"
      color={badge.color ?? "grey"}
      className="ml-auto shrink-0"
      rounded="full"
    >
      <span aria-hidden={!!badge.srLabel}>{badge.label}</span>
      {badge.srLabel ? <span className="sr-only">{badge.srLabel}</span> : null}
    </Badge>
  )
}

/**
 * Renders the label, the optional description line and the optional badge.
 * Shared by the desktop link, the mobile collapsible trigger and the mobile
 * self-link so all three stay visually identical.
 */
const NavItemBody = ({
  label,
  description,
  badge,
}: {
  label: string
  description?: string
  badge?: NavItemBadge
}) => {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-x-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <Text size="small" weight="plus" leading="compact" className="truncate">
          {label}
        </Text>
        {description ? (
          <Text
            size="xsmall"
            leading="compact"
            className="text-ui-fg-muted truncate"
          >
            {description}
          </Text>
        ) : null}
      </div>
      {badge ? <NavItemBadgeTag badge={badge} /> : null}
    </div>
  )
}

export const NavItem = ({
  icon,
  label,
  description,
  badge,
  to,
  items,
  type = "core",
  from,
  translationNs,
}: INavItem) => {
  const { t } = useTranslation(translationNs as any)
  const { pathname, search } = useLocation()
  const [open, setOpen] = useState(getIsOpen(to, items, pathname))

  // Use translation if translationNs is provided, otherwise use label as-is
  const displayLabel: string = translationNs ? t(label) : label

  useEffect(() => {
    setOpen(getIsOpen(to, items, pathname))
  }, [pathname, to, items])

  const navLinkClassNames = useCallback(
    ({
      to,
      isActive,
      isNested = false,
      isSetting = false,
    }: {
      to: string
      isActive: boolean
      isNested?: boolean
      isSetting?: boolean
    }) => {
      if (["core", "setting"].includes(type)) {
        isActive = pathname.startsWith(to)
      }

      return clx(BASE_NAV_LINK_CLASSES, {
        [NESTED_NAV_LINK_CLASSES]: isNested,
        [ACTIVE_NAV_LINK_CLASSES]: isActive,
        [SETTING_NAV_LINK_CLASSES]: isSetting,
      })
    },
    [type, pathname]
  )

  const getLinkTarget = useCallback(
    (target: string) => {
      if (pathname === target && search) {
        return { pathname: target, search }
      }

      return target
    },
    [pathname, search]
  )

  const isSetting = type === "setting"

  return (
    <div className="px-3">
      <NavItemTooltip to={to}>
        <NavLink
          to={getLinkTarget(to)}
          end={items?.some((i) => i.to === pathname)}
          state={
            from
              ? {
                  from,
                }
              : undefined
          }
          className={({ isActive }) => {
            return clx(navLinkClassNames({ isActive, isSetting, to }), {
              "max-lg:hidden": !!items?.length,
            })
          }}
        >
          {type !== "setting" && (
            <div className="flex size-6 shrink-0 items-center justify-center">
              <Icon icon={icon} type={type} />
            </div>
          )}
          <NavItemBody
            label={displayLabel}
            description={description}
            badge={badge}
          />
        </NavLink>
      </NavItemTooltip>
      {items && items.length > 0 && (
        <RadixCollapsible.Root open={open} onOpenChange={setOpen}>
          <RadixCollapsible.Trigger
            className={clx(
              "text-ui-fg-subtle hover:text-ui-fg-base transition-fg hover:bg-ui-bg-subtle-hover flex w-full items-center gap-x-2 rounded-md py-0.5 pl-0.5 pr-2 outline-none lg:hidden",
              { "pl-2": isSetting }
            )}
          >
            <div className="flex size-6 shrink-0 items-center justify-center">
              <Icon icon={icon} type={type} />
            </div>
            <NavItemBody
              label={displayLabel}
              description={description}
              badge={badge}
            />
          </RadixCollapsible.Trigger>
          <RadixCollapsible.Content>
            <div className="flex flex-col gap-y-0.5 pb-2 pt-0.5">
              <ul className="flex flex-col gap-y-0.5">
                <li className="flex w-full items-center gap-x-1 lg:hidden">
                  <NavItemTooltip to={to}>
                    <NavLink
                      to={getLinkTarget(to)}
                      end
                      className={({ isActive }) => {
                        return clx(
                          navLinkClassNames({
                            to,
                            isActive,
                            isSetting,
                            isNested: true,
                          })
                        )
                      }}
                    >
                      <NavItemBody
                        label={displayLabel}
                        description={description}
                        badge={badge}
                      />
                    </NavLink>
                  </NavItemTooltip>
                </li>
                {items.map((item) => (
                  <NavItemSubItem
                    key={item.to}
                    item={item}
                    isSetting={isSetting}
                    navLinkClassNames={navLinkClassNames}
                    getLinkTarget={getLinkTarget}
                  />
                ))}
              </ul>
            </div>
          </RadixCollapsible.Content>
        </RadixCollapsible.Root>
      )}
    </div>
  )
}

const Icon = ({ icon, type }: { icon?: ReactNode; type: ItemType }) => {
  if (!icon) {
    return null
  }

  return type === "extension" ? (
    <div className="shadow-borders-base bg-ui-bg-base flex h-5 w-5 items-center justify-center rounded-[4px]">
      <div className="h-[15px] w-[15px] overflow-hidden rounded-sm">{icon}</div>
    </div>
  ) : (
    icon
  )
}
